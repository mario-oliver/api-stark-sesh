import { prisma } from '../../lib/prisma.js'
import { Prisma } from '../../generated/client.js'
import { processVoiceNote } from './processVoiceNote.js'

const POLL_INTERVAL_MS = Number(process.env.OBS_JOB_POLL_MS || 1500)
const LEASE_MS = Number(process.env.OBS_JOB_LEASE_MS || 60_000)
const MAX_ATTEMPTS = Number(process.env.OBS_JOB_MAX_ATTEMPTS || 5)

let started = false
let timer: NodeJS.Timeout | null = null
let processing = false

function nextRunForAttempt(attempts: number) {
  const delaySeconds = Math.min(60, Math.max(2, attempts * 2))
  return new Date(Date.now() + delaySeconds * 1000)
}

async function claimNextJob() {
  const now = new Date()
  const candidate = await prisma.voiceNoteProcessingJob.findFirst({
    where: {
      status: { in: ['PENDING', 'RETRY'] },
      nextRunAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }]
    },
    orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'asc' }]
  })
  if (!candidate) return null

  const claimed = await prisma.voiceNoteProcessingJob.updateMany({
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

async function processJob(jobId: string, voiceNoteId: string) {
  const startedAt = Date.now()
  try {
    await processVoiceNote(voiceNoteId)
    await prisma.voiceNoteProcessingJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        leaseExpiresAt: null,
        lastError: null
      }
    })
    console.info('[voice-note-processing] completed', {
      jobId,
      voiceNoteId,
      elapsedMs: Date.now() - startedAt
    })
  } catch (error) {
    const existing = await prisma.voiceNoteProcessingJob.findUnique({ where: { id: jobId } })
    const attempts = existing?.attempts ?? 1
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Voice note processing failed'
    const terminal = attempts >= MAX_ATTEMPTS

    if (terminal) {
      await prisma.voiceNote.update({
        where: { id: voiceNoteId },
        data: { processingStatus: 'FAILED' }
      })
    }

    await prisma.voiceNoteProcessingJob.update({
      where: { id: jobId },
      data: {
        status: terminal ? 'FAILED' : 'RETRY',
        nextRunAt: terminal ? new Date() : nextRunForAttempt(attempts),
        leaseExpiresAt: null,
        lastError: message
      }
    })
    console.warn('[voice-note-processing] failed', {
      jobId,
      voiceNoteId,
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
      await processJob(job.id, job.voiceNoteId)
    }
  } catch (error) {
    console.error('[voice-note-processing] worker tick failed', error)
  } finally {
    processing = false
  }
}

export async function enqueueVoiceNoteProcessingJob(
  voiceNoteId: string,
  payload?: Record<string, unknown>,
  options?: { force?: boolean }
) {
  if (!options?.force) {
    const existing = await prisma.voiceNoteProcessingJob.findFirst({
      where: {
        voiceNoteId,
        status: { in: ['PENDING', 'RUNNING', 'RETRY'] }
      },
      select: { id: true }
    })
    if (existing) return
  }

  await prisma.voiceNoteProcessingJob.create({
    data: {
      voiceNoteId,
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

export function startVoiceNoteProcessingWorker() {
  if (started) return
  started = true
  timer = setInterval(() => {
    void workerTick().catch(error => {
      console.error('[voice-note-processing] unhandled worker tick error', error)
    })
  }, POLL_INTERVAL_MS)
  timer.unref?.()
  void workerTick().catch(error => {
    console.error('[voice-note-processing] unhandled worker start error', error)
  })
}

export function stopVoiceNoteProcessingWorker() {
  if (!timer) return
  clearInterval(timer)
  timer = null
  started = false
}
