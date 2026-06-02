import type { FastifyInstance } from 'fastify'
import {
  getCampaignBySlug,
  getCampaignsList,
  postIterateCampaign,
  postSaveCampaign
} from '../controllers/campaignsController.js'

export default async function campaignsRoutes(fastify: FastifyInstance) {
  fastify.get('/', getCampaignsList)
  fastify.get('/:slug', getCampaignBySlug)
  fastify.post('/', postSaveCampaign)
  fastify.post('/:slug/iterate', postIterateCampaign)
}
