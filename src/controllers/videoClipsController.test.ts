/**
 * VideoClip routes — machine proof for issue 0022 (DB-free; always runs).
 *
 * Drives the REAL route plugin (validation preHandlers + controller +
 * dogAccess + s3 presign policy) over Fastify inject against an in-memory
 * Prisma fake. AWS is stubbed at the seams only: `getSignedUrl` returns a
 * deterministic URL and `getS3Client` a spy — content-type, size-cap, and
 * per-dog key checks are the real service code.
 *
 * Proves: non-member 403 on every route; presign restricted to video content
 * types; register→today-payload→url→delete round-trip; standalone vs
 * exercise-linked clips; cross-log dailyCareActionId rejected; day/history
 * payloads embed the day's clips.
 */
import { describe, it, before, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'

// ── Fixture ids (route params are uuid-validated) ────────────────────────────

const DOG_A = '11111111-1111-4111-8111-111111111111'
const DOG_B = '22222222-2222-4222-8222-222222222222'
const LOG_A1 = 'aaaaaaa1-0000-4000-8000-000000000001'
const LOG_A2 = 'aaaaaaa2-0000-4000-8000-000000000002'
const LOG_B1 = 'bbbbbbb1-0000-4000-8000-000000000001'
const ACTION_A1 = 'ccccccc1-0000-4000-8000-000000000001' // belongs to LOG_A1
const ACTION_A2 = 'ccccccc2-0000-4000-8000-000000000002' // belongs to LOG_A2
const MEMBER = 'user-member'
const OUTSIDER = 'user-outsider'

// ── In-memory Prisma fake ─────────────────────────────────────────────────────

type Row = Record<string, unknown>

const memberships = new Set<string>([`${DOG_A}:${MEMBER}`, `${DOG_B}:user-b-owner`])
const dogRows = new Map<string, Row>()
const logRows = new Map<string, Row>()
const actionRows = new Map<string, Row>()
const clipRows = new Map<string, Row>()

function seedDog(id: string, name: string): void {
  dogRows.set(id, {
    id,
    name,
    breed: null,
    age: null,
    sex: null,
    weightLbs: null,
    condition: null,
    vetName: null,
    vetPhone: null,
    photoKey: null,
    notes: null,
    shareCode: `SHARE-${name}`,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z')
  })
}

function seedLog(id: string, dogId: string, dateIso: string): void {
  logRows.set(id, {
    id,
    dogId,
    date: new Date(dateIso),
    summary: null,
    bucketScores: null,
    scoreComputedAt: null,
    scoreInputVersion: null,
    createdAt: new Date(dateIso),
    updatedAt: new Date(dateIso)
  })
}

function clipsForLog(dailyCareLogId: string): Row[] {
  return [...clipRows.values()]
    .filter(c => c.dailyCareLogId === dailyCareLogId)
    .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())
}

function resetFixture(): void {
  dogRows.clear()
  logRows.clear()
  actionRows.clear()
  clipRows.clear()
  seedDog(DOG_A, 'Stark')
  seedDog(DOG_B, 'Other')
  seedLog(LOG_A1, DOG_A, '2026-07-01T00:00:00.000Z')
  seedLog(LOG_A2, DOG_A, '2026-07-02T00:00:00.000Z')
  seedLog(LOG_B1, DOG_B, '2026-07-01T00:00:00.000Z')
  actionRows.set(ACTION_A1, { id: ACTION_A1, dailyCareLogId: LOG_A1, status: 'COMPLETED' })
  actionRows.set(ACTION_A2, { id: ACTION_A2, dailyCareLogId: LOG_A2, status: 'PENDING' })
}

