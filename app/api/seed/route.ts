import { type NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getNextWeekKeys, generateWeekSlotDefinitions } from '@/lib/week-utils'

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
        results.push({ week_key: weekKey, created: 0, existing: count })
        continue
      }

      const slotDefs = generateWeekSlotDefinitions(weekKey)
      const { data, error } = await supabase
        .from('studio_slots')
        .insert(slotDefs)
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
