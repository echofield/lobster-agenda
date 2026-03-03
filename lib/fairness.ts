// LOBSTER AGENDA — FAIRNESS SCORING ENGINE
// Computes fairness points for slots, validates assignments, suggests allocations

import type {
  ScoringMultipliers,
  SlotPointsBreakdown,
  EntityFairnessSummary,
  FairnessState,
  PersonFairnessBreakdown,
  SafeguardConfig,
  SafeguardViolation,
  EntitySlug,
  PersonSlug,
  EnhancedSlot,
} from '@/types/fairness'
import {
  DEFAULT_MULTIPLIERS,
  DEFAULT_SAFEGUARDS,
  ENTITY_MAP,
  ENTITY_DISPLAY,
  PERSON_DISPLAY,
} from '@/types/fairness'

// ============================================================
// SLOT SCORING
// ============================================================

/**
 * Compute fairness points for a single slot.
 *
 * Formula:
 *   base = (minutes / 60) × base_points_per_hour
 *   type_mult = { mix: 1.3, session: 1.1, night: 1.0 }
 *   weekend_mult = is_weekend ? 1.4 : 1.0
 *   hot_mult = is_hot_day ? 1.2 : 1.0
 *   total = base × type_mult × weekend_mult × hot_mult
 *
 * Each multiplier's CONTRIBUTION is tracked separately for transparency.
 */
export function computeSlotPoints(
  slot: {
    id: string
    slot_type: 'mix' | 'session' | 'night'
    start_time: string
    end_time: string
    slot_date?: string | null
    day_of_week?: number
  },
  multipliers: ScoringMultipliers = DEFAULT_MULTIPLIERS,
  hotDays: string[] = ['friday_evening', 'saturday', 'sunday'],
  customHotDates: string[] = [],
): SlotPointsBreakdown {
  const minutes = computeSlotMinutes(slot.start_time, slot.end_time)
  const hours = minutes / 60

  // Base points
  const basePoints = hours * multipliers.base_points_per_hour

  // Type multiplier
  let typeMult = 1.0
  switch (slot.slot_type) {
    case 'mix': typeMult = multipliers.mix_morning_multiplier; break
    case 'session': typeMult = multipliers.session_multiplier; break
    case 'night': typeMult = multipliers.night_multiplier; break
  }

  // Weekend detection
  const isWeekend = detectWeekend(slot)
  const weekendMult = isWeekend ? multipliers.weekend_multiplier : 1.0

  // Hot day detection
  const isHot = detectHotDay(slot, hotDays, customHotDates)
  const hotMult = isHot ? multipliers.hot_day_multiplier : 1.0

  // Combined total
  const total = basePoints * typeMult * weekendMult * hotMult

  // Breakdown for transparency
  const primeContribution = basePoints * (typeMult - 1.0)
  const weekendContribution = basePoints * typeMult * (weekendMult - 1.0)
  // Night multiplier is 1.0 (no bonus), so nightContribution is always 0.
  // Kept for breakdown symmetry — if night_multiplier changes from 1.0, this activates.
  const nightContribution = basePoints * (multipliers.night_multiplier - 1.0)
  const hotContribution = basePoints * typeMult * weekendMult * (hotMult - 1.0)

  const explanation: string[] = []
  explanation.push(`${hours.toFixed(1)}h × ${multipliers.base_points_per_hour} base = ${basePoints.toFixed(2)} pts`)
  if (typeMult !== 1.0) explanation.push(`${slot.slot_type.toUpperCase()} ×${typeMult} (+${primeContribution.toFixed(2)} pts)`)
  if (isWeekend) explanation.push(`Weekend ×${weekendMult} (+${weekendContribution.toFixed(2)} pts)`)
  if (isHot) explanation.push(`Hot day ×${hotMult} (+${hotContribution.toFixed(2)} pts)`)
  explanation.push(`Total: ${total.toFixed(2)} pts`)

  return {
    slot_id: slot.id,
    minutes,
    hours,
    points_base: round2(basePoints),
    points_prime: round2(primeContribution),
    points_weekend: round2(weekendContribution),
    points_night: round2(nightContribution),
    points_hot: round2(hotContribution),
    points_total: round2(total),
    explanation,
  }
}

/**
 * Compute minutes between two HH:MM times.
 * Handles overnight (e.g. 20:00 → 02:00 = 360 min)
 */
