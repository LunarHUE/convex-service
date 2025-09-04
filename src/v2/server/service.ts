import {
  defineTable,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  IndexTiebreakerField,
  TableDefinition,
  type GenericDataModel,
  type SearchIndexConfig,
  type TableNamesInDataModel,
  type VectorIndexConfig,
} from 'convex/server'
import {
  GenericValidator,
  v,
  type Validator,
  type VObject,
} from 'convex/values'
import * as z from 'zod/v4'
import { Expand } from '../types'
import {
  GenericFields,
  ServiceField,
  ServiceFieldsToConvex,
  createZodSchemaFromFields,
  defineField,
  type CreateZodSchemaFromFields,
} from './field'
import {
  zid,
  zodToConvex,
  type ConvexValidatorFromZod,
  type Zid,
  type ZodToConvex,
} from './zod'
import type { GenericFieldHooks, GenericServiceHooks } from './hooks'
import type { GenericRlsRules } from './rls'

type Join<T extends string[], Sep extends string> = T extends []
  ? ''
  : T extends [infer F extends string]
  ? F
  : T extends [infer F extends string, ...infer R extends string[]]
  ? `${F}${Sep}${Join<R, Sep>}`
  : string

export type IndexNameByFields<T extends string[]> = `by_${Join<T, '_'>}`

/**
 * @internal
 */
export type VectorIndex<Fields extends GenericFields> = {
  indexDescriptor: string
  vectorField: FieldPaths<Fields>
  dimensions: number
  filterFields: FieldPaths<Fields>[]
}

/**
 * @internal
 */
export type Index<Fields extends GenericFields> = {
  indexDescriptor: string
  fields: FieldPaths<Fields>[]
}

/**
 * @internal
 */
export type SearchIndex<Fields extends GenericFields> = {
  indexDescriptor: string
  searchField: FieldPaths<Fields>
  filterFields: FieldPaths<Fields>[]
}
type IndexStrategies<Fields extends GenericFields = any> = {
  indexes: Index<Fields>[]
  searchIndexes: SearchIndex<Fields>[]
  vectorIndexes: VectorIndex<Fields>[]
}

// Helper type to check if a Zod type is a ZodDefault
type IsZodDefault<T> = T extends z.ZodDefault<any> ? true : false

// Helper type to check if a Zod type is a ZodOptional
type IsZodOptional<T> = T extends z.ZodOptional<any> ? true : false

// Helper type to unwrap ZodDefault to get the inner type
type UnwrapZodDefault<T> = T extends z.ZodDefault<infer Inner> ? Inner : T

// Helper type to unwrap ZodOptional to get the inner type
type UnwrapZodOptional<T> = T extends z.ZodOptional<infer Inner> ? Inner : T

// Helper type to get the original type from ZodDefault or ZodOptional
type GetOriginalZodType<T> = UnwrapZodOptional<UnwrapZodDefault<T>>

// For the "withoutDefaults" version, we need to exclude ZodDefault fields entirely
type ZodFieldToConvexValidatorWithoutDefaults<T extends z.ZodType> =
  IsZodDefault<T> extends true
    ? never // Exclude ZodDefault fields entirely
    : IsZodOptional<T> extends true
    ? Validator<z.infer<GetOriginalZodType<T>>, 'optional', string>
    : Validator<z.infer<T>, 'required', string>

type TransformZodShapeToConvexWithoutDefaults<
  Shape extends Record<string, z.ZodType>
> = {
  [K in keyof Shape as ZodFieldToConvexValidatorWithoutDefaults<
    Shape[K]
  > extends never
    ? never
    : K]: ZodFieldToConvexValidatorWithoutDefaults<Shape[K]>
}

// Helper type to preserve optional nature in the reconstructed Zod schema
type PreserveOptionalInSchema<T extends z.ZodType> =
  IsZodDefault<T> extends true
    ? never // Exclude defaults entirely
    : IsZodOptional<T> extends true
    ? z.ZodOptional<GetOriginalZodType<T>> // Keep as optional
    : T // Keep as-is for required fields

