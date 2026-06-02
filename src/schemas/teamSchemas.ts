import { z } from 'zod'

export const teamMemberSchema = z.object({
  number: z.string(),
  name: z.string(),
  aliases: z.array(z.string().min(1).max(100)).max(20).optional().default([])
})

export const createTeamSchema = z.object({
  name: z.string().max(200).optional(),
  members: z.array(teamMemberSchema).min(0)
})

export const addTeamMemberSchema = teamMemberSchema

export const teamIdParamSchema = z.object({
  id: z.string().uuid()
})

export const teamMemberIdParamSchema = z.object({
  memberId: z.string().uuid()
})

export const updateTeamMemberParamsSchema = z.object({
  id: z.string().uuid(),
  memberId: z.string().uuid()
})

export const updateTeamMemberSchema = z
  .object({
    number: z.string().optional(),
    name: z.string().optional(),
    isActive: z.boolean().optional(),
    aliases: z.array(z.string().min(1).max(100)).max(20).optional()
  })
  .refine(
    data => data.number != null || data.name != null || data.isActive != null || data.aliases != null,
    'At least one field (number, name, isActive, aliases) must be provided'
  )

export type CreateTeamInput = z.infer<typeof createTeamSchema>
export type TeamMemberInput = z.infer<typeof teamMemberSchema>
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>
export type UpdateTeamMemberParamsInput = z.infer<typeof updateTeamMemberParamsSchema>
