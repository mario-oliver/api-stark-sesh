import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'

// Mock OpenAI image editing before loading the module
mock.module('../../../config/s3.js', {
  namedExports: {
    getSpriteImageModel: () => 'gpt-image-1',
    getSpriteFrameSize: () => 64
  }
})

// Minimal 1×1 transparent PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

// Stub editImage so no real API calls are made
mock.module('./openaiImage.js', {
  namedExports: {
    editImage: async () => TINY_PNG
  }
})

// Stub postProcess to return the input unchanged to keep tests fast
mock.module('./postProcess.js', {
  namedExports: {
    postProcessFrame: async (buf: Buffer) => buf
  }
})

// Stub validate to always pass
mock.module('./validateFrame.js', {
  namedExports: {
    validateFrame: async () => ({ ok: true })
  }
})

describe('generateSpriteSet engine', () => {
  it('returns a manifest with all requested animations', async () => {
    const { generateSpriteSet } = await import('./index.js')

    const result = await generateSpriteSet({
      referenceImage: TINY_PNG,
      styleReference: TINY_PNG,
      breed: 'Golden Retriever',
      animations: [
        { animation: 'idle', frameCount: 2, fps: 4, loop: true },
        { animation: 'bark', frameCount: 2, fps: 4, loop: true }
      ]
    })

    assert.ok(result.manifest)
    assert.equal(result.manifest.breed, 'Golden Retriever')
    assert.ok(result.manifest.animations.idle)
    assert.ok(result.manifest.animations.bark)
    assert.equal(result.manifest.animations.idle.frames, 2)
    assert.equal(result.manifest.animations.bark.frames, 2)
    assert.equal(result.frames.size, 4) // 2 idle + 2 bark
  })

  it('frame keys follow {animation}_{NNN} convention', async () => {
    const { generateSpriteSet } = await import('./index.js')

    const result = await generateSpriteSet({
      referenceImage: TINY_PNG,
      styleReference: TINY_PNG,
      breed: 'Labrador',
      animations: [{ animation: 'run', frameCount: 3, fps: 6, loop: true }]
    })

    assert.ok(result.frames.has('run_001'))
    assert.ok(result.frames.has('run_002'))
    assert.ok(result.frames.has('run_003'))
  })

  it('reports progress events', async () => {
    const { generateSpriteSet } = await import('./index.js')

    const events: { step: string; progress: number }[] = []
    await generateSpriteSet(
      {
        referenceImage: TINY_PNG,
        styleReference: TINY_PNG,
        breed: 'Poodle',
        animations: [{ animation: 'idle', frameCount: 1, fps: 4, loop: true }]
      },
      {
        onProgress: (e) => events.push({ step: e.step, progress: e.progress })
      }
    )

    assert.ok(events.length > 0)
    const steps = events.map((e) => e.step)
    assert.ok(steps.includes('BUILD_BASE_REFERENCE'))
    assert.ok(steps.includes('FINALIZE'))
  })
})
