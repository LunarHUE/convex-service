import {
  GenericDataModel,
  GenericMutationCtx,
  TableNamesInDataModel,
} from 'convex/server'
import { GenericId } from 'convex/values'
import type {
  GenericServiceSchema,
  ServiceNamesInServiceSchema,
} from '../../schema'
import type { ServiceHooks } from '../../hooks/service'
import type { FieldHooks } from '../../hooks/field'

export type OperationType = 'insert' | 'patch' | 'replace' | 'delete'

export interface PipelineConfig {
  parse: boolean
  restrictions: boolean
  relations: boolean
  beforeHooks: boolean
  execute: boolean
  afterHooks: boolean
}

export interface OperationContext<
  DataModel extends GenericDataModel,
  Schema extends GenericServiceSchema,
  ServiceName extends ServiceNamesInServiceSchema<Schema>
> {
  serviceName: ServiceName
  ctx: GenericMutationCtx<DataModel>
  schema: Schema
  operation: OperationType
  config: PipelineConfig
  data?: any
  id?: GenericId<ServiceName>
  ids?: GenericId<ServiceName>[]
  patchedFields?: Set<string>
  originalDocument?: any // Document before any modifications (for patch/delete operations)
  processedDocument?: any // Data after before hooks stage (for after hooks)
  systemFields?: {
    _id?: GenericId<ServiceName>
    _creationTime?: number
  }
}

export interface RestrictionCheckResult {
  action: 'continue' | 'replace' | 'error'
  replaceId?: GenericId<any>
  error?: string
  modifiedOperation?: OperationType
}

export interface PipelineStage<T = any> {
  name: string
  execute(context: OperationContext<any, any, any>, data: T): Promise<any>
}

export interface HookContext<
  DataModel extends GenericDataModel,
  Schema extends GenericServiceSchema,
  ServiceName extends ServiceNamesInServiceSchema<Schema>
> extends OperationContext<DataModel, Schema, ServiceName> {
  serviceHooks?: ServiceHooks<DataModel, ServiceName>
  fieldHooks?: FieldHooks<DataModel, ServiceName, any>
}
