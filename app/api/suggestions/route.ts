import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'open'
  
  const { data: { user } } = await supabase.auth.getUser()
  
  // Get member for vote info
  const { data: member } = await supabase
    .from('studio_members')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  let query = supabase
    .from('studio_suggestions')
    .select('*, creator:created_by(id, display_name)')
    .order('created_at', { ascending: false })

  if (status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: suggestions, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get user's votes
  if (member) {
    const { data: votes } = await supabase
      .from('studio_suggestion_votes')
      .select('suggestion_id, vote')
      .eq('member_id', member.id)

    const votesMap = new Map(votes?.map(v => [v.suggestion_id, v.vote]))
    
    const suggestionsWithVotes = suggestions?.map(s => ({
      ...s,
      my_vote: votesMap.get(s.id) || null
    }))

    return NextResponse.json({ suggestions: suggestionsWithVotes })
  }

  return NextResponse.json({ suggestions })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('studio_members')
    .select('id')
    .eq('user_id', user.id)
    .single()

  const { data, error } = await supabase
    .from('studio_suggestions')
    .insert({
      title: body.title,
      description: body.description || null,
      type: body.type || 'general',
      created_by: member?.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ suggestion: data })
}
