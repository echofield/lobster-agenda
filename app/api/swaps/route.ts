import { type NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { StudioEntity } from '@/types/studio'

const VALID_ENTITIES = ['romann', 'lobster'] as const

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  try {
    const status = request.nextUrl.searchParams.get('status')
    const slotId = request.nextUrl.searchParams.get('slot_id')

    let query = supabase
      .from('studio_swap_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (slotId) query = query.eq('slot_id', slotId)

    const { data: swaps, error } = await query
    if (error) throw error

    return NextResponse.json({ swaps: swaps || [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { slot_id, requester, target, message } = body as {
      slot_id?: string
      requester?: StudioEntity
      target?: StudioEntity
      message?: string
    }

    if (!slot_id || !requester || !target) {
      return NextResponse.json({ error: 'slot_id, requester, target required' }, { status: 400 })
    }

    if (!VALID_ENTITIES.includes(requester as any) || !VALID_ENTITIES.includes(target as any)) {
      return NextResponse.json({ error: 'Invalid entity' }, { status: 400 })
    }

    if (requester === target) {
      return NextResponse.json({ error: 'Same requester and target' }, { status: 400 })
    }

    const { data: slot } = await supabase
      .from('studio_slots')
      .select('assignee')
      .eq('id', slot_id)
      .single()

    if (!slot || slot.assignee !== target) {
      return NextResponse.json({ error: `Slot not assigned to ${target}` }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('studio_swap_requests')
      .select('id')
      .eq('slot_id', slot_id)
      .eq('status', 'pending')
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Pending swap exists' }, { status: 409 })
    }

    const { data: swap, error } = await supabase
      .from('studio_swap_requests')
      .insert({ slot_id, requester, target, message: message || null })
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ swap }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
