'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { T, FONT } from '@/lib/design'
import { PERSON_DISPLAY, type PersonSlug } from '@/types/fairness'

interface SwapRequest {
  id: string
  slot_id: string
  requester: string
  target: string
  message?: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
}

export function SwapPanel() {
  const [swaps, setSwaps] = useState<SwapRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSwaps()
  }, [])

  const fetchSwaps = async () => {
    try {
      const res = await fetch('/api/swaps?status=pending')
      const data = await res.json()
      setSwaps(data.swaps || [])
    } catch (e) {
      console.error('Error fetching swaps:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleDecision = async (swapId: string, decision: 'accept' | 'decline') => {
    try {
      const res = await fetch(`/api/swaps/${swapId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision })
      })
      if (res.ok) {
        fetchSwaps()
      }
    } catch (e) {
      console.error('Error deciding swap:', e)
    }
  }

  if (loading) return null
  if (swaps.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: T.surface,
        border: `1px solid ${T.gold}44`,
        borderRadius: 4,
        padding: 16,
        marginBottom: 20,
      }}
    >
      <div style={{
        fontFamily: FONT.label,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.1em',
        color: T.gold,
        marginBottom: 12,
      }}>
        DEMANDES D'ECHANGE ({swaps.length})
      </div>

      {swaps.map(swap => (
        <div key={swap.id} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 0',
          borderBottom: `1px solid ${T.whisper}`,
        }}>
          <div>
            <span style={{ fontFamily: FONT.label, fontSize: 11, color: T.primary }}>
              {swap.requester}
            </span>
            <span style={{ fontFamily: FONT.mono, fontSize: 10, color: T.ghost, margin: '0 8px' }}>
              demande a
            </span>
            <span style={{ fontFamily: FONT.label, fontSize: 11, color: T.primary }}>
              {swap.target}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleDecision(swap.id, 'accept')}
              style={{
                padding: '4px 10px',
                background: T.calm + '22',
                border: `1px solid ${T.calm}44`,
                borderRadius: 2,
                cursor: 'pointer',
                fontFamily: FONT.label,
                fontSize: 9,
                color: T.calm,
              }}
            >
              Accepter
            </button>
            <button
              onClick={() => handleDecision(swap.id, 'decline')}
              style={{
                padding: '4px 10px',
                background: T.alert + '22',
                border: `1px solid ${T.alert}44`,
                borderRadius: 2,
                cursor: 'pointer',
                fontFamily: FONT.label,
                fontSize: 9,
                color: T.alert,
              }}
            >
              Refuser
            </button>
          </div>
        </div>
      ))}
    </motion.div>
  )
}
