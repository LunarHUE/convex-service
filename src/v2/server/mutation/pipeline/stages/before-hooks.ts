import type { PipelineStage, OperationContext } from '../types'
import type { GenericRegisteredService } from '../../../service'
import { ServiceHooks } from '../../../hooks/service'
import { ServiceField } from '../../../field'

export class BeforeHookStage implements PipelineStage {
  name = 'before-hooks'

  async execute(
    context: OperationContext<any, any, any>,
    data: any
  ): Promise<any> {
    if (!data) {
      return data
    }

    const service = context.schema[
      context.serviceName
    ] as GenericRegisteredService
    if (!service) {
      throw new Error(`Service ${context.serviceName} not found in schema`)
    }

    if (context.id && !context.originalDocument) {
      console.log(
        '[before-hooks] no original document, getting from db',
        context.id
      )
      const updatedDoc = await context.ctx.db.get(context.id)
      context.originalDocument = updatedDoc
    }
    context.processedDocument = data

    // Execute service-level before hooks
    if (service.$hooks.service) {
      const serviceHooks = ServiceHooks.getServiceHooks(service.$hooks.service)
      if (serviceHooks.before) {
        const hookOperation = this.mapOperationType(context.operation)
        const hookCtx = { ...context.ctx, meta: {} }

        context.processedDocument = await serviceHooks.before({
          value: context.originalDocument,
          operation: hookOperation,
          ctx: hookCtx,
        })
        // After running the service-level before hook, diff the old vs processedData,
        // and for any changed key, add it to context.patchedFields (for patch operations).
        if (context.operation === 'patch' && context.patchedFields) {
          if (
            context.originalDocument &&
            typeof context.originalDocument === 'object'
          ) {
            for (const key of Object.keys(context.originalDocument)) {
              if (
                context.originalDocument[key] !== context.processedDocument[key]
              ) {
                context.patchedFields.add(key)
              }
            }
          }
        }
      }
    }

    // Execute field-level before hooks from FieldHooks registry
    if (service.$hooks.field) {
      const fieldHooks = service.$hooks.field.fieldHooks

      for (const [fieldName, fieldHook] of fieldHooks) {
        if (fieldHook.before) {
          const hookOperation = this.mapOperationType(context.operation)
          const hookCtx = { ...context.ctx, meta: {} }
          context.processedDocument[fieldName] = await fieldHook.before({
            value: context.originalDocument,
            operation: hookOperation,
            ctx: hookCtx,
          })
          if (context.operation === 'patch') {
            context.patchedFields?.add(fieldName)
          }
        }
      }
    }

    // Execute ServiceField hooks
    for (const [fieldName, field] of Object.entries(service.fields)) {
      if (field instanceof ServiceField) {
        const fieldHooks = field.fieldHooks
        if (fieldHooks?.before) {
          const hookOperation = this.mapOperationType(context.operation)
          const hookCtx = { ...context.ctx, meta: {} }

          context.processedDocument[fieldName] = await fieldHooks.before({
            value: context.originalDocument,
            operation: hookOperation,
            ctx: hookCtx,
          })
          if (context.operation === 'patch') {
            context.patchedFields?.add(fieldName)
          }
        }
      }
    }

    return context.processedDocument
  }

  private mapOperationType(operation: string): 'insert' | 'update' | 'delete' {
    switch (operation) {
      case 'insert':
        return 'insert'
      case 'patch':
      case 'replace':
        return 'update'
      case 'delete':
        return 'delete'
      default:
        throw new Error(`Unknown operation type: ${operation}`)
    }
  }
}
