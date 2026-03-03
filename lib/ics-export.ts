// LOBSTER AGENDA — ICS EXPORT
// Generates RFC 5545 compliant ICS calendar files
// This is the Google Calendar integration boundary.
// Future: add OAuth + push to Google Calendar API.

interface ICSSlot {
  id: string
  slot_date: string        // 'YYYY-MM-DD'
  start_time: string       // 'HH:MM'
  end_time: string         // 'HH:MM'
  slot_type: string        // 'mix', 'session', 'night'
  person_name?: string
  entity_name?: string
  notes?: string
  status?: string
}

const SLOT_EMOJI: Record<string, string> = {
  mix: '🎛️',
  session: '🎵',
  night: '🌙',
}

/**
 * Generate an ICS calendar string from a list of slots.
 * Timezone: Europe/Paris (hardcoded for V1).
 */
export function generateICS(slots: ICSSlot[], calendarName: string = 'Lobster Agenda'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lobster Agenda//lobster-agenda//FR',
    `X-WR-CALNAME:${calendarName}`,
    'X-WR-TIMEZONE:Europe/Paris',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // VTIMEZONE for Europe/Paris
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Paris',
    'BEGIN:STANDARD',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
  ]

  for (const slot of slots) {
    if (!slot.slot_date || !slot.start_time || !slot.end_time) continue

    const emoji = SLOT_EMOJI[slot.slot_type] || '📅'
    const summary = `${emoji} ${slot.slot_type.toUpperCase()}${slot.person_name ? ` — ${slot.person_name}` : ''}${slot.entity_name ? ` (${slot.entity_name})` : ''}`

    const dtStart = formatICSDateTime(slot.slot_date, slot.start_time)
    let dtEnd = formatICSDateTime(slot.slot_date, slot.end_time)

    // Handle overnight: if end < start, it's the next day
    const [sh] = slot.start_time.split(':').map(Number)
    const [eh] = slot.end_time.split(':').map(Number)
    if (eh < sh) {
      const nextDay = new Date(slot.slot_date)
      nextDay.setDate(nextDay.getDate() + 1)
      const nextDateStr = nextDay.toISOString().split('T')[0]
      dtEnd = formatICSDateTime(nextDateStr, slot.end_time)
    }

    const description = [
      `Type: ${slot.slot_type.toUpperCase()}`,
      slot.person_name ? `Personne: ${slot.person_name}` : null,
      slot.entity_name ? `Entité: ${slot.entity_name}` : null,
      slot.status ? `Statut: ${slot.status}` : null,
      slot.notes ? `Notes: ${slot.notes}` : null,
    ].filter(Boolean).join('\\n')

    lines.push(
      'BEGIN:VEVENT',
      `UID:${slot.id}@lobster-agenda`,
      `DTSTAMP:${formatICSDateTimeUTC(new Date())}`,
      `DTSTART;TZID=Europe/Paris:${dtStart}`,
      `DTEND;TZID=Europe/Paris:${dtEnd}`,
      `SUMMARY:${escapeICS(summary)}`,
      `DESCRIPTION:${escapeICS(description)}`,
      'LOCATION:Studio',
      `STATUS:${slot.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`,
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function formatICSDateTime(date: string, time: string): string {
  // Convert 'YYYY-MM-DD' + 'HH:MM' to '20260315T100000'
  const d = date.replace(/-/g, '')
  const t = time.replace(/:/g, '') + '00'
  return `${d}T${t}`
}

function formatICSDateTimeUTC(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

// ============================================================
// GOOGLE CALENDAR ADAPTER INTERFACE
// Future implementation boundary for OAuth + push
// ============================================================

export interface GoogleCalendarAdapter {
  /** Push confirmed slots to Google Calendar */
  pushSlots(slots: ICSSlot[], calendarId: string): Promise<{ success: boolean; eventIds: string[] }>
  /** Delete an event from Google Calendar */
  deleteEvent(eventId: string, calendarId: string): Promise<boolean>
  /** Sync: pull events and detect conflicts */
  pullEvents(calendarId: string, startDate: string, endDate: string): Promise<ICSSlot[]>
}

// Placeholder: implement when OAuth is ready
export class GoogleCalendarAdapterStub implements GoogleCalendarAdapter {
  async pushSlots(): Promise<{ success: boolean; eventIds: string[] }> {
    console.warn('[GoogleCalendar] Adapter not implemented. Use ICS export for now.')
    return { success: false, eventIds: [] }
  }
  async deleteEvent(): Promise<boolean> { return false }
  async pullEvents(): Promise<ICSSlot[]> { return [] }
}