type WithoutDefaultsServiceValidator<Schema extends z.ZodType> =
  Schema extends z.ZodObject<infer Shape extends Record<string, z.ZodType>>
    ? VObject<
        // The inferred type from the transformed schema - this now preserves optionals
        z.infer<
          z.ZodObject<{
            [K in keyof Shape as ZodFieldToConvexValidatorWithoutDefaults<
              Shape[K]
            > extends never
              ? never
              : K]: PreserveOptionalInSchema<Shape[K]>
          }>
        >,
        // The validators object
        TransformZodShapeToConvexWithoutDefaults<Shape>,
        // Always required at the top level
        'required',
        // Field paths
        string
      >
    : never

type ServiceValidators<
  Fields extends GenericFields,
  Schema extends CreateZodSchemaFromFields<Fields>
> = {
  validator: ZodToConvex<Schema>
  withoutDefaults: WithoutDefaultsServiceValidator<Schema>
}

// Transform all fields in a shape to remove defaults - using conditional type to ensure proper Zod constraint
type RemoveDefaultsFromShape<Shape> = Shape extends Record<string, any>
  ? {
      [K in keyof Shape as Shape[K] extends z.ZodDefault<any>
        ? never
        : K]: Shape[K]
    }
  : never

// Create a schema without defaults - using type assertion to work around Zod's internal constraints
type CreateWithoutDefaultsSchema<Fields extends GenericFields> =
  CreateZodSchemaFromFields<Fields> extends z.ZodObject<infer Shape>
    ? z.ZodObject<RemoveDefaultsFromShape<Shape>>
    : never

type SystemFields<TableName extends string> = {
  _id: Zid<TableName>
  _creationTime: z.ZodNumber
}

type CreateWithSystemFieldsSchema<
  Fields extends GenericFields,
  TableName extends string
> = CreateZodSchemaFromFields<Fields> extends z.ZodObject<infer Shape>
  ? z.ZodObject<Shape & SystemFields<TableName>>
  : never

type ServiceSchemas<
  Fields extends GenericFields,
  TableName extends string = ''
> = {
  withoutSystemFieldsSchema: CreateZodSchemaFromFields<Fields>
  withoutDefaultsSchema: CreateWithoutDefaultsSchema<Fields>
  withSystemFieldsSchema: CreateWithSystemFieldsSchema<Fields, TableName>
}

type CompositeUnique<Fields extends GenericFields> = {
  fields: FieldPaths<Fields>[]
  onConflict: OnConflictPolicy
}

type ServiceState<Fields extends GenericFields> = {
  validators: ServiceValidators<Fields, CreateZodSchemaFromFields<Fields>>
  compositeUniques: Record<string, CompositeUnique<Fields>>
}

type OnConflictPolicy = 'replace' | 'fail'

type FieldPaths<Fields> = keyof Fields & string

type AnyServiceFields = Record<string, ServiceField<any, any>>

type RegisteredServiceOptions = {
  serviceHooks?: GenericServiceHooks
  fieldHooks?: GenericFieldHooks
  rls?: GenericRlsRules
}
export type GenericServiceTable = ServiceTable<any, any, any, any>
export class ServiceTable<
  Validator extends GenericValidator,
  Indexes extends GenericTableIndexes = {},
  SearchIndexes extends GenericTableSearchIndexes = {},
  VectorIndexes extends GenericTableVectorIndexes = {}
