import { FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import { sendError, sendSuccess } from '../utils/responseHelpers.js'
import { isAppleConfigured, getAppleSignedDataVerifier } from '../services/billing/appleClient.js'
import { syncAppleSubscription, verifyAndSyncAppleTransaction } from '../services/billing/syncAppleSubscription.js'
import { getActiveEntitlement } from '../services/billing/entitlements.js'

export class AppleController {
  async verifyTransaction(request: AuthenticatedRequest, reply: FastifyReply) {
    if (!isAppleConfigured()) {
      return sendError(reply, 'Apple App Store is not configured', 503)
    }

    const { signedTransaction } = request.body as { signedTransaction?: string }
    if (!signedTransaction?.trim()) {
      return sendError(reply, 'signedTransaction is required', 400)
    }

    try {
      await verifyAndSyncAppleTransaction(request.user.id, signedTransaction.trim())
      const entitlement = await getActiveEntitlement(request.user.id)
      return sendSuccess(reply, { entitlement })
    } catch (err) {
      request.log.error(err, 'Apple transaction verification failed')
      return sendError(reply, 'Transaction verification failed', 400)
    }
  }

  async handleNotification(request: { body: unknown; log: { error: (err: unknown, msg?: string) => void } }, reply: FastifyReply) {
    if (!isAppleConfigured()) {
      return reply.status(503).send({ error: 'Apple App Store is not configured' })
    }

    const body = request.body as { signedPayload?: string }
    const signedPayload = body?.signedPayload
    if (!signedPayload) {
      return reply.status(400).send({ error: 'Missing signedPayload' })
    }

    try {
      const verifier = getAppleSignedDataVerifier()
      const notification = await verifier.verifyAndDecodeNotification(signedPayload)

      const data = notification.data
      if (!data?.signedTransactionInfo) {
        return reply.status(200).send({ received: true })
      }

      const transaction = await verifier.verifyAndDecodeTransaction(data.signedTransactionInfo)
      const originalTransactionId = String(transaction.originalTransactionId)

      const existing = await prisma.subscription.findFirst({
        where: { appleOriginalTxId: originalTransactionId }
      })

      if (existing) {
        await syncAppleSubscription(existing.userId, originalTransactionId)
      }
    } catch (err) {
      request.log.error(err, 'Apple notification handling failed')
    }

    return reply.status(200).send({ received: true })
  }
}
