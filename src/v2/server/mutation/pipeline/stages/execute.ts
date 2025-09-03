import type { PipelineStage, OperationContext } from '../types'
import { GenericId } from 'convex/values'
import * as z from 'zod/v4'

export class ExecuteStage implements PipelineStage {
  name = 'execute'

  /**
   * Transforms data to convert undefined values to null for optional fields.
   * This ensures Convex operations receive null instead of undefined for optional fields.
   */
  private transformOptionalFields(
    data: Record<string, any>,
    context: OperationContext<any, any, any>
  ): Record<string, any> {
    if (!data || typeof data !== 'object') {
      return data
    }

    const transformedData = { ...data }
    const service = context.schema[context.serviceName]

    if (!service?.fields) {
      return transformedData
    }

    // Iterate through each field in the data
    for (const [fieldName, fieldValue] of Object.entries(transformedData)) {
      if (fieldValue === undefined) {
        const fieldSchema = service.fields[fieldName]
        if (fieldSchema && this.isOptionalField(fieldSchema)) {
          transformedData[fieldName] = null
        }
      }
    }

    return transformedData
  }

  /**
   * Checks if a field schema represents an optional field.
   */
  private isOptionalField(fieldSchema: any): boolean {
    // Check if it's a Zod optional schema
    if (fieldSchema instanceof z.ZodOptional) {
      return true
    }

    // Check if it's a ServiceField with optional Zod schema
    if (
      fieldSchema &&
      typeof fieldSchema === 'object' &&
      fieldSchema._zodValidator
    ) {
      return fieldSchema._zodValidator instanceof z.ZodOptional
    }

    // Check if it's a union with null (converted optional field)
    if (fieldSchema instanceof z.ZodUnion) {
      const options = fieldSchema.options
      if (options && Array.isArray(options)) {
        return options.some((option: any) => option instanceof z.ZodNull)
      }
    }

    return false
  }

  async execute(
    context: OperationContext<any, any, any>,
    data: any
  ): Promise<any> {
    switch (context.operation) {
      case 'insert':
        return this.executeInsert(context, data)
      case 'patch':
        return this.executePatch(context, data)
      case 'replace':
        return this.executeReplace(context, data)
      case 'delete':
        return this.executeDelete(context)
      default:
        throw new Error(`Unknown operation: ${context.operation}`)
    }
  }

  private async executeInsert(
    context: OperationContext<any, any, any>,
    data: any
  ): Promise<GenericId<any>> {
    const transformedData = this.transformOptionalFields(data, context)
    const id = await context.ctx.db.insert(context.serviceName, transformedData)
    return id
  }

  private async executePatch(
    context: OperationContext<any, any, any>,
    data: any
  ): Promise<GenericId<any>> {
    if (!context.id) {
      throw new Error('ID required for patch operation')
    }

    // Skip patch if no fields actually changed
    if (context.patchedFields && context.patchedFields.size === 0) {
      return context.id
    }

    // Only patch with the fields that actually changed
    if (context.patchedFields) {
      const originalPatch = data || {}
      const patchData: Record<string, any> = {}

      for (const field of context.patchedFields) {
        if (field in originalPatch) {
          patchData[field] = originalPatch[field]
        }
      }

      if (Object.keys(patchData).length > 0) {
        const transformedPatchData = this.transformOptionalFields(
          patchData,
          context
        )

        await context.ctx.db.patch(context.id, transformedPatchData)
      }
    } else {
      // Fallback to original behavior if patchedFields not set
      const transformedData = this.transformOptionalFields(data, context)
      await context.ctx.db.patch(context.id, transformedData)
    }

    return context.id
  }

  private async executeReplace(
    context: OperationContext<any, any, any>,
    data: any
  ): Promise<GenericId<any>> {
    if (!context.id) {
      throw new Error('ID required for replace operation')
    }
    const transformedData = this.transformOptionalFields(data, context)
    await context.ctx.db.replace(context.id, transformedData)

    return context.id
  }

  private async executeDelete(
    context: OperationContext<any, any, any>
  ): Promise<GenericId<any>> {
    if (!context.id) {
      throw new Error('ID required for delete operation')
    }
    await context.ctx.db.delete(context.id)
    return context.id
  }
}
