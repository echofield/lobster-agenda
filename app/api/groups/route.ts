import { NextResponse } from 'next/server'
import { ENTITY_INFO } from '@/types/studio'

export async function GET() {
  // Return static group info for now
  const groups = [
    { id: '1', name: 'LOBSTER STUDIO', slug: 'lobster', color: '#4A7B6A', monthly_allocation: 15, members: ['Martial', 'Alexandre', 'Hedi'] },
    { id: '2', name: 'ROMAN & LÉONARD', slug: 'romann', color: '#A38767', monthly_allocation: 15, members: ['Roman', 'Léonard'] },
  ]
  return NextResponse.json({ groups, entities: ENTITY_INFO })
}
