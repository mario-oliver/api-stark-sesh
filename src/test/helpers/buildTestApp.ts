/**
 * Loaded dynamically inside before() — AFTER setupTestEnv() and registerMockAuditGraph().
 * This ensures:
 *  1. process.env.DATABASE_URL already points at DATABASE_URL_TEST when lib/prisma.ts
 *     is first imported transitively through dogRoutes.
 *  2. mock.module for graphRunner.ts is already registered before sessionService loads it.
 */
import Fastify from 'fastify'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import dogRoutes from '../../routes/dogRoutes.js'

/** Mutate this before each inject call to control which user the stub authenticates. */
export const testAuth = { userId: '', email: 'test@test.invalid' }

export async function buildTestApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false })

  // Auth stub: sets request.user from testAuth before every route handler.
  // Global addHook runs before route-level preHandlers so validation sees a
  // populated user.
  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    request.user = { id: testAuth.userId, email: testAuth.email }
  })

  await fastify.register(dogRoutes, { prefix: '/v1/dogs' })
  await fastify.ready()
  return fastify
}
