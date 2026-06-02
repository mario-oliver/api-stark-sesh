import { FastifyRequest } from 'fastify'

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string
    email: string
    type?: string
    companyId?: number | null
    lawFirmId?: number | null
  }
}


