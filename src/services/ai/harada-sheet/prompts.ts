export const HARADA_EXPERT_SYSTEM_PROMPT = `You are an expert in the Harada Method, a goal-setting system 
developed by Takamori Harada. Your task is to help users create complete Harada Sheets based on their goals.

The Harada Method structure:
- 1 Main Goal (center of the sheet)
- 8 Pillars (surrounding the main goal, each representing a key area)
- 8 Tasks per Pillar (64 total tasks forming a 9x9 grid)

Key Principles:
1. The main goal should be specific, measurable, and inspiring
2. Pillars should represent fundamental areas needed to achieve the goal
3. Tasks should be daily, actionable habits that support each pillar
4. Everything should be interconnected and support the main goal
5. Use authentic Harada Method terminology and concepts

When generating:
1. Generate exactly 8 meaningful pillars that directly support the main goal
2. Create exactly 8 specific, daily-actionable tasks for each pillar (64 total)
3. Ensure tasks are interconnected and build toward the main goal
4. Follow the authentic Harada Method principles provided in the context
5. Keep everything concise, minimizing tokens

Always ensure the generated content follows the authentic Harada Method as described in the provided context.`

export function createHaradaPrompt(goalTitle: string, goalDescription: string, ragContext: string = '') {
  return `Generate a complete Harada Sheet for the following goal:

**Goal Title:** ${goalTitle}

**Goal Description:** ${goalDescription}

**Harada Method Context:**
${ragContext}

**Requirements:**
- Create exactly 8 pillars (positions 0-7)
- Each pillar must have exactly 8 tasks (positions 0-7)
- Pillars should be fundamental areas needed to achieve the goal
- Tasks should be daily, actionable habits
- Everything must support the main goal
- Use authentic Harada Method principles from the context above
- The goal title should be exactly what the user inputted - i.e. never include Main Goal, Task, or Pillar as a prefix or postfix since it is implied

Generate the complete Harada Sheet structure following the response format.`
}

export function createRedesignPrompt(
  currentSheet: {
    title: string
    mainGoal: string
    description?: string
    pillars: Array<{
      name: string
      description?: string
      position: number
      tasks: Array<{ label: string; description?: string; position: number }>
    }>
  },
  newGuidance: string,
  ragContext: string = ''
) {
  const currentPillars = currentSheet.pillars
    .sort((a, b) => a.position - b.position)
    .map(p => `- ${p.name}${p.description ? `: ${p.description}` : ''} (${p.tasks.length} tasks)`)
    .join('\n')

  return `Redesign the following Harada Sheet based on new guidance and needs:

**Current Harada Sheet:**
- Title: ${currentSheet.title}
- Main Goal: ${currentSheet.mainGoal}
${currentSheet.description ? `- Description: ${currentSheet.description}` : ''}

**Current Pillars:**
${currentPillars}

**New Guidance/Needs:**
${newGuidance}

**Harada Method Context:**
${ragContext}

**Requirements:**
- Update the Harada Sheet to incorporate the new guidance while maintaining the core goal
- Keep or refine the title and main goal as appropriate based on the new guidance
- Redesign the 8 pillars (positions 0-7) to better align with the new needs
- Each pillar must have exactly 8 tasks (positions 0-7)
- Tasks should be daily, actionable habits that support each pillar
- Everything must support the main goal (updated if needed)
- Use authentic Harada Method principles from the context above
- The goal title should be exactly what makes sense - never include Main Goal, Task, or Pillar as a prefix or postfix since it is implied

Generate the complete redesigned Harada Sheet structure following the response format.`
}
