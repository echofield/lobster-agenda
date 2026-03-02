// STUDIO MODULE TYPES

export type StudioEntity = 'roman' | 'lobster'
export type SlotType = 'mix' | 'session' | 'night'
export type SwapStatus = 'pending' | 'accepted' | 'declined'
export type ValidationStatus = 'ok' | 'warn' | 'block'

export interface StudioSlot {
  id: string
  week_key: string           // ISO week: '2026-W10'
  day_of_week: number        // 0=Monday, 6=Sunday
  slot_type: SlotType
  start_time: string         // HH:MM
  end_time: string           // HH:MM
  assignee: StudioEntity | null
  validation_status: ValidationStatus
  validation_reasons: string[]
  created_at: string
  updated_at: string
}

export interface StudioSwapRequest {
  id: string
  slot_id: string
  requester: StudioEntity
  target: StudioEntity
  status: SwapStatus
  message: string | null
  responded_at: string | null
  created_at: string
}

export interface StudioMember {
  id: string
  entity_key: StudioEntity
  display_name: string
  color_hex: string
  created_at: string
}

export interface StudioRuleset {
  id: string
  version: number
  rules: StudioRules
  is_active: boolean
  created_at: string
}

export interface StudioRules {
  studio_hours: {
    open: string   // "10:00"
    close: string  // "02:00"
  }
  slot_definitions: {
    mix: { start: string; end: string }
    session: { start: string; end: string }
    night: { start: string; end: string }
  }
  weekend_prime_rotation: {
    week_a: {
      roman: string[]   // ["sat_session", "sun_night"]
      lobster: string[]
    }
    week_b: {
      roman: string[]
      lobster: string[]
    }
  }
  mix_morning_guarantees: {
    roman: number      // 3
    lobster: number    // 2
    alternating: number // 2
  }
  max_consecutive_nights: number // 2
}

// Validation result from validator
export interface ValidationResult {
  status: ValidationStatus
  reasons: string[]
  suggestedFix?: {
    action: 'swap' | 'unassign' | 'reassign'
    target_slot_id?: string
    suggested_assignee?: StudioEntity
    message?: string
  }
}

// Week schedule (aggregated view)
export interface WeekSchedule {
  week_key: string
  week_type: 'A' | 'B'  // For prime rotation
  days: DaySchedule[]
  stats: WeekStats
}

export interface DaySchedule {
  day_of_week: number
  date: string           // ISO date string
  day_name: string       // "Lundi", "Mardi", etc.
  is_weekend: boolean
  slots: StudioSlot[]
}

export interface WeekStats {
  roman: EntityStats
  lobster: EntityStats
}

export interface EntityStats {
  mix_count: number
  session_count: number
  night_count: number
  total_hours: number
  weekend_prime_count: number
}

// API request/response types
export interface AssignSlotRequest {
  slot_id: string
  assignee: StudioEntity | null
}

export interface SwapRequestCreate {
  slot_id: string
  requester: StudioEntity
  target: StudioEntity
  message?: string
}

export interface SwapDecision {
  swap_id: string
  decision: 'accept' | 'decline'
}

// Day names in French (OPÉRA locale)
export const DAY_NAMES_FR = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
] as const

// Slot display labels
export const SLOT_LABELS: Record<SlotType, string> = {
  mix: 'MIX',
  session: 'SESSION',
  night: 'NIGHT',
}

// Slot time ranges
export const SLOT_TIMES: Record<SlotType, { start: string; end: string }> = {
  mix: { start: '10:00', end: '16:00' },
  session: { start: '16:00', end: '22:00' },
  night: { start: '20:00', end: '02:00' },
}

// Entity display info
export const ENTITY_INFO: Record<StudioEntity, { name: string; color: string }> = {
  roman: { name: 'Roman', color: '#A38767' },
  lobster: { name: 'Lobster', color: '#4A7B6A' },
}
