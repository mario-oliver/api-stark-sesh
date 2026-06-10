import type { CareBucket, HealthObservationType } from '../../generated/client.js'

export function observationTypeToBucket(type: HealthObservationType): CareBucket {
  switch (type) {
    case 'SLIPPING':
    case 'LIMPING':
    case 'WEAKNESS':
    case 'STIFFNESS':
    case 'PAIN':
      return 'MOBILITY'
    case 'LOW_ENERGY':
    case 'APPETITE':
    case 'BATHROOM':
    case 'MEDICATION':
    case 'GENERAL_NOTE':
      return 'RECOVERY'
    default:
      return 'MOBILITY'
  }
}

export const CARE_BUCKETS = ['ACTIVITY', 'MOBILITY', 'RECOVERY'] as const satisfies readonly CareBucket[]
