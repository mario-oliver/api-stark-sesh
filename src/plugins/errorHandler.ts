import { FastifyInstance, FastifyError } from 'fastify';

export default async function errorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    fastify.log.error(error);

    // Handle validation errors
    if (error.validation) {
      return reply.status(400).send({
        success: false,
        message: 'Validation error',
        errors: error.validation,
      });
    }

    // Handle Prisma errors
    // if (error.code) {
    //   switch (error.code) {
    //     case 'P2002':
    //       return reply.status(409).send({
    //         success: false,
    //         message: 'Resource already exists',
    //         field: error.meta?.target?.[0] || 'unknown',
    //       });
    //     case 'P2025':
    //       return reply.status(404).send({
    //         success: false,
    //         message: 'Resource not found',
    //       });
    //     case 'P2003':
    //       return reply.status(400).send({
    //         success: false,
    //         message: 'Foreign key constraint failed',
    //       });
    //     default:
    //       break;
    //   }
    // }

    // Handle HTTP errors
    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        success: false,
        message: error.message || 'An error occurred',
      });
    }

    // Default error response
    return reply.status(500).send({
      success: false,
      message:
        process.env.NODE_ENV === 'production'
          ? 'Internal Server Error'
          : error.message || 'Internal Server Error',
    });
  });

  // Handle 404 errors
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      message: 'Route not found',
      path: request.url,
    });
  });
}
