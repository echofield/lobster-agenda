import { type NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { validateMove } from '@/lib/validator'
import { validateAssignment, computeSlotPoints } from '@/lib/fairness'
import { ENTITY_MAP } from '@/types/fairness'
import type { StudioSlot, StudioSwapRequest } from '@/types/studio'
import type { EnhancedSlot, PersonSlug } from '@/types/fairness'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/swaps/:id/decide
 * Body: { decision: 'accept' | 'decline' }
 *
 * Enhanced: also updates person/entity on slot and fairness ledger.
 * Runs both legacy validateMove AND new validateAssignment safeguards.
 */
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
      // Fetch week slots WITH person/entity joins for safeguard validation
      const { data: weekSlots } = await supabase
        .from('studio_slots')
        .select(`
          *,
          person:lobster_persons!assigned_person_id(slug),
          entity:lobster_entities!assigned_entity_id(slug)
        `)
        .eq('week_key', slot.week_key)

      // Legacy validation
      const validation = validateMove(slot.id, swap.requester, slot.week_key, weekSlots || [])

      if (validation.status === 'block') {
        return NextResponse.json({ error: 'Swap blocked', validation }, { status: 422 })
      }

      // Resolve person/entity for requester
      let personId: string | null = swap.requester_person_id || null
      let entityId: string | null = null
      let requesterPersonSlug: PersonSlug | null = null

      if (personId) {
        const { data: p } = await supabase
          .from('lobster_persons')
          .select('entity_id, slug')
          .eq('id', personId)
          .single()
        if (p) {
          entityId = p.entity_id
          requesterPersonSlug = p.slug as PersonSlug
        }
      } else {
        const entitySlug = swap.requester === 'roman' ? 'rl' : 'lobster'
        const { data: e } = await supabase.from('lobster_entities').select('id').eq('slug', entitySlug).single()
        if (e) entityId = e.id
      }

      // Person-level safeguard validation (if we have person slug + slot has date)
      if (requesterPersonSlug && slot.slot_date) {
        const enhancedSlots: EnhancedSlot[] = (weekSlots || []).map((s: any) => ({
          ...s,
          person_slug: s.person?.slug ?? null,
          entity_slug: s.entity?.slug ?? null,
          status: s.status || 'tentative',
          source: s.source || 'manual',
          validation_status: s.validation_status || 'ok',
          validation_reasons: s.validation_reasons || [],
        }))

        const targetEnhanced = enhancedSlots.find(s => s.id === slot.id)
        if (targetEnhanced) {
          const violations = validateAssignment(targetEnhanced, requesterPersonSlug, enhancedSlots)
          const blocks = violations.filter(v => v.severity === 'block')
          if (blocks.length > 0) {
            return NextResponse.json({
              error: 'Swap blocked by safeguards',
              violations: blocks.map(v => ({ rule: v.rule, message: v.message, suggestion: v.suggestion })),
            }, { status: 422 })
          }
        }
      }

      await supabase
        .from('studio_slots')
        .update({
          assignee: swap.requester,
          assigned_person_id: personId,
          assigned_entity_id: entityId,
          validation_status: validation.status,
          validation_reasons: validation.reasons,
        })
        .eq('id', slot.id)

      // Update fairness ledger
      if (entityId && slot.slot_date) {
        const points = computeSlotPoints({
          id: slot.id,
          slot_type: slot.slot_type,
          start_time: slot.start_time,
          end_time: slot.end_time,
          slot_date: slot.slot_date,
          day_of_week: slot.day_of_week,
        })
        await supabase
          .from('lobster_fairness_ledger')
          .upsert({
            slot_id: slot.id,
            entity_id: entityId,
            person_id: personId,
            period_key: slot.slot_date.substring(0, 7),
            slot_date: slot.slot_date,
            minutes: points.minutes,
            points_base: points.points_base,
            points_prime: points.points_prime,
            points_weekend: points.points_weekend,
            points_night: points.points_night,
            points_hot: points.points_hot,
            points_total: points.points_total,
            breakdown: points,
          }, { onConflict: 'slot_id' })
          .catch((err: unknown) => console.error('Ledger update on swap failed:', err))
      }
    }

    const newStatus = decision === 'accept' ? 'accepted' : 'declined'
    const { data: updated, error: updateError } = await supabase
      .from('studio_swap_requests')
      .update({
        status: newStatus,
        responded_at: new Date().toISOString(),
      })
      .eq('id', swapId)
      .select('*')
      .single()

    if (updateError) throw updateError

    return NextResponse.json({
      swap: updated,
      message: decision === 'accept' ? 'Swap accepted and applied' : 'Swap declined',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
