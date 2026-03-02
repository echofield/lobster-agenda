import { type NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { validateMove, validateWeek } from '@/lib/validator'
import type { StudioSlot, StudioEntity } from '@/types/studio'

const VALID_ENTITIES = ['roman', 'lobster'] as const

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  try {
    const weekKey = request.nextUrl.searchParams.get('week')
    if (!weekKey || !/^\d{4}-W\d{2}$/.test(weekKey)) {
      return NextResponse.json({ error: 'Invalid week format' }, { status: 400 })
    }

    const { data: slots, error } = await supabase
      .from('studio_slots')
      .select('*')
      .eq('week_key', weekKey)
      .order('day_of_week')
      .order('slot_type')

    if (error) throw error

    const validationMap = validateWeek(weekKey, slots || [])
    const slotsWithValidation = (slots || []).map(slot => ({
      ...slot,
      validation_status: validationMap.get(slot.id)?.status || 'ok',
      validation_reasons: validationMap.get(slot.id)?.reasons || [],
    }))

    return NextResponse.json({ slots: slotsWithValidation, week_key: weekKey })
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
    const slotId = body?.slot_id
    const assignee = body?.assignee as StudioEntity | null | undefined

    if (!slotId) {
      return NextResponse.json({ error: 'slot_id required' }, { status: 400 })
    }

    if (assignee !== null && assignee !== undefined && !VALID_ENTITIES.includes(assignee as any)) {
      return NextResponse.json({ error: 'Invalid assignee' }, { status: 400 })
    }

    const { data: slot, error: slotError } = await supabase
      .from('studio_slots')
      .select('*')
      .eq('id', slotId)
      .single()

    if (slotError || !slot) {
      return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
    }

    const { data: weekSlots, error: weekError } = await supabase
      .from('studio_slots')
      .select('*')
      .eq('week_key', slot.week_key)

    if (weekError) throw weekError

    const validation = validateMove(slotId, assignee ?? null, slot.week_key, weekSlots || [])

    if (validation.status === 'block') {
      return NextResponse.json({ error: 'Blocked by rules', validation }, { status: 422 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('studio_slots')
      .update({
        assignee: assignee ?? null,
        validation_status: validation.status,
        validation_reasons: validation.reasons,
      })
      .eq('id', slotId)
      .select('*')
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ slot: updated, validation })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
