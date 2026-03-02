import { type NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { validateMove } from '@/lib/validator'
import type { StudioSlot, StudioSwapRequest } from '@/types/studio'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  try {
    const { id: swapId } = await context.params
    const body = await request.json()
    const decision = body?.decision as 'accept' | 'decline' | undefined

    if (!decision || !['accept', 'decline'].includes(decision)) {
      return NextResponse.json({ error: 'decision must be accept or decline' }, { status: 400 })
    }

    const { data: swap, error: swapError } = await supabase
      .from('studio_swap_requests')
      .select('*')
      .eq('id', swapId)
      .single()

    if (swapError || !swap) {
      return NextResponse.json({ error: 'Swap not found' }, { status: 404 })
    }

    if (swap.status !== 'pending') {
      return NextResponse.json({ error: `Already ${swap.status}` }, { status: 400 })
    }

    const { data: slot, error: slotError } = await supabase
      .from('studio_slots')
      .select('*')
      .eq('id', swap.slot_id)
      .single()

    if (slotError || !slot) {
      return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
    }

    if (decision === 'accept') {
      const { data: weekSlots } = await supabase
        .from('studio_slots')
        .select('*')
        .eq('week_key', slot.week_key)

      const validation = validateMove(slot.id, swap.requester, slot.week_key, weekSlots || [])

      if (validation.status === 'block') {
        return NextResponse.json({ error: 'Swap blocked', validation }, { status: 422 })
      }

      await supabase
        .from('studio_slots')
        .update({
          assignee: swap.requester,
          validation_status: validation.status,
          validation_reasons: validation.reasons,
        })
        .eq('id', slot.id)
    }

    const { data: updated, error: updateError } = await supabase
      .from('studio_swap_requests')
      .update({
        status: decision === 'accept' ? 'accepted' : 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('id', swapId)
      .select('*')
      .single()

    if (updateError) throw updateError

    return NextResponse.json({
      swap: updated,
      message: decision === 'accept' ? 'Swap accepted' : 'Swap declined',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
