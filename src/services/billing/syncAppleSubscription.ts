import type { SubscriptionStatus } from '../../generated/client.js'
import { prisma } from '../../lib/prisma.js'
import { resolveApplePlanSlug } from '../../config/plans.js'
import { getAppleApiClient, getAppleSignedDataVerifier, isAppleConfigured } from './appleClient.js'
import { Status } from '@apple/app-store-server-library'

function mapAppleStatus(status: number | undefined): SubscriptionStatus {
  switch (status) {
    case Status.ACTIVE:
    case Status.BILLING_GRACE_PERIOD:
      return 'active'
    case Status.BILLING_RETRY:
      return 'past_due'
    case Status.EXPIRED:
    case Status.REVOKED:
      return 'canceled'
    default:
      return 'none'
  }
}

export async function syncAppleSubscription(
  userId: string,
  originalTransactionId: string
): Promise<void> {
  if (!isAppleConfigured()) {
    throw new Error('Apple App Store is not configured')
  }

  const client = getAppleApiClient()
  const response = await client.getAllSubscriptionStatuses(originalTransactionId)

  let bestProductId: string | null = null
  let bestStatus: SubscriptionStatus = 'none'
  let periodEnd: Date | null = null
  let cancelAtPeriodEnd = false

  for (const group of response.data ?? []) {
    for (const item of group.lastTransactions ?? []) {
      const status = mapAppleStatus(item.status)
      if (status !== 'active' && status !== 'trialing' && status !== 'past_due') continue

      const verifier = getAppleSignedDataVerifier()
      const transaction = await verifier.verifyAndDecodeTransaction(item.signedTransactionInfo!)
      const productId = transaction.productId ?? ''
      const expires = transaction.expiresDate ? new Date(transaction.expiresDate) : null

      if (status === 'active' || status === 'past_due') {
        bestProductId = productId
        bestStatus = status
        periodEnd = expires
        cancelAtPeriodEnd = false
        break
      }
    }
    if (bestProductId) break
  }

  if (!bestProductId) {
    await prisma.subscription.upsert({
      where: {
        userId_source: { userId, source: 'apple' }
      },
      update: {
        status: 'none',
        planSlug: '',
        periodEnd: null,
        cancelAtPeriodEnd: false,
        appleOriginalTxId: originalTransactionId
      },
      create: {
        userId,
        source: 'apple',
        status: 'none',
        planSlug: '',
        appleOriginalTxId: originalTransactionId
      }
    })
    return
  }

  await prisma.subscription.upsert({
    where: {
      userId_source: { userId, source: 'apple' }
    },
    update: {
      status: bestStatus,
      planSlug: resolveApplePlanSlug(bestProductId),
      appleOriginalTxId: originalTransactionId,
      periodEnd,
      cancelAtPeriodEnd
    },
    create: {
      userId,
      source: 'apple',
      status: bestStatus,
      planSlug: resolveApplePlanSlug(bestProductId),
      appleOriginalTxId: originalTransactionId,
      periodEnd,
      cancelAtPeriodEnd
    }
  })
}

export async function verifyAndSyncAppleTransaction(
  userId: string,
  signedTransaction: string
): Promise<{ originalTransactionId: string }> {
  const verifier = getAppleSignedDataVerifier()
  const transaction = await verifier.verifyAndDecodeTransaction(signedTransaction)
  const originalTransactionId = String(transaction.originalTransactionId)

  await syncAppleSubscription(userId, originalTransactionId)

  return { originalTransactionId }
}