const fakePrisma = {
  dogMember: {
    async findUnique({ where }: { where: { dogId_userId: { dogId: string; userId: string } } }) {
      const { dogId, userId } = where.dogId_userId
      return memberships.has(`${dogId}:${userId}`)
        ? { id: `${dogId}:${userId}`, dogId, userId, role: 'caregiver', createdAt: new Date() }
        : null
    }
  },
  user: {
    async upsert() {
      return {}
    }
  },
  dog: {
    async findUniqueOrThrow({ where }: { where: { id: string } }) {
      const dog = dogRows.get(where.id)
      if (!dog) throw new Error(`dog ${where.id} not found`)
      return { ...dog }
    }
  },
  dailyCareLog: {
    async findFirst({ where }: { where: { id: string; dogId: string } }) {
      const log = logRows.get(where.id)
      if (!log || log.dogId !== where.dogId) return null
      return { id: log.id }
    },
    async findUnique({ where }: { where: { dogId_date: { dogId: string; date: Date } } }) {
      const { dogId, date } = where.dogId_date
      for (const log of logRows.values()) {
        if (log.dogId === dogId && (log.date as Date).getTime() === date.getTime()) {
          return { id: log.id }
        }
      }
      return null
    },
    async create({ data }: { data: Row }) {
      const id = randomUUID()
      logRows.set(id, {
        id,
        dogId: data.dogId,
        date: data.date,
        summary: null,
        bucketScores: null,
        scoreComputedAt: null,
        scoreInputVersion: null,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      return { id }
    },
    async findUniqueOrThrow({ where }: { where: { id: string } }) {
      const log = logRows.get(where.id)
      if (!log) throw new Error(`log ${where.id} not found`)
      return {
        ...log,
        dailyCareActions: [],
        voiceNotes: [],
        healthObservations: [],
        videoClips: clipsForLog(where.id)
      }
    },
    async findMany({ where }: { where: { dogId: string } }) {
      return [...logRows.values()]
        .filter(l => l.dogId === where.dogId)
        .sort((a, b) => (b.date as Date).getTime() - (a.date as Date).getTime())
        .map(log => {
          const logActions = [...actionRows.values()].filter(a => a.dailyCareLogId === log.id)
          const videoClips = clipsForLog(log.id as string)
          return {
            ...log,
            _count: {
              dailyCareActions: logActions.length,
              healthObservations: 0,
              voiceNotes: 0,
              videoClips: videoClips.length
            },
            dailyCareActions: logActions
              .filter(a => a.status === 'COMPLETED')
              .map(a => ({ id: a.id })),
            videoClips
          }
        })
    },
    async count({ where }: { where: { dogId: string } }) {
      return [...logRows.values()].filter(l => l.dogId === where.dogId).length
    }
  },
  dailyCareAction: {
    async findFirst({ where }: { where: { id: string; dailyCareLogId: string } }) {
      const action = actionRows.get(where.id)
      if (!action || action.dailyCareLogId !== where.dailyCareLogId) return null
      return { id: action.id }
    }
  },
  videoClip: {
    async create({ data }: { data: Row }) {
      const row: Row = {
        id: randomUUID(),
        dogId: data.dogId,
        dailyCareLogId: data.dailyCareLogId,
        dailyCareActionId: data.dailyCareActionId ?? null,
        userId: data.userId,
        s3Key: data.s3Key,
        durationSeconds: data.durationSeconds ?? null,
        createdAt: new Date()
      }
      clipRows.set(row.id as string, row)
      return { ...row }
    },
    async findFirst({ where }: { where: { id: string; dogId: string } }) {
      const clip = clipRows.get(where.id)
      if (!clip || clip.dogId !== where.dogId) return null
      return { ...clip }
    },
    async delete({ where }: { where: { id: string } }) {
      const clip = clipRows.get(where.id)
      if (!clip) throw new Error(`clip ${where.id} not found`)
      clipRows.delete(where.id)
      return { ...clip }
    }
  }
}

// ── AWS seam stubs ────────────────────────────────────────────────────────────

const SIGNED_URL = 'https://s3.test.invalid/signed'
const s3Sends: string[] = []
const fakeS3Client = {
  async send(command: { constructor: { name: string } }) {
    s3Sends.push(command.constructor.name)
    return {}
  }
}

// ── App under test ────────────────────────────────────────────────────────────

const auth = { userId: MEMBER }
let app: FastifyInstance
let loadTodayPayload: typeof import('../services/dailyCare/resolveTodayLog.js')['loadTodayPayload']
let dogsController: import('./dogsController.js').DogsController

before(async () => {
  process.env.AWS_REGION ??= 'us-east-1'
  process.env.S3_BUCKET_DOG_PHOTOS ??= 'test-bucket'
  process.env.AWS_ACCESS_KEY_ID ??= 'test-key'
  process.env.AWS_SECRET_ACCESS_KEY ??= 'test-secret'

  const url = (rel: string) => new URL(rel, import.meta.url).href
  await mock.module(url('../lib/prisma.ts'), { namedExports: { prisma: fakePrisma } })
  await mock.module(url('../lib/s3Client.ts'), {
    namedExports: { getS3Client: () => fakeS3Client }
  })
  await mock.module('@aws-sdk/s3-request-presigner', {
    namedExports: { getSignedUrl: async () => SIGNED_URL }
  })

  const routesMod = await import('../routes/videoClipRoutes.js')
  const todayMod = await import('../services/dailyCare/resolveTodayLog.js')
  const dogsMod = await import('./dogsController.js')
  loadTodayPayload = todayMod.loadTodayPayload
  dogsController = new dogsMod.DogsController()

  app = Fastify({ logger: false })
  app.addHook('preHandler', async request => {
    request.user = { id: auth.userId, email: 'test@test.invalid' }
  })
  await app.register(routesMod.default, { prefix: '/v1/dogs' })
  await app.ready()

  resetFixture()
})

after(async () => {
  await app.close()
})

function dogKey(dogId: string): string {
  return `video-clips/${dogId}/${randomUUID()}.mp4`
}

// ── Membership guard ──────────────────────────────────────────────────────────

describe('VideoClip routes — non-member gets 403 on every route', () => {
  it('rejects presign, register, url, and delete for a non-member', async () => {
    resetFixture()
    auth.userId = OUTSIDER

    const presign = await app.inject({
      method: 'POST',
      url: `/v1/dogs/${DOG_A}/video-clips/presign`,
      payload: { contentType: 'video/mp4', contentLength: 1000 }
    })
    const register = await app.inject({
      method: 'POST',
      url: `/v1/dogs/${DOG_A}/video-clips`,
      payload: { s3Key: dogKey(DOG_A), dailyCareLogId: LOG_A1 }
    })
    const getUrl = await app.inject({
      method: 'GET',
      url: `/v1/dogs/${DOG_A}/video-clips/${randomUUID()}/url`
    })
    const del = await app.inject({
      method: 'DELETE',
      url: `/v1/dogs/${DOG_A}/video-clips/${randomUUID()}`
    })

    for (const [name, res] of [
      ['presign', presign],
      ['register', register],
      ['url', getUrl],
      ['delete', del]
    ] as const) {
      assert.equal(res.statusCode, 403, `${name} must 403 for non-members`)
      assert.equal(res.json().success, false)
    }
    assert.equal(clipRows.size, 0, 'no clip row may be created for a non-member')

    auth.userId = MEMBER
  })
})

// ── Presign policy ────────────────────────────────────────────────────────────

describe('POST /v1/dogs/:id/video-clips/presign', () => {
  it('returns a PUT URL, per-dog s3Key, and Content-Type header for video/mp4', async () => {
    resetFixture()
    const res = await app.inject({
      method: 'POST',
      url: `/v1/dogs/${DOG_A}/video-clips/presign`,
      payload: { contentType: 'video/mp4', contentLength: 1_000_000 }
    })

    assert.equal(res.statusCode, 200)
    const { data } = res.json()
    assert.equal(data.uploadUrl, SIGNED_URL)
    assert.ok(
      (data.s3Key as string).startsWith(`video-clips/${DOG_A}/`),
      `s3Key must be under the dog prefix, got ${data.s3Key}`
    )
    assert.deepEqual(data.headers, { 'Content-Type': 'video/mp4' })
    assert.ok(typeof data.expiresIn === 'number' && data.expiresIn > 0)
  })

  it('rejects non-video content types with 400', async () => {
    for (const contentType of ['image/png', 'audio/mpeg', 'video/x-msvideo']) {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/dogs/${DOG_A}/video-clips/presign`,
        payload: { contentType, contentLength: 1000 }
      })
      assert.equal(res.statusCode, 400, `${contentType} must be rejected`)
      assert.match(res.json().error, /Unsupported video type/)
    }
  })

  it('rejects uploads above the size cap with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/dogs/${DOG_A}/video-clips/presign`,
      payload: { contentType: 'video/mp4', contentLength: 500 * 1024 * 1024 + 1 }
    })
    assert.equal(res.statusCode, 400)
    assert.match(res.json().error, /500 MB or smaller/)
  })
})

// ── Register validation ───────────────────────────────────────────────────────

describe('POST /v1/dogs/:id/video-clips — register', () => {
  it('registers a standalone clip with the exact frozen field set', async () => {
    resetFixture()
    const s3Key = dogKey(DOG_A)
    const res = await app.inject({
      method: 'POST',
      url: `/v1/dogs/${DOG_A}/video-clips`,
      payload: { s3Key, dailyCareLogId: LOG_A1, durationSeconds: 42 }
    })

    assert.equal(res.statusCode, 201)
    const { data } = res.json()
    assert.deepEqual(Object.keys(data).sort(), [
      'createdAt',
      'dailyCareActionId',
      'dailyCareLogId',
      'dogId',
      'durationSeconds',
      'id',
      's3Key',
      'userId'
    ])
    assert.equal(data.dogId, DOG_A)
    assert.equal(data.dailyCareLogId, LOG_A1)
    assert.equal(data.dailyCareActionId, null)
    assert.equal(data.userId, MEMBER)
    assert.equal(data.s3Key, s3Key)
    assert.equal(data.durationSeconds, 42)
    assert.ok(!Number.isNaN(Date.parse(data.createdAt)), 'createdAt must be ISO')
  })

  it('registers an exercise-linked clip when the action belongs to the log', async () => {
    resetFixture()
    const res = await app.inject({
      method: 'POST',
      url: `/v1/dogs/${DOG_A}/video-clips`,
      payload: { s3Key: dogKey(DOG_A), dailyCareLogId: LOG_A1, dailyCareActionId: ACTION_A1 }
    })
    assert.equal(res.statusCode, 201)
    assert.equal(res.json().data.dailyCareActionId, ACTION_A1)
  })

  it('rejects a dailyCareActionId from another log with 400', async () => {
    resetFixture()
    const res = await app.inject({
      method: 'POST',
      url: `/v1/dogs/${DOG_A}/video-clips`,
      payload: { s3Key: dogKey(DOG_A), dailyCareLogId: LOG_A1, dailyCareActionId: ACTION_A2 }
    })
    assert.equal(res.statusCode, 400)
    assert.match(res.json().error, /does not belong/)
    assert.equal(clipRows.size, 0)
  })

  it("rejects a dailyCareLogId belonging to another dog with 404", async () => {
    resetFixture()
    const res = await app.inject({
      method: 'POST',
      url: `/v1/dogs/${DOG_A}/video-clips`,
      payload: { s3Key: dogKey(DOG_A), dailyCareLogId: LOG_B1 }
    })
    assert.equal(res.statusCode, 404)
    assert.equal(clipRows.size, 0)
  })

  it("rejects an s3Key under another dog's prefix with 400", async () => {
    resetFixture()
    const res = await app.inject({
      method: 'POST',
      url: `/v1/dogs/${DOG_A}/video-clips`,
      payload: { s3Key: dogKey(DOG_B), dailyCareLogId: LOG_A1 }
    })
    assert.equal(res.statusCode, 400)
    assert.match(res.json().error, /Invalid video clip key/)
  })

  it("resolves today's log when no dailyCareLogId or date is given", async () => {
    resetFixture()
    const { todayUtcDateString, formatCalendarDate } = await import(
      '../services/dailyCare/dateUtils.js'
    )
    const res = await app.inject({
      method: 'POST',
      url: `/v1/dogs/${DOG_A}/video-clips`,
      payload: { s3Key: dogKey(DOG_A) }
    })

    assert.equal(res.statusCode, 201)
    const { data } = res.json()
    const todayLog = [...logRows.values()].find(
      l => l.dogId === DOG_A && formatCalendarDate(l.date as Date) === todayUtcDateString()
    )
    assert.ok(todayLog, "today's log must be created on demand")
    assert.equal(data.dailyCareLogId, todayLog.id)
  })
})

// ── Round-trip: register → today payload → url → delete ─────────────────────

describe('VideoClip round-trip and day payload embedding', () => {
  it('register → today-payload → url → delete → url 404', async () => {
    resetFixture()
    s3Sends.length = 0

    // register (standalone) + register (exercise-linked)
    const standalone = await app.inject({
      method: 'POST',
      url: `/v1/dogs/${DOG_A}/video-clips`,
      payload: { s3Key: dogKey(DOG_A), dailyCareLogId: LOG_A1, durationSeconds: 7 }
    })
    const linked = await app.inject({
      method: 'POST',
      url: `/v1/dogs/${DOG_A}/video-clips`,
      payload: { s3Key: dogKey(DOG_A), dailyCareLogId: LOG_A1, dailyCareActionId: ACTION_A1 }
    })
    assert.equal(standalone.statusCode, 201)
    assert.equal(linked.statusCode, 201)
    const standaloneClip = standalone.json().data
    const linkedClip = linked.json().data

    // today/day payload embeds both clips with the frozen shape
    const payload = await loadTodayPayload(DOG_A, LOG_A1)
    const payloadClips = payload.dailyLog.videoClips
    assert.equal(payloadClips.length, 2, 'day payload must embed the day clips')
    const ids = payloadClips.map((c: { id: string }) => c.id)
    assert.ok(ids.includes(standaloneClip.id))
    assert.ok(ids.includes(linkedClip.id))
    const embeddedLinked = payloadClips.find((c: { id: string }) => c.id === linkedClip.id)
    const embeddedStandalone = payloadClips.find(
      (c: { id: string }) => c.id === standaloneClip.id
    )
    assert.ok(embeddedLinked)
    assert.ok(embeddedStandalone)
    assert.equal(embeddedLinked.dailyCareActionId, ACTION_A1)
    assert.equal(embeddedStandalone.dailyCareActionId, null)
    assert.equal(typeof embeddedStandalone.createdAt, 'string')

    // presigned GET url
    const urlRes = await app.inject({
      method: 'GET',
      url: `/v1/dogs/${DOG_A}/video-clips/${standaloneClip.id}/url`
    })
    assert.equal(urlRes.statusCode, 200)
    assert.equal(urlRes.json().data.url, SIGNED_URL)
    assert.ok(urlRes.json().data.expiresIn > 0)

    // delete removes the row and the S3 object
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/v1/dogs/${DOG_A}/video-clips/${standaloneClip.id}`
    })
    assert.equal(delRes.statusCode, 200)
    assert.ok(
      s3Sends.includes('DeleteObjectCommand'),
      'delete must attempt S3 object cleanup'
    )

    const afterDelete = await app.inject({
      method: 'GET',
      url: `/v1/dogs/${DOG_A}/video-clips/${standaloneClip.id}/url`
    })
    assert.equal(afterDelete.statusCode, 404)

    // the other clip survives
    const remaining = await loadTodayPayload(DOG_A, LOG_A1)
    assert.deepEqual(
      remaining.dailyLog.videoClips.map((c: { id: string }) => c.id),
      [linkedClip.id]
    )
  })

  it('unknown clip id → 404 on url and delete', async () => {
    resetFixture()
    const missing = randomUUID()
    const urlRes = await app.inject({
      method: 'GET',
      url: `/v1/dogs/${DOG_A}/video-clips/${missing}/url`
    })
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/v1/dogs/${DOG_A}/video-clips/${missing}`
    })
    assert.equal(urlRes.statusCode, 404)
    assert.equal(delRes.statusCode, 404)
  })
})

