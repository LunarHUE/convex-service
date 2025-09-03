import * as z from 'zod/v4'
import { ZodToConvex } from './zod'
import type { Expand } from '../types'
import type {
  BeforeOperation,
  AfterOperation,
  ValueFromZodValidator,
} from './types'

type ExtractZodType<T extends Field> = T extends ServiceField<infer U>
  ? U
  : T extends z.ZodType
  ? T
  : never

// Helper type to remove Zod brands from a Zod schema

export type CreateZodSchemaFromFields<Fields extends GenericFields> =
  z.ZodObject<{
    [K in keyof Fields]: ExtractZodType<Fields[K]>
  }>

export type ServiceFieldsToConvex<Fields extends GenericFields> = ZodToConvex<
  CreateZodSchemaFromFields<Fields>
>

export function createZodSchemaFromFields<T extends GenericFields>(
  fields: T
): CreateZodSchemaFromFields<T> {
  const zodShape: Record<string, z.ZodType> = {}

  for (const [key, field] of Object.entries(fields)) {
    if (field instanceof ServiceField) {
      zodShape[key] = ServiceField.toZod(field)
    } else {
      zodShape[key] = field
    }
  }

  return z.object(zodShape) as CreateZodSchemaFromFields<T>
}

export type Field = ServiceField | z.ZodType
export type GenericFields = Record<string, Field>

type ServiceFieldHooks<
  ZodValidator extends z.ZodType = z.ZodType,
  Value extends ValueFromZodValidator<ZodValidator> = ValueFromZodValidator<ZodValidator>
> = {
  before?: (operation: BeforeOperation<Value>) => Promise<Value> | Value
  after?: (operation: AfterOperation<Value>) => Promise<void> | void
}

type ServiceFieldHookSetters<
  ZodValidator extends z.ZodType = z.ZodType,
  Value extends ValueFromZodValidator<ZodValidator> = ValueFromZodValidator<ZodValidator>
> = {
  before: (
    hook: (operation: BeforeOperation<Value>) => Promise<Value> | Value
  ) => void
  after: (
    hook: (operation: AfterOperation<Value>) => Promise<void> | void
  ) => void
}

type ServiceFieldState<ZodValidator extends z.ZodType = z.ZodType> = {
  unique: boolean
  hooks: ServiceFieldHooks<ZodValidator>
}

export class ServiceField<
  ZodValidator extends z.ZodType = z.ZodType,
  State extends ServiceFieldState<ZodValidator> = ServiceFieldState<ZodValidator>
> {
  private _zodValidator: ZodValidator
  private _state = {
    unique: false,
    hooks: {} as ServiceFieldHooks<ZodValidator>,
  }

  constructor(zodValidator: ZodValidator) {
    this._zodValidator = zodValidator
  }

  public unique(): ServiceField<
    ZodValidator,
    Expand<Omit<State, 'unique'> & { unique: true }>
  > {
    this._state.unique = true
    return this
  }

  public hooks(
    callback: (hooks: ServiceFieldHookSetters<ZodValidator>) => void
  ) {
    const hookHandlers: ServiceFieldHookSetters<ZodValidator> = {
      before: (hook) => {
        this._state.hooks.before = hook
      },
      after: (hook) => {
        this._state.hooks.after = hook
      },
    }
    callback(hookHandlers)
    return this
  }

  static toZod(field: ServiceField): z.ZodType {
    return field._zodValidator
  }

  static isUnique(field: ServiceField): boolean {
    return field._state.unique
  }

  get fieldHooks(): ServiceFieldHooks<ZodValidator> {
    return this._state.hooks
  }
}

/**
 * A field in a service.
 *
 * ```ts
 * const emailField = defineField(v.string().email()).unique()
 * ```
 *
 * @param zodValidator - The zod validator for the field.
 */
export const defineField = <T extends z.ZodType>(zodValidator: T) => {
  return new ServiceField(zodValidator)
}
