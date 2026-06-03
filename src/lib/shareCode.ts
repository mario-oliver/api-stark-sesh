import { randomBytes } from 'node:crypto'

/** Crockford base32 alphabet (no 0/O, 1/I/L, U). */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 8

export function generateShareCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i]! % ALPHABET.length]
  }
  return code
}

export function normalizeShareCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '')
}

export function formatShareCode(code: string): string {
  const normalized = normalizeShareCode(code)
  if (normalized.length <= 4) return normalized
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`
}
