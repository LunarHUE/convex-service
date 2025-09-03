import type { PipelineStage, OperationContext } from '../types'
import { GenericId } from 'convex/values'

export class ExecuteStage implements PipelineStage {
  name = 'execute'

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
    const id = await context.ctx.db.insert(context.serviceName, data)
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
        await context.ctx.db.patch(context.id, patchData)
      }
    } else {
      // Fallback to original behavior if patchedFields not set
      await context.ctx.db.patch(context.id, data)
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
    await context.ctx.db.replace(context.id, data)

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
