import { defineField } from '@lunarhue/convex-service/v2/server'
import { zid } from '@lunarhue/convex-service/v2/server'
import { z } from 'zod/v4'

export const emailField = defineField(z.string().email()).unique()
export const profileIdField = defineField(zid('profiles'))

export const updatedAtField = defineField(
  z.number().default(() => Date.now())
).hooks((hooks) => {
  hooks.before(async ({ value, operation }) => {
    if (operation === 'insert' || operation === 'update') {
      return Date.now()
    }
    return value
  })
})

export const updatedByField = defineField(zid('users').optional()).hooks(
  (hooks) => {
    hooks.before(async ({ ctx }) => {
      const identity = await ctx.auth.getUserIdentity()
      const userId = identity?.subject
      if (userId) {
        const user = ctx.db.normalizeId('users', userId)
        return user
      }
      return null
    })
  }
)

export const defaultFields = {
  updatedBy: updatedByField,
  updatedAt: updatedAtField,
}
