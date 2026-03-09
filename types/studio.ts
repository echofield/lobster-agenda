// STUDIO MODULE TYPES

export type GroupSlug = 'romann' | 'lobster'
export type StudioEntity = GroupSlug
export type SlotType = 'mix' | 'session' | 'night'
export type SwapStatus = 'pending' | 'accepted' | 'declined'
export type ValidationStatus = 'ok' | 'warn' | 'block'
export type Priority = 'low' | 'normal' | 'high' | 'money'

export interface StudioSlot {
  id: string
  week_key: string
  day_of_week: number
  slot_type: SlotType
  start_time: string
  end_time: string
  assignee: StudioEntity | null
  lockout?: boolean
  is_priority?: boolean
  priority_reason?: string
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

export interface StudioGroup {
  id: string
  name: string
  slug: GroupSlug
  color: string
  monthly_allocation: number
  created_at: string
}

export interface StudioTodo {
  id: string
  content: string
  is_completed: boolean
  created_by?: string
  priority: Priority
  created_at: string
  completed_at?: string
}

export interface StudioSuggestion {
  id: string
  title: string
  description?: string
  type: string
  created_by?: string
  creator?: { display_name: string }
  status: string
  votes_for: number
  votes_against: number
  my_vote?: 'for' | 'against' | null
  created_at: string
}

export interface GroupUsageStats {
  group: StudioGroup
  total_days: number
  allocation: number
  percentage: number
  members: { member_id: string; member?: { display_name: string }; total_days: number; mix_slots: number; session_slots: number; night_slots: number }[]
}

export interface StudioRuleset {
  id: string
  version: number
  rules: StudioRules
  is_active: boolean
  created_at: string
}

export interface StudioRules {
  studio_hours: { open: string; close: string }
  slot_definitions: {
    mix: { start: string; end: string }
    session: { start: string; end: string }
    night: { start: string; end: string }
  }
  weekend_prime_rotation: {
    week_a: { roman: string[]; lobster: string[] }
    week_b: { roman: string[]; lobster: string[] }
  }
  mix_morning_guarantees: { roman: number; lobster: number; alternating: number }
  max_consecutive_nights: number
}

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

export interface WeekSchedule {
  week_key: string
  week_type: 'A' | 'B'
  days: DaySchedule[]
  stats: WeekStats
}

export interface DaySchedule {
  day_of_week: number
  date: string
  day_name: string
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

export const DAY_NAMES_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const

export const SLOT_LABELS: Record<SlotType, string> = { mix: 'MIX', session: 'SESSION', night: 'NIGHT' }

export const SLOT_TIMES: Record<SlotType, { start: string; end: string }> = {
  mix: { start: '10:00', end: '16:00' },
  session: { start: '16:00', end: '22:00' },
  night: { start: '20:00', end: '02:00' },
}

export const ENTITY_INFO: Record<StudioEntity, { name: string; color: string }> = {
  roman: { name: 'Roman', color: '#A38767' },
  lobster: { name: 'Lobster', color: '#4A7B6A' },
}

export const GROUP_INFO = ENTITY_INFO

export const PRIORITY_LABELS: Record<Priority, { label: string; color: string }> = {
  low: { label: 'Basse', color: '#6a6a6a' },
  normal: { label: 'Normal', color: '#D4CFC4' },
  high: { label: 'Haute', color: '#C45C3E' },
  money: { label: 'Argent', color: '#D4AF37' },
}
