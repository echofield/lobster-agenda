import { type NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { computeFairnessState } from '@/lib/fairness'
import type { EnhancedSlot, MonthlySummary } from '@/types/fairness'

/**
 * GET /api/fairness/summary?period=2026-03&format=json
 * End-of-month summary with entity totals, points, fairness verdict.
 * format=csv returns CSV, otherwise JSON.
 */
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  try {
    const period = request.nextUrl.searchParams.get('period')
    const format = request.nextUrl.searchParams.get('format') || 'json'

    const now = new Date()
    const periodKey = period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const [year, month] = periodKey.split('-').map(Number)
    const startDate = `${periodKey}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    // Fetch slots
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

    // Fetch multipliers
    const { data: configData } = await supabase
      .from('lobster_config')
      .select('key, value')
      .in('key', ['scoring_multipliers', 'hot_days'])

    const multipliers = configData?.find((c: any) => c.key === 'scoring_multipliers')?.value || undefined
    const hotDaysConfig = configData?.find((c: any) => c.key === 'hot_days')?.value
    const hotDays = hotDaysConfig?.days || ['friday_evening', 'saturday', 'sunday']
    const customHotDates = hotDaysConfig?.custom_dates || []

    const fairness = computeFairnessState(slots, periodKey, multipliers, hotDays, customHotDates)

    const summary: MonthlySummary = {
      period_key: periodKey,
      generated_at: new Date().toISOString(),
      entities: fairness.entities,
      persons: fairness.person_breakdown,
      fairness_verdict: fairness.verdict,
      total_studio_hours: fairness.entities.reduce((s, e) => s + e.total_hours, 0),
      total_studio_points: fairness.entities.reduce((s, e) => s + e.total_points, 0),
      slot_count: fairness.entities.reduce((s, e) => s + e.slot_count, 0),
    }

    if (format === 'csv') {
      const lines: string[] = []
      lines.push('Entity,Hours,Points,Prime Pts,Weekend Pts,Night Pts,Hot Pts,Slots,Share %,Target %,Delta')
      for (const e of summary.entities) {
        lines.push([
          e.entity_name, e.total_hours, e.total_points, e.prime_points,
          e.weekend_points, e.night_points, e.hot_points, e.slot_count,
          (e.actual_share * 100).toFixed(1), (e.target_share * 100).toFixed(1),
          (e.fairness_delta * 100).toFixed(1),
        ].join(','))
      }
      lines.push('')
      lines.push('Person,Entity,Hours,Points,Slots')
      for (const p of summary.persons) {
        lines.push([p.person_name, p.entity_slug, p.total_hours, p.total_points, p.slot_count].join(','))
      }

      return new Response(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="lobster-summary-${periodKey}.csv"`,
        },
      })
    }

    return NextResponse.json(summary)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