> {
  validator: Validator
  private _indexStrategies: IndexStrategies = {
    indexes: [],
    searchIndexes: [],
    vectorIndexes: [],
  }
  constructor(validator: Validator, indexStrategies: IndexStrategies) {
    this.validator = validator
    this._indexStrategies = indexStrategies
  }

  /**
   * @deprecated This method is deprecated.
   * Please use {@link defineService().index()} instead.
   * See: GITHUB LINK
   */
  index() {
    throw new Error(
      'Method not implemented. use defineService().index() instead. See: GITHUB LINK'
    )
  }

  /**
   * @deprecated This method is deprecated.
   * Please use {@link defineService().searchIndex()} instead.
   * See: GITHUB LINK
   */
  searchIndex() {
    throw new Error(
      'Method not implemented. use defineService().searchIndex() instead. See: GITHUB LINK'
    )
  }

  /**
   * @deprecated This method is deprecated.
   * Please use {@link defineService().vectorIndex()} instead.
   * See: GITHUB LINK
   */
  vectorIndex() {
    throw new Error(
      'Method not implemented. use defineService().vectorIndex() instead. See: GITHUB LINK'
    )
  }

  protected self(): TableDefinition<
    Validator,
    Indexes,
    SearchIndexes,
    VectorIndexes
  > {
    return this as unknown as TableDefinition<
      Validator,
      Indexes,
      SearchIndexes,
      VectorIndexes
    >
  }

  ' indexes'(): { indexDescriptor: string; fields: string[] }[] {
    return this._indexStrategies.indexes
  }

  export() {
    const documentType = (this.validator as any).json
    if (typeof documentType !== 'object') {
      throw new Error(
        // change comment later to docus link for defineService
        'Invalid validator: please make sure that the parameter of `defineTable` is valid (see https://docs.convex.dev/database/schemas)'
      )
    }

    return {
      indexes: this._indexStrategies.indexes,
      searchIndexes: this._indexStrategies.searchIndexes,
      vectorIndexes: this._indexStrategies.vectorIndexes,
      documentType,
    }
  }
}

export type GenericRegisteredService = RegisteredService<any>

export interface RegisteredService<
  Fields extends GenericFields,
  TableName extends string = ''
> {
  fields: Fields
  validators: ServiceValidators<Fields, CreateZodSchemaFromFields<Fields>>
  schemas: ServiceSchemas<Fields, TableName>
  name: TableName
  types: {
    withoutSystemFields: z.infer<CreateZodSchemaFromFields<Fields>>
    withoutDefaults: z.infer<CreateWithoutDefaultsSchema<Fields>>
    withSystemFields: z.infer<CreateWithSystemFieldsSchema<Fields, TableName>>
  }
  $indexStrategies: IndexStrategies<Fields>
  $state: ServiceState<Fields>
  $hooks: {
    service?: GenericServiceHooks
    field?: GenericFieldHooks
  }
  $rls?: GenericRlsRules
}

/**
 * Creates a Convex validator from a Zod schema, excluding fields with default values
 */
export function zodToConvexWithoutDefaults<Schema extends z.ZodObject>(
  zodSchema: Schema
): WithoutDefaultsServiceValidator<Schema> {
  const shape = zodSchema.shape
  const result: Record<string, GenericValidator> = {}

  for (const [key, zodType] of Object.entries(shape)) {
    if (zodType instanceof z.ZodDefault) {
      continue
    }

    if (zodType instanceof z.ZodOptional) {
      result[key] = v.optional(zodToConvex(zodType))
    } else {
      result[key] = zodToConvex(zodType)
    }
  }

  return v.object(result) as WithoutDefaultsServiceValidator<Schema>
}

function createWithoutDefaultsSchema<Fields extends GenericFields>(
  fields: Fields
): CreateWithoutDefaultsSchema<Fields> {
  const baseSchema = createZodSchemaFromFields(fields)
  const shape = baseSchema.shape
  const newShape: Record<string, z.ZodType> = {}

  for (const [key, zodType] of Object.entries(shape)) {
    if (!(zodType instanceof z.ZodDefault)) {
      newShape[key] = zodType
    }
  }

  return z.object(newShape) as CreateWithoutDefaultsSchema<Fields>
}
function createWithSystemFieldsSchema<
  Fields extends GenericFields,
  TableName extends string
