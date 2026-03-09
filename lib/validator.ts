// STUDIO SLOT VALIDATOR
// Deterministic validation of slot assignments against fairness rules

import type {
  StudioSlot,
  StudioEntity,
  SlotType,
  ValidationResult,
  ValidationStatus,
  WeekStats,
  EntityStats,
} from '@/types/studio'

/**
 * Determine week type (A or B) from ISO week key
 * Week 1 of any year = A, Week 2 = B, alternating
 */
export function getWeekType(weekKey: string): 'A' | 'B' {
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return 'A'
  const weekNum = parseInt(match[2], 10)
  return weekNum % 2 === 1 ? 'A' : 'B'
}

/**
 * Check if a slot is a weekend prime slot
 * Prime slots: Saturday SESSION, Saturday NIGHT, Sunday SESSION, Sunday NIGHT
 */
export function isPrimeSlot(dayOfWeek: number, slotType: SlotType): boolean {
  // 5 = Saturday, 6 = Sunday
  if (dayOfWeek !== 5 && dayOfWeek !== 6) return false
  return slotType === 'session' || slotType === 'night'
}

/**
 * Get expected prime slot assignments based on week type
 */
export function getExpectedPrimeAssignments(weekType: 'A' | 'B'): Record<string, StudioEntity> {
  // Encoding: "5_session" = Saturday SESSION, "6_night" = Sunday NIGHT, etc.
  if (weekType === 'A') {
    return {
      '5_session': 'romann',   // Sat SESSION -> Roman
      '6_night': 'romann',     // Sun NIGHT -> Roman
      '5_night': 'lobster',   // Sat NIGHT -> Lobster
      '6_session': 'lobster', // Sun SESSION -> Lobster
    }
  } else {
    return {
      '5_session': 'lobster', // Week B: inverse
      '6_night': 'lobster',
      '5_night': 'romann',
      '6_session': 'romann',
    }
  }
}

/**
 * Count MIX mornings per entity for a week
 */
export function countMixMornings(slots: StudioSlot[]): { roman: number; lobster: number } {
  const mixSlots = slots.filter(s => s.slot_type === 'mix')
  return {
    roman: mixSlots.filter(s => s.assignee === 'romann').length,
    lobster: mixSlots.filter(s => s.assignee === 'lobster').length,
  }
}

/**
 * Check consecutive nights for an entity
 * Returns max consecutive night count
 */
export function getMaxConsecutiveNights(slots: StudioSlot[], entity: StudioEntity): number {
  // Sort by day
  const nightSlots = slots
    .filter(s => s.slot_type === 'night')
    .sort((a, b) => a.day_of_week - b.day_of_week)

  let maxConsec = 0
  let currentConsec = 0
  let prevDay = -2

  for (const slot of nightSlots) {
    if (slot.assignee === entity) {
      if (slot.day_of_week === prevDay + 1) {
        currentConsec++
      } else {
        currentConsec = 1
      }
      maxConsec = Math.max(maxConsec, currentConsec)
    } else {
      currentConsec = 0
    }
    prevDay = slot.day_of_week
  }

  return maxConsec
}

/**
 * Calculate week stats for both entities
 */
export function calculateWeekStats(slots: StudioSlot[]): WeekStats {
  const emptyStats = (): EntityStats => ({
    mix_count: 0,
    session_count: 0,
    night_count: 0,
    total_hours: 0,
    weekend_prime_count: 0,
  })

  const stats: WeekStats = {
    roman: emptyStats(),
    lobster: emptyStats(),
  }

  // Slot durations in hours
  const slotHours: Record<SlotType, number> = {
    mix: 6,      // 10:00-16:00
    session: 6,  // 16:00-22:00
    night: 6,    // 20:00-02:00
  }

  for (const slot of slots) {
    if (!slot.assignee) continue
    const entityStats = stats[slot.assignee]

    switch (slot.slot_type) {
      case 'mix':
        entityStats.mix_count++
        break
      case 'session':
        entityStats.session_count++
        break
      case 'night':
        entityStats.night_count++
        break
    }

    entityStats.total_hours += slotHours[slot.slot_type]

    if (isPrimeSlot(slot.day_of_week, slot.slot_type)) {
      entityStats.weekend_prime_count++
    }
  }

  return stats
}

/**
 * Main validator: check if a move is valid
 */
