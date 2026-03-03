import { type NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generateICS } from '@/lib/ics-export'

/**
 * GET /api/export/ics?entity=rl&period=2026-03
 * GET /api/export/ics?person=roman&period=2026-03
 * Export confirmed slots as ICS calendar file.
 */
export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  try {
    const entity = request.nextUrl.searchParams.get('entity')
    const person = request.nextUrl.searchParams.get('person')
    const period = request.nextUrl.searchParams.get('period')

    const now = new Date()
    const periodKey = period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const [year, month] = periodKey.split('-').map(Number)
    const startDate = `${periodKey}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    let query = supabase
      .from('studio_slots')
      .select(`
        *,
        person:lobster_persons!assigned_person_id(name, slug),
        entity:lobster_entities!assigned_entity_id(name, slug)
      `)
      .gte('slot_date', startDate)
      .lte('slot_date', endDate)
      .not('assignee', 'is', null)

    // Filter by entity or person
    if (entity) {
      const { data: entityData } = await supabase
        .from('lobster_entities')
        .select('id')
        .eq('slug', entity)
        .single()
      if (entityData) {
        query = query.eq('assigned_entity_id', entityData.id)
      }
    } else if (person) {
      const { data: personData } = await supabase
        .from('lobster_persons')
        .select('id')
        .eq('slug', person)
        .single()
      if (personData) {
        query = query.eq('assigned_person_id', personData.id)
      }
    }

    const { data: slots, error: slotError } = await query.order('slot_date').order('start_time')
    if (slotError) throw slotError

    const calendarName = entity
      ? `Lobster Agenda - ${entity.toUpperCase()}`
      : person
        ? `Lobster Agenda - ${person}`
        : 'Lobster Agenda'

    const icsContent = generateICS(
      (slots || []).map((s: any) => ({
        id: s.id,
        slot_date: s.slot_date,
        start_time: s.start_time,
        end_time: s.end_time,
        slot_type: s.slot_type,
        person_name: s.person?.name,
        entity_name: s.entity?.name,
        notes: s.notes,
        status: s.status,
      })),
      calendarName,
    )

    return new Response(icsContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="lobster-agenda-${entity || person || 'all'}-${periodKey}.ics"`,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
