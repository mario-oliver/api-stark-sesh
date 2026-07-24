/**
 * VideoClip S3 helpers — pure unit tests (no DB, no AWS). Proves the presign
 * policy gate: video content types only, size cap, and per-dog key ownership.
 * Both validations fire BEFORE any S3 config/client is touched, so these run
 * with no AWS env at all.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertAllowedVideoClipContentType,
  assertVideoClipKeyForDog,
  buildVideoClipKey,
  createVideoClipUploadPresign
} from './videoClips.js'
import { MAX_VIDEO_CLIP_BYTES } from '../../config/s3.js'

const DOG_ID = '11111111-1111-4111-8111-111111111111'

describe('assertAllowedVideoClipContentType', () => {
  it('accepts the three allowed video types', () => {
    assert.equal(assertAllowedVideoClipContentType('video/mp4'), 'video/mp4')
    assert.equal(assertAllowedVideoClipContentType('video/webm'), 'video/webm')
    assert.equal(assertAllowedVideoClipContentType('video/quicktime'), 'video/quicktime')
  })

  it('normalizes case and parameter suffixes', () => {
    assert.equal(assertAllowedVideoClipContentType('Video/MP4'), 'video/mp4')
    assert.equal(assertAllowedVideoClipContentType('video/webm; codecs=vp9'), 'video/webm')
  })

  it('rejects images, unknown video containers, and empty values', () => {
    assert.throws(() => assertAllowedVideoClipContentType('image/jpeg'), /Unsupported video type/)
    assert.throws(() => assertAllowedVideoClipContentType('video/x-msvideo'), /Unsupported video type/)
    assert.throws(() => assertAllowedVideoClipContentType('application/octet-stream'), /Unsupported video type/)
    assert.throws(() => assertAllowedVideoClipContentType(''), /Unsupported video type/)
  })
})

describe('buildVideoClipKey / assertVideoClipKeyForDog', () => {
  it('keys live under the per-dog prefix with the right extension', () => {
    const key = buildVideoClipKey(DOG_ID, 'video/mp4')
    assert.ok(key.startsWith(`video-clips/${DOG_ID}/`), `unexpected key ${key}`)
    assert.ok(key.endsWith('.mp4'))
    assert.ok(buildVideoClipKey(DOG_ID, 'video/quicktime').endsWith('.mov'))
    assert.ok(buildVideoClipKey(DOG_ID, 'video/webm').endsWith('.webm'))
  })

  it('accepts a key built for the same dog', () => {
    const key = buildVideoClipKey(DOG_ID, 'video/mp4')
    assert.doesNotThrow(() => assertVideoClipKeyForDog(key, DOG_ID))
  })

  it("rejects another dog's key and foreign prefixes", () => {
    const otherDog = '22222222-2222-4222-8222-222222222222'
    const key = buildVideoClipKey(otherDog, 'video/mp4')
    assert.throws(() => assertVideoClipKeyForDog(key, DOG_ID), /Invalid video clip key/)
    assert.throws(
      () => assertVideoClipKeyForDog(`dog-photos/${DOG_ID}/x.mp4`, DOG_ID),
      /Invalid video clip key/
    )
  })
})

describe('createVideoClipUploadPresign — policy gate before any S3 call', () => {
  it('rejects non-video content types', async () => {
    await assert.rejects(
      createVideoClipUploadPresign({ dogId: DOG_ID, contentType: 'image/png', contentLength: 100 }),
      /Unsupported video type/
    )
  })

  it('rejects uploads above the size cap', async () => {
    await assert.rejects(
      createVideoClipUploadPresign({
        dogId: DOG_ID,
        contentType: 'video/mp4',
        contentLength: MAX_VIDEO_CLIP_BYTES + 1
      }),
      /500 MB or smaller/
    )
  })
})
