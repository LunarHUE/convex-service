import {
  GenericDataModel,
  GenericDatabaseReader,
  TableNamesInDataModel,
} from 'convex/server'
import { GenericId } from 'convex/values'
import {
  type GenericServiceSchema,
  type ServiceNamesInServiceSchema,
} from '../schema'
import * as z from 'zod/v4'
import type { CreateZodSchemaFromFields } from '../field'
import type { GenericRegisteredService } from '../service'
import type { PipelineConfig } from './pipeline/types'

export interface InsertBuilder<
  Schema extends GenericServiceSchema = GenericServiceSchema,
  ServiceName extends ServiceNamesInServiceSchema<Schema> = ServiceNamesInServiceSchema<Schema>,
  TInput extends ExtractDocumentTypeWithoutDefaults<
    Schema,
    ServiceName
  > = ExtractDocumentTypeWithoutDefaults<Schema, ServiceName>
> {
  one(
    document: TInput,
    config?: Partial<PipelineConfig>
  ): Promise<GenericId<ServiceName>>
  many(
    documents: TInput[],
    config?: Partial<PipelineConfig>
  ): Promise<GenericId<ServiceName>[]>
}

export interface ReplaceOneBuilder<
  Schema extends GenericServiceSchema = GenericServiceSchema,
  ServiceName extends ServiceNamesInServiceSchema<Schema> = ServiceNamesInServiceSchema<Schema>,
  TInput extends ExtractDocumentTypeWithoutDefaults<
    Schema,
    ServiceName
  > = ExtractDocumentTypeWithoutDefaults<Schema, ServiceName>
> {
  one(
    document: TInput,
    config?: Partial<PipelineConfig>
  ): Promise<GenericId<ServiceName>>
}

export interface ReplaceManyBuilder<
  Schema extends GenericServiceSchema = GenericServiceSchema,
  ServiceName extends ServiceNamesInServiceSchema<Schema> = ServiceNamesInServiceSchema<Schema>,
  TInput extends ExtractDocumentTypeWithoutDefaults<
    Schema,
    ServiceName
  > = ExtractDocumentTypeWithoutDefaults<Schema, ServiceName>
> {
  many(
    documents: TInput[],
    config?: Partial<PipelineConfig>
  ): Promise<GenericId<ServiceName>[]>
}

export interface PatchOneBuilder<
  Schema extends GenericServiceSchema = GenericServiceSchema,
  ServiceName extends ServiceNamesInServiceSchema<Schema> = ServiceNamesInServiceSchema<Schema>,
  TInput extends ExtractDocumentTypeWithoutDefaults<
    Schema,
    ServiceName
  > = ExtractDocumentTypeWithoutDefaults<Schema, ServiceName>
> {
  one(
    document: Partial<TInput>,
    config?: Partial<PipelineConfig>
  ): Promise<GenericId<ServiceName>>
}

export interface PatchManyBuilder<
  Schema extends GenericServiceSchema = GenericServiceSchema,
  ServiceName extends ServiceNamesInServiceSchema<Schema> = ServiceNamesInServiceSchema<Schema>,
  TInput extends ExtractDocumentTypeWithoutDefaults<
    Schema,
    ServiceName
  > = ExtractDocumentTypeWithoutDefaults<Schema, ServiceName>
> {
  many(
    documents: Partial<TInput>[],
    config?: Partial<PipelineConfig>
  ): Promise<GenericId<ServiceName>[]>
}

// Main database interface that overrides Convex methods
export interface ServiceDatabaseWriter<
  DataModel extends GenericDataModel = GenericDataModel,
  Schema extends GenericServiceSchema = GenericServiceSchema
