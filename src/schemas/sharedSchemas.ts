import { z } from 'zod'

/**
 * Shared Zod schemas used across multiple modules
 * These are the foundation schemas that other schemas can extend
 */

// Clerk UUID schema
export const clerkIdSchema = z
  .string()
  .regex(/^user_[A-Za-z0-9]{27}$/, 'Must be a valid Clerk user ID format (e.g., user_31dtJKfKuUpJ92VyMJe21GOyjXt)')

// Common parameter schemas
export const idParamSchema = z.object({
  id: z.string().uuid()
})

// Clerk user ID parameter schema
export const userIdParamSchema = z.object({
  id: z.string() // Clerk user ID (can be any string from Clerk)
})

// Pagination schemas
export const paginationQuerySchema = z.object({
  // page: z.string().regex(/^\d+$/).transform(Number).optional().default(1),
  // limit: z.string().regex(/^\d+$/).transform(Number).optional().default(10),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10)
})

export const paginationResponseSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().min(0),
  pages: z.number().int().min(0)
})

// Common response schemas
export const successResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional()
})

export const errorResponseSchema = z.object({
  success: z.boolean().default(false),
  error: z.string(),
  message: z.string().optional(),
  details: z
    .array(
      z.object({
        field: z.string(),
        message: z.string()
      })
    )
    .optional()
})

// Common parameter schemas
export const beneficiaryQuestionnaireParams = z.object({
  applicationId: z.string().regex(/^\d+$/).transform(Number),
  beneficiaryId: z.string()
})

// Date schemas
export const dateStringSchema = z
  .string()
  .datetime()
  .transform(date => new Date(date))
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform(date => new Date(date))

// Email schema
export const emailSchema = z.string().email()

// Phone number schema (international format)
export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/)
  .optional()

// Country code schema (ISO 3166-1 alpha-2)
export const countryCodeSchema = z.string().length(2).toUpperCase()

// Type exports for TypeScript
export type PaginationQuery = z.infer<typeof paginationQuerySchema>
export type PaginationResponse = z.infer<typeof paginationResponseSchema>
