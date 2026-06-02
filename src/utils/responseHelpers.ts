import { FastifyReply } from 'fastify'

interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
  code?: string
  pagination?: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export function sendSuccess<T>(reply: FastifyReply, data: T, statusCode: number = 200, message?: string) {
  const response: ApiResponse<T> = {
    success: true,
    data: data
  }

  if (message) {
    response.message = message
  }

  return reply.status(statusCode).send(response)
}

export function sendError(
  reply: FastifyReply,
  error: string,
  statusCode: number = 400,
  message?: string,
  code?: string
) {
  const response: ApiResponse = {
    success: false,
    error
  }

  if (message) {
    response.message = message
  }

  if (code) {
    response.code = code
  }

  return reply.status(statusCode).send(response)
}

export function sendPaginated<T>(
  reply: FastifyReply,
  data: T[],
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  },
  statusCode: number = 200
) {
  const response: ApiResponse<T[]> = {
    success: true,
    data,
    pagination
  }

  return reply.status(statusCode).send(response)
}

// Convenience methods for common status codes
export function sendCreated<T>(reply: FastifyReply, data: T, message?: string) {
  return sendSuccess(reply, data, 201, message)
}

export function sendNoContent(reply: FastifyReply) {
  return reply.status(204).send()
}

export function sendNotFound(
  reply: FastifyReply,
  error: string = 'Resource not found',
  message?: string,
  code?: string
) {
  return sendError(reply, error, 404, message, code)
}

export function sendUnauthorized(reply: FastifyReply, error: string = 'Unauthorized', message?: string) {
  return sendError(reply, error, 401, message)
}

export function sendForbidden(reply: FastifyReply, error: string = 'Forbidden', message?: string) {
  return sendError(reply, error, 403, message)
}

export function sendConflict(reply: FastifyReply, error: string = 'Conflict', message?: string) {
  return sendError(reply, error, 409, message)
}

export function sendValidationError(reply: FastifyReply, error: string = 'Validation failed', message?: string) {
  return sendError(reply, error, 422, message)
}

export function sendInternalError(reply: FastifyReply, error: string = 'Internal server error', message?: string) {
  return sendError(reply, error, 500, message)
}

// Convenience methods for common operations
export function sendCreatedWithMessage<T>(reply: FastifyReply, data: T, message: string) {
  return sendCreated(reply, data, message)
}

export function sendUpdated<T>(reply: FastifyReply, data: T, message?: string) {
  return sendSuccess(reply, data, 200, message || 'Updated successfully')
}

export function sendDeleted(reply: FastifyReply, message: string = 'Deleted successfully') {
  return sendSuccess(reply, null, 200, message)
}
