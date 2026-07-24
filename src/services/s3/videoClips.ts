import { randomUUID } from 'node:crypto'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getVideoClipPrefix, getS3Config, MAX_VIDEO_CLIP_BYTES } from '../../config/s3.js'
import { getS3Client } from '../../lib/s3Client.js'

/**
 * VideoClip S3 artifacts (context.md#VideoClip): presigned PUT upload, presigned
 * GET playback/download, delete. Video content types only — the clip is a dumb
 * artifact, so there is no processing pipeline behind these keys.
 */

const VIDEO_CONTENT_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime'])

const EXT_BY_TYPE: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov'
}

export function assertAllowedVideoClipContentType(contentType: string): string {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase()
  if (!normalized || !VIDEO_CONTENT_TYPES.has(normalized)) {
    throw new Error('Unsupported video type. Use MP4, WebM, or MOV.')
  }
  return normalized
}

/** Keys are prefixed per dog so a clip key can be tied back to its dog. */
export function buildVideoClipKey(dogId: string, contentType: string): string {
  const prefix = getVideoClipPrefix()
  const ext = EXT_BY_TYPE[contentType] ?? 'mp4'
  const safeDogId = dogId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `${prefix}/${safeDogId}/${randomUUID()}.${ext}`
}

export function assertVideoClipKeyForDog(s3Key: string, dogId: string): void {
  const prefix = getVideoClipPrefix()
  const safeDogId = dogId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const expected = `${prefix}/${safeDogId}/`
  if (!s3Key.startsWith(expected)) {
    throw new Error('Invalid video clip key for this dog')
  }
}

export async function createVideoClipUploadPresign(args: {
  dogId: string
  contentType: string
  contentLength: number
}): Promise<{
  uploadUrl: string
  s3Key: string
  headers: { 'Content-Type': string }
  expiresIn: number
}> {
  const contentType = assertAllowedVideoClipContentType(args.contentType)

  if (args.contentLength > MAX_VIDEO_CLIP_BYTES) {
    throw new Error(`Video must be ${MAX_VIDEO_CLIP_BYTES / (1024 * 1024)} MB or smaller`)
  }

  const s3Key = buildVideoClipKey(args.dogId, contentType)
  const config = getS3Config()
  const client = getS3Client()

  const putCommand = new PutObjectCommand({
    Bucket: config.bucket,
    Key: s3Key,
    ContentType: contentType
  })

  const uploadUrl = await getSignedUrl(client, putCommand, {
    expiresIn: config.uploadExpiresSeconds
  })

  return {
    uploadUrl,
    s3Key,
    headers: { 'Content-Type': contentType },
    expiresIn: config.uploadExpiresSeconds
  }
}

/** Presigned GET for playback/download. */
export async function getPresignedVideoClipUrl(
  s3Key: string | null | undefined
): Promise<{ url: string; expiresIn: number } | null> {
  if (!s3Key?.trim()) {
    return null
  }

  const config = getS3Config()
  const client = getS3Client()
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: s3Key
  })

  const url = await getSignedUrl(client, command, { expiresIn: config.viewExpiresSeconds })
  return { url, expiresIn: config.viewExpiresSeconds }
}

/** Best-effort object removal when a clip row is deleted. */
export async function deleteVideoClipObject(s3Key: string): Promise<void> {
  const config = getS3Config()
  const client = getS3Client()
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: s3Key
    })
  )
}
