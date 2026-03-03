// STUDIO WEEK UTILITIES
// ISO week handling with Europe/Paris timezone

import type { SlotType, StudioSlot, DaySchedule, WeekSchedule } from '@/types/studio'
import { DAY_NAMES_FR, SLOT_TIMES } from '@/types/studio'
import { getWeekType, calculateWeekStats } from './validator'

/**
 * Get ISO week key for a given date (Europe/Paris timezone)
 * Format: "2026-W10"
 */
export function getISOWeekKey(date: Date): string {
  // Clone to avoid mutation
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))

  // Set to nearest Thursday: current date + 4 - current day number
  // (Sunday=0 → +4, Monday=1 → +3, etc.)
  const dayNum = d.getUTCDay() || 7 // Make Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)

  // Get first day of year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))

  // Calculate week number
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)

  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

/**
 * Parse ISO week key to get the Monday date of that week
 */
export function parseWeekKey(weekKey: string): Date {
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/)
  if (!match) throw new Error(`Invalid week key: ${weekKey}`)

  const year = parseInt(match[1], 10)
  const week = parseInt(match[2], 10)

  // Jan 4th is always in week 1
  const jan4 = new Date(year, 0, 4)
  const jan4Day = jan4.getDay() || 7 // Sunday = 7

  // Find Monday of week 1
  const week1Monday = new Date(jan4)
  week1Monday.setDate(jan4.getDate() - jan4Day + 1)

  // Add weeks
  const targetMonday = new Date(week1Monday)
  targetMonday.setDate(week1Monday.getDate() + (week - 1) * 7)

  return targetMonday
}

/**
 * Get date for a specific day in a week
 * dayOfWeek: 0=Monday, 6=Sunday
 */
export function getDateForDay(weekKey: string, dayOfWeek: number): Date {
  const monday = parseWeekKey(weekKey)
  const date = new Date(monday)
  date.setDate(monday.getDate() + dayOfWeek)
  return date
}

/**
 * Format date as ISO string (YYYY-MM-DD)
 */
export function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Get current week key (Europe/Paris)
 */
export function getCurrentWeekKey(): string {
  // Use Intl to get Paris time
  const parisTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' })
  return getISOWeekKey(new Date(parisTime))
}

/**
 * Generate next N week keys starting from current week
 */
export function getNextWeekKeys(count: number, startFrom?: string): string[] {
  const keys: string[] = []
  const startWeek = startFrom ? parseWeekKey(startFrom) : parseWeekKey(getCurrentWeekKey())

  for (let i = 0; i < count; i++) {
    const weekDate = new Date(startWeek)
    weekDate.setDate(startWeek.getDate() + i * 7)
    keys.push(getISOWeekKey(weekDate))
  }

  return keys
}

/**
 * Generate slot definitions for a week
 * Returns array of slot data (without IDs, for seeding)
 */
export function generateWeekSlotDefinitions(weekKey: string): Array<{
  week_key: string
  day_of_week: number
  slot_type: SlotType
  start_time: string
  end_time: string
}> {
  const slots: Array<{
    week_key: string
    day_of_week: number
    slot_type: SlotType
    start_time: string
    end_time: string
  }> = []

  const slotTypes: SlotType[] = ['mix', 'session', 'night']

  for (let day = 0; day < 7; day++) {
    for (const slotType of slotTypes) {
      slots.push({
        week_key: weekKey,
        day_of_week: day,
        slot_type: slotType,
        start_time: SLOT_TIMES[slotType].start,
        end_time: SLOT_TIMES[slotType].end,
      })
    }
  }

  return slots
}

/**
 * Build DaySchedule from slots
 */
export function buildDaySchedule(
  weekKey: string,
  dayOfWeek: number,
  slots: StudioSlot[],
): DaySchedule {
  const date = getDateForDay(weekKey, dayOfWeek)

  return {
    day_of_week: dayOfWeek,
    date: formatDateISO(date),
    day_name: DAY_NAMES_FR[dayOfWeek],
    is_weekend: dayOfWeek >= 5,
    slots: slots
      .filter(s => s.day_of_week === dayOfWeek)
      .sort((a, b) => {
        const order: Record<SlotType, number> = { mix: 0, session: 1, night: 2 }
        return order[a.slot_type] - order[b.slot_type]
      }),
  }
}

/**
 * Build full WeekSchedule from slots
 */
export function buildWeekSchedule(weekKey: string, slots: StudioSlot[]): WeekSchedule {
  const days: DaySchedule[] = []

  for (let day = 0; day < 7; day++) {
    days.push(buildDaySchedule(weekKey, day, slots))
  }

  return {
    week_key: weekKey,
    week_type: getWeekType(weekKey),
    days,
    stats: calculateWeekStats(slots),
  }
}

/**
 * Get display label for week
 * e.g., "10-16 Mars 2026" for Week 11
 */
export function getWeekDisplayLabel(weekKey: string): string {
  const monday = parseWeekKey(weekKey)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const monthNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ]

  const startDay = monday.getDate()
  const endDay = sunday.getDate()
  const month = monthNames[sunday.getMonth()]
  const year = sunday.getFullYear()

  if (monday.getMonth() === sunday.getMonth()) {
    return `${startDay}-${endDay} ${month} ${year}`
  } else {
    return `${startDay} ${monthNames[monday.getMonth()]} - ${endDay} ${month} ${year}`
  }
}
