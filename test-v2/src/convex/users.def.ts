import {
  defineService,
  createFieldHooks,
  createServiceHooks,
} from '@lunarhue/convex-service/v2'
import { defaultFields, emailField, profileIdField } from './fields'
import { z } from 'zod/v4'
import { DataModel } from './_generated/dataModel'
import { TableAggregate } from '@convex-dev/aggregate'
import { components } from './_generated/api'

const fieldHooks = createFieldHooks<DataModel, 'users'>()
const serviceHooks = createServiceHooks<DataModel, 'users'>()

serviceHooks
  .before(async ({ value, operation }) => {
    // console.log('serviceHooks.before', value, operation)
    return value
  })
  .after(async ({ oldValue, newValue, operation }) => {
    // console.log('serviceHooks.after oldValue', oldValue)
    // console.log('serviceHooks.after newValue', newValue)
    // console.log('serviceHooks.after operation', operation)
  })

fieldHooks.field('fullName').before(async ({ value, operation }) => {
  if (operation === 'insert' || operation === 'update') {
    return `${value.firstName} ${value.lastName}`
  }
  return value.fullName
})

export const [usersService, usersTable] = defineService({
  email: emailField,
  // we have to use guid since zod throws a parsing error when using uuid even though it's a valid uuid. So we use
  // guid instead since it looks for uuid like strings rather than rfc 9562
  // idk what this problem stems from lol but its a bug.
  uuid: z
    .string()
    .uuid()
    .default(() => crypto.randomUUID()),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string().optional(),
  profileId: profileIdField,
  ...defaultFields,
})
  .name('users')
  .compositeUnique(['email', 'uuid'], 'fail')
  .register({
    fieldHooks: fieldHooks,
    serviceHooks: serviceHooks,
  })

export const usersAggregate = new TableAggregate<{
  Key: number
  DataModel: DataModel
  TableName: 'users'
}>(components.aggregate, {
  sortKey: (doc) => doc._creationTime,
})
