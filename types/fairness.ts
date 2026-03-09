// LOBSTER AGENDA — FAIRNESS & ENTITY TYPES

// ============================================================
// ENTITIES & PERSONS
// ============================================================

export interface LobsterEntity {
  id: string
  name: string          // 'R.L' or 'LOBSTER'
  slug: string          // 'rl' or 'lobster'
  display_name: string  // 'Romann & Leonard'
  color: string
  target_share: number  // 0.50
}

export interface LobsterPerson {
  id: string
  name: string
  slug: string          // 'romann', 'leonard', 'martial', 'alexandre', 'hedi'
  entity_id: string
  entity?: LobsterEntity
  color?: string
  email?: string
  is_active: boolean
}

// Person slug type for strict typing
export type PersonSlug = 'romann' | 'leonard' | 'martial' | 'alexandre' | 'hedi'
export type EntitySlug = 'rl' | 'lobster'

// ============================================================
// ENTITY/PERSON CONSTANTS
// ============================================================

export const ENTITY_MAP: Record<PersonSlug, EntitySlug> = {
  romann: 'rl',
  leonard: 'rl',
  martial: 'lobster',
  alexandre: 'lobster',
  hedi: 'lobster',
}

export const ENTITY_DISPLAY: Record<EntitySlug, { name: string; displayName: string; color: string; persons: PersonSlug[] }> = {
  rl: { name: 'R.L', displayName: 'Romann & Leonard', color: '#A38767', persons: ['romann', 'leonard'] },
  lobster: { name: 'LOBSTER', displayName: 'Lobster Studio', color: '#4A7B6A', persons: ['martial', 'alexandre', 'hedi'] },
}

export const PERSON_DISPLAY: Record<PersonSlug, { name: string; color: string; entity: EntitySlug }> = {
  romann:     { name: 'Romann',     color: '#A38767', entity: 'rl' },
  leonard:   { name: 'Leonard',   color: '#C4A882', entity: 'rl' },
  martial:   { name: 'Martial',   color: '#4A7B6A', entity: 'lobster' },
  alexandre: { name: 'Alexandre', color: '#5C9B82', entity: 'lobster' },
  hedi:      { name: 'Hedi',      color: '#3A6B5A', entity: 'lobster' },
}

// Legacy compatibility: map old entity slugs to new
export const LEGACY_ENTITY_MAP: Record<string, EntitySlug> = {
  romann: 'rl',
  lobster: 'lobster',
}

// ============================================================
// FAIRNESS SCORING
// ============================================================

export interface ScoringMultipliers {
  base_points_per_hour: number    // 1.0
  mix_morning_multiplier: number  // 1.3
  session_multiplier: number      // 1.1
  night_multiplier: number        // 1.0
  weekend_multiplier: number      // 1.4
  hot_day_multiplier: number      // 1.2
}

export const DEFAULT_MULTIPLIERS: ScoringMultipliers = {
  base_points_per_hour: 1.0,
  mix_morning_multiplier: 1.3,
  session_multiplier: 1.1,
  night_multiplier: 1.0,
  weekend_multiplier: 1.4,
  hot_day_multiplier: 1.2,
}

export interface SlotPointsBreakdown {
  slot_id: string
  minutes: number
  hours: number
  points_base: number      // hours × base
  points_prime: number     // type multiplier contribution
  points_weekend: number   // weekend multiplier contribution
  points_night: number     // night multiplier contribution
  points_hot: number       // hot day multiplier contribution
  points_total: number     // sum of all
  explanation: string[]    // human-readable breakdown
}

export interface FairnessLedgerEntry {
  id: string
  slot_id: string
  entity_id: string
  person_id: string | null
  period_key: string
  slot_date: string
  minutes: number
  points_base: number
  points_prime: number
  points_weekend: number
  points_night: number
  points_hot: number
  points_total: number
  breakdown: SlotPointsBreakdown
  computed_at: string
}