>(
  fields: Fields,
  tableName: TableName
): CreateWithSystemFieldsSchema<Fields, TableName> {
  const baseSchema = createZodSchemaFromFields(fields)
  const systemFields = {
    _id: zid(tableName),
    _creationTime: z.number(),
  }

  return z.object({
    ...baseSchema.shape,
    ...systemFields,
  }) as CreateWithSystemFieldsSchema<Fields, TableName>
}

export type GenericService = Service<any, any, any, any>

export class Service<
  Fields extends GenericFields,
  Indexes extends GenericTableIndexes = {},
  SearchIndexes extends GenericTableSearchIndexes = {},
  VectorIndexes extends GenericTableVectorIndexes = {},
  TableName extends string = string
> {
  private _state: ServiceState<Fields> = {
    validators: {
      validator: {},
      withoutDefaults: {},
    },
    compositeUniques: {},
  } as ServiceState<Fields>

  private _schemas: ServiceSchemas<Fields, TableName> = {
    withoutSystemFieldsSchema: {},
    withSystemFieldsSchema: {},
    withoutDefaultsSchema: {},
  } as ServiceSchemas<Fields, TableName>

  private _indexStrategies: IndexStrategies<Fields> = {
    indexes: [],
    searchIndexes: [],
    vectorIndexes: [],
  }

  private _fields: Fields = {} as Fields
  private _name: TableName = '' as TableName

  constructor(fields: Fields) {
    this._fields = Object.entries(fields).reduce((acc, [key, value]) => {
      if (value instanceof ServiceField) {
        acc[key] = value
      } else {
        acc[key] = defineField(value)
      }
      return acc
    }, {} as AnyServiceFields) as Fields

    this._schemas.withoutSystemFieldsSchema = createZodSchemaFromFields(
      this._fields
    )

    this._schemas.withoutDefaultsSchema = createWithoutDefaultsSchema(
      this._fields
    )

    this._state.validators.validator = zodToConvex(
      this._schemas.withoutSystemFieldsSchema
    )
    this._state.validators.withoutDefaults = zodToConvexWithoutDefaults(
      this._schemas.withoutSystemFieldsSchema
    )
  }

  private cleanIndexName(name: string): string {
    let cleaned = name.replace(/[^a-zA-Z0-9_]/g, '_')
    if (cleaned.length > 64) cleaned = cleaned.slice(0, 64)
    return cleaned
  }

  public compositeUnique<
    FirstFieldPath extends FieldPaths<Fields>,
    RestFieldPaths extends FieldPaths<Fields>[]
  >(
    fields: [FirstFieldPath, ...RestFieldPaths],
    onConflict: OnConflictPolicy
  ): Service<
    Fields,
    Expand<
      Indexes &
        Record<
          IndexNameByFields<[FirstFieldPath, ...RestFieldPaths]>,
          [FirstFieldPath, ...RestFieldPaths, IndexTiebreakerField]
        >
    >,
    SearchIndexes,
    VectorIndexes,
    TableName
  > {
    const indexName = this.cleanIndexName(`by_${fields.join('_')}`)
    this._state.compositeUniques[indexName] = {
      fields,
      onConflict,
    }
    this.index(indexName, fields)
    return this
  }

  public name<NewName extends string>(
    name: NewName
  ): Service<Fields, Indexes, SearchIndexes, VectorIndexes, NewName> {
    ;(this._name as any) = name
    ;(this._schemas.withSystemFieldsSchema as any) =
      createWithSystemFieldsSchema(this._fields, name)
    return this as any as Service<
      Fields,
      Indexes,
      SearchIndexes,
      VectorIndexes,
      NewName
    >
  }

  public index<
    IndexName extends string,
    FirstFieldPath extends FieldPaths<Fields>,
    RestFieldPaths extends FieldPaths<Fields>[]
  >(
    name: IndexName,
    fields: [FirstFieldPath, ...RestFieldPaths]
  ): Service<
    Fields,
    Expand<
      Indexes &
        Record<
          IndexName,
          [FirstFieldPath, ...RestFieldPaths, IndexTiebreakerField]
        >
    >,
    SearchIndexes,
    VectorIndexes,
    TableName
  > {
    const indexName = this.cleanIndexName(`by_${fields.join('_')}`)
    this._indexStrategies.indexes.push({
      indexDescriptor: indexName,
      fields: fields,
    })
    return this
  }

  public searchIndex<
    IndexName extends string,
    SearchField extends FieldPaths<Fields>,
    FilterFields extends FieldPaths<Fields> = never
  >(
    name: IndexName,
    indexConfig: Expand<SearchIndexConfig<SearchField, FilterFields>>
  ): Service<
    Fields,
    Indexes,
    Expand<
      SearchIndexes &
        Record<
          IndexName,
          {
            searchField: SearchField
            filterFields: FilterFields
          }
        >
    >,
    VectorIndexes,
    TableName
  > {
    this._indexStrategies.searchIndexes.push({
      indexDescriptor: name,
      searchField: indexConfig.searchField,
      filterFields: indexConfig.filterFields || [],
    })
    return this
  }

  public vectorIndex<
    IndexName extends string,
    VectorField extends FieldPaths<Fields>,
    FilterFields extends FieldPaths<Fields> = never
  >(
    name: IndexName,
    indexConfig: Expand<VectorIndexConfig<VectorField, FilterFields>>
  ): Service<
    Fields,
    Indexes,
    SearchIndexes,
    Expand<
      VectorIndexes &
        Record<
          IndexName,
          {
            vectorField: VectorField
            dimensions: number
            filterFields: FilterFields
          }
        >
    >,
    TableName
  > {
    this._indexStrategies.vectorIndexes.push({
      indexDescriptor: name,
      vectorField: indexConfig.vectorField,
      dimensions: indexConfig.dimensions,
      filterFields: indexConfig.filterFields || [],
    })
    return this
  }

  public register(
    options: RegisteredServiceOptions = {}
  ): [
    RegisteredService<Fields, TableName>,
    TableDefinition<
      ServiceFieldsToConvex<Fields>,
      Expand<Indexes & GetUniqueFieldIndexes<Fields>>,
      SearchIndexes,
      VectorIndexes
    >
  ] {
    for (const [key, value] of Object.entries(this._fields)) {
      if (value instanceof ServiceField) {
        if (ServiceField.isUnique(value)) {
          this.index(`by_${key}`, [key as FieldPaths<Fields>])
        }
      }
    }
    const table = new ServiceTable(
      this._state.validators.validator as GenericValidator,
      this._indexStrategies
    ) as unknown as TableDefinition<
      ServiceFieldsToConvex<Fields>,
      Expand<Indexes & GetUniqueFieldIndexes<Fields>>,
      SearchIndexes,
      VectorIndexes
    >

    const service: RegisteredService<Fields, TableName> = {
      fields: this._fields,
      validators: this._state.validators,
      schemas: this._schemas,
      name: this._name as TableName,
      types: {
        withoutSystemFields: {} as z.infer<CreateZodSchemaFromFields<Fields>>,
        withoutDefaults: {} as z.infer<CreateWithoutDefaultsSchema<Fields>>,
        withSystemFields: {} as z.infer<
          CreateWithSystemFieldsSchema<Fields, TableName>
        >,
      },
      $indexStrategies: this._indexStrategies,
      $state: this._state,
      $hooks: {
        service: options.serviceHooks,
        field: options.fieldHooks,
      },
      $rls: options.rls,
    }

    return [service, table]
  }
}

type GetUniqueFieldIndexes<Fields extends GenericFields> = {
  [K in keyof Fields as Fields[K] extends ServiceField<any, infer State>
    ? State['unique'] extends true
      ? `by_${K & string}`
      : never
    : never]: [K & string, IndexTiebreakerField]
}

export const defineService = <
  Fields extends Record<string, ServiceField | z.ZodType>
>(
  fields: Fields
) => {
  return new Service(fields)
}
