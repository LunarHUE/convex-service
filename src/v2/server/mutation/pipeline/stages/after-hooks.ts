import type { PipelineStage, OperationContext } from '../types'
import type { GenericRegisteredService } from '../../../service'
import { ServiceHooks } from '../../../hooks/service'
import { ServiceField } from '../../../field'

export class AfterHookStage implements PipelineStage {
  name = 'after-hooks'

  async execute(
    context: OperationContext<any, any, any>,
    data: any
  ): Promise<any> {
    const service = context.schema[
      context.serviceName
    ] as GenericRegisteredService
    if (!service) {
      throw new Error(`Service ${context.serviceName} not found in schema`)
    }

    // Determine old and new values based on operation type
    let oldValue: any
    let newValue: any

    if (context.id && !context.processedDocument) {
      console.log(
        '[after-hooks] no processed document, getting from db',
        context.id
      )
      const updatedDoc = await context.ctx.db.get(context.id)
      context.processedDocument = updatedDoc
    }

    switch (context.operation) {
      case 'insert':
        oldValue = undefined
        newValue = context.processedDocument
        break
      case 'patch':
        oldValue = context.originalDocument
        newValue = context.processedDocument
        break
      case 'replace':
        oldValue = context.originalDocument
        newValue = context.processedDocument
        break
      case 'delete':
        oldValue = context.originalDocument
        newValue = undefined
        break
      default:
        oldValue = undefined
        newValue = context.processedDocument
    }

    // Execute service-level after hooks
    if (service.$hooks.service) {
      const serviceHooks = ServiceHooks.getServiceHooks(service.$hooks.service)
      if (serviceHooks.after) {
        const hookOperation = this.mapOperationType(context.operation)
        const hookCtx = {
          ...context.ctx,
          meta: {},
        }

        await serviceHooks.after({
          operation: hookOperation,
          ctx: hookCtx,
          oldValue: oldValue,
          newValue: newValue,
        })
      }
    }

    // Execute field-level after hooks from FieldHooks registry
    if (service.$hooks.field) {
      const fieldHooks = service.$hooks.field.fieldHooks

      for (const [fieldName, fieldHook] of fieldHooks) {
        if (fieldHook.after && data && data[fieldName] !== undefined) {
          const hookOperation = this.mapOperationType(context.operation)
          const hookCtx = { ...context.ctx, meta: {} }

          await fieldHook.after({
            operation: hookOperation,
            ctx: hookCtx,
            oldValue: oldValue[fieldName],
            newValue: newValue[fieldName],
          })
        }
      }
    }

    // Execute ServiceField hooks
    for (const [fieldName, field] of Object.entries(service.fields)) {
      if (
        field instanceof ServiceField &&
        data &&
        data[fieldName] !== undefined
      ) {
        const fieldHooks = field.fieldHooks
        if (fieldHooks?.after) {
          const hookOperation = this.mapOperationType(context.operation)
          const hookCtx = { ...context.ctx, meta: {} }

          await fieldHooks.after({
            operation: hookOperation,
            ctx: hookCtx,
            oldValue: oldValue[fieldName],
            newValue: newValue[fieldName],
          })
        }
      }
    }

    return data
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