export interface EntityFairnessSummary {
  entity_id: string
  entity_slug: EntitySlug
  entity_name: string
  entity_color: string
  period_key: string
  total_minutes: number
  total_hours: number
  total_points: number
  prime_points: number
  weekend_points: number
  night_points: number
  hot_points: number
  slot_count: number
  target_share: number     // 0.50
  actual_share: number     // computed
  fairness_delta: number   // deviation from target (positive = over, negative = under)
}

export interface FairnessState {
  period_key: string
  entities: EntityFairnessSummary[]
  overall_delta: number         // absolute diff between entities
  verdict: 'balanced' | 'slight_imbalance' | 'imbalanced'
  suggestion: string            // "LOBSTER should take next prime slot"
  person_breakdown: PersonFairnessBreakdown[]
}

export interface PersonFairnessBreakdown {
  person_slug: PersonSlug
  person_name: string
  entity_slug: EntitySlug
  total_minutes: number
  total_hours: number
  total_points: number
  slot_count: number
}

// ============================================================
// SAFEGUARDS
// ============================================================

export interface SafeguardConfig {
  max_consecutive_nights_per_person: number   // 2
  max_consecutive_nights_per_entity: number   // 3
  min_rest_hours_night_to_morning: number     // 8
  max_daily_hours_per_person: number          // 12
  slot_min_duration_minutes: number           // 30
  slot_max_duration_minutes: number           // 720 (12h)
  single_room: boolean                        // true = no overlaps at all
}

export const DEFAULT_SAFEGUARDS: SafeguardConfig = {
  max_consecutive_nights_per_person: 2,
  max_consecutive_nights_per_entity: 3,
  min_rest_hours_night_to_morning: 8,
  max_daily_hours_per_person: 12,
  slot_min_duration_minutes: 30,
  slot_max_duration_minutes: 720,
  single_room: true,
}

export interface SafeguardViolation {
  rule: string
  severity: 'block' | 'warn'
  message: string
  suggestion?: string
}

// ============================================================
// SWAP WORKFLOW
// ============================================================

export type SwapRequestStatus = 'requested' | 'accepted' | 'rejected' | 'applied' | 'expired'

export interface LobsterSwapRequest {
  id: string
  slot_id: string
  target_slot_id?: string
  requester: string            // person slug
  requester_person_id?: string
  target: string               // person slug or entity slug
  target_person_id?: string
  message?: string
  status: SwapRequestStatus
  proposed_date?: string
  proposed_start_time?: string
  proposed_end_time?: string
  fairness_impact?: {
    before: { rl_points: number; lobster_points: number }
    after: { rl_points: number; lobster_points: number }
    improves_fairness: boolean
  }
  auto_approved: boolean
  responded_at?: string
  created_at: string
}

// ============================================================
// MONTHLY SUMMARY / EXPORT
// ============================================================

export interface MonthlySummary {
  period_key: string
  generated_at: string
  entities: EntityFairnessSummary[]
  persons: PersonFairnessBreakdown[]
  fairness_verdict: string
  total_studio_hours: number
  total_studio_points: number
  slot_count: number
}

// ============================================================
// ENHANCED SLOT (with person + entity)
// ============================================================

export interface EnhancedSlot {
  id: string
  week_key: string
  day_of_week: number
  slot_type: 'mix' | 'session' | 'night'
  start_time: string
  end_time: string
  slot_date: string | null
  // Legacy
  assignee: string | null       // 'romann' | 'lobster' (legacy enum)
  // New person-level
  assigned_person_id: string | null
  assigned_entity_id: string | null
  person_slug?: string | null
  person_name?: string | null
  entity_slug?: string | null
  entity_name?: string | null
  entity_color?: string | null
  // Status
  status: 'tentative' | 'confirmed' | 'locked' | 'cancelled'
  source: 'manual' | 'auto' | 'import' | 'seed'
  label?: string
  notes?: string
  // Existing
  lockout?: boolean
  is_priority?: boolean
  priority_reason?: string
  validation_status: 'ok' | 'warn' | 'block'
  validation_reasons: string[]
  created_at: string
  updated_at: string
}
