import type {
  PipelineStage,
  OperationContext,
  RestrictionCheckResult,
} from '../types'
import type { GenericRegisteredService } from '../../../service'
import { ServiceField } from '../../../field'
import type { IndexRangeBuilder } from 'convex/server'

export class RestrictionStage implements PipelineStage {
  name = 'restriction'

  async execute(
    context: OperationContext<any, any, any>,
    data: any
  ): Promise<any> {
    if (!data || context.operation === 'delete') {
      return data
    }

    const service = context.schema[
      context.serviceName
    ] as GenericRegisteredService
    if (!service) {
      throw new Error(`Service ${context.serviceName} not found in schema`)
    }

    // Check unique field constraints
    await this.checkUniqueFields(context, service, data)

    // Check composite unique constraints
    await this.checkCompositeUniques(context, service, data)

    return data
  }

  private async checkUniqueFields(
    context: OperationContext<any, any, any>,
    service: GenericRegisteredService,
    data: any
  ): Promise<void> {
    for (const [fieldName, field] of Object.entries(service.fields)) {
      if (field instanceof ServiceField && ServiceField.isUnique(field)) {
        // For patch operations, only validate fields that are being patched
        if (
          context.operation === 'patch' &&
          context.patchedFields &&
          !context.patchedFields.has(fieldName)
        ) {
          continue
        }

        const fieldValue = data[fieldName]
        if (fieldValue !== undefined) {
          const result = await this.checkUniqueness(
            context,
            fieldName,
            fieldValue,
            service
          )

          if (result.action === 'replace' && result.replaceId) {
            // Modify operation to replace instead of insert
            context.operation = 'replace'
            context.id = result.replaceId
          } else if (result.action === 'error') {
            throw new Error(
              result.error ||
                `Unique constraint violation for field ${fieldName} at ${fieldValue} for id ${result.replaceId}`
            )
          }
        }
      }
    }
  }

  private async checkCompositeUniques(
    context: OperationContext<any, any, any>,
    service: GenericRegisteredService,
    data: any
  ): Promise<void> {
    for (const [indexName, compositeUnique] of Object.entries(
      service.$state.compositeUniques
    )) {
      // For patch operations, only validate if at least one field in the composite is being patched
      if (context.operation === 'patch' && context.patchedFields) {
        const hasAnyPatchedField = compositeUnique.fields.some((field) =>
          context.patchedFields!.has(field)
        )
        if (!hasAnyPatchedField) {
          continue
        }
      }

      const values = compositeUnique.fields.map((field) => data[field])

      // Only check if all fields have values
      if (values.every((v) => v !== undefined)) {
        const result = await this.checkCompositeUniqueness(
          context,
          compositeUnique.fields,
          values,
          compositeUnique.onConflict,
          service
        )

        if (result.action === 'replace' && result.replaceId) {
          // Modify operation to replace instead of insert
          context.operation = 'replace'
          context.id = result.replaceId
        } else if (result.action === 'error') {
          throw new Error(
            result.error ||
              `Composite unique constraint violation for fields ${compositeUnique.fields.join(
                ', '
              )}`
          )
        }
      }
    }
  }

  private async checkUniqueness(
    context: OperationContext<any, any, any>,
    fieldName: string,
    fieldValue: any,
    service: GenericRegisteredService
  ): Promise<RestrictionCheckResult> {
    try {
      console.log(
        '[restriction] checking uniqueness query',
        `by_${fieldName}`,
        fieldValue
      )
      const existing = await context.ctx.db
        .query(context.serviceName)
        .withIndex(`by_${fieldName}`, (q) => q.eq(fieldName, fieldValue))
        .first()

      if (existing) {
        // For replace/patch operations, ignore if it's the same document we're updating
        if (
          (context.operation === 'replace' || context.operation === 'patch') &&
          context.id
        ) {
          if (existing._id === context.id) {
            // Same document, no conflict
            return { action: 'continue' }
          }
        }

        return {
          action: 'error',
          error: `Unique constraint violation: ${fieldName} already exists at ${fieldValue} for id ${existing._id}`,
        }
      }

      return { action: 'continue' }
    } catch (error) {
      throw new Error(`Failed to check uniqueness for ${fieldName}: ${error}`)
    }
  }

  private async checkCompositeUniqueness(
    context: OperationContext<any, any, any>,
    fields: string[],
    values: any[],
    onConflict: 'replace' | 'fail',
    service: GenericRegisteredService
  ): Promise<RestrictionCheckResult> {
    try {
      // Build index query for composite unique check
      const indexName = `by_${fields.join('_')}`

      console.log(
        '[restriction] checking composite uniqueness query',
        indexName
      )

      const existing = await context.ctx.db
        .query(context.serviceName)
        .withIndex(indexName, (q) => {
          let builder = q
          for (let i = 0; i < fields.length; i++) {
            builder = builder.eq(fields[i], values[i]) as IndexRangeBuilder<
              any,
              any,
              0
            >
          }
          return builder
        })
        .first()

      if (existing) {
        if (context.operation === 'insert') {
          if (onConflict === 'replace') {
            return {
              action: 'replace',
              replaceId: existing._id,
              modifiedOperation: 'replace',
            }
          } else {
            return {
              action: 'error',
              error: `Composite unique constraint violation for fields ${fields.join(
                ', '
              )}`,
            }
          }
        } else if (
          context.operation === 'patch' ||
          context.operation === 'replace'
        ) {
          // For updates, only error if it's a different document
          if (context.id && existing._id !== context.id) {
            return {
              action: 'error',
              error: `Composite unique constraint violation for fields ${fields.join(
                ', '
              )}`,
            }
          }
        }
      }

      return { action: 'continue' }
    } catch (error) {
      throw new Error(
        `Failed to check composite uniqueness for ${fields.join(
          ', '
        )}: ${error}`
      )
    }
  }
}
