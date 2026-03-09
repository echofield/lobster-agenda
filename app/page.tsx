'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { T, FONT, fadeUp, GRAIN_SVG } from '@/lib/design'
import { createClient } from '@/lib/supabase/client'
import { useStudioSlots } from '@/hooks/use-studio-slots'
import { StudioBoard } from '@/components/studio-board'
import { WeekSelector } from '@/components/week-selector'
import { FairnessHUD } from '@/components/fairness-hud'
import { SwapPanel } from '@/components/swap-panel'
import type { PersonSlug } from '@/types/fairness'

export default function HomePage() {
  const router = useRouter()
  const [seeding, setSeeding] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [user, setUser] = useState<{ email?: string } | null>(null)

  const { schedule, weekKey, loading, error, setWeekKey, assignSlot, assignPerson, refetch } = useStudioSlots({ pollInterval: 30000 })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeks: 8 }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: `${data.total_created} créneaux créés` })
        refetch()
      } else {
        setMessage({ type: 'error', text: data.error })
      }
    } catch {
      setMessage({ type: 'error', text: 'Erreur réseau' })
    } finally {
      setSeeding(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const handleAssign = async (slotId: string, assignee: 'romann' | 'lobster' | null) => {
    const result = await assignSlot(slotId, assignee)
    if (!result.success) {
      setMessage({ type: 'error', text: result.error || 'Erreur' })
      setTimeout(() => setMessage(null), 3000)
    }
    return result
}

  const handlePersonAssign = async (slotId: string, person: PersonSlug | null) => {
    const result = await assignPerson(slotId, person)
    if (!result.success) {
      setMessage({ type: 'error', text: result.error || 'Erreur' })
      setTimeout(() => setMessage(null), 3000)
    }
    return result
  }

  return (
    <div style={{ minHeight: '100vh', background: T.void, position: 'relative' }}>
      {/* Grain */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage: GRAIN_SVG,
          backgroundRepeat: 'repeat',
          opacity: T.grainOpacity,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          padding: '16px 24px',
          background: T.void,
          borderBottom: `1px solid ${T.whisper}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h1 style={{ fontFamily: FONT.reading, fontSize: 24, fontWeight: 400, color: T.primary, margin: 0 }}>
            Lobster Agenda
          </h1>
          <p style={{ fontFamily: FONT.label, fontSize: 10, color: T.secondary, marginTop: 2, letterSpacing: '0.1em' }}>
            STUDIO PLANNING
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user?.email && (
            <span style={{ fontFamily: FONT.mono, fontSize: 10, color: T.ghost }}>{user.email}</span>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSeed}
            disabled={seeding}
            style={{
              padding: '8px 14px',
              background: T.calm + '22',
              border: `1px solid ${T.calm}44`,
              borderRadius: 3,
              cursor: seeding ? 'wait' : 'pointer',
              fontFamily: FONT.label,
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: '0.1em',
              color: T.calm,
              opacity: seeding ? 0.6 : 1,
            }}
          >
            {seeding ? '...' : 'GÉNÉRER 8 SEM.'}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleLogout}
            style={{
              padding: '8px 14px',
              background: T.surface,
              border: `1px solid ${T.whisper}`,
              borderRadius: 3,
              cursor: 'pointer',
              fontFamily: FONT.label,
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: '0.1em',
              color: T.secondary,
            }}
          >
            DÉCONNEXION
          </motion.button>
        </div>
      </header>

      {/* Content */}
      <main style={{ padding: 24, maxWidth: 1400, margin: '0 auto', position: 'relative', zIndex: 2 }}>
        {/* Message */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              padding: '10px 16px',
              background: message.type === 'success' ? T.calm + '22' : T.alert + '22',
              border: `1px solid ${message.type === 'success' ? T.calm : T.alert}44`,
              borderRadius: 3,
              marginBottom: 16,
              fontFamily: FONT.label,
              fontSize: 11,
              color: message.type === 'success' ? T.calm : T.alert,
            }}
          >
            {message.text}
          </motion.div>
        )}

        {/* Week selector */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" style={{ marginBottom: 20 }}>
          <WeekSelector selectedWeek={weekKey} onSelect={setWeekKey} weeksToShow={8} />
        </motion.div>

        {/* Swap Panel */}
        <SwapPanel />

        <motion.div variants={fadeUp} initial="hidden" animate="visible">
        </motion.div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: 16,
              background: T.alert + '22',
              border: `1px solid ${T.alert}44`,
              borderRadius: 4,
              marginBottom: 20,
            }}
          >
            <div style={{ fontFamily: FONT.label, fontSize: 11, color: T.alert, marginBottom: 8 }}>ERREUR</div>
            <div style={{ fontFamily: FONT.body, fontSize: 12, color: T.secondary }}>{error}</div>
            <button
              onClick={refetch}
              style={{
                marginTop: 12,
                padding: '6px 12px',
                background: T.surface,
                border: `1px solid ${T.whisper}`,
                borderRadius: 2,
                cursor: 'pointer',
                fontFamily: FONT.label,
                fontSize: 9,
                color: T.secondary,
              }}
            >
              RÉESSAYER
            </button>
          </div>
        )}

        {/* Board */}
        {schedule && <StudioBoard schedule={schedule} onAssign={handleAssign} onPersonAssign={handlePersonAssign} loading={loading} />}

        {/* Empty state */}
        {!loading && !error && schedule && schedule.days.every(d => d.slots.length === 0) && (
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            style={{
              padding: 40,
              textAlign: 'center',
              background: T.surface,
              border: `1px solid ${T.whisper}`,
              borderRadius: 4,
            }}
          >
            <div style={{ fontFamily: FONT.label, fontSize: 12, color: T.secondary, marginBottom: 16 }}>
              Aucun créneau pour cette semaine
            </div>
            <button
              onClick={handleSeed}
              disabled={seeding}
              style={{
                padding: '10px 20px',
                background: T.calm + '22',
                border: `1px solid ${T.calm}44`,
                borderRadius: 3,
                cursor: seeding ? 'wait' : 'pointer',
                fontFamily: FONT.label,
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.1em',
                color: T.calm,
              }}
            >
              GÉNÉRER LES CRÉNEAUX
            </button>
          </motion.div>
        )}

        {/* Équité */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" style={{ marginTop: 24 }}>
          <FairnessHUD />
        </motion.div>
      </main>
    </div>
  )
}
