/**
 * Issue 0006 — the canonical example of the consolidated care model.
 *
 * A pure, deterministic builder (no DB, no I/O) describing one fully-wired dataset in
 * the post-ADR-0002 shape: bucketed flat CareActions (incl. a RECOVERY medication and
 * a distinct left/right pair), one DailyCareLog with PLAN and non-PLAN DailyCareActions
 * showing actual-vs-target, a HealthObservation, a slimmed VoiceNote, and a
 * CareAgentSession per surviving kind. `prisma/seed.ts` writes these rows;
 * `buildSeedData.test.ts` asserts their shape. Fixed IDs make the seed idempotent.
 */
import type {
  CareBucket,
  CareActionFrequency,
  CareActionTimeOfDay,
  DailyCareActionSource,
  DailyCareActionStatus,
  Tolerance,
  HealthObservationType,
  ObservationSeverity,
  CareAgentSessionKind,
  CareAgentSessionStatus,
  DogSex,
  VoiceNoteProcessingStatus
} from '../../generated/enums.js'

export interface SeedUser {
  id: string
  email: string
  firstName: string
  lastName: string
}

export interface SeedDog {
  id: string
  name: string
  breed: string | null
  age: number | null
  sex: DogSex | null
  condition: string | null
  notes: string | null
  shareCode: string
}

export interface SeedDogMember {
  id: string
  dogId: string
  userId: string
  role: string
}

export interface SeedCarePlan {
  id: string
  dogId: string
  name: string
  isActive: boolean
}

export interface SeedCareAction {
  id: string
  carePlanId: string
  name: string
  description: string | null
  bucket: CareBucket
  frequency: CareActionFrequency
  timeOfDay: CareActionTimeOfDay | null
  targetReps: number | null
  targetDurationSeconds: number | null
  instructions: string | null
  sortOrder: number
  /** Builder-only tag (not persisted): marks medication actions for the shape test. */
  isMedication: boolean
}

export interface SeedDailyCareLog {
  id: string
  dogId: string
  date: Date
  summary: string | null
}

export interface SeedDailyCareAction {
  id: string
  dailyCareLogId: string
  careActionId: string | null
  bucket: CareBucket
  source: DailyCareActionSource
  nameSnapshot: string
  descriptionSnapshot: string | null
  instructionsSnapshot: string | null
  status: DailyCareActionStatus
  tolerance: Tolerance | null
  targetReps: number | null
  actualReps: number | null
  targetDurationSeconds: number | null
  actualDurationSeconds: number | null
  notes: string | null
  extractionConfidence: number | null
  needsReview: boolean
  sortOrder: number
}

export interface SeedVoiceNote {
  id: string
  dogId: string
  dailyCareLogId: string
  userId: string
  audioUrl: string | null
  transcript: string
  processingStatus: VoiceNoteProcessingStatus
}

export interface SeedHealthObservation {
  id: string
  dogId: string
  dailyCareLogId: string
  userId: string
  voiceNoteId: string | null
  bucket: CareBucket | null
  type: HealthObservationType
  severity: ObservationSeverity | null
  bodyArea: string | null
  note: string
}

export interface SeedCareAgentSession {
  id: string
  dogId: string
  userId: string
  kind: CareAgentSessionKind
  status: CareAgentSessionStatus
  messages: unknown
  questions: unknown
  draft: unknown
  voiceNoteId: string | null
  committedCarePlanId: string | null
  committedCareActionId: string | null
}

export interface SeedData {
  user: SeedUser
  dog: SeedDog
  dogMember: SeedDogMember
  carePlan: SeedCarePlan
  careActions: SeedCareAction[]
  dailyCareLog: SeedDailyCareLog
  dailyCareActions: SeedDailyCareAction[]
  voiceNote: SeedVoiceNote
  healthObservations: SeedHealthObservation[]
  careAgentSessions: SeedCareAgentSession[]
}

// Deterministic fixed IDs → the seed is idempotent (upsert-by-id) and re-runnable.
const ID = {
  user: '00000000-0000-4000-8000-000000000001',
  dog: '00000000-0000-4000-8000-000000000002',
  dogMember: '00000000-0000-4000-8000-000000000003',
  carePlan: '00000000-0000-4000-8000-000000000010',
  actWalk: '00000000-0000-4000-8000-000000000020',
  actSitStand: '00000000-0000-4000-8000-000000000021',
  mobLeft: '00000000-0000-4000-8000-000000000022',
  mobRight: '00000000-0000-4000-8000-000000000023',
  recLaser: '00000000-0000-4000-8000-000000000024',
  recMed: '00000000-0000-4000-8000-000000000025',
  dailyLog: '00000000-0000-4000-8000-000000000030',
  dcaWalk: '00000000-0000-4000-8000-000000000031',
  dcaSitStand: '00000000-0000-4000-8000-000000000032',
  dcaAdHoc: '00000000-0000-4000-8000-000000000033',
  voiceNote: '00000000-0000-4000-8000-000000000040',
  observation: '00000000-0000-4000-8000-000000000050',
  sessionBuild: '00000000-0000-4000-8000-000000000060',
  sessionAudit: '00000000-0000-4000-8000-000000000061',
  sessionDailyLog: '00000000-0000-4000-8000-000000000062'
} as const

