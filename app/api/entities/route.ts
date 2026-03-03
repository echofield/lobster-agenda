import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/entities
 * Returns all entities with their persons.
 */
export async function GET() {
  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  try {
    const { data: entities, error: entityError } = await supabase
      .from('lobster_entities')
      .select('*')
      .order('name')

    if (entityError) throw entityError

    const { data: persons, error: personError } = await supabase
      .from('lobster_persons')
      .select('*')
      .eq('is_active', true)
      .order('name')

    if (personError) throw personError

    // Group persons by entity
    const result = (entities || []).map((entity: any) => ({
      ...entity,
      persons: (persons || []).filter((p: any) => p.entity_id === entity.id),
    }))

    return NextResponse.json({ entities: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
