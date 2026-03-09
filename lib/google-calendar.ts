// Google Calendar API Integration for Lobster Agenda

export interface CalendarConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface CalendarEvent {
  summary: string
  description: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  location?: string
}

// Build OAuth URL for Google Calendar
export function getGoogleAuthUrl(config: CalendarConfig): string {
  const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar')
  const redirectUri = encodeURIComponent(config.redirectUri)
  return 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + config.clientId + '&redirect_uri=' + redirectUri + '&response_type=code&scope=' + scope + '&access_type=offline&prompt=consent'
}

// Exchange auth code for tokens
export async function exchangeCodeForTokens(
  code: string,
  config: CalendarConfig
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error('Failed to exchange code')
  return res.json()
}

// Create calendar event
export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarEvent
): Promise<any> {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/' + calendarId + '/events',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  )
  if (!res.ok) throw new Error('Failed to create event')
  return res.json()
}

// Convert slot to calendar event
export function slotToCalendarEvent(
  slot: {
    slot_type: string
    start_time: string
    end_time: string
    slot_date: string
    person_name?: string
    entity_name?: string
  },
  timeZone = 'Europe/Paris'
): CalendarEvent {
  const date = slot.slot_date
  const personName = slot.person_name || 'Libre'
  const entityName = slot.entity_name || ''
  return {
    summary: 'Studio: ' + personName + ' - ' + slot.slot_type.toUpperCase(),
    description: 'Creneau ' + slot.slot_type + ' reserve par ' + personName + ' (' + entityName + ')',
    start: { dateTime: date + 'T' + slot.start_time + ':00', timeZone },
    end: { dateTime: date + 'T' + slot.end_time + ':00', timeZone },
    location: 'Studio',
  }
}
