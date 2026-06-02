/**
 * RAG context for Harada Method. Returns empty string when PGVectorStore is not in use.
 * Re-enable by restoring @langchain/community and vectorStore/setup.ts, then using getVectorStore() here.
 */
export async function retrieveHaradaContext(_goalTitle: string, _goalDescription: string): Promise<string> {
  return ''
}
