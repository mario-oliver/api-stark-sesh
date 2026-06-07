import { FastifyRequest, FastifyReply } from 'fastify'
import { getActiveEntitlement } from '../services/billing/entitlements.js'
import { sendForbidden } from '../utils/responseHelpers.js'

export async function requirePro(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user
  if (!user?.id) {
    return sendForbidden(reply, 'Authentication required')
  }

  const entitlement = await getActiveEntitlement(user.id)
  if (!entitlement.hasPro) {
    return sendForbidden(reply, 'Pro subscription required', 'Upgrade to Pro to access this feature')
  }
}
