import { randomUUID } from 'node:crypto'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getDogPhotoPrefix, getS3Config, MAX_DOG_PHOTO_BYTES } from '../../config/s3.js'
import { getS3Client } from '../../lib/s3Client.js'

/** Formats browsers can render in <img> (exclude HEIC/HEIF). */
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
])

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

export function assertAllowedImageContentType(contentType: string): string {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase()
  if (!normalized || !ALLOWED_CONTENT_TYPES.has(normalized)) {
    throw new Error('Unsupported image type. Use JPEG, PNG, WebP, or GIF.')
  }
  return normalized
}

export function buildDogPhotoKey(userId: string, contentType: string): string {
  const dogPhotoPrefix = getDogPhotoPrefix()
  const ext = EXT_BY_TYPE[contentType] ?? 'jpg'
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `${dogPhotoPrefix}/${safeUserId}/${randomUUID()}.${ext}`
}

export function assertPhotoKeyOwnedByUser(photoKey: string, userId: string): void {
  const dogPhotoPrefix = getDogPhotoPrefix()
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const prefix = `${dogPhotoPrefix}/${safeUserId}/`
  if (!photoKey.startsWith(prefix)) {
    throw new Error('Invalid photo key for this user')
  }
}

export async function createDogPhotoUploadPresign(args: {
  userId: string
  contentType: string
  contentLength: number
}): Promise<{
  uploadUrl: string
  photoKey: string
  viewUrl: string
  headers: { 'Content-Type': string }
  expiresIn: number
}> {
  if (args.contentLength > MAX_DOG_PHOTO_BYTES) {
    throw new Error(`Photo must be ${MAX_DOG_PHOTO_BYTES / (1024 * 1024)} MB or smaller`)
  }

  const contentType = assertAllowedImageContentType(args.contentType)
  const photoKey = buildDogPhotoKey(args.userId, contentType)
  const config = getS3Config()
  const client = getS3Client()

  const putCommand = new PutObjectCommand({
    Bucket: config.bucket,
    Key: photoKey,
    ContentType: contentType
  })

  const uploadUrl = await getSignedUrl(client, putCommand, {
    expiresIn: config.uploadExpiresSeconds
  })

  const viewUrl = await getPresignedDogPhotoViewUrl(photoKey)
  if (!viewUrl) {
    throw new Error('Could not create photo view URL')
  }

  return {
    uploadUrl,
    photoKey,
    viewUrl,
    headers: { 'Content-Type': contentType },
    expiresIn: config.uploadExpiresSeconds
  }
}

export async function getPresignedDogPhotoViewUrl(
  photoKey: string | null | undefined
): Promise<string | null> {
  if (!photoKey?.trim()) {
    return null
  }

  const config = getS3Config()
  const client = getS3Client()
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: photoKey
  })

  return getSignedUrl(client, command, { expiresIn: config.viewExpiresSeconds })
}
