import * as z from 'zod'

export const haradaSheetResponseSchema = z.object({
  title: z.string().describe('The title of the Harada Sheet'),
  mainGoal: z.string().describe('The main goal text (center of the sheet)'),
  description: z.string().nullable().optional().describe('Optional description of the sheet'),
  pillars: z
    .array(
      z.object({
        name: z.string().describe('Pillar name'),
        description: z.string().nullable().optional().describe('Pillar description'),
        position: z.number().min(0).max(7).describe('Pillar position (0-7)'),
        tasks: z
          .array(
            z.object({
              label: z.string().describe('Task label (short phrase)'),
              description: z.string().nullable().optional().describe('Task description'),
              position: z.number().min(0).max(7).describe('Task position within pillar (0-7)')
            })
          )
          .length(8)
          .describe('Exactly 8 tasks per pillar')
      })
    )
    .length(8)
    .describe('Exactly 8 pillars')
})

export type GeneratedHaradaSheet = z.infer<typeof haradaSheetResponseSchema>
