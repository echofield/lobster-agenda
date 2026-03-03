import { type NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { computeFairnessState, suggestNextAllocation } from '@/lib/fairness'
import type { EnhancedSlot } from '@/types/fairness'

/**
 * GET /api/fairness?period=2026-03
 * Returns fairness state for a period (month).
 */
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  try {
    const period = request.nextUrl.searchParams.get('period')

    // Default to current month
    const now = new Date()
    const periodKey = period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    // Parse period to get date range
    const [year, month] = periodKey.split('-').map(Number)
    const startDate = `${periodKey}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0] // last day of month

    // Fetch all slots in the period with person/entity joins
    const { data: rawSlots, error: slotError } = await supabase
      .from('studio_slots')
      .select(`
        *,
        person:lobster_persons!assigned_person_id(name, slug),
        entity:lobster_entities!assigned_entity_id(name, slug, color)
      `)
      .gte('slot_date', startDate)
      .lte('slot_date', endDate)
      .not('assignee', 'is', null)

    if (slotError) throw slotError

    // Transform to EnhancedSlot shape
    const slots: EnhancedSlot[] = (rawSlots || []).map((s: any) => ({
      ...s,
      person_slug: s.person?.slug || null,
      person_name: s.person?.name || null,
      entity_slug: s.entity?.slug || null,
      entity_name: s.entity?.name || null,
      entity_color: s.entity?.color || null,
      status: s.status || 'tentative',
      source: s.source || 'manual',
      validation_status: s.validation_status || 'ok',
      validation_reasons: s.validation_reasons || [],
    }))

    // Fetch config multipliers
    const { data: configData } = await supabase
      .from('lobster_config')
      .select('key, value')
      .in('key', ['scoring_multipliers', 'hot_days'])

    const multipliers = configData?.find((c: any) => c.key === 'scoring_multipliers')?.value || undefined
    const hotDaysConfig = configData?.find((c: any) => c.key === 'hot_days')?.value
    const hotDays = hotDaysConfig?.days || ['friday_evening', 'saturday', 'sunday']
    const customHotDates = hotDaysConfig?.custom_dates || []

    // Compute fairness
    const fairnessState = computeFairnessState(slots, periodKey, multipliers, hotDays, customHotDates)
    const nextAllocation = suggestNextAllocation(fairnessState)

    return NextResponse.json({
      period: periodKey,
      start_date: startDate,
      end_date: endDate,
      fairness: fairnessState,
      next_allocation: nextAllocation,
      slot_count: slots.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
