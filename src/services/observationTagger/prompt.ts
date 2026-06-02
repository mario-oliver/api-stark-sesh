import type { RosterPlayer } from './types.js'

export function buildObservationTaggingPrompt(args: {
  transcript: string
  sessionTypeLabel: string
  players: RosterPlayer[]
}) {
  const rosterLines =
    args.players.length === 0
      ? 'No players provided.'
      : args.players
          .map(
            (p, i) =>
              `${i + 1}. teamMemberId=${p.teamMemberId}, number=${p.number || '-'}, name=${p.name || '-'}, aliases=${p.aliases.join('|') || '-'}`
          )
          .join('\n')

  const system = [
    'You classify basketball coaching observations and map mentioned players to a known roster.',
    'Return ONLY valid JSON with keys: scope, players.',
    'scope must be one of: TEAM_WIDE, PLAYER_SPECIFIC, MIXED, UNKNOWN.',
    'players must be an array of objects (never strings). Each object must have: teamMemberId, optional confidence, optional reason.',
    'players must only include teamMemberId values from the provided roster.',
    'Players may be referred to by canonical name, jersey number, or aliases/nicknames in roster aliases.',
    'If no specific player is referenced, return players as empty array [].',
    'If one or more specific players are referenced, include each player once.',
    "Example: {\"scope\":\"PLAYER_SPECIFIC\",\"players\":[{\"teamMemberId\":\"<uuid>\",\"confidence\":0.82,\"reason\":\"...\"}]}",
    'Do not hallucinate unknown players.',
    'Do not include extra keys.'
  ].join(' ')

  const user = [
    `Session type: ${args.sessionTypeLabel}`,
    'Roster:',
    rosterLines,
    'Transcript:',
    args.transcript
  ].join('\n\n')

  return { system, user }
}

