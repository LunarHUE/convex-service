import {
  GenericMutationCtx,
  GenericDataModel,
  TableNamesInDataModel,
  DocumentByName,
  type GenericQueryCtx,
} from 'convex/server'
import { z } from 'zod/v4'
import { Merge } from '../types'

export type AfterOperation<
  Value extends any = any,
  Ctx extends GenericMutationCtx<GenericDataModel> = GenericMutationCtx<GenericDataModel>
> = {
  operation: 'insert' | 'update' | 'delete'
  ctx: ServiceOperationCtx<GenericDataModel, Ctx>
  oldValue: Value // Previous value before the operation
  newValue: Value // New value after the operation
}

export type AfterOperationByDataModel<
  DataModel extends GenericDataModel = GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel> = TableNamesInDataModel<DataModel>,
  Ctx extends GenericMutationCtx<DataModel> = GenericMutationCtx<DataModel>
> = {
  operation: 'insert' | 'update' | 'delete'
  ctx: ServiceOperationCtx<DataModel, Ctx>
  oldValue: DocumentByName<DataModel, TableName>
  newValue: DocumentByName<DataModel, TableName>
}

export type BeforeOperation<
  Value extends any = any,
  Ctx extends GenericMutationCtx<GenericDataModel> = GenericMutationCtx<GenericDataModel>
> = {
  value: Value
  operation: 'insert' | 'update' | 'delete'
  ctx: ServiceOperationCtx<GenericDataModel, Ctx>
}

export type ValueFromZodValidator<
  ZodValidator extends z.ZodType,
  Schema extends z.ZodType = ZodValidator
> = Schema extends z.ZodOptional<infer Inner extends z.ZodType>
  ? z.infer<Inner> | null
  : z.infer<Schema>

export type BeforeOperationByDataModel<
  DataModel extends GenericDataModel = GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel> = TableNamesInDataModel<DataModel>,
  Ctx extends GenericMutationCtx<DataModel> = GenericMutationCtx<DataModel>
> = {
  value: DocumentByName<DataModel, TableName>
  operation: 'insert' | 'update' | 'delete'
  ctx: ServiceOperationCtx<DataModel, Ctx>
}

export type OmitSystemFields<T> = T extends Record<string, any>
  ? Omit<T, '_id' | '_creationTime'>
  : T

type ServiceOperationCtx<
  DataModel extends GenericDataModel = GenericDataModel,
  Ctx extends GenericQueryCtx<DataModel> = GenericQueryCtx<DataModel>
> = Merge<
  Ctx,
  {
    meta: Record<string, any>
  }
>