// ── History payload ───────────────────────────────────────────────────────────

describe('GET /v1/dogs/:id/history — clips embedded per day', () => {
  it('each history log entry carries its videoClips and videoClipCount', async () => {
    resetFixture()
    await app.inject({
      method: 'POST',
      url: `/v1/dogs/${DOG_A}/video-clips`,
      payload: { s3Key: dogKey(DOG_A), dailyCareLogId: LOG_A1 }
    })

    const state: { statusCode: number; body: unknown } = { statusCode: 200, body: undefined }
    const reply = {
      status(code: number) {
        state.statusCode = code
        return reply
      },
      send(body: unknown) {
        state.body = body
        return reply
      }
    }
    await dogsController.getHistory(
      {
        params: { id: DOG_A },
        query: {},
        user: { id: MEMBER, email: 'test@test.invalid' }
      } as unknown as Parameters<typeof dogsController.getHistory>[0],
      reply as unknown as Parameters<typeof dogsController.getHistory>[1]
    )

    assert.equal(state.statusCode, 200)
    const body = state.body as {
      data: {
        logs: Array<{
          id: string
          videoClipCount: number
          videoClips: Array<{ id: string; s3Key: string; createdAt: string }>
        }>
      }
    }
    const withClip = body.data.logs.find(l => l.id === LOG_A1)
    const withoutClip = body.data.logs.find(l => l.id === LOG_A2)
    assert.ok(withClip, 'LOG_A1 must be in history')
    assert.equal(withClip.videoClipCount, 1)
    assert.equal(withClip.videoClips.length, 1)
    assert.equal(typeof withClip.videoClips[0].createdAt, 'string')
    assert.ok(withoutClip)
    assert.equal(withoutClip.videoClipCount, 0)
    assert.deepEqual(withoutClip.videoClips, [])
  })
})
