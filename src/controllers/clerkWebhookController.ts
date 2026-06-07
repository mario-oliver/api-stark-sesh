import { FastifyReply } from 'fastify'
import { Webhook } from 'svix'
import { prisma } from '../lib/prisma.js'
import { sendError } from '../utils/responseHelpers.js'

interface ClerkUserCreatedEvent {
  type: string
  data: {
    id: string
    email_addresses?: Array<{ email_address: string }>
    first_name?: string | null
    last_name?: string | null
  }
}

export class ClerkWebhookController {
  async handleWebhook(
    request: {
      rawBody?: Buffer
      headers: Record<string, string | string[] | undefined>
      log: { error: (err: unknown, msg?: string) => void }
    },
    reply: FastifyReply
  ) {
    const secret = process.env.CLERK_WEBHOOK_SECRET
    if (!secret) {
      return sendError(reply, 'CLERK_WEBHOOK_SECRET is not configured', 503)
    }

    const rawBody = request.rawBody
    if (!rawBody) {
      return sendError(reply, 'Missing raw body', 400)
    }

    const svixId = request.headers['svix-id']
    const svixTimestamp = request.headers['svix-timestamp']
    const svixSignature = request.headers['svix-signature']

    if (
      typeof svixId !== 'string' ||
      typeof svixTimestamp !== 'string' ||
      typeof svixSignature !== 'string'
    ) {
      return sendError(reply, 'Missing Svix headers', 400)
    }

    let event: ClerkUserCreatedEvent
    try {
      const wh = new Webhook(secret)
      event = wh.verify(rawBody.toString('utf8'), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature
      }) as ClerkUserCreatedEvent
    } catch (err) {
      request.log.error(err, 'Clerk webhook verification failed')
      return sendError(reply, 'Invalid webhook signature', 400)
    }

    if (event.type === 'user.created') {
      const email = event.data.email_addresses?.[0]?.email_address
      if (email) {
        await prisma.user.upsert({
          where: { id: event.data.id },
          create: {
            id: event.data.id,
            email,
            firstName: event.data.first_name ?? null,
            lastName: event.data.last_name ?? null
          },
          update: {
            email,
            firstName: event.data.first_name ?? null,
            lastName: event.data.last_name ?? null
          }
        })
      }
    }

    return reply.status(200).send({ received: true })
  }
}
