import { z } from 'zod'
import { emailSchema, paginationQuerySchema, userIdParamSchema } from './sharedSchemas.js'

/**
 * User-related Zod schemas
 * Matches the simplified User model in Prisma
 */

// Base user profile schema (matches Prisma User model)
export const baseUserSchema = z.object({
  id: z.string(), // Clerk user ID
  email: emailSchema,
  firstName: z.string().min(1).max(50).nullable(),
  lastName: z.string().min(1).max(50).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
})

// User creation schema (for Clerk webhook)
export const createUserSchema = z.object({
  id: z.string(),
  email: emailSchema,
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional()
})

// User update schema (all fields optional)
export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional()
})

// User query schemas
export const userListQuerySchema = paginationQuerySchema.extend({
  search: z.string().min(1).optional()
})

export const userSearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().positive().max(50).default(10)
})

// Re-export userIdParamSchema for convenience
export { userIdParamSchema }

// Type exports
export type BaseUser = z.infer<typeof baseUserSchema>
export type CreateUser = z.infer<typeof createUserSchema>
export type UpdateUser = z.infer<typeof updateUserSchema>
export type UserListQuery = z.infer<typeof userListQuerySchema>
export type UserSearchQuery = z.infer<typeof userSearchQuerySchema>
