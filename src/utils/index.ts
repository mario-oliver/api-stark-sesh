// Shared utility functions
export function formatDate(date: Date): string {
  return date.toISOString()
}

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}
