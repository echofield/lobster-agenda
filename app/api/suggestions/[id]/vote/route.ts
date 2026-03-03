import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
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

  if (!member) {
    return NextResponse.json({ error: 'Membre non trouvé' }, { status: 404 })
  }

  // Upsert vote
  const { error: voteError } = await supabase
    .from('studio_suggestion_votes')
    .upsert({
      suggestion_id: id,
      member_id: member.id,
      vote: body.vote // 'for' or 'against'
    }, {
      onConflict: 'suggestion_id,member_id'
    })

  if (voteError) {
    return NextResponse.json({ error: voteError.message }, { status: 500 })
  }

  // Recalculate votes
  const { data: forVotes } = await supabase
    .from('studio_suggestion_votes')
    .select('id')
    .eq('suggestion_id', id)
    .eq('vote', 'for')

  const { data: againstVotes } = await supabase
    .from('studio_suggestion_votes')
    .select('id')
    .eq('suggestion_id', id)
    .eq('vote', 'against')

  // Update suggestion vote counts
  await supabase
    .from('studio_suggestions')
    .update({
      votes_for: forVotes?.length || 0,
      votes_against: againstVotes?.length || 0
    })
    .eq('id', id)

  return NextResponse.json({ success: true })
}
