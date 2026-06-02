import { prisma } from './prisma.js'
import type { AuthenticatedRequest } from '../types/auth.js'

/**
 * Ensures the authenticated user exists in the User table (for FK constraints).
 * Call before creating Team or Session so Team.userId / Session.userId reference a valid User.
 */
export async function ensureUserExists(request: AuthenticatedRequest): Promise<void> {
  const { id, email } = request.user
  await prisma.user.upsert({
    where: { id },
    create: { id, email, firstName: null, lastName: null },
    update: {} // no-op if exists
  })
}
