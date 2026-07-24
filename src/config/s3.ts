import 'dotenv/config'

const DEFAULT_UPLOAD_EXPIRES = 900
const DEFAULT_VIEW_EXPIRES = 86_400

export const MAX_DOG_PHOTO_BYTES = 10 * 1024 * 1024
export const MAX_CARE_STEP_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_CARE_STEP_VIDEO_BYTES = 25 * 1024 * 1024
/** VideoClip uploads go straight to S3 via presigned PUT (bypasses the 25 MB
 * multipart path), so the cap is generous: ~2 min of phone video. */
export const MAX_VIDEO_CLIP_BYTES = 500 * 1024 * 1024

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}

export function assertS3Ready(): void {
  requireEnv('AWS_REGION')
  requireEnv('S3_BUCKET_DOG_PHOTOS')
  requireEnv('AWS_ACCESS_KEY_ID')
  requireEnv('AWS_SECRET_ACCESS_KEY')
}

export function isS3Ready(): boolean {
  try {
    assertS3Ready()
    return true
  } catch {
    return false
  }
}

export function getDogPhotoPrefix(): string {
  return (process.env.S3_DOG_PHOTO_PREFIX || 'dog-photos').replace(/^\/+|\/+$/g, '')
}

export function getCareStepMediaPrefix(): string {
  return (process.env.S3_CARE_STEP_MEDIA_PREFIX || 'care-step-media').replace(/^\/+|\/+$/g, '')
}

export function getVideoClipPrefix(): string {
  return (process.env.S3_VIDEO_CLIP_PREFIX || 'video-clips').replace(/^\/+|\/+$/g, '')
}

export function getDogSpritePrefix(): string {
  return (process.env.S3_DOG_SPRITE_PREFIX || 'dog-sprites').replace(/^\/+|\/+$/g, '')
}

export function getSpriteFrameSize(): number {
  return Number(process.env.SPRITE_FRAME_SIZE) || 1245
}

export function getSpriteImageModel(): string {
  return process.env.SPRITE_IMAGE_MODEL || 'gpt-image-1'
}

export function getS3Config() {
  assertS3Ready()
  return {
    region: requireEnv('AWS_REGION'),
    bucket: requireEnv('S3_BUCKET_DOG_PHOTOS'),
    dogPhotoPrefix: getDogPhotoPrefix(),
    uploadExpiresSeconds: Number(process.env.S3_PRESIGN_UPLOAD_EXPIRES_SEC) || DEFAULT_UPLOAD_EXPIRES,
    viewExpiresSeconds: Number(process.env.S3_PRESIGN_VIEW_EXPIRES_SEC) || DEFAULT_VIEW_EXPIRES,
    maxPhotoBytes: MAX_DOG_PHOTO_BYTES
  }
}
