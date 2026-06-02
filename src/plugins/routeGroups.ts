import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

type AuthLevel = 'none' | 'optional' | 'required';

interface RouteGroupOptions extends FastifyPluginOptions {
  prefix: string;
  authLevel: AuthLevel;
  routes: (fastify: FastifyInstance) => Promise<void>;
}

export default async function routeGroups(
  fastify: FastifyInstance,
  options: RouteGroupOptions,
) {
  const { prefix, authLevel, routes } = options;

  await fastify.register(
    async (groupFastify) => {
      // Apply appropriate authentication based on level
      switch (authLevel) {
        case 'required':
          groupFastify.addHook('preHandler', requireAuth);
          break;
        case 'optional':
          groupFastify.addHook('preHandler', optionalAuth);
          break;
        case 'none':
        default:
          // No authentication required
          break;
      }

      // Register the actual routes
      await routes(groupFastify);
    },
    { prefix },
  );
}

// Convenience functions for different auth levels
export function publicRoutes(
  fastify: FastifyInstance,
  options: Omit<RouteGroupOptions, 'authLevel'>,
) {
  return routeGroups(fastify, {
    prefix: options.prefix,
    routes: options.routes,
    authLevel: 'none',
  });
}

export function optionalAuthRoutes(
  fastify: FastifyInstance,
  options: Omit<RouteGroupOptions, 'authLevel'>,
) {
  return routeGroups(fastify, {
    prefix: options.prefix,
    routes: options.routes,
    authLevel: 'optional',
  });
}

export function protectedRoutes(
  fastify: FastifyInstance,
  options: Omit<RouteGroupOptions, 'authLevel'>,
) {
  return routeGroups(fastify, {
    prefix: options.prefix,
    routes: options.routes,
    authLevel: 'required',
  });
}
