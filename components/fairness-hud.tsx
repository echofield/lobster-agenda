'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { T, FONT, fadeUp } from '@/lib/design'
import type { FairnessState, EntityFairnessSummary, PersonFairnessBreakdown, EntitySlug } from '@/types/fairness'
import { ENTITY_DISPLAY } from '@/types/fairness'

interface FairnessHUDProps {
  period?: string // '2026-03'
}

export function FairnessHUD({ period }: FairnessHUDProps) {
  const [fairness, setFairness] = useState<FairnessState | null>(null)
  const [nextAllocation, setNextAllocation] = useState<EntitySlug | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFairness = async () => {
    setLoading(true)
    try {
      const params = period ? `?period=${period}` : ''
      const res = await fetch(`/api/fairness${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setFairness(data.fairness)
      setNextAllocation(data.next_allocation)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fairness data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchFairness() }, [period])

  if (loading) {
    return (
      <div style={{ padding: 16, background: T.surface, border: `1px solid ${T.whisper}`, borderRadius: 4 }}>
        <div style={{ fontFamily: FONT.label, fontSize: 10, color: T.ghost, letterSpacing: '0.1em' }}>
          CHARGEMENT ÉQUITÉ...
        </div>
      </div>
    )
  }

  if (error || !fairness) {
    return (
      <div style={{ padding: 16, background: T.surface, border: `1px solid ${T.whisper}`, borderRadius: 4 }}>
        <div style={{ fontFamily: FONT.label, fontSize: 10, color: T.alert }}>
          {error || 'No fairness data'}
        </div>
      </div>
    )
  }

  const rl = fairness.entities.find(e => e.entity_slug === 'rl')!
  const lobster = fairness.entities.find(e => e.entity_slug === 'lobster')!

  const verdictColor = fairness.verdict === 'balanced' ? T.calm
    : fairness.verdict === 'slight_imbalance' ? T.gold
    : T.alert

  const verdictLabel = fairness.verdict === 'balanced' ? 'ÉQUILIBRÉE'
    : fairness.verdict === 'slight_imbalance' ? 'LÉGER DÉSÉQUILIBRE'
    : 'DÉSÉQUILIBRÉE'

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      style={{
        background: T.surface,
        border: `1px solid ${T.whisper}`,
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${T.whisper}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ fontFamily: FONT.label, fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', color: T.primary }}>
          ÉQUITÉ
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: verdictColor }} />
          <span style={{ fontFamily: FONT.label, fontSize: 9, color: verdictColor, letterSpacing: '0.1em' }}>
            {verdictLabel}
          </span>
        </div>
      </div>

      {/* Balance bars */}
      <div style={{ padding: '12px 16px' }}>
        {/* Points balance */}
        <BalanceBar
          label="POINTS TOTAL"
          leftValue={rl.total_points}
          rightValue={lobster.total_points}
          leftColor={ENTITY_DISPLAY.rl.color}
          rightColor={ENTITY_DISPLAY.lobster.color}
          leftLabel={ENTITY_DISPLAY.rl.name}
          rightLabel={ENTITY_DISPLAY.lobster.name}
        />

        {/* Hours balance */}
        <BalanceBar
          label="HEURES"
          leftValue={rl.total_hours}
          rightValue={lobster.total_hours}
          leftColor={ENTITY_DISPLAY.rl.color}
          rightColor={ENTITY_DISPLAY.lobster.color}
          leftLabel={`${rl.total_hours}h`}
          rightLabel={`${lobster.total_hours}h`}
          style={{ marginTop: 10 }}
        />

        {/* Prime points */}
        <BalanceBar
          label="PRIME"
          leftValue={rl.prime_points}
          rightValue={lobster.prime_points}
          leftColor={ENTITY_DISPLAY.rl.color}
          rightColor={ENTITY_DISPLAY.lobster.color}
          leftLabel={`${rl.prime_points}`}
          rightLabel={`${lobster.prime_points}`}
          style={{ marginTop: 10 }}
        />

        {/* Weekend */}
        <BalanceBar
          label="WEEK-END"
          leftValue={rl.weekend_points}
          rightValue={lobster.weekend_points}
          leftColor={ENTITY_DISPLAY.rl.color}
          rightColor={ENTITY_DISPLAY.lobster.color}
          leftLabel={`${rl.weekend_points}`}
          rightLabel={`${lobster.weekend_points}`}
          style={{ marginTop: 10 }}
        />
      </div>

      {/* Suggestion */}
      <div style={{
        padding: '10px 16px',
        borderTop: `1px solid ${T.whisper}`,
        background: T.void,
      }}>
        <div style={{ fontFamily: FONT.label, fontSize: 9, color: T.ghost, letterSpacing: '0.1em', marginBottom: 4 }}>
          RECOMMANDATION
        </div>
        <div style={{ fontFamily: FONT.body, fontSize: 11, color: T.secondary, lineHeight: 1.5 }}>
          {fairness.suggestion}
        </div>
        {nextAllocation && (
          <div style={{
            marginTop: 6,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            background: ENTITY_DISPLAY[nextAllocation].color + '22',
            border: `1px solid ${ENTITY_DISPLAY[nextAllocation].color}44`,
            borderRadius: 2,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: ENTITY_DISPLAY[nextAllocation].color }} />
            <span style={{ fontFamily: FONT.label, fontSize: 9, color: ENTITY_DISPLAY[nextAllocation].color, letterSpacing: '0.05em' }}>
              PROCHAIN PRIME → {ENTITY_DISPLAY[nextAllocation].name}
            </span>
          </div>
        )}
      </div>

      {/* Person breakdown */}
      {fairness.person_breakdown.length > 0 && (
        <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.whisper}` }}>
          <div style={{ fontFamily: FONT.label, fontSize: 9, color: T.ghost, letterSpacing: '0.1em', marginBottom: 8 }}>
            DÉTAIL PAR PERSONNE
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            {fairness.person_breakdown.map(p => (
              <PersonStat key={p.person_slug} person={p} />
            ))}
          </div>
        </div>
      )}

      {/* Export links */}
      <div style={{
        padding: '8px 16px',
        borderTop: `1px solid ${T.whisper}`,
        display: 'flex',
        gap: 8,
      }}>
        <ExportButton
          label="JSON"
          href={`/api/fairness/summary?period=${fairness.period_key}&format=json`}
        />
        <ExportButton
          label="CSV"
          href={`/api/fairness/summary?period=${fairness.period_key}&format=csv`}
        />
        <ExportButton
          label="ICS R.L"
          href={`/api/export/ics?entity=rl&period=${fairness.period_key}`}
        />
        <ExportButton
          label="ICS LOBSTER"
          href={`/api/export/ics?entity=lobster&period=${fairness.period_key}`}
        />
      </div>
    </motion.div>
  )
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function BalanceBar({
  label, leftValue, rightValue, leftColor, rightColor, leftLabel, rightLabel, style,
}: {
  label: string
  leftValue: number
  rightValue: number
  leftColor: string
  rightColor: string
  leftLabel: string
  rightLabel: string
  style?: React.CSSProperties
}) {
  const total = leftValue + rightValue
  const leftPct = total > 0 ? (leftValue / total) * 100 : 50
  const rightPct = 100 - leftPct

  return (
    <div style={style}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
      }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 9, color: leftColor }}>{leftLabel}</span>
        <span style={{ fontFamily: FONT.label, fontSize: 8, color: T.ghost, letterSpacing: '0.1em' }}>{label}</span>
        <span style={{ fontFamily: FONT.mono, fontSize: 9, color: rightColor }}>{rightLabel}</span>
      </div>
      <div style={{
        display: 'flex',
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        background: T.whisper,
      }}>
        <div style={{
          width: `${leftPct}%`,
          background: leftColor,
          transition: 'width 0.5s ease',
          borderRadius: leftPct >= 50 ? '3px 0 0 3px' : 3,
        }} />
        <div style={{
          width: `${rightPct}%`,
          background: rightColor,
          transition: 'width 0.5s ease',
          borderRadius: rightPct >= 50 ? '0 3px 3px 0' : 3,
        }} />
      </div>
      {/* Center mark */}
      <div style={{
        position: 'relative',
        top: -9,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 1,
        height: 10,
        background: T.primary + '44',
        pointerEvents: 'none',
      }} />
    </div>
  )
}

function PersonStat({ person }: { person: PersonFairnessBreakdown }) {
  const entityInfo = ENTITY_DISPLAY[person.entity_slug]
  return (
    <div style={{
      padding: '6px 8px',
      background: entityInfo.color + '11',
      border: `1px solid ${entityInfo.color}22`,
      borderRadius: 2,
    }}>
      <div style={{
        fontFamily: FONT.label,
        fontSize: 9,
        fontWeight: 500,
        color: entityInfo.color,
        marginBottom: 2,
      }}>
        {person.person_name}
      </div>
      <div style={{
        fontFamily: FONT.mono,
        fontSize: 8,
        color: T.ghost,
      }}>
        {person.total_hours}h • {person.total_points} pts • {person.slot_count} créneaux
      </div>
    </div>
  )
}

function ExportButton({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      style={{
        padding: '4px 8px',
        background: T.void,
        border: `1px solid ${T.whisper}`,
        borderRadius: 2,
        fontFamily: FONT.label,
        fontSize: 8,
        color: T.ghost,
        letterSpacing: '0.1em',
        textDecoration: 'none',
        cursor: 'pointer',
      }}
    >
      {label}
    </a>
  )
}
