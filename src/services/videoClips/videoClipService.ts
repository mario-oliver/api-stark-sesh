import { prisma } from '../../lib/prisma.js'
import { parseCalendarDate, todayUtcDateString } from '../dailyCare/dateUtils.js'

/**
 * VideoClip — dumb artifact (context.md#VideoClip, ADR-0004 §5). The serialized
 * shape below is the frozen contract web and iOS mock against:
 * `{ id, dogId, dailyCareLogId, dailyCareActionId?, userId, s3Key,
 *    durationSeconds?, createdAt }` — nothing more.
 */

export type VideoClipRow = {
  id: string
  dogId: string
  dailyCareLogId: string
  dailyCareActionId: string | null
  userId: string
  s3Key: string
  durationSeconds: number | null
  createdAt: Date
}

export function serializeVideoClip(clip: VideoClipRow) {
  return {
    id: clip.id,
    dogId: clip.dogId,
    dailyCareLogId: clip.dailyCareLogId,
    dailyCareActionId: clip.dailyCareActionId,
    userId: clip.userId,
    s3Key: clip.s3Key,
    durationSeconds: clip.durationSeconds,
    createdAt: clip.createdAt.toISOString()
  }
}

export function serializeVideoClips(clips: VideoClipRow[] | null | undefined) {
  // Tolerate a missing include: callers embed clips wherever a DailyCareLog is
  // loaded, and not every query (or test fake) selects the relation.
  return (clips ?? []).map(serializeVideoClip)
}

/**
 * Resolve the DailyCareLog a clip registers against.
 * - `dailyCareLogId` given → it must belong to this dog.
 * - otherwise → find-or-create the log for `date` (today when no date given).
 *   Plan seeding is left to resolveTodayLog on the next Today load.
 */
export async function resolveClipDailyCareLog(args: {
  dogId: string
  dailyCareLogId?: string
  date?: string
}): Promise<{ logId: string } | { error: string; statusCode: 400 | 404 }> {
  if (args.dailyCareLogId) {
    const log = await prisma.dailyCareLog.findFirst({
      where: { id: args.dailyCareLogId, dogId: args.dogId },
      select: { id: true }
    })
    if (!log) {
      return { error: 'Daily care log not found for this dog', statusCode: 404 }
    }
    return { logId: log.id }
  }

  const dateStr = args.date ?? todayUtcDateString()
  const logDate = parseCalendarDate(dateStr)
  if (!logDate) {
    return { error: 'Invalid date format. Use YYYY-MM-DD.', statusCode: 400 }
  }

  const existing = await prisma.dailyCareLog.findUnique({
    where: { dogId_date: { dogId: args.dogId, date: logDate } },
    select: { id: true }
  })
  if (existing) {
    return { logId: existing.id }
  }

  const created = await prisma.dailyCareLog.create({
    data: { dogId: args.dogId, date: logDate },
    select: { id: true }
  })
  return { logId: created.id }
}

/** A linked exercise execution must belong to the clip's own daily log. */
export async function assertActionBelongsToLog(
  dailyCareActionId: string,
  dailyCareLogId: string
): Promise<boolean> {
  const action = await prisma.dailyCareAction.findFirst({
    where: { id: dailyCareActionId, dailyCareLogId },
    select: { id: true }
  })
  return action !== null
}