export function validateMove(
  slotId: string,
  newAssignee: StudioEntity | null,
  weekKey: string,
  allSlotsInWeek: StudioSlot[],
): ValidationResult {
  const reasons: string[] = []
  let status: ValidationStatus = 'ok'

  // Find the slot being modified
  const targetSlot = allSlotsInWeek.find(s => s.id === slotId)
  if (!targetSlot) {
    return { status: 'block', reasons: ['Slot not found'] }
  }

  // Create simulated state with the new assignment
  const simulatedSlots = allSlotsInWeek.map(s =>
    s.id === slotId ? { ...s, assignee: newAssignee } : s
  )

  // If unassigning, always OK
  if (newAssignee === null) {
    return { status: 'ok', reasons: [] }
  }

  const weekType = getWeekType(weekKey)

  // ===== RULE 1: Weekend Prime Rotation (BLOCK) =====
  if (isPrimeSlot(targetSlot.day_of_week, targetSlot.slot_type)) {
    const expectedAssignments = getExpectedPrimeAssignments(weekType)
    const slotKey = `${targetSlot.day_of_week}_${targetSlot.slot_type}`
    const expectedAssignee = expectedAssignments[slotKey]

    if (expectedAssignee && newAssignee !== expectedAssignee) {
      return {
        status: 'block',
        reasons: [
          `Prime slot violation: Week ${weekType} requires ${expectedAssignee.toUpperCase()} for ${targetSlot.slot_type.toUpperCase()} on ${targetSlot.day_of_week === 5 ? 'Saturday' : 'Sunday'}`,
        ],
        suggestedFix: {
          action: 'reassign',
          suggested_assignee: expectedAssignee,
          message: `Assign to ${expectedAssignee} instead`,
        },
      }
    }
  }

  // ===== RULE 2: MIX Morning Guarantees (WARN/BLOCK) =====
  if (targetSlot.slot_type === 'mix') {
    const mixCounts = countMixMornings(simulatedSlots)

    // Guaranteed minimums: Roman 3, Lobster 2
    // Total MIX slots per week = 7 (one per day)
    // Alternating = 2 (Week A: Roman, Week B: Lobster)
    const alternatingOwner: StudioEntity = weekType === 'A' ? 'romann' : 'lobster'

    // Calculate effective guarantees with alternating
    const romanMin = 3 + (alternatingOwner === 'romann' ? 2 : 0)
    const lobsterMin = 2 + (alternatingOwner === 'lobster' ? 2 : 0)

    // Count all assigned MIX slots
    const totalAssigned = mixCounts.roman + mixCounts.lobster
    const totalMixSlots = simulatedSlots.filter(s => s.slot_type === 'mix').length

    // Check if assignment would break guarantees
    if (newAssignee === 'romann' && mixCounts.lobster < lobsterMin) {
      const lobsterNeeds = lobsterMin - mixCounts.lobster
      const remainingSlots = totalMixSlots - totalAssigned
      if (remainingSlots < lobsterNeeds) {
        status = 'block'
        reasons.push(
          `MIX guarantee violation: Lobster needs ${lobsterNeeds} more MIX slot(s) but only ${remainingSlots} remain`,
        )
      }
    }

    if (newAssignee === 'lobster' && mixCounts.roman < romanMin) {
      const romanNeeds = romanMin - mixCounts.roman
      const remainingSlots = totalMixSlots - totalAssigned
      if (remainingSlots < romanNeeds) {
        status = 'block'
        reasons.push(
          `MIX guarantee violation: Roman needs ${romanNeeds} more MIX slot(s) but only ${remainingSlots} remain`,
        )
      }
    }

    // Warn if getting unbalanced (but still possible)
    if (status === 'ok') {
      if (mixCounts.roman > romanMin + 1) {
        status = 'warn'
        reasons.push(`Roman has ${mixCounts.roman} MIX slots (expected ~${romanMin})`)
      }
      if (mixCounts.lobster > lobsterMin + 1) {
        status = 'warn'
        reasons.push(`Lobster has ${mixCounts.lobster} MIX slots (expected ~${lobsterMin})`)
      }
    }
  }

  // ===== RULE 3: Max Consecutive Nights (BLOCK) =====
  if (targetSlot.slot_type === 'night') {
    const consecNights = getMaxConsecutiveNights(simulatedSlots, newAssignee)
    if (consecNights > 2) {
      return {
        status: 'block',
        reasons: [`${newAssignee.toUpperCase()} would have ${consecNights} consecutive NIGHT slots (max 2)`],
        suggestedFix: {
          action: 'swap',
          message: 'Consider swapping with the other entity',
        },
      }
    }
  }

  return { status, reasons }
}

/**
 * Validate an entire week schedule
 * Returns validation status for each slot
 */
export function validateWeek(
  weekKey: string,
  slots: StudioSlot[],
): Map<string, ValidationResult> {
  const results = new Map<string, ValidationResult>()

  for (const slot of slots) {
    if (slot.assignee) {
      const result = validateMove(slot.id, slot.assignee, weekKey, slots)
      results.set(slot.id, result)
    } else {
      results.set(slot.id, { status: 'ok', reasons: [] })
    }
  }

  return results
}

/**
 * Check if week schedule is fully valid (no blocks)
 */
export function isWeekValid(validationResults: Map<string, ValidationResult>): boolean {
  for (const result of validationResults.values()) {
    if (result.status === 'block') return false
  }
  return true
}

/**
 * Get overall week status (worst status wins)
 */
export function getWeekOverallStatus(validationResults: Map<string, ValidationResult>): ValidationStatus {
  let worst: ValidationStatus = 'ok'
  for (const result of validationResults.values()) {
    if (result.status === 'block') return 'block'
    if (result.status === 'warn') worst = 'warn'
  }
  return worst
}
