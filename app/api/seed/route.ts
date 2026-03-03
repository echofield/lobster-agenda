import { type NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getNextWeekKeys, generateWeekSlotDefinitions, getDateForDay, formatDateISO } from '@/lib/week-utils'

export async function POST(request: NextRequest) {
  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const weeksCount = typeof body?.weeks === 'number' ? Math.min(Math.max(body.weeks, 1), 52) : 8

    const weekKeys = getNextWeekKeys(weeksCount)
    const results: { week_key: string; created: number; existing: number }[] = []

    for (const weekKey of weekKeys) {
      const { count } = await supabase
        .from('studio_slots')
        .select('id', { count: 'exact', head: true })
        .eq('week_key', weekKey)

      if (count && count > 0) {
        // Backfill slot_date for existing slots missing it
        const { data: noDate } = await supabase
          .from('studio_slots')
          .select('id, day_of_week')
          .eq('week_key', weekKey)
          .is('slot_date', null)
        if (noDate && noDate.length > 0) {
          for (const s of noDate) {
            const d = getDateForDay(weekKey, s.day_of_week)
            await supabase.from('studio_slots').update({ slot_date: formatDateISO(d), source: 'seed' }).eq('id', s.id)
          }
        }
        results.push({ week_key: weekKey, created: 0, existing: count })
        continue
      }

      const slotDefs = generateWeekSlotDefinitions(weekKey)
      // Enrich with slot_date
      const enriched = slotDefs.map(s => ({
        ...s,
        slot_date: formatDateISO(getDateForDay(weekKey, s.day_of_week)),
        source: 'seed' as const,
        status: 'tentative' as const,
      }))
      const { data, error } = await supabase
        .from('studio_slots')
        .insert(enriched)
        .select('id')

      if (error) {
        results.push({ week_key: weekKey, created: 0, existing: 0 })
      } else {
        results.push({ week_key: weekKey, created: data?.length || 0, existing: 0 })
      }
    }

    const totalCreated = results.reduce((s, r) => s + r.created, 0)
    const totalExisting = results.reduce((s, r) => s + r.existing, 0)

    return NextResponse.json({
      message: `Seeded ${weeksCount} weeks`,
      total_created: totalCreated,
      total_existing: totalExisting,
      weeks: results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
