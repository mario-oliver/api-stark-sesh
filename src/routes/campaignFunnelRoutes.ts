import type { FastifyInstance } from 'fastify'
import {
  getDefaultInput,
  getPerformance,
  postBrief,
  postOptimize,
  postVariants,
  runFullPipeline
} from '../controllers/campaignFunnelController.js'

export default async function campaignFunnelRoutes(fastify: FastifyInstance) {
  fastify.get('/defaults', getDefaultInput)
  fastify.post('/brief', postBrief)
  fastify.post('/variants', postVariants)
  fastify.get('/performance/:pageId', getPerformance)
  fastify.post('/optimize', postOptimize)
  fastify.post('/run', runFullPipeline)
}
