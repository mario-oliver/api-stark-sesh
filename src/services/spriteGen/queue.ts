import { prisma } from '../../lib/prisma.js'
import { Prisma } from '../../generated/client.js'
import { runSpriteGenerationSession } from './orchestrator.js'

const POLL_INTERVAL_MS = Number(process.env.SPRITE_JOB_POLL_MS || 3000)
const LEASE_MS = Number(process.env.SPRITE_JOB_LEASE_MS || 300_000) // 5 min — image gen is slow
const MAX_ATTEMPTS = Number(process.env.SPRITE_JOB_MAX_ATTEMPTS || 3)

let started = false
let timer: NodeJS.Timeout | null = null
let processing = false

function nextRunForAttempt(attempts: number) {
  const delaySeconds = Math.min(120, Math.max(10, attempts * 15))
  return new Date(Date.now() + delaySeconds * 1000)
}

async function claimNextJob() {
  const now = new Date()
  const candidate = await prisma.spriteGenerationJob.findFirst({
    where: {
      status: { in: ['PENDING', 'RETRY'] },
      nextRunAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }]
    },
    orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'asc' }]
  })
  if (!candidate) return null

  const claimed = await prisma.spriteGenerationJob.updateMany({
    where: {
      id: candidate.id,
      status: { in: ['PENDING', 'RETRY'] },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }]
    },
    data: {
      status: 'RUNNING',
      attempts: { increment: 1 },
      leaseExpiresAt: new Date(Date.now() + LEASE_MS)
    }
  })

  if (claimed.count === 0) return null
  return candidate
}

async function processJob(jobId: string, sessionId: string) {
  const startedAt = Date.now()

  // Mark session as RUNNING
  await prisma.spriteGenerationSession.update({
    where: { id: sessionId },
    data: { status: 'RUNNING' }
  })

  try {
    await runSpriteGenerationSession(sessionId)

    await prisma.spriteGenerationJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        leaseExpiresAt: null,
        lastError: null
      }
    })

    console.info('[sprite-gen] completed', {
      jobId,
      sessionId,
      elapsedMs: Date.now() - startedAt
    })
  } catch (error) {
    const existing = await prisma.spriteGenerationJob.findUnique({ where: { id: jobId } })
    const attempts = existing?.attempts ?? 1
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Sprite generation failed'
    const terminal = attempts >= MAX_ATTEMPTS

    await prisma.spriteGenerationSession.update({
      where: { id: sessionId },
      data: { status: 'FAILED', error: message }
    })

    await prisma.spriteGenerationJob.update({
      where: { id: jobId },
      data: {
        status: terminal ? 'FAILED' : 'RETRY',
        nextRunAt: terminal ? new Date() : nextRunForAttempt(attempts),
        leaseExpiresAt: null,
        lastError: message
      }
    })

    console.warn('[sprite-gen] failed', {
      jobId,
      sessionId,
      attempts,
      terminal,
      message,
      elapsedMs: Date.now() - startedAt
    })
  }
}

async function workerTick() {
  if (processing) return
  processing = true
  try {
    for (;;) {
      const job = await claimNextJob()
      if (!job) break
      await processJob(job.id, job.sessionId)
    }
  } catch (error) {
    console.error('[sprite-gen] worker tick failed', error)
  } finally {
    processing = false
  }
}

export async function enqueueSpriteGenerationJob(
  sessionId: string,
  payload?: Record<string, unknown>
) {
  const existing = await prisma.spriteGenerationJob.findFirst({
    where: {
      sessionId,
      status: { in: ['PENDING', 'RUNNING', 'RETRY'] }
    },
    select: { id: true }
  })
  if (existing) return

  await prisma.spriteGenerationJob.create({
    data: {
      sessionId,
      status: 'PENDING',
      nextRunAt: new Date(),
      leaseExpiresAt: null,
      lastError: null,
      ...(payload == null
        ? { payload: Prisma.JsonNull }
        : { payload: payload as Prisma.InputJsonValue })
    }
  })
}

export function startSpriteGenerationWorker() {
  if (started) return
  started = true
  timer = setInterval(() => {
    void workerTick().catch((error) => {
      console.error('[sprite-gen] unhandled worker tick error', error)
    })
  }, POLL_INTERVAL_MS)
  timer.unref?.()
  void workerTick().catch((error) => {
    console.error('[sprite-gen] unhandled worker start error', error)
  })
}

export function stopSpriteGenerationWorker() {
  if (!timer) return
  clearInterval(timer)
  timer = null
  started = false
}