> extends GenericDatabaseReader<DataModel> {
  // Override insert - returns builder instead of Promise
  insert<ServiceName extends ServiceNamesInServiceSchema<Schema>>(
    serviceName: ServiceName
  ): InsertBuilder<
    Schema,
    ServiceName,
    ExtractDocumentTypeWithoutDefaults<Schema, ServiceName>
  >

  // Override replace - returns builder based on ID type
  replace<ServiceName extends ServiceNamesInServiceSchema<Schema>>(
    id: GenericId<ServiceName>
  ): ReplaceOneBuilder<Schema, ServiceName>

  replace<ServiceName extends ServiceNamesInServiceSchema<Schema>>(
    ids: GenericId<ServiceName>[]
  ): ReplaceManyBuilder<Schema, ServiceName>

  // Override patch - returns builder based on ID type
  patch<ServiceName extends ServiceNamesInServiceSchema<Schema>>(
    id: GenericId<ServiceName>
  ): PatchOneBuilder<Schema, ServiceName>

  patch<ServiceName extends ServiceNamesInServiceSchema<Schema>>(
    ids: GenericId<ServiceName>[]
  ): PatchManyBuilder<Schema, ServiceName>

  // Override delete - directly executable based on ID type
  delete<ServiceName extends ServiceNamesInServiceSchema<Schema>>(
    id: GenericId<ServiceName>,
    config?: Partial<PipelineConfig>
  ): Promise<GenericId<ServiceName>>

  delete<ServiceName extends ServiceNamesInServiceSchema<Schema>>(
    ids: GenericId<ServiceName>[],
    config?: Partial<PipelineConfig>
  ): Promise<GenericId<ServiceName>[]>
}

export type GetZodSchemaFromService<Service extends GenericRegisteredService> =
  CreateZodSchemaFromFields<Service['fields']>

export type GetServiceFromSchemaAndTableName<
  Schema extends GenericServiceSchema,
  ServiceName extends ServiceNamesInServiceSchema<Schema>
> = Schema extends GenericServiceSchema ? Schema[ServiceName] : never

export type ExtractDocumentType<
  Schema extends GenericServiceSchema,
  ServiceName extends ServiceNamesInServiceSchema<Schema>
> = DocumentWithRequiredDefaults<
  GetZodSchemaFromService<GetServiceFromSchemaAndTableName<Schema, ServiceName>>
>

export type ExtractDocumentTypeWithoutDefaults<
  Schema extends GenericServiceSchema,
  ServiceName extends ServiceNamesInServiceSchema<Schema>
> = DocumentWithOptionalDefaults<
  GetZodSchemaFromService<GetServiceFromSchemaAndTableName<Schema, ServiceName>>
>

export type DocumentWithOptionalDefaults<T> = T extends z.ZodObject<infer Shape>
  ? {
      [K in keyof Shape as Shape[K] extends
        | z.ZodDefault<any>
        | z.ZodOptional<any>
        ? K
        : never]?: Shape[K] extends z.ZodDefault<infer Inner>
        ? z.infer<Inner> | null
        : Shape[K] extends z.ZodOptional<infer OptionalInner>
        ? z.infer<OptionalInner> | null
        : never
    } & {
      [K in keyof Shape as Shape[K] extends
        | z.ZodDefault<any>
        | z.ZodOptional<any>
        ? never
        : K]: Shape[K] extends z.ZodType ? z.infer<Shape[K]> : never
    }
  : T

export type DocumentWithRequiredDefaults<T extends z.ZodType> =
  T extends z.ZodObject<infer Shape>
    ? {
        [K in keyof Shape as Shape[K] extends z.ZodOptional<any>
          ? K
          : never]?: Shape[K] extends z.ZodOptional<infer OptionalInner>
          ? z.infer<OptionalInner> | null
          : never
      } & {
        [K in keyof Shape as Shape[K] extends z.ZodOptional<any>
          ? never
          : K]: Shape[K] extends z.ZodDefault<infer Inner>
          ? z.infer<Inner>
          : Shape[K] extends z.ZodType
          ? z.infer<Shape[K]>
          : never
      }
    : T
