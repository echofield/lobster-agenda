import { type NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens } from '@/lib/google-calendar'

const config = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/callback',
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')
  
  if (error) {
    return NextResponse.redirect(new URL('/?calendar_error=' + error, request.url))
  }
  
  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 })
  }
  
  try {
    const tokens = await exchangeCodeForTokens(code, config)
    // In production, store tokens securely in DB
    // For now, redirect with tokens in URL (for demo)
    const redirectUrl = new URL('/', request.url)
    redirectUrl.searchParams.set('calendar_connected', 'true')
    return NextResponse.redirect(redirectUrl)
  } catch (e) {
    return NextResponse.redirect(new URL('/?calendar_error=token_exchange_failed', request.url))
  }
}
