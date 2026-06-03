import type { Dog } from '../generated/client.js'
import { isS3Ready } from '../config/s3.js'
import { getPresignedDogPhotoViewUrl } from '../services/s3/dogPhotos.js'

export type DogDto = Omit<Dog, 'photoKey' | 'shareCode'> & {
  photoUrl: string | null
  role?: string
  defaultCarePlan?: string
  shareCode?: string
}

export async function serializeDog(
  dog: Dog,
  extras?: { role?: string; defaultCarePlan?: string; includeShareCode?: boolean }
): Promise<DogDto> {
  const photoUrl =
    dog.photoKey && isS3Ready() ? await getPresignedDogPhotoViewUrl(dog.photoKey) : null
  const { photoKey: _photoKey, shareCode, ...rest } = dog
  const { includeShareCode, ...publicExtras } = extras ?? {}
  return {
    ...rest,
    photoUrl,
    ...(includeShareCode ? { shareCode } : {}),
    ...publicExtras
  }
}

export async function serializeDogs(
  dogs: Array<Dog & { role?: string }>
): Promise<DogDto[]> {
  return Promise.all(dogs.map(d => serializeDog(d, d.role ? { role: d.role } : undefined)))
}
