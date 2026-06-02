export type TaggingScope = 'TEAM_WIDE' | 'PLAYER_SPECIFIC' | 'MIXED' | 'UNKNOWN'

export interface RosterPlayer {
  teamMemberId: string
  number: string
  name: string
  aliases: string[]
}

export interface TaggingPlayerMatch {
  teamMemberId: string
  confidence?: number
  reason?: string
}

export interface TaggingModelOutput {
  scope: TaggingScope
  players: TaggingPlayerMatch[]
}

