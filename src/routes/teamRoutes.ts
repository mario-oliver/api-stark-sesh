import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { TeamsController } from '../controllers/teamsController.js'
import { validate, validateParams } from '../middleware/validation.js'
import { AuthenticatedRequest } from '../types/auth.js'
import {
  addTeamMemberSchema,
  createTeamSchema,
  updateTeamMemberParamsSchema,
  updateTeamMemberSchema,
  teamIdParamSchema
} from '../schemas/teamSchemas.js'

export default async function teamRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
) {
  const controller = new TeamsController()

  fastify.post('/', {
    preHandler: validate(createTeamSchema),
    handler: async (request, reply) => {
      return controller.createTeam(request as AuthenticatedRequest, reply)
    }
  })

  fastify.get('/', {
    handler: async (request, reply) => {
      return controller.listTeams(request as AuthenticatedRequest, reply)
    }
  })

  fastify.get('/:id', {
    preHandler: validateParams(teamIdParamSchema),
    handler: async (request, reply) => {
      return controller.getTeam(request as AuthenticatedRequest, reply)
    }
  })

  fastify.post('/:id/members', {
    preHandler: [validateParams(teamIdParamSchema), validate(addTeamMemberSchema)],
    handler: async (request, reply) => {
      return controller.addTeamMember(request as AuthenticatedRequest, reply)
    }
  })

  fastify.patch('/:id/members/:memberId', {
    preHandler: [validateParams(updateTeamMemberParamsSchema), validate(updateTeamMemberSchema)],
    handler: async (request, reply) => {
      return controller.updateTeamMember(request as AuthenticatedRequest, reply)
    }
  })
}
