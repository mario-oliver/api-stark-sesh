import { runObservationTagging } from './runTagging.js'

const pending = new Set<string>()
let running = false

async function drainQueue() {
  if (running) return
  running = true

  try {
    while (pending.size > 0) {
      const observationId = pending.values().next().value as string
      pending.delete(observationId)
      await runObservationTagging(observationId)
    }
  } finally {
    running = false
  }
}

export function enqueueObservationTagging(observationId: string) {
  pending.add(observationId)
  setImmediate(() => {
    void drainQueue()
  })
}

