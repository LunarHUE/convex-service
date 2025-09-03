import type { PipelineStage, OperationContext } from '../types'
import type { GenericRegisteredService } from '../../../service'

export class ParseStage implements PipelineStage {
  name = 'parse'

  async execute(
    context: OperationContext<any, any, any>,
    data: any
  ): Promise<any> {
    // Only fetch for delete operations when afterHooks will run
    if (
      context.operation === 'delete' &&
      context.config.afterHooks &&
      context.id
    ) {
      console.log(
        '[parse] operation is delete and afterHooks is true, getting existing document',
        context.id
      )
      const existingDoc = await context.ctx.db.get(context.id)
      context.originalDocument = existingDoc
      return existingDoc
    }

    if (!data) {
      return data
    }

    const service = context.schema[
      context.serviceName
    ] as GenericRegisteredService
    if (!service) {
      throw new Error(`Service ${context.serviceName} not found in schema`)
    }

    try {
      let dataToValidate = data
      const zodSchema = service.schema

      if (context.operation === 'patch') {
        // For patch operations, we only need to validate the fields being patched
        // since existing data was already validated when originally inserted

        // Track which fields are actually being patched
        context.patchedFields = new Set(Object.keys(data))

        // If no fields provided, return early
        if (Object.keys(data).length === 0) {
          return {}
        }

        // Create a partial schema for just the patched fields
        const patchedFieldsSchema = zodSchema.partial().pick(
          Object.keys(data).reduce((acc, key) => {
            acc[key] = true
            return acc
          }, {} as Record<string, true>)
        )

        // Validate only the patched fields
        dataToValidate = Array.isArray(data)
          ? data.map((item) => patchedFieldsSchema.parse(item))
          : patchedFieldsSchema.parse(data)
      } else {
        // For insert/replace operations, validate the full data with defaults
        dataToValidate = Array.isArray(data)
          ? data.map((item) => zodSchema.parse(item))
          : zodSchema.parse(data)
        context.originalDocument = dataToValidate
      }

      console.log('validated data:', dataToValidate)
      return dataToValidate
    } catch (error) {
      throw new Error(`Data validation failed: ${error}`)
    }
  }
}
