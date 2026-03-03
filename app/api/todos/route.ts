import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const groupId = searchParams.get('group_id')
  const showCompleted = searchParams.get('completed') === 'true'
  
  let query = supabase
    .from('studio_todos')
    .select('*, creator:created_by(id, display_name), assignee:assigned_to(id, display_name), group:group_id(id, name, slug)')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })

  if (!showCompleted) {
    query = query.eq('is_completed', false)
  }

  if (groupId) {
    query = query.or(`group_id.eq.${groupId},group_id.is.null`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ todos: data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Get member from user
  const { data: member } = await supabase
    .from('studio_members')
    .select('id')
    .eq('user_id', user.id)
    .single()

  const { data, error } = await supabase
    .from('studio_todos')
    .insert({
      content: body.content,
      created_by: member?.id,
      assigned_to: body.assigned_to || null,
      group_id: body.group_id || null,
      priority: body.priority || 'normal',
      due_date: body.due_date || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ todo: data })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()
  
  const updates: Record<string, unknown> = {}
  if (body.is_completed !== undefined) {
    updates.is_completed = body.is_completed
    if (body.is_completed) {
      updates.completed_at = new Date().toISOString()
    } else {
      updates.completed_at = null
    }
  }
  if (body.content) updates.content = body.content
  if (body.priority) updates.priority = body.priority
  if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to

  const { data, error } = await supabase
    .from('studio_todos')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ todo: data })
}
