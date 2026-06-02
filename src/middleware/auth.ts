import { FastifyRequest, FastifyReply } from 'fastify'
import { clerkClient, getAuth } from '@clerk/fastify'

// Extend the FastifyRequest interface to include user information and Clerk session
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string
      email: string
      type?: string
      companyId?: number | null
      lawFirmId?: number | null
    }
    session?: {
      userId: string
    }
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Debug logging
    request.log.info('🔐 Authentication check started')

    // Use Clerk's getAuth function to properly handle the JWT token
    const { userId } = getAuth(request)

    request.log.info(`📋 Auth result - userId: ${userId}`)

    if (!userId) {
      request.log.warn('❌ No userId found in request')
      return reply.status(401).send({
        success: false,
        message: 'Authentication required'
      })
    }

    request.log.info(`✅ UserId found: ${userId}`)

    // Get user information from Clerk (including metadata)
    const user = await clerkClient.users.getUser(userId)

    if (!user) {
      request.log.warn(`❌ User not found for userId: ${userId}`)
      return reply.status(401).send({
        success: false,
        message: 'User not found'
      })
    }

    // // Identify user in PostHog for analytics
    // try {
    //   request.server.posthogClient.identify({
    //     distinctId: userId,
    //   });
    // } catch (error) {
    //   // Don't fail authentication if PostHog fails
    //   request.log.warn(error, 'Failed to identify user in PostHog');
    // }

    // Extract primary email
    const primaryEmail = user.emailAddresses?.[0]?.emailAddress
    request.log.info(`✅ User found: ${primaryEmail || 'no email'}`)

    // Extract metadata
    const metadata = user.publicMetadata as {
      type?: string
      companyId?: number
      lawFirmId?: number
    }

    // Attach complete user information to the request
    request.user = {
      id: user.id,
      email: primaryEmail || '',
      type: metadata.type,
      companyId: metadata.companyId || null,
      lawFirmId: metadata.lawFirmId || null
    }

    request.log.info(
      `✅ Authentication successful with metadata: type=${metadata.type}, companyId=${metadata.companyId}`
    )
    return
  } catch (error) {
    request.log.error(error, '❌ Authentication error:')
    return reply.status(401).send({
      success: false,
      message: 'Authentication failed'
    })
  }
}

export async function optionalAuth(request: FastifyRequest) {
  try {
    const { userId } = getAuth(request)

    if (!userId) {
      // No userId, but that's okay for optional auth
      return
    }

    // Get user information from Clerk
    const user = await clerkClient.users.getUser(userId)

    if (user) {
      // Identify user in PostHog for analytics
      // try {
      //   request.server.posthogClient.identify({
      //     distinctId: userId
      //   })
      // } catch (error) {
      //   // Don't fail authentication if PostHog fails
      //   request.log.warn(error, 'Failed to identify user in PostHog')
      // }

      // Extract metadata for optional auth too
      const metadata = user.publicMetadata as {
        type?: string
        companyId?: number
        lawFirmId?: number
      }

      // Attach user information to the request
      request.user = {
        id: user.id,
        email: user.emailAddresses[0]?.emailAddress || '',
        type: metadata.type,
        companyId: metadata.companyId || null,
        lawFirmId: metadata.lawFirmId || null
      }
    }

    return
  } catch (error) {
    request.log.error(error, 'Optional authentication error:')
    // Don't fail the request for optional auth errors
    return
  }
}

// Utility function to sync user metadata to Clerk
export async function syncUserMetadataToClerk(
  clerkUserId: string,
  userData: {
    type: string
    companyId: number | null
    lawFirmId: number | null
  }
) {
  try {
    await clerkClient.users.updateUserMetadata(clerkUserId, {
      publicMetadata: {
        type: userData.type,
        companyId: userData.companyId,
        lawFirmId: userData.lawFirmId
      }
    })

    console.log(`✅ Synced metadata to Clerk for user ${clerkUserId}:`, userData)
    return true
  } catch (error) {
    console.error(`❌ Failed to sync metadata to Clerk for user ${clerkUserId}:`, error)
    return false
  }
}
