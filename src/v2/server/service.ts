import {
  defineTable,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  IndexTiebreakerField,
  TableDefinition,
  type SearchIndexConfig,
  type VectorIndexConfig,
} from 'convex/server'
import { GenericValidator } from 'convex/values'
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
import { zodToConvex, type ZodToConvex } from './zod'
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

type WithoutDefaultsValidator<
  Fields extends GenericFields,
  Schema extends CreateZodSchemaFromFields<Fields>
> = ZodToConvex<Schema>
type ServiceValidators<
  Fields extends GenericFields,
  Schema extends CreateZodSchemaFromFields<Fields>
> = {
  validator: ZodToConvex<Schema>
  withoutDefaults: GenericValidator
}

// Without defaults will remove the defaults from the schema entirely as to not create default values from the parsing
// This means that if you have a test: z.string().default("test") and then you use the withoutDefaults schema to parse it,
// then the object at test: will be undefined since our schema doesnt have a default to parse to, but if you use the withDefaults schema to parse it, then the object at test: will be "test"
type ServiceSchemas<Fields extends GenericFields> = {
  withDefaults: CreateZodSchemaFromFields<Fields>
  withoutDefaults: z.ZodType
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

export interface RegisteredService<Fields extends GenericFields> {
  fields: Fields
  validators: ServiceValidators<Fields, CreateZodSchemaFromFields<Fields>>
  schema: CreateZodSchemaFromFields<Fields>
  name: string
  $indexStrategies: IndexStrategies<Fields>
  $state: ServiceState<Fields>
  $hooks: {
    service?: GenericServiceHooks
    field?: GenericFieldHooks
  }
  $rls?: GenericRlsRules
}

export type GenericService = Service<any, any, any, any>

export class Service<
  Fields extends GenericFields,
  Indexes extends GenericTableIndexes = {},
  SearchIndexes extends GenericTableSearchIndexes = {},
  VectorIndexes extends GenericTableVectorIndexes = {}
> {
  private _state: ServiceState<Fields> = {
    validators: {
      validator: {},
      withoutDefaults: {},
    },
    compositeUniques: {},
  } as ServiceState<Fields>
  private _indexStrategies: IndexStrategies<Fields> = {
    indexes: [],
    searchIndexes: [],
    vectorIndexes: [],
  }
  private _fields: Fields = {} as Fields
  private _name: string = ''
  private _schema: CreateZodSchemaFromFields<Fields> =
    {} as CreateZodSchemaFromFields<Fields>

  constructor(fields: Fields) {
    this._fields = Object.entries(fields).reduce((acc, [key, value]) => {
      if (value instanceof ServiceField) {
        acc[key] = value
      } else {
        acc[key] = defineField(value)
      }
      return acc
    }, {} as AnyServiceFields) as Fields

    this._schema = createZodSchemaFromFields(this._fields)
    this._state.validators.validator = zodToConvex(this._schema)
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
    VectorIndexes
  > {
    const indexName = this.cleanIndexName(`by_${fields.join('_')}`)
    this._state.compositeUniques[indexName] = {
      fields,
      onConflict,
    }
    this.index(indexName, fields)
    return this
  }

  public name(name: string): this {
    this._name = name
    return this
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
    VectorIndexes
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
    VectorIndexes
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
    >
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
    RegisteredService<Fields>,
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
      this._state.validators.validator,
      this._indexStrategies
    ) as unknown as TableDefinition<
      ServiceFieldsToConvex<Fields>,
      Expand<Indexes & GetUniqueFieldIndexes<Fields>>,
      SearchIndexes,
      VectorIndexes
    >

    const service: RegisteredService<Fields> = {
      fields: this._fields,
      validators: this._state.validators,
      schema: this._schema,
      name: this._name,
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
