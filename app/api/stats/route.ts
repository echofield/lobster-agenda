import { type NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/stats?month=2026-03
 * Returns group usage statistics computed from actual slot data.
 * Falls back to entity-level aggregation from studio_slots.
 */
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7)

    const [year, mon] = month.split('-').map(Number)
    const startDate = `${month}-01`
    const endDate = new Date(year, mon, 0).toISOString().split('T')[0]

    // Fetch all assigned slots in the period
    const { data: slots, error } = await supabase
      .from('studio_slots')
      .select(`
        id, slot_type, assignee, slot_date,
        assigned_person_id, assigned_entity_id,
        person:lobster_persons!assigned_person_id(name, slug),
        entity:lobster_entities!assigned_entity_id(name, slug, color)
      `)
      .gte('slot_date', startDate)
      .lte('slot_date', endDate)
      .not('assignee', 'is', null)

    if (error) throw error

    // Aggregate by entity
    const entityStats: Record<string, {
      name: string; slug: string; color: string;
      total_days: Set<string>; mix: number; session: number; night: number;
      members: Record<string, { name: string; days: Set<string>; mix: number; session: number; night: number }>
    }> = {
      lobster: { name: 'LOBSTER STUDIO', slug: 'lobster', color: '#4A7B6A', total_days: new Set(), mix: 0, session: 0, night: 0, members: {} },
      roman: { name: 'ROMAN & LÉONARD', slug: 'roman', color: '#A38767', total_days: new Set(), mix: 0, session: 0, night: 0, members: {} },
    }

    for (const slot of slots || []) {
      const entityKey = slot.assignee as string
      const entity = entityStats[entityKey]
      if (!entity) continue

      if (slot.slot_date) entity.total_days.add(slot.slot_date)
      if (slot.slot_type === 'mix') entity.mix++
      else if (slot.slot_type === 'session') entity.session++
      else if (slot.slot_type === 'night') entity.night++

      // Person-level stats
      const personName = (slot as any).person?.name || entityKey
      const personSlug = (slot as any).person?.slug || entityKey
      if (!entity.members[personSlug]) {
        entity.members[personSlug] = { name: personName, days: new Set(), mix: 0, session: 0, night: 0 }
      }
      const member = entity.members[personSlug]
      if (slot.slot_date) member.days.add(slot.slot_date)
      if (slot.slot_type === 'mix') member.mix++
      else if (slot.slot_type === 'session') member.session++
      else if (slot.slot_type === 'night') member.night++
    }

    const groups = Object.entries(entityStats).map(([key, e]) => ({
      group: { id: key, name: e.name, slug: e.slug, color: e.color, monthly_allocation: 15 },
      total_days: e.total_days.size,
      allocation: 15,
      percentage: Math.round((e.total_days.size / 15) * 100),
      members: Object.entries(e.members).map(([slug, m]) => ({
        member_id: slug,
        member: { display_name: m.name },
        total_days: m.days.size,
        mix_slots: m.mix,
        session_slots: m.session,
        night_slots: m.night,
      })),
    }))

    return NextResponse.json({ month, groups })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
