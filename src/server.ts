import type { FastifyInstance } from 'fastify'
import Fastify from './app.js'
import config from './config/config.js'
import {
  startVoiceNoteProcessingWorker,
  stopVoiceNoteProcessingWorker
} from './services/voiceNoteProcessing/queue.js'

let fastify: FastifyInstance
let isShuttingDown = false

const start = async () => {
  fastify = await Fastify()
  startVoiceNoteProcessingWorker()

  try {
    await fastify.listen({
      port: config.server.port,
      host: config.server.host
    })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

const gracefulShutdown = async (signal: string) => {
  // Prevent multiple shutdown attempts
  if (isShuttingDown) {
    return
  }
  isShuttingDown = true

  if (!fastify) {
    process.exit(0)
    return
  }

  // Set a timeout to force exit if shutdown takes too long
  const forceExitTimer = setTimeout(() => {
    console.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10000) // 10 second timeout

  try {
    fastify.log.info(`Received ${signal}. Starting graceful shutdown...`)
    stopVoiceNoteProcessingWorker()
    await fastify.close()
    fastify.log.info('Server closed successfully')
    clearTimeout(forceExitTimer)
    process.exit(0)
  } catch (closeError) {
    fastify.log.error(closeError, 'Error during shutdown:')
    clearTimeout(forceExitTimer)
    process.exit(1)
  }
}

// Handle shutdown signals - ensure the async function completes
process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM').catch(err => {
    console.error('Shutdown error:', err)
    process.exit(1)
  })
})

process.on('SIGINT', () => {
  gracefulShutdown('SIGINT').catch(err => {
    console.error('Shutdown error:', err)
    process.exit(1)
  })
})

// Handle uncaught errors
process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err)
  gracefulShutdown('uncaughtException').finally(() => process.exit(1))
})

process.on('unhandledRejection', reason => {
  console.error('Unhandled rejection:', reason)
  gracefulShutdown('unhandledRejection').finally(() => process.exit(1))
})

start()
