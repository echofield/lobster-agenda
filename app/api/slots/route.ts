import { type NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { validateMove, validateWeek } from '@/lib/validator'
import { validateAssignment, computeSlotPoints, computeSlotMinutes } from '@/lib/fairness'
import { ENTITY_MAP, PERSON_DISPLAY, LEGACY_ENTITY_MAP } from '@/types/fairness'
import type { StudioSlot, StudioEntity } from '@/types/studio'
import type { PersonSlug, EntitySlug, EnhancedSlot } from '@/types/fairness'

const VALID_ENTITIES = ['romann', 'lobster'] as const
const VALID_PERSONS = ['romann', 'leonard', 'martial', 'alexandre', 'hedi'] as const

export async function GET(request: NextRequest) {
  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  try {
    const weekKey = request.nextUrl.searchParams.get('week')
    const dateFrom = request.nextUrl.searchParams.get('from')
    const dateTo = request.nextUrl.searchParams.get('to')

    // Support both week-based (legacy) and date-range queries
    if (weekKey) {
      if (!/^\d{4}-W\d{2}$/.test(weekKey)) {
        return NextResponse.json({ error: 'Invalid week format' }, { status: 400 })
      }

      const { data: slots, error } = await supabase
        .from('studio_slots')
        .select(`
          *,
          person:lobster_persons!assigned_person_id(id, name, slug, color),
          entity:lobster_entities!assigned_entity_id(id, name, slug, color)
        `)
        .eq('week_key', weekKey)
        .order('day_of_week')
        .order('slot_type')

      if (error) throw error

      const typedSlots = (slots || []) as StudioSlot[]
      const validationMap = validateWeek(weekKey, typedSlots)
      const slotsWithValidation = typedSlots.map((slot: any) => ({
        ...slot,
        person_slug: slot.person?.slug || null,
        person_name: slot.person?.name || null,
        entity_slug: slot.entity?.slug || null,
        entity_name: slot.entity?.name || null,
        entity_color: slot.entity?.color || null,
        validation_status: validationMap.get(slot.id)?.status || 'ok',
        validation_reasons: validationMap.get(slot.id)?.reasons || [],
      }))

      return NextResponse.json({ slots: slotsWithValidation, week_key: weekKey })
    }

    // Date range query
    if (dateFrom && dateTo) {
      const { data: slots, error } = await supabase
        .from('studio_slots')
        .select(`
          *,
          person:lobster_persons!assigned_person_id(id, name, slug, color),
          entity:lobster_entities!assigned_entity_id(id, name, slug, color)
        `)
        .gte('slot_date', dateFrom)
        .lte('slot_date', dateTo)
        .order('slot_date')
        .order('start_time')

      if (error) throw error

      return NextResponse.json({ slots: slots || [], date_range: { from: dateFrom, to: dateTo } })
    }

    return NextResponse.json({ error: 'Provide week or from/to date range' }, { status: 400 })
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
    const assignee = body?.assignee as StudioEntity | null | undefined // legacy: 'romann' | 'lobster'
    const person = body?.person as PersonSlug | null | undefined       // new: 'romann' | 'leonard' | etc.

    if (!slotId) {
      return NextResponse.json({ error: 'slot_id required' }, { status: 400 })
    }

    // Determine person and entity from input
    let personSlug: PersonSlug | null = null
    let entitySlug: EntitySlug | null = null
    let legacyAssignee: StudioEntity | null = null

    if (person) {
      // New person-level assignment
      if (!VALID_PERSONS.includes(person as any)) {
        return NextResponse.json({ error: 'Invalid person' }, { status: 400 })
      }
      personSlug = person
      entitySlug = ENTITY_MAP[person]
      legacyAssignee = entitySlug === 'rl' ? 'romann' : 'lobster'
    } else if (assignee !== undefined) {
      // Legacy entity-level assignment (backwards compatible)
      if (assignee !== null && !VALID_ENTITIES.includes(assignee as any)) {
        return NextResponse.json({ error: 'Invalid assignee' }, { status: 400 })
      }
      legacyAssignee = assignee ?? null
      if (legacyAssignee) {
        entitySlug = LEGACY_ENTITY_MAP[legacyAssignee] || null
      }
    } else {
      return NextResponse.json({ error: 'person or assignee required' }, { status: 400 })
    }

    // Fetch the target slot
    const { data: slot, error: slotError } = await supabase
      .from('studio_slots')
      .select('*')
      .eq('id', slotId)
      .single()

    if (slotError || !slot) {
      return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
    }

    // Fetch all week slots WITH person/entity joins for safeguard validation
    const { data: weekSlots, error: weekError } = await supabase
      .from('studio_slots')
      .select(`
        *,
        person:lobster_persons!assigned_person_id(slug),
        entity:lobster_entities!assigned_entity_id(slug)
      `)
      .eq('week_key', slot.week_key)

    if (weekError) throw weekError

    // Legacy validation (maintains existing rules)
    const legacyValidation = validateMove(slotId, legacyAssignee, slot.week_key, weekSlots || [])

    if (legacyValidation.status === 'block') {
      return NextResponse.json({ error: 'Blocked by rules', validation: legacyValidation }, { status: 422 })
    }

    // New person-level safeguard validation (if person provided + slot has date)
    let safeguardWarnings: string[] = []
    if (personSlug && slot.slot_date) {
      // Build EnhancedSlot shape with REAL person/entity slugs from joins
      const enhancedSlots: EnhancedSlot[] = (weekSlots || []).map((s: any) => ({
        ...s,
        person_slug: s.person?.slug ?? null,
        entity_slug: s.entity?.slug ?? null,
        status: s.status || 'tentative',
        source: s.source || 'manual',
        validation_status: s.validation_status || 'ok',
        validation_reasons: s.validation_reasons || [],
      }))
      const targetEnhanced = enhancedSlots.find(s => s.id === slotId)
      if (targetEnhanced) {
        const violations = validateAssignment(targetEnhanced, personSlug, enhancedSlots)
        const blocks = violations.filter(v => v.severity === 'block')
        const warns = violations.filter(v => v.severity === 'warn')

        if (blocks.length > 0) {
          return NextResponse.json({
            error: 'Blocked by safeguards',
            violations: blocks.map(v => ({ rule: v.rule, message: v.message, suggestion: v.suggestion })),
          }, { status: 422 })
        }
        safeguardWarnings = warns.map(v => v.message)
      }
    }

    // Look up person/entity IDs from DB
    let personId: string | null = null
    let entityId: string | null = null

    if (personSlug) {
      const { data: personData } = await supabase
        .from('lobster_persons')
        .select('id, entity_id')
        .eq('slug', personSlug)
        .single()
      if (personData) {
        personId = personData.id
        entityId = personData.entity_id
      }
    } else if (entitySlug) {
      const { data: entityData } = await supabase
        .from('lobster_entities')
        .select('id')
        .eq('slug', entitySlug)
        .single()
      if (entityData) {
        entityId = entityData.id
      }
    }

    // Merge legacy + safeguard warnings
    const allReasons = [...legacyValidation.reasons, ...safeguardWarnings]
    const finalStatus = safeguardWarnings.length > 0 && legacyValidation.status === 'ok' ? 'warn' : legacyValidation.status

    // Update slot
    const updateData: Record<string, any> = {
      assignee: legacyAssignee,
      assigned_person_id: personId,
      assigned_entity_id: entityId,
      validation_status: finalStatus,
      validation_reasons: allReasons,
    }

    const { data: updated, error: updateError } = await supabase
      .from('studio_slots')
      .update(updateData)
      .eq('id', slotId)
      .select(`
        *,
        person:lobster_persons!assigned_person_id(id, name, slug, color),
        entity:lobster_entities!assigned_entity_id(id, name, slug, color)
      `)
      .single()

    if (updateError) throw updateError

    // Update fairness ledger (async, non-blocking for UI)
    if (legacyAssignee && entityId && slot.slot_date) {
      const periodKey = slot.slot_date.substring(0, 7) // '2026-03'
      const points = computeSlotPoints({
        id: slotId,
        slot_type: slot.slot_type,
        start_time: slot.start_time,
        end_time: slot.end_time,
        slot_date: slot.slot_date,
        day_of_week: slot.day_of_week,
      })

      await supabase
        .from('lobster_fairness_ledger')
        .upsert({
          slot_id: slotId,
          entity_id: entityId,
          person_id: personId,
          period_key: periodKey,
          slot_date: slot.slot_date,
          minutes: points.minutes,
          points_base: points.points_base,
          points_prime: points.points_prime,
          points_weekend: points.points_weekend,
          points_night: points.points_night,
          points_hot: points.points_hot,
          points_total: points.points_total,
          breakdown: points,
          computed_at: new Date().toISOString(),
        }, { onConflict: 'slot_id' })
        .then(() => {}) // fire and forget
        .catch((err: unknown) => console.error('Fairness ledger update failed:', err))
    } else if (!legacyAssignee) {
      // Remove from ledger if unassigned
      await supabase
        .from('lobster_fairness_ledger')
        .delete()
        .eq('slot_id', slotId)
        .then(() => {})
        .catch((err: unknown) => console.error('Fairness ledger cleanup failed:', err))
    }

    return NextResponse.json({
      slot: {
        ...updated,
        person_slug: (updated as any).person?.slug || null,
        person_name: (updated as any).person?.name || null,
        entity_slug: (updated as any).entity?.slug || null,
        entity_name: (updated as any).entity?.name || null,
        entity_color: (updated as any).entity?.color || null,
      },
      validation: { status: finalStatus, reasons: allReasons },
      safeguard_warnings: safeguardWarnings.length > 0 ? safeguardWarnings : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PUT /api/slots — Create a new custom slot (hour-level)
 */
export async function PUT(request: NextRequest) {
  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { slot_date, start_time, end_time, slot_type, person, label, notes } = body as {
      slot_date: string
      start_time: string
      end_time: string
      slot_type?: string
      person?: PersonSlug
      label?: string
      notes?: string
    }

    if (!slot_date || !start_time || !end_time) {
      return NextResponse.json({ error: 'slot_date, start_time, end_time required' }, { status: 400 })
    }

    // Validate time format
    if (!/^\d{2}:\d{2}$/.test(start_time) || !/^\d{2}:\d{2}$/.test(end_time)) {
      return NextResponse.json({ error: 'Times must be HH:MM format' }, { status: 400 })
    }

    // Validate duration
    const minutes = computeSlotMinutes(start_time, end_time)
    if (minutes < 30) {
      return NextResponse.json({ error: 'Slot must be at least 30 minutes' }, { status: 400 })
    }

    // Determine slot_type from time or explicit
    const resolvedSlotType = slot_type || inferSlotType(start_time)

    // Determine week_key and day_of_week from slot_date
    const dateObj = new Date(slot_date)
    const dayOfWeek = (dateObj.getDay() + 6) % 7 // Convert Sun=0→6, Mon=1→0
    const weekKey = getISOWeekKeyFromDate(dateObj)

    // Person lookup
    let personId: string | null = null
    let entityId: string | null = null
    let legacyAssignee: string | null = null

    if (person && VALID_PERSONS.includes(person as any)) {
      const { data: personData } = await supabase
        .from('lobster_persons')
        .select('id, entity_id')
        .eq('slug', person)
        .single()
      if (personData) {
        personId = personData.id
        entityId = personData.entity_id
        legacyAssignee = ENTITY_MAP[person] === 'rl' ? 'romann' : 'lobster'
      }
    }

    // Safeguard validation: fetch existing day slots and check for overlaps/violations
    const { data: daySlots } = await supabase
      .from('studio_slots')
      .select(`
        *,
        person:lobster_persons!assigned_person_id(slug),
        entity:lobster_entities!assigned_entity_id(slug)
      `)
      .eq('slot_date', slot_date)

    const existingEnhanced: EnhancedSlot[] = (daySlots || []).map((s: any) => ({
      ...s,
      person_slug: s.person?.slug ?? null,
      entity_slug: s.entity?.slug ?? null,
      status: s.status || 'tentative',
      source: s.source || 'manual',
      validation_status: s.validation_status || 'ok',
      validation_reasons: s.validation_reasons || [],
    }))

    // Build candidate slot for validation (not yet in DB)
    const candidateSlot: EnhancedSlot = {
      id: 'candidate-new',
      week_key: weekKey,
      day_of_week: dayOfWeek,
      slot_type: resolvedSlotType as 'mix' | 'session' | 'night',
      start_time,
      end_time,
      slot_date,
      assignee: legacyAssignee,
      assigned_person_id: personId,
      assigned_entity_id: entityId,
      person_slug: person ?? null,
      entity_slug: person ? ENTITY_MAP[person] : null,
      status: 'tentative',
      source: 'manual',
      validation_status: 'ok',
      validation_reasons: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const violations = validateAssignment(candidateSlot, person ?? null, existingEnhanced)
    const blocks = violations.filter(v => v.severity === 'block')
    if (blocks.length > 0) {
      return NextResponse.json({
        error: 'Blocked by safeguards',
        violations: blocks.map(v => ({ rule: v.rule, message: v.message, suggestion: v.suggestion })),
      }, { status: 422 })
    }

    const { data: newSlot, error } = await supabase
      .from('studio_slots')
      .insert({
        week_key: weekKey,
        day_of_week: dayOfWeek,
        slot_type: resolvedSlotType,
        start_time,
        end_time,
        slot_date,
        assignee: legacyAssignee,
        assigned_person_id: personId,
        assigned_entity_id: entityId,
        label: label || null,
        notes: notes || null,
        status: 'tentative',
        source: 'manual',
        validation_status: 'ok',
        validation_reasons: [],
      })
      .select('*')
      .single()

    if (error) throw error

    // Write to fairness ledger if assigned
    if (legacyAssignee && entityId && newSlot.slot_date) {
      const periodKey = newSlot.slot_date.substring(0, 7)
      const points = computeSlotPoints({
        id: newSlot.id,
        slot_type: newSlot.slot_type,
        start_time: newSlot.start_time,
        end_time: newSlot.end_time,
        slot_date: newSlot.slot_date,
        day_of_week: newSlot.day_of_week,
      })

      await supabase
        .from('lobster_fairness_ledger')
        .upsert({
          slot_id: newSlot.id,
          entity_id: entityId,
          person_id: personId,
          period_key: periodKey,
          slot_date: newSlot.slot_date,
          minutes: points.minutes,
          points_base: points.points_base,
          points_prime: points.points_prime,
          points_weekend: points.points_weekend,
          points_night: points.points_night,
          points_hot: points.points_hot,
          points_total: points.points_total,
          breakdown: points,
          computed_at: new Date().toISOString(),
        }, { onConflict: 'slot_id' })
        .catch((err: unknown) => console.error('Fairness ledger on custom slot failed:', err))
    }

    return NextResponse.json({ slot: newSlot }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function inferSlotType(startTime: string): string {
  const hour = parseInt(startTime.split(':')[0], 10)
  if (hour >= 6 && hour < 12) return 'mix'
  if (hour >= 12 && hour < 20) return 'session'
  return 'night'
}

function getISOWeekKeyFromDate(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}