/** A fixed UTC midnight so the seeded DailyCareLog date is deterministic. */
function seedDate(): Date {
  return new Date('2026-06-10T00:00:00.000Z')
}

export function buildSeedData(): SeedData {
  const user: SeedUser = {
    id: ID.user,
    email: 'caregiver@starkhealth.test',
    firstName: 'Sam',
    lastName: 'Caregiver'
  }

  const dog: SeedDog = {
    id: ID.dog,
    name: 'Stark',
    breed: 'German Shepherd',
    age: 8,
    sex: 'MALE',
    condition: 'Bilateral hip dysplasia; post-op left CCL repair.',
    notes: 'Primary care dog for the Stark Health MVP seed.',
    shareCode: 'STARKSEED01'
  }

  const dogMember: SeedDogMember = {
    id: ID.dogMember,
    dogId: dog.id,
    userId: user.id,
    role: 'caregiver'
  }

  const carePlan: SeedCarePlan = {
    id: ID.carePlan,
    dogId: dog.id,
    name: 'Hip & post-op recovery plan',
    isActive: true
  }

  const careActions: SeedCareAction[] = [
    {
      id: ID.actWalk,
      carePlanId: carePlan.id,
      name: 'Short controlled leash walk',
      description: 'Flat-ground walk to build endurance.',
      bucket: 'ACTIVITY',
      frequency: 'DAILY',
      timeOfDay: 'ANYTIME',
      targetReps: null,
      targetDurationSeconds: 600,
      instructions: 'Even surfaces only; stop if limping appears.',
      sortOrder: 1,
      isMedication: false
    },
    {
      id: ID.actSitStand,
      carePlanId: carePlan.id,
      name: 'Assisted sit-to-stand',
      description: 'Rear-end strengthening.',
      bucket: 'ACTIVITY',
      frequency: 'EVERY_OTHER_DAY',
      timeOfDay: 'EVENING',
      targetReps: 5,
      targetDurationSeconds: null,
      instructions: 'Support the hips; 5 controlled reps.',
      sortOrder: 2,
      isMedication: false
    },
    {
      id: ID.mobLeft,
      carePlanId: carePlan.id,
      name: 'Left hind-leg range-of-motion stretch',
      description: 'Gentle flexion/extension, left side.',
      bucket: 'MOBILITY',
      frequency: 'DAILY',
      timeOfDay: 'MORNING',
      targetReps: 10,
      targetDurationSeconds: null,
      instructions: 'Slow, pain-free range only.',
      sortOrder: 3,
      isMedication: false
    },
    {
      id: ID.mobRight,
      carePlanId: carePlan.id,
      name: 'Right hind-leg range-of-motion stretch',
      description: 'Gentle flexion/extension, right side.',
      bucket: 'MOBILITY',
      frequency: 'DAILY',
      timeOfDay: 'MORNING',
      targetReps: 10,
      targetDurationSeconds: null,
      instructions: 'Slow, pain-free range only.',
      sortOrder: 4,
      isMedication: false
    },
    {
      id: ID.recLaser,
      carePlanId: carePlan.id,
      name: 'Laser therapy on hips',
      description: 'Class IV laser for inflammation.',
      bucket: 'RECOVERY',
      frequency: 'WEEKLY',
      timeOfDay: 'ANYTIME',
      targetReps: null,
      targetDurationSeconds: 300,
      instructions: 'Per vet protocol; protective goggles on.',
      sortOrder: 5,
      isMedication: false
    },
    {
      id: ID.recMed,
      carePlanId: carePlan.id,
      name: 'Carprofen 75mg',
      description: 'NSAID for post-op pain (medication = RECOVERY CareAction).',
      bucket: 'RECOVERY',
      frequency: 'DAILY',
      timeOfDay: 'MORNING',
      targetReps: null,
      targetDurationSeconds: null,
      instructions: 'One 75mg tablet with food each morning.',
      sortOrder: 6,
      isMedication: true
    }
  ]

  const dailyCareLog: SeedDailyCareLog = {
    id: ID.dailyLog,
    dogId: dog.id,
    date: seedDate(),
    summary: 'Good mobility day; completed walk and stretches, gave morning meds.'
  }

  const dailyCareActions: SeedDailyCareAction[] = [
    {
      id: ID.dcaWalk,
      dailyCareLogId: dailyCareLog.id,
      careActionId: ID.actWalk,
      bucket: 'ACTIVITY',
      source: 'PLAN',
      nameSnapshot: 'Short controlled leash walk',
      descriptionSnapshot: 'Flat-ground walk to build endurance.',
      instructionsSnapshot: 'Even surfaces only; stop if limping appears.',
      status: 'COMPLETED',
      tolerance: 'GOOD',
      targetReps: null,
      actualReps: null,
      targetDurationSeconds: 600,
      actualDurationSeconds: 540,
      notes: 'Walked 9 minutes, no limp.',
      extractionConfidence: null,
      needsReview: false,
      sortOrder: 1
    },
    {
      id: ID.dcaSitStand,
      dailyCareLogId: dailyCareLog.id,
      careActionId: ID.actSitStand,
      bucket: 'ACTIVITY',
      source: 'PLAN',
      nameSnapshot: 'Assisted sit-to-stand',
      descriptionSnapshot: 'Rear-end strengthening.',
      instructionsSnapshot: 'Support the hips; 5 controlled reps.',
      status: 'PARTIALLY_COMPLETED',
      tolerance: 'OKAY',
      targetReps: 5,
      actualReps: 4,
      targetDurationSeconds: null,
      actualDurationSeconds: null,
      notes: 'Tired after 4 reps.',
      extractionConfidence: null,
      needsReview: false,
      sortOrder: 2
    },
    {
      id: ID.dcaAdHoc,
      dailyCareLogId: dailyCareLog.id,
      careActionId: null,
      bucket: 'ACTIVITY',
      source: 'LLM_EXTRACTED',
      nameSnapshot: 'Extra evening yard walk',
      descriptionSnapshot: null,
      instructionsSnapshot: null,
      status: 'COMPLETED',
      tolerance: 'GOOD',
      targetReps: null,
      actualReps: null,
      targetDurationSeconds: null,
      actualDurationSeconds: 300,
      notes: 'Caregiver mentioned an unplanned short walk in the voice note.',
      extractionConfidence: 0.82,
      needsReview: false,
      sortOrder: 3
    }
  ]

  const voiceNote: SeedVoiceNote = {
    id: ID.voiceNote,
    dogId: dog.id,
    dailyCareLogId: dailyCareLog.id,
    userId: user.id,
    audioUrl: null,
    transcript:
      'Did Stark’s morning stretches and his walk, he seemed a little stiff in the left hip getting up. Gave him his Carprofen. Took him out again in the evening.',
    processingStatus: 'PROCESSED'
  }

  const healthObservations: SeedHealthObservation[] = [
    {
      id: ID.observation,
      dogId: dog.id,
      dailyCareLogId: dailyCareLog.id,
      userId: user.id,
      voiceNoteId: voiceNote.id,
      bucket: 'MOBILITY',
      type: 'STIFFNESS',
      severity: 'MILD',
      bodyArea: 'left hip',
      note: 'Stiff standing up this morning; eased after stretching.'
    }
  ]

  const careAgentSessions: SeedCareAgentSession[] = [
    {
      id: ID.sessionBuild,
      dogId: dog.id,
      userId: user.id,
      kind: 'PLAN_BUILD',
      status: 'COMMITTED',
      messages: [
        { role: 'user', content: 'Add a daily morning hip stretch for both back legs.' },
        { role: 'assistant', content: 'Added left and right hind-leg range-of-motion stretches.' }
      ],
      questions: null,
      draft: { summary: 'Added bilateral hind-leg ROM stretches to the plan.' },
      voiceNoteId: null,
      committedCarePlanId: carePlan.id,
      committedCareActionId: ID.mobLeft
    },
    {
      id: ID.sessionAudit,
      dogId: dog.id,
      userId: user.id,
      kind: 'PLAN_AUDIT',
      status: 'DRAFT_READY',
      messages: [
        { role: 'assistant', content: 'Audit: plan covers all three buckets; consider a cool-down.' }
      ],
      questions: ['Add a post-walk cool-down?'],
      draft: {
        report: {
          summary: 'Balanced plan across ACTIVITY/MOBILITY/RECOVERY.',
          overallRating: 'GOOD'
        }
      },
      voiceNoteId: null,
      committedCarePlanId: null,
      committedCareActionId: null
    },
    {
      id: ID.sessionDailyLog,
      dogId: dog.id,
      userId: user.id,
      kind: 'DAILY_LOG',
      status: 'COMMITTED',
      messages: [],
      questions: null,
      draft: null,
      voiceNoteId: voiceNote.id,
      committedCarePlanId: null,
      committedCareActionId: null
    }
  ]

  return {
    user,
    dog,
    dogMember,
    carePlan,
    careActions,
    dailyCareLog,
    dailyCareActions,
    voiceNote,
    healthObservations,
    careAgentSessions
  }
}
