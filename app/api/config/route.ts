import { type NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/config
 * Returns all config values.
 *
 * PATCH /api/config
 * Update a config value. Body: { key: string, value: any }
 */
export async function GET() {
  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  try {
    const { data, error } = await supabase
      .from('lobster_config')
      .select('*')
      .order('key')

    if (error) throw error

    // Transform to key-value map
    const config: Record<string, any> = {}
    for (const row of data || []) {
      config[row.key] = row.value
    }

    return NextResponse.json({ config })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { key, value } = body as { key?: string; value?: any }

    if (!key || value === undefined) {
      return NextResponse.json({ error: 'key and value required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('lobster_config')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', key)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ config: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
