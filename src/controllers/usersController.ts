import { FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { AuthenticatedRequest } from '../types/auth.js'
import {
  sendNotFound,
  sendSuccess,
  sendPaginated,
  sendUpdated,
  sendCreated
} from '../utils/responseHelpers.js'

/**
 * Clean user controller
 * No permission complexity - just business logic
 */

export class UsersController {
  /**
   * Create user (called during sign-up)
   * Middleware: auth (automatic)
   */
  async createUser(request: AuthenticatedRequest, reply: FastifyReply) {
    const data = request.body as {
      id: string
      email: string
      firstName?: string
      lastName?: string
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { id: data.id }
    })

    if (existingUser) {
      return sendSuccess(reply, { user: existingUser })
    }

    // Create new user
    const user = await prisma.user.create({
      data: {
        id: data.id,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName
      }
    })

    return sendCreated(reply, { user }, 'User created successfully')
  }

  /**
   * Get current user profile
   * Middleware: auth (automatic)
   */
  async getProfile(request: AuthenticatedRequest, reply: FastifyReply) {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id }
    })

    if (!user) {
      return sendNotFound(reply, 'User not found')
    }

    return sendSuccess(reply, { user })
  }

  /**
   * Update current user profile
   * Middleware: validate(updateUserSchema)
   */
  async updateProfile(request: AuthenticatedRequest, reply: FastifyReply) {
    const data = request.body as Record<string, unknown> // Already validated by Zod

    const user = await prisma.user.update({
      where: { id: request.user.id },
      data
    })

    return sendUpdated(reply, { user }, 'Profile updated successfully')
  }

  /**
   * List users
   * Middleware: validateQuery(userListQuerySchema)
   */
  async getUsers(request: AuthenticatedRequest, reply: FastifyReply) {
    const { page = 1, limit = 10, search } = request.query as { page?: number; limit?: number; search?: string }

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } }
          ]
        }
      : {}

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ])

    return sendPaginated(reply, users, {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    })
  }

  /**
   * Get specific user
   * Middleware: validateParams(userIdParamSchema)
   */
  async getUser(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }

    const user = await prisma.user.findUnique({
      where: { id }
    })

    if (!user) {
      return sendNotFound(reply, 'User not found')
    }

    return sendSuccess(reply, { user })
  }

  /**
   * Update specific user
   * Middleware: [validateParams(userIdParamSchema), validate(updateUserSchema)]
   */
  async updateUser(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const data = request.body as Record<string, unknown> // Already validated by Zod

    // Only allow users to update their own profile
    if (id !== request.user.id) {
      return reply.code(403).send({
        success: false,
        error: 'Forbidden',
        message: 'You can only update your own profile'
      })
    }

    const user = await prisma.user.update({
      where: { id },
      data
    })

    return sendUpdated(reply, { user }, 'User updated successfully')
  }
}
