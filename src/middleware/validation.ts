import { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import { z } from 'zod';

/**
 * Dead simple Zod validation middleware
 * DRY as a bone - define schema once, use everywhere
 */

export const validate = <T extends z.ZodSchema>(
  schema: T,
): preHandlerHookHandler => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate request body
      request.body = schema.parse(request.body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: error.issues.map((err: z.ZodIssue) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      throw error;
    }
  };
};

export const validateParams = <T extends z.ZodSchema>(
  schema: T,
): preHandlerHookHandler => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      request.params = schema.parse(request.params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Invalid parameters',
          details: error.issues.map((err: z.ZodIssue) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      throw error;
    }
  };
};

export const validateQuery = <T extends z.ZodSchema>(
  schema: T,
): preHandlerHookHandler => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      request.query = schema.parse(request.query);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Invalid query parameters',
          details: error.issues.map((err: z.ZodIssue) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      throw error;
    }
  };
};

// Note: Schemas are now imported directly in routes where needed
// This middleware only provides validation utilities
