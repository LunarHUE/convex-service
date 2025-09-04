import { v } from 'convex/values'
import { mutation } from '../lib/mutation'
import { partial } from 'convex-helpers/validators'
import { usersAggregate, usersService } from './users.def'
import { query } from './_generated/server'
import { z } from 'zod/v4'

export const getUser = query({
  args: {
    id: v.id('users'),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.id)
    return user
  },
})

export const insertMany = mutation({
  args: {
    users: v.array(usersService.validators.withoutDefaults),
  },
  handler: async (ctx, args) => {
    const inserted = await ctx.db.insert('users').many(args.users, {
      restrictions: false,
    })

    // for (const user of inserted) {
    //   const doc = await ctx.db.get(user)
    //   await usersAggregate.insert(ctx, doc)
    // }

    return inserted
  },
})

export const insert = mutation({
  args: usersService.validators.withoutDefaults,
  handler: async (ctx, args) => {
    const inserted = await ctx.db.insert('users').one(args)

    return inserted
  },
})

export const test = query({
  args: {
    page: v.number(),
    pageSize: v.number(),
    order: v.optional(v.union(v.literal('asc'), v.literal('desc'))),
  },
  handler: async (ctx, args) => {
    if (args.page < 1) {
      throw new Error('Page must be greater than or equal to 1')
    }
    if (args.pageSize < 1 || args.pageSize > 4095) {
      throw new Error('Page size must be between 1 and 4095 (inclusive)')
    }

    const total = await usersAggregate.count(ctx)
    const order = args.order ?? 'desc'
    const totalPages = Math.ceil(total / args.pageSize)

    if (args.page > totalPages && total > 0) {
      throw new Error(`Page ${args.page} exceeds total pages (${totalPages})`)
    }

    let cursorIdx
    if (order === 'desc') {
      // For descending: start from negative total, move toward 0
      // Page 1: -pageSize (gets last pageSize items)
      // Page 2: -pageSize*2 (gets second-to-last pageSize items)
      cursorIdx = -(args.page * args.pageSize)
    } else {
      // For ascending: start from 0, move toward positive
      // Page 1: 0 (gets first pageSize items)
      // Page 2: pageSize (gets second pageSize items)
      cursorIdx = (args.page - 1) * args.pageSize
    }

    console.log(`Page ${args.page}, Order: ${order}, CursorIdx: ${cursorIdx}`)

    const cursorAggregate = await usersAggregate.at(ctx, cursorIdx)

    const paginated = await ctx.db
      .query('users')
      .withIndex('by_creation_time', (q) =>
        q.gte('_creationTime', cursorAggregate.key)
      )
      .order(order === 'desc' ? 'desc' : 'asc')
      .take(args.pageSize)

    const hasNextPage = args.page < totalPages
    const hasPrevPage = args.page > 1

    return {
      data: paginated,
      pagination: {
        currentPage: args.page,
        pageSize: args.pageSize,
        totalItems: total,
        totalPages,
        nextPage: hasNextPage ? args.page + 1 : null,
        prevPage: hasPrevPage ? args.page - 1 : null,
      },
    }
  },
})

export const insertWithoutRestrictions = mutation({
  args: usersService.validators.withoutDefaults,
  handler: async (ctx, args) => {
    const inserted = await ctx.db
      .insert('users')
      .one(args, { restrictions: false })

    return inserted
  },
})

export const patch = mutation({
  args: {
    id: v.id('users'),
    patch: partial(usersService.validators.validator),
  },
  handler: async (ctx, { id, patch }) => {
    const patched = await ctx.db.patch(id).one(patch)

    return patched
  },
})

export const destroy = mutation({
  args: {
    id: v.id('users'),
  },
  handler: async (ctx, args) => {
    const deleted = await ctx.db.delete(args.id)

    return deleted
  },
})

export const replace = mutation({
  args: {
    id: v.id('users'),
    replace: v.object({
      email: v.string(),
      firstName: v.string(),
      lastName: v.string(),
      profileId: v.id('profiles'),
    }),
  },
  handler: async (ctx, args) => {
    const replaced = await ctx.db.replace(args.id).one(args.replace)

    return replaced
  },
})
