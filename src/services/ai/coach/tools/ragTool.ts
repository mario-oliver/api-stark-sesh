import { tool } from 'langchain'
import * as z from 'zod'
import type { VectorStore } from '@langchain/core/vectorstores'

/** Type assertion avoids TS2589 (excessively deep instantiation) from LangChain tool() generics. */
export function createRAGTool(vectorStore: VectorStore) {
  // @ts-expect-error TS2589 - LangChain tool() has excessively deep generics on some TS versions
  return tool(
    async ({ query }: { query: string }) => {
      const results = await vectorStore.similaritySearch(query, 5)
      return results.map((doc, i) => `[${i + 1}] ${doc.pageContent}`).join('\n\n')
    },
    {
      name: 'search_harada_method',
      description: `Search the Harada Method book for relevant information about goal setting, 
                    pillars, tasks, methodology, and coaching principles. Use this to provide 
                    authentic Harada Method guidance.`,
      schema: z.object({
        query: z.string().describe('The search query about Harada Method principles or coaching advice')
      })
    }
  ) as unknown as { name: string; invoke: (input: { query: string }) => Promise<string> }
}
