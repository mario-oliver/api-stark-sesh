import { S3Client } from '@aws-sdk/client-s3'
import { getS3Config } from '../config/s3.js'

let client: S3Client | null = null

export function getS3Client(): S3Client {
  if (!client) {
    const { region } = getS3Config()
    client = new S3Client({
      region,
      // Avoid checksum query params on presigned PUT URLs (breaks browser fetch uploads).
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
      }
    })
  }
  return client
}
