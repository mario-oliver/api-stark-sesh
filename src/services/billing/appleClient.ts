import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier
} from '@apple/app-store-server-library'
import { readFileSync } from 'node:fs'

function getAppleEnvironment(): Environment {
  return process.env.APPLE_ENVIRONMENT === 'production'
    ? Environment.PRODUCTION
    : Environment.SANDBOX
}

function getPrivateKey(): string {
  const inline = process.env.APPLE_APP_STORE_PRIVATE_KEY
  if (inline) {
    return inline.replace(/\\n/g, '\n')
  }
  const path = process.env.APPLE_APP_STORE_PRIVATE_KEY_PATH
  if (path) {
    return readFileSync(path, 'utf8')
  }
  throw new Error('Apple private key not configured (APPLE_APP_STORE_PRIVATE_KEY or _PATH)')
}

export function isAppleConfigured(): boolean {
  return Boolean(
    process.env.APPLE_APP_STORE_KEY_ID &&
      process.env.APPLE_APP_STORE_ISSUER_ID &&
      process.env.APPLE_BUNDLE_ID &&
      (process.env.APPLE_APP_STORE_PRIVATE_KEY || process.env.APPLE_APP_STORE_PRIVATE_KEY_PATH)
  )
}

export function getAppleApiClient(): AppStoreServerAPIClient {
  const keyId = process.env.APPLE_APP_STORE_KEY_ID
  const issuerId = process.env.APPLE_APP_STORE_ISSUER_ID
  const bundleId = process.env.APPLE_BUNDLE_ID
  if (!keyId || !issuerId || !bundleId) {
    throw new Error('Apple App Store API credentials are not fully configured')
  }
  return new AppStoreServerAPIClient(getPrivateKey(), keyId, issuerId, bundleId, getAppleEnvironment())
}

export function getAppleSignedDataVerifier(): SignedDataVerifier {
  const bundleId = process.env.APPLE_BUNDLE_ID
  const appAppleId = process.env.APPLE_APP_APPLE_ID
    ? Number(process.env.APPLE_APP_APPLE_ID)
    : undefined
  if (!bundleId) {
    throw new Error('APPLE_BUNDLE_ID is not configured')
  }
  return new SignedDataVerifier([], true, getAppleEnvironment(), bundleId, appAppleId)
}
