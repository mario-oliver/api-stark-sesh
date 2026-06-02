import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregateExtractedStatLines } from './extractStatsFromTranscript.js'

test('aggregateExtractedStatLines sums multiple lines for same player', () => {
  const result = aggregateExtractedStatLines({
    roster: [{ teamMemberId: 'p1', number: '1', name: 'Alpha', aliases: ['Ace'] }],
    modelLines: [
      { playerRef: '1', points: 2, assists: 0, rebounds: 1, steals: 0, blocks: 0, turnovers: 0, fouls: 0 },
      { playerRef: 'Alpha', points: 3, assists: 1, rebounds: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0 }
    ]
  })
  assert.equal(result.lines.length, 2)
  assert.equal(result.aggregated.length, 1)
  assert.equal(result.aggregated[0]?.points, 5)
  assert.equal(result.aggregated[0]?.assists, 1)
  assert.equal(result.aggregated[0]?.rebounds, 1)
})

test('aggregateExtractedStatLines keeps unresolved line without aggregation', () => {
  const result = aggregateExtractedStatLines({
    roster: [{ teamMemberId: 'p1', number: '1', name: 'Alpha', aliases: [] }],
    modelLines: [
      { playerRef: 'unknown player', points: 2, assists: 0, rebounds: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0 }
    ]
  })
  assert.equal(result.lines[0]?.teamMemberId, null)
  assert.equal(result.aggregated.length, 0)
})

test('aggregateExtractedStatLines resolves alias references', () => {
  const result = aggregateExtractedStatLines({
    roster: [{ teamMemberId: 'p1', number: '1', name: 'Alpha', aliases: ['Ace'] }],
    modelLines: [
      { playerRef: 'Ace', points: 2, assists: 0, rebounds: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0 }
    ]
  })
  assert.equal(result.lines[0]?.teamMemberId, 'p1')
  assert.equal(result.aggregated[0]?.points, 2)
})
