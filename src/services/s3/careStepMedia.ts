import { randomUUID } from 'node:crypto'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getCareStepMediaPrefix, getS3Config, MAX_CARE_STEP_IMAGE_BYTES, MAX_CARE_STEP_VIDEO_BYTES } from '../../config/s3.js'
import { getS3Client } from '../../lib/s3Client.js'

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
])

const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime'])

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov'
}

export function assertAllowedCareStepContentType(contentType: string): {
  normalized: string
  isVideo: boolean
} {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase()
  if (!normalized) {
    throw new Error('Content type is required')
  }
  if (IMAGE_TYPES.has(normalized)) {
    return { normalized, isVideo: false }
  }
  if (VIDEO_TYPES.has(normalized)) {
    return { normalized, isVideo: true }
  }
  throw new Error('Unsupported media type. Use JPEG, PNG, WebP, GIF, MP4, WebM, or MOV.')
}

export function buildCareStepMediaKey(userId: string, contentType: string): string {
  const prefix = getCareStepMediaPrefix()
  const ext = EXT_BY_TYPE[contentType] ?? 'bin'
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `${prefix}/${safeUserId}/${randomUUID()}.${ext}`
}

export function assertCareStepMediaKeyOwnedByUser(mediaKey: string, userId: string): void {
  const prefix = getCareStepMediaPrefix()
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const expected = `${prefix}/${safeUserId}/`
  if (!mediaKey.startsWith(expected)) {
    throw new Error('Invalid media key for this user')
  }
}

export async function createCareStepMediaUploadPresign(args: {
  userId: string
  contentType: string
  contentLength: number
}): Promise<{
  uploadUrl: string
  mediaKey: string
  viewUrl: string
  headers: { 'Content-Type': string }
  expiresIn: number
}> {
  const { normalized, isVideo } = assertAllowedCareStepContentType(args.contentType)
  const maxBytes = isVideo ? MAX_CARE_STEP_VIDEO_BYTES : MAX_CARE_STEP_IMAGE_BYTES
  if (args.contentLength > maxBytes) {
    throw new Error(`File must be ${maxBytes / (1024 * 1024)} MB or smaller`)
  }

  const mediaKey = buildCareStepMediaKey(args.userId, normalized)
  const config = getS3Config()
  const client = getS3Client()

  const putCommand = new PutObjectCommand({
    Bucket: config.bucket,
    Key: mediaKey,
    ContentType: normalized
  })

  const uploadUrl = await getSignedUrl(client, putCommand, {
    expiresIn: config.uploadExpiresSeconds
  })

  const viewUrl = await getPresignedCareStepMediaViewUrl(mediaKey)
  if (!viewUrl) {
    throw new Error('Could not create media view URL')
  }

  return {
    uploadUrl,
    mediaKey,
    viewUrl,
    headers: { 'Content-Type': normalized },
    expiresIn: config.uploadExpiresSeconds
  }
}

export async function getPresignedCareStepMediaViewUrl(
  mediaKey: string | null | undefined
): Promise<string | null> {
  if (!mediaKey?.trim()) {
    return null
  }

  const config = getS3Config()
  const client = getS3Client()
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: mediaKey
  })

  return getSignedUrl(client, command, { expiresIn: config.viewExpiresSeconds })
}
