import { FastifyInstance, FastifyPluginOptions } from 'fastify';

export async function healthRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // Health check endpoint
  fastify.get('/', async (_request, _reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  });

  // Readiness check
  fastify.get('/ready', async (_request, _reply) => {
    // Add checks for database, external services, etc.
    return {
      status: 'ready',
      checks: {
        database: 'ok',
        // Add more health checks here
      }
    };
  });
}

