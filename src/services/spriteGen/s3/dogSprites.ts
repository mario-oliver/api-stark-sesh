import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getDogSpritePrefix, getS3Config } from '../../../config/s3.js'
import { getS3Client } from '../../../lib/s3Client.js'
import type { SpriteAnimation } from '../engine/types.js'

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * S3 key: dog-sprites/{safeUserId}/{dogId}/{spriteSetId}/{animation}/{animation}_{NNN}.png
 */
export function buildSpriteFrameKey(
  userId: string,
  dogId: string,
  spriteSetId: string,
  animation: SpriteAnimation,
  frameIndex: number
): string {
  const prefix = getDogSpritePrefix()
  const padded = String(frameIndex + 1).padStart(3, '0')
  return `${prefix}/${safeId(userId)}/${safeId(dogId)}/${safeId(spriteSetId)}/${animation}/${animation}_${padded}.png`
}

export function buildSpriteStoragePrefix(userId: string, dogId: string, spriteSetId: string): string {
  const prefix = getDogSpritePrefix()
  return `${prefix}/${safeId(userId)}/${safeId(dogId)}/${safeId(spriteSetId)}`
}

export function assertSpriteKeyOwnedByUser(key: string, userId: string, dogId: string, spriteSetId: string): void {
  const expected = buildSpriteStoragePrefix(userId, dogId, spriteSetId)
  if (!key.startsWith(expected)) {
    throw new Error('Invalid sprite key for this user/dog/set')
  }
}

/**
 * Upload a generated frame buffer directly to S3 (server-side PUT).
 */
export async function putSpriteFrame(
  userId: string,
  dogId: string,
  spriteSetId: string,
  animation: SpriteAnimation,
  frameIndex: number,
  buffer: Buffer
): Promise<string> {
  const key = buildSpriteFrameKey(userId, dogId, spriteSetId, animation, frameIndex)
  const config = getS3Config()
  const client = getS3Client()

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable'
    })
  )

  return key
}

/**
 * Stream a sprite frame from S3 (used for the frame serving endpoint).
 */
export async function streamSpriteFrame(key: string): Promise<{
  body: NodeJS.ReadableStream
  contentType: string
}> {
  const config = getS3Config()
  const client = getS3Client()

  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key
    })
  )

  if (!response.Body) {
    throw new Error('Sprite frame object is empty')
  }

  return {
    body: response.Body as NodeJS.ReadableStream,
    contentType: response.ContentType ?? 'image/png'
  }
}

/**
 * Generate a presigned GET URL for a sprite frame (for manifest URL preview).
 */
export async function getPresignedSpriteFrameViewUrl(key: string): Promise<string | null> {
  if (!key?.trim()) return null
  const config = getS3Config()
  const client = getS3Client()

  const command = new GetObjectCommand({ Bucket: config.bucket, Key: key })
  return getSignedUrl(client, command, { expiresIn: config.viewExpiresSeconds })
}
