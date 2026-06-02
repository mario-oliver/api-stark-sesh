import { prisma } from '../../lib/prisma.js'
import { Prisma } from '../../generated/client.js'
import { runObservationTagging } from '../observationTagger/runTagging.js'
import { deriveObservationStats, recomputeObservationTotalsFromLines } from './statDerivation.js'

const POLL_INTERVAL_MS = Number(process.env.OBS_JOB_POLL_MS || 1500)
const LEASE_MS = Number(process.env.OBS_JOB_LEASE_MS || 60_000)
const MAX_ATTEMPTS = Number(process.env.OBS_JOB_MAX_ATTEMPTS || 5)

let started = false
let timer: NodeJS.Timeout | null = null
let processing = false
let schemaMissingWarned = false

function isMissingObservationJobTable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2021' &&
    (error.meta as { modelName?: string } | undefined)?.modelName === 'ObservationProcessingJob'
  )
}

function nextRunForAttempt(attempts: number) {
  const delaySeconds = Math.min(60, Math.max(2, attempts * 2))
  return new Date(Date.now() + delaySeconds * 1000)
}

async function claimNextJob() {
  const now = new Date()
  const candidate = await prisma.observationProcessingJob.findFirst({
    where: {
      status: { in: ['PENDING', 'RETRY'] },
      nextRunAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }]
    },
    orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'asc' }]
  })
  if (!candidate) return null

  const claimed = await prisma.observationProcessingJob.updateMany({
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

async function processJob(jobId: string, observationId: string) {
  const startedAt = Date.now()
  try {
    await runObservationTagging(observationId)
    await deriveObservationStats(observationId)
    await recomputeObservationTotalsFromLines(observationId)
    await prisma.observationProcessingJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        leaseExpiresAt: null,
        lastError: null
      }
    })
    console.info('[observation-processing] completed', {
      jobId,
      observationId,
      elapsedMs: Date.now() - startedAt
    })
  } catch (error) {
    const existing = await prisma.observationProcessingJob.findUnique({ where: { id: jobId } })
    const attempts = existing?.attempts ?? 1
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Observation processing failed'
    const terminal = attempts >= MAX_ATTEMPTS
    await prisma.observationProcessingJob.update({
      where: { id: jobId },
      data: {
        status: terminal ? 'FAILED' : 'RETRY',
        nextRunAt: terminal ? new Date() : nextRunForAttempt(attempts),
        leaseExpiresAt: null,
        lastError: message
      }
    })
    console.warn('[observation-processing] failed', {
      jobId,
      observationId,
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
      await processJob(job.id, job.observationId)
    }
    schemaMissingWarned = false
  } catch (error) {
    if (isMissingObservationJobTable(error)) {
      if (!schemaMissingWarned) {
        schemaMissingWarned = true
        console.warn(
          '[observation-processing] ObservationProcessingJob table missing. Run DB migrations to enable async observation/stat processing.'
        )
      }
      return
    }
    console.error('[observation-processing] worker tick failed', error)
  } finally {
    processing = false
  }
}

export async function enqueueObservationProcessingJob(
  observationId: string,
  payload?: Record<string, unknown>,
  options?: { force?: boolean }
) {
  try {
    if (!options?.force) {
      const existing = await prisma.observationProcessingJob.findFirst({
        where: {
          observationId,
          status: { in: ['PENDING', 'RUNNING', 'RETRY'] }
        },
        select: { id: true }
      })
      if (existing) {
        return
      }
    }
    await prisma.observationProcessingJob.create({
      data: {
        observationId,
        status: 'PENDING',
        nextRunAt: new Date(),
        leaseExpiresAt: null,
        lastError: null,
        ...(payload == null
          ? { payload: Prisma.JsonNull }
          : { payload: payload as Prisma.InputJsonValue })
      }
    })
  } catch (error) {
    if (isMissingObservationJobTable(error)) {
      if (!schemaMissingWarned) {
        schemaMissingWarned = true
        console.warn(
          '[observation-processing] enqueue skipped because ObservationProcessingJob table is missing.'
        )
      }
      return
    }
    throw error
  }
}

export function startObservationProcessingWorker() {
  if (started) return
  started = true
  timer = setInterval(() => {
    void workerTick().catch(error => {
      console.error('[observation-processing] unhandled worker tick error', error)
    })
  }, POLL_INTERVAL_MS)
  timer.unref?.()
  void workerTick().catch(error => {
    console.error('[observation-processing] unhandled worker start error', error)
  })
}

export function stopObservationProcessingWorker() {
  if (!timer) return
  clearInterval(timer)
  timer = null
  started = false
}
