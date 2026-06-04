import { TavilySearch } from '@langchain/tavily'
import type { ResearchSnippet } from '../types.js'

function getTavilyTool() {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not configured')
  }
  return new TavilySearch({
    maxResults: 4,
    includeAnswer: true,
    searchDepth: 'basic',
    tavilyApiKey: apiKey
  })
}

function summarizeSearchResult(raw: unknown, query: string): string {
  if (!raw || typeof raw !== 'object') {
    return `No results for: ${query}`
  }

  const data = raw as {
    answer?: string
    results?: Array<{ title?: string; content?: string }>
  }

  const parts: string[] = []
  if (data.answer) {
    parts.push(data.answer)
  }
  if (data.results?.length) {
    for (const r of data.results.slice(0, 3)) {
      const title = r.title ?? 'Result'
      const content = (r.content ?? '').slice(0, 400)
      parts.push(`${title}: ${content}`)
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : `No detailed results for: ${query}`
}

export async function runTavilyResearch(queries: string[]): Promise<ResearchSnippet[]> {
  const tool = getTavilyTool()
  const snippets: ResearchSnippet[] = []

  for (const query of queries.slice(0, 3)) {
    try {
      const result = await tool.invoke({ query: `canine dog rehabilitation ${query}` })
      snippets.push({
        query,
        summary: summarizeSearchResult(result, query)
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed'
      snippets.push({ query, summary: `Search error: ${message}` })
    }
  }

  return snippets
}
