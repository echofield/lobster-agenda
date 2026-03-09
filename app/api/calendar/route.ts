import { type NextRequest, NextResponse } from 'next/server'
import { getGoogleAuthUrl, exchangeCodeForTokens, createCalendarEvent, slotToCalendarEvent } from '@/lib/google-calendar'

const config = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/callback',
}

// GET: Return auth URL or sync status
export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action')
  
  if (action === 'auth') {
    if (!config.clientId) {
      return NextResponse.json({ error: 'Google Calendar not configured' }, { status: 500 })
    }
    const authUrl = getGoogleAuthUrl(config)
    return NextResponse.json({ authUrl })
  }
  
  return NextResponse.json({ status: 'ready', configured: !!config.clientId })
}

// POST: Sync slots to calendar
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { access_token, calendar_id, slots } = body
    
    if (!access_token || !calendar_id || !slots) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }
    
    const results = []
    for (const slot of slots) {
      if (slot.person_name && slot.slot_date) {
        const event = slotToCalendarEvent(slot)
        try {
          const created = await createCalendarEvent(access_token, calendar_id, event)
          results.push({ slot_id: slot.id, event_id: created.id, status: 'created' })
        } catch (e) {
          results.push({ slot_id: slot.id, status: 'error', error: String(e) })
        }
      }
    }
    
    return NextResponse.json({ synced: results.length, results })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