export function computeSlotMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)

  let startMin = sh * 60 + sm
  let endMin = eh * 60 + em

  // Overnight handling
  if (endMin <= startMin) {
    endMin += 24 * 60
  }

  return endMin - startMin
}

function detectWeekend(slot: { slot_date?: string | null; day_of_week?: number }): boolean {
  if (slot.slot_date) {
    const d = new Date(slot.slot_date)
    const dow = d.getDay() // 0=Sun, 6=Sat
    return dow === 0 || dow === 6
  }
  // Fallback to day_of_week (0=Mon, 5=Sat, 6=Sun)
  if (slot.day_of_week !== undefined) {
    return slot.day_of_week >= 5
  }
  return false
}

function detectHotDay(
  slot: { slot_date?: string | null; day_of_week?: number; slot_type: string; start_time: string },
  hotDays: string[],
  customHotDates: string[],
): boolean {
  // Check custom dates first
  if (slot.slot_date && customHotDates.includes(slot.slot_date)) return true

  const dow = slot.slot_date
    ? new Date(slot.slot_date).getDay()
    : (slot.day_of_week !== undefined ? ((slot.day_of_week + 1) % 7) : -1) // convert 0=Mon→1, 6=Sun→0

  // friday_evening: Friday (dow 5 or day_of_week 4) + evening slot
  if (hotDays.includes('friday_evening')) {
    const isFriday = slot.slot_date ? dow === 5 : slot.day_of_week === 4
    const isEvening = slot.slot_type === 'session' || slot.slot_type === 'night'
    if (isFriday && isEvening) return true
  }

  // saturday
  if (hotDays.includes('saturday')) {
    const isSat = slot.slot_date ? dow === 6 : slot.day_of_week === 5
    if (isSat) return true
  }

  // sunday
  if (hotDays.includes('sunday')) {
    const isSun = slot.slot_date ? dow === 0 : slot.day_of_week === 6
    if (isSun) return true
  }

  return false
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ============================================================
// ENTITY BALANCE
// ============================================================

/**
 * Compute fairness state for a period.
 * Takes all slots in the period and returns entity-level + person-level breakdown.
 */
export function computeFairnessState(
  slots: EnhancedSlot[],
  periodKey: string,
  multipliers: ScoringMultipliers = DEFAULT_MULTIPLIERS,
  hotDays: string[] = ['friday_evening', 'saturday', 'sunday'],
  customHotDates: string[] = [],
): FairnessState {
  // Compute points for each assigned slot
  const entityTotals: Record<EntitySlug, {
    minutes: number; points: number; primeP: number; weekendP: number; nightP: number; hotP: number; count: number
  }> = {
    rl: { minutes: 0, points: 0, primeP: 0, weekendP: 0, nightP: 0, hotP: 0, count: 0 },
    lobster: { minutes: 0, points: 0, primeP: 0, weekendP: 0, nightP: 0, hotP: 0, count: 0 },
  }

  const personTotals: Record<string, {
    minutes: number; points: number; count: number; entity: EntitySlug
  }> = {}

  for (const slot of slots) {
    const entitySlug = resolveEntitySlug(slot)
    if (!entitySlug) continue

    const breakdown = computeSlotPoints(slot, multipliers, hotDays, customHotDates)

    const et = entityTotals[entitySlug]
    et.minutes += breakdown.minutes
    et.points += breakdown.points_total
    et.primeP += breakdown.points_prime
    et.weekendP += breakdown.points_weekend
    et.nightP += breakdown.points_night
    et.hotP += breakdown.points_hot
    et.count++

    // Person tracking
    const personSlug = slot.person_slug || resolvePersonSlug(slot)
    if (personSlug) {
      if (!personTotals[personSlug]) {
        personTotals[personSlug] = { minutes: 0, points: 0, count: 0, entity: entitySlug }
      }
      personTotals[personSlug].minutes += breakdown.minutes
      personTotals[personSlug].points += breakdown.points_total
      personTotals[personSlug].count++
    }
  }

  // Build entity summaries
  const totalPoints = entityTotals.rl.points + entityTotals.lobster.points
  const entities: EntityFairnessSummary[] = (['rl', 'lobster'] as EntitySlug[]).map(slug => {
    const t = entityTotals[slug]
    const info = ENTITY_DISPLAY[slug]
    const actualShare = totalPoints > 0 ? t.points / totalPoints : 0
    return {
      entity_id: '', // populated by API from DB
      entity_slug: slug,
      entity_name: info.name,
      entity_color: info.color,
      period_key: periodKey,
      total_minutes: t.minutes,
      total_hours: round2(t.minutes / 60),
      total_points: round2(t.points),
      prime_points: round2(t.primeP),
      weekend_points: round2(t.weekendP),
      night_points: round2(t.nightP),
      hot_points: round2(t.hotP),
      slot_count: t.count,
      target_share: 0.50,
      actual_share: round2(actualShare),
      fairness_delta: round2(actualShare - 0.50),
    }
  })

  // Person breakdown
  const persons: PersonFairnessBreakdown[] = Object.entries(personTotals).map(([slug, t]) => ({
    person_slug: slug as PersonSlug,
    person_name: PERSON_DISPLAY[slug as PersonSlug]?.name || slug,
    entity_slug: t.entity,
    total_minutes: t.minutes,
    total_hours: round2(t.minutes / 60),
    total_points: round2(t.points),
    slot_count: t.count,
  }))

  // Verdict
  const delta = Math.abs(entities[0].fairness_delta)
  let verdict: 'balanced' | 'slight_imbalance' | 'imbalanced' = 'balanced'
  if (delta > 0.15) verdict = 'imbalanced'
  else if (delta > 0.05) verdict = 'slight_imbalance'

  // Suggestion
  const underEntity = entities.reduce((a, b) => a.actual_share < b.actual_share ? a : b)
  const suggestion = totalPoints === 0
    ? 'No slots assigned yet. Both entities start equal.'
    : verdict === 'balanced'
      ? 'Fair allocation. Continue balanced assignments.'
      : `${underEntity.entity_name} should take the next prime slot to restore balance.`

  return {
    period_key: periodKey,
    entities,
    overall_delta: round2(Math.abs(entityTotals.rl.points - entityTotals.lobster.points)),
    verdict,
    suggestion,
    person_breakdown: persons,
  }
}

/**
 * Suggest which entity should take the next prime slot.
 */
export function suggestNextAllocation(fairnessState: FairnessState): EntitySlug {
  const rl = fairnessState.entities.find(e => e.entity_slug === 'rl')!
  const lobster = fairnessState.entities.find(e => e.entity_slug === 'lobster')!

  // The entity with fewer points should get priority
  return rl.total_points <= lobster.total_points ? 'rl' : 'lobster'
}

// ============================================================
// SAFEGUARD VALIDATION
// ============================================================

/**
 * Validate a slot assignment against safeguard rules.
 * Returns list of violations (empty = ok).
 */
export function validateAssignment(
  slot: EnhancedSlot,
  personSlug: PersonSlug | null,
  allSlots: EnhancedSlot[],
  safeguards: SafeguardConfig = DEFAULT_SAFEGUARDS,
): SafeguardViolation[] {
  const violations: SafeguardViolation[] = []

  if (!personSlug) return violations // unassigning is always ok

  const entitySlug = ENTITY_MAP[personSlug]

  // RULE 1: No overlapping slots (single room)
  if (safeguards.single_room) {
    const overlapping = allSlots.filter(s =>
      s.id !== slot.id &&
      s.slot_date === slot.slot_date &&
      s.assignee !== null &&
      timeRangesOverlap(slot.start_time, slot.end_time, s.start_time, s.end_time)
    )
    if (overlapping.length > 0) {
      violations.push({
        rule: 'no_overlap_room',
        severity: 'block',
        message: `Studio already booked: overlaps with ${overlapping[0].slot_type.toUpperCase()} (${overlapping[0].start_time}-${overlapping[0].end_time})`,
      })
    }
  }

  // RULE 2: No overlapping slots for same person
  const personOverlaps = allSlots.filter(s =>
    s.id !== slot.id &&
    s.slot_date === slot.slot_date &&
    resolvePersonSlug(s) === personSlug &&
    timeRangesOverlap(slot.start_time, slot.end_time, s.start_time, s.end_time)
  )
  if (personOverlaps.length > 0) {
    violations.push({
      rule: 'no_overlap_person',
      severity: 'block',
      message: `${PERSON_DISPLAY[personSlug].name} already has a slot at that time`,
    })
  }

  // RULE 3: Max consecutive nights per person
  if (slot.slot_type === 'night') {
    const consecutiveNights = countConsecutiveNights(slot, personSlug, allSlots, 'person')
    if (consecutiveNights >= safeguards.max_consecutive_nights_per_person) {
      violations.push({
        rule: 'max_consecutive_nights_person',
        severity: 'block',
        message: `${PERSON_DISPLAY[personSlug].name} would have ${consecutiveNights + 1} consecutive NIGHT slots (max ${safeguards.max_consecutive_nights_per_person})`,
        suggestion: 'Assign to another person or swap with the other entity',
      })
    }
  }

  // RULE 4: Max consecutive nights per entity
  if (slot.slot_type === 'night') {
    const consecutiveNights = countConsecutiveNights(slot, personSlug, allSlots, 'entity')
    if (consecutiveNights >= safeguards.max_consecutive_nights_per_entity) {
      violations.push({
        rule: 'max_consecutive_nights_entity',
        severity: 'warn',
        message: `Entity ${ENTITY_DISPLAY[entitySlug].name} would have ${consecutiveNights + 1} consecutive NIGHT slots (max ${safeguards.max_consecutive_nights_per_entity})`,
      })
    }
  }

  // RULE 5: Min rest between NIGHT and morning MIX
  if (slot.slot_type === 'mix') {
    const prevNight = findPreviousNight(slot, personSlug, allSlots)
    if (prevNight) {
      const restHours = computeRestHours(prevNight.end_time, slot.start_time)
      if (restHours < safeguards.min_rest_hours_night_to_morning) {
        violations.push({
          rule: 'min_rest_night_to_morning',
          severity: 'warn',
          message: `Only ${restHours.toFixed(1)}h rest after NIGHT (min ${safeguards.min_rest_hours_night_to_morning}h required)`,
          suggestion: 'Consider starting later or skipping this MIX',
        })
      }
    }
  }

  // RULE 6: Max daily hours per person
  const dailyMinutes = allSlots
    .filter(s => s.id !== slot.id && s.slot_date === slot.slot_date && resolvePersonSlug(s) === personSlug)
    .reduce((sum, s) => sum + computeSlotMinutes(s.start_time, s.end_time), 0)
  const slotMinutes = computeSlotMinutes(slot.start_time, slot.end_time)
  const totalDailyHours = (dailyMinutes + slotMinutes) / 60
  if (totalDailyHours > safeguards.max_daily_hours_per_person) {
    violations.push({
      rule: 'max_daily_hours',
      severity: 'warn',
      message: `${PERSON_DISPLAY[personSlug].name} would have ${totalDailyHours.toFixed(1)}h on this day (max ${safeguards.max_daily_hours_per_person}h)`,
    })
  }

  // RULE 7: Slot duration limits
  if (slotMinutes < safeguards.slot_min_duration_minutes) {
    violations.push({
      rule: 'min_duration',
      severity: 'block',
      message: `Slot is ${slotMinutes}min (min ${safeguards.slot_min_duration_minutes}min)`,
    })
  }
  if (slotMinutes > safeguards.slot_max_duration_minutes) {
    violations.push({
      rule: 'max_duration',
      severity: 'warn',
      message: `Slot is ${(slotMinutes / 60).toFixed(1)}h (max ${safeguards.slot_max_duration_minutes / 60}h)`,
    })
  }

  // RULE 8: Locked slots
  if (slot.status === 'locked') {
    violations.push({
      rule: 'locked_slot',
      severity: 'block',
      message: 'This slot is locked and cannot be modified',
    })
  }

  return violations
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function resolveEntitySlug(slot: EnhancedSlot): EntitySlug | null {
  if (slot.entity_slug) return slot.entity_slug as EntitySlug
  if (slot.person_slug) return ENTITY_MAP[slot.person_slug as PersonSlug] || null
  // Legacy fallback
  if (slot.assignee === 'roman') return 'rl'
  if (slot.assignee === 'lobster') return 'lobster'
  return null
}

function resolvePersonSlug(slot: EnhancedSlot | { person_slug?: string | null; assignee?: string | null }): string | null {
  if ('person_slug' in slot && slot.person_slug) return slot.person_slug
  return null
}

function timeRangesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

  let s1 = toMin(start1), e1 = toMin(end1)
  let s2 = toMin(start2), e2 = toMin(end2)

  // Handle overnight
  if (e1 <= s1) e1 += 24 * 60
  if (e2 <= s2) e2 += 24 * 60

  return s1 < e2 && s2 < e1
}

function countConsecutiveNights(
  targetSlot: EnhancedSlot,
  personSlug: PersonSlug,
  allSlots: EnhancedSlot[],
  mode: 'person' | 'entity',
): number {
  if (!targetSlot.slot_date) return 0

  const entitySlug = ENTITY_MAP[personSlug]
  const targetDate = new Date(targetSlot.slot_date)

  // Look backwards
  let count = 0
  for (let offset = 1; offset <= 7; offset++) {
    const checkDate = new Date(targetDate)
    checkDate.setDate(checkDate.getDate() - offset)
    const checkDateStr = checkDate.toISOString().split('T')[0]

    const nightSlot = allSlots.find(s =>
      s.slot_type === 'night' &&
      s.slot_date === checkDateStr &&
      s.id !== targetSlot.id &&
      (mode === 'person'
        ? resolvePersonSlug(s) === personSlug
        : resolveEntitySlug(s) === entitySlug)
    )

    if (nightSlot) count++
    else break
  }

  // Look forwards
  for (let offset = 1; offset <= 7; offset++) {
    const checkDate = new Date(targetDate)
    checkDate.setDate(checkDate.getDate() + offset)
    const checkDateStr = checkDate.toISOString().split('T')[0]

    const nightSlot = allSlots.find(s =>
      s.slot_type === 'night' &&
      s.slot_date === checkDateStr &&
      s.id !== targetSlot.id &&
      (mode === 'person'
        ? resolvePersonSlug(s) === personSlug
        : resolveEntitySlug(s) === entitySlug)
    )

    if (nightSlot) count++
    else break
  }

  return count // total consecutive excluding the target slot itself
}

function findPreviousNight(
  mixSlot: EnhancedSlot,
  personSlug: PersonSlug,
  allSlots: EnhancedSlot[],
): EnhancedSlot | null {
  if (!mixSlot.slot_date) return null

  const targetDate = new Date(mixSlot.slot_date)
  const prevDateStr = new Date(targetDate.setDate(targetDate.getDate() - 1)).toISOString().split('T')[0]

  return allSlots.find(s =>
    s.slot_type === 'night' &&
    s.slot_date === prevDateStr &&
    resolvePersonSlug(s) === personSlug
  ) || null
}

function computeRestHours(nightEndTime: string, morningStartTime: string): number {
  const [nh, nm] = nightEndTime.split(':').map(Number)
  const [mh, mm] = morningStartTime.split(':').map(Number)

  // Night ends at e.g. 02:00, morning starts at 10:00
  // If night end is < 12:00, we assume it's already the next day
  let nightEndMin = nh * 60 + nm
  let morningStartMin = mh * 60 + mm

  // Both are in the same "day" conceptually
  if (morningStartMin > nightEndMin) {
    return (morningStartMin - nightEndMin) / 60
  }

  // Shouldn't happen normally, but handle edge case
  return (morningStartMin + 24 * 60 - nightEndMin) / 60
}

// ============================================================
// SWAP FAIRNESS CHECK
// ============================================================

/**
 * Evaluate whether a swap improves or worsens fairness.
 */
export function evaluateSwapFairness(
  currentSlots: EnhancedSlot[],
  swapSlotId: string,
  newPersonSlug: PersonSlug,
  periodKey: string,
  multipliers: ScoringMultipliers = DEFAULT_MULTIPLIERS,
): { before: FairnessState; after: FairnessState; improves: boolean } {
  const before = computeFairnessState(currentSlots, periodKey, multipliers)

  // Simulate the swap
  const newEntitySlug = ENTITY_MAP[newPersonSlug]
  const simulatedSlots = currentSlots.map(s =>
    s.id === swapSlotId
      ? { ...s, person_slug: newPersonSlug, entity_slug: newEntitySlug, assignee: newEntitySlug === 'rl' ? 'roman' : 'lobster' }
      : s
  )

  const after = computeFairnessState(simulatedSlots, periodKey, multipliers)

  return {
    before,
    after,
    improves: after.overall_delta < before.overall_delta,
  }
}
