// Type declarations for LangChain subpath imports
// These help TypeScript resolve subpath exports when using moduleResolution: "node"

declare module '@langchain/core/vectorstores' {
  export type { VectorStore } from '@langchain/core/dist/vectorstores'
  export * from '@langchain/core/dist/vectorstores'
}

declare module '@langchain/core/documents' {
  export type { Document } from '@langchain/core/dist/documents'
  export * from '@langchain/core/dist/documents'
}
