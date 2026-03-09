'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { T, FONT, fadeUp } from '@/lib/design'
import type { WeekSchedule, StudioEntity, SlotType } from '@/types/studio'
import { SLOT_LABELS, ENTITY_INFO } from '@/types/studio'
import { PERSON_DISPLAY, type PersonSlug } from '@/types/fairness'
import { SlotCard } from './slot-card'

interface StudioBoardProps {
  schedule: WeekSchedule
  onAssign: (slotId: string, assignee: StudioEntity | null) => Promise<{ success: boolean; error?: string }>
  onPersonAssign?: (slotId: string, person: PersonSlug | null) => Promise<{ success: boolean; error?: string }>
  loading?: boolean
}

const SLOT_ORDER: SlotType[] = ['mix', 'session', 'night']

export function StudioBoard({ schedule, onAssign, onPersonAssign, loading }: StudioBoardProps) {
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleDragOver = (e: React.DragEvent, slotId: string) => {
    e.preventDefault()
    setDragOverSlot(slotId)
  }

  const handleDragLeave = () => {
    setDragOverSlot(null)
  }

  const handleDrop = async (e: React.DragEvent, targetSlotId: string, targetAssignee: StudioEntity) => {
    e.preventDefault()
    setDragOverSlot(null)

    const sourceSlotId = e.dataTransfer.getData('slot_id')
    if (!sourceSlotId) return

    const result = await onAssign(sourceSlotId, targetAssignee)
    if (!result.success) {
      setErrorMessage(result.error || 'Failed to assign')
      setTimeout(() => setErrorMessage(null), 3000)
    }
  }

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      style={{
        background: T.void,
        border: `1px solid ${T.whisper}`,
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${T.whisper}`,
          background: T.surface,
        }}
      >
        <div>
          <div style={{ fontFamily: FONT.label, fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', color: T.primary }}>
            STUDIO PLANNING
          </div>
          <div style={{ fontFamily: FONT.mono, fontSize: 10, color: T.secondary, marginTop: 2 }}>
            {schedule.week_key} • Semaine {schedule.week_type}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          {(['romann', 'lobster'] as const).map(entity => {
            const stats = schedule.stats[entity]
            const info = ENTITY_INFO[entity]
            return (
              <div key={entity} style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: FONT.label, fontSize: 10, fontWeight: 500, color: info.color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {info.name}
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 9, color: T.ghost, marginTop: 2 }}>
                  {stats.total_hours}h ({stats.mix_count}M/{stats.session_count}S/{stats.night_count}N)
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {errorMessage && (
        <div style={{ padding: '8px 16px', background: T.alert + '22', borderBottom: `1px solid ${T.alert}44`, fontFamily: FONT.label, fontSize: 11, color: T.alert }}>
          {errorMessage}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', gap: 1, background: T.whisper }}>
        <div style={{ background: T.surface }} />
        {schedule.days.map(day => (
          <div
            key={day.day_of_week}
            style={{
              padding: '10px 8px',
              background: day.is_weekend ? T.surfaceRaised : T.surface,
              textAlign: 'center',
            }}
          >
            <div style={{ fontFamily: FONT.label, fontSize: 10, fontWeight: day.is_weekend ? 600 : 400, letterSpacing: '0.1em', color: day.is_weekend ? T.gold : T.secondary }}>
              {day.day_name.substring(0, 3).toUpperCase()}
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 9, color: T.ghost, marginTop: 2 }}>
              {day.date.split('-').slice(1).join('/')}
            </div>
          </div>
        ))}

        {SLOT_ORDER.map(slotType => (
          <>
            <div
              key={`label-${slotType}`}
              style={{
                padding: '12px 8px',
                background: T.surface,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: FONT.label,
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  color: slotType === 'night' ? T.gold : T.secondary,
                  transform: 'rotate(-90deg)',
                  whiteSpace: 'nowrap',
                }}
              >
                {SLOT_LABELS[slotType]}
              </div>
            </div>

            {schedule.days.map(day => {
              const slot = day.slots.find(s => s.slot_type === slotType)
              if (!slot) return <div key={`empty-${day.day_of_week}-${slotType}`} style={{ background: T.void }} />

              const isDropTarget = dragOverSlot === slot.id

              return (
                <div
                  key={slot.id}
                  style={{
                    padding: 8,
                    background: day.is_weekend ? T.surfaceRaised : T.void,
                    borderLeft: isDropTarget ? `2px solid ${T.calm}` : undefined,
                    transition: 'all 0.15s ease',
                  }}
                  onDragOver={(e) => handleDragOver(e, slot.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, slot.id, slot.assignee === 'romann' ? 'lobster' : 'romann')}
                >
                  <SlotCard slot={slot} onAssign={(assignee) => onAssign(slot.id, assignee)} onPersonAssign={onPersonAssign ? (person) => onPersonAssign(slot.id, person) : undefined} compact />
                </div>
              )
            })}
          </>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${T.whisper}`, background: T.surface }}>
        {(['romann', 'lobster'] as const).map(entity => {
          const info = ENTITY_INFO[entity]
          return (
            <div
              key={entity}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const slotId = e.dataTransfer.getData('slot_id')
                if (slotId) onAssign(slotId, entity)
              }}
              style={{
                flex: 1,
                padding: '12px 16px',
                background: info.color + '11',
                border: `1px dashed ${info.color}44`,
                borderRadius: 3,
                textAlign: 'center',
                fontFamily: FONT.label,
                fontSize: 10,
                color: info.color,
                letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              GLISSER ICI POUR {info.name.toUpperCase()}
            </div>
          )
        })}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const slotId = e.dataTransfer.getData('slot_id')
            if (slotId) onAssign(slotId, null)
          }}
          style={{
            flex: 0.5,
            padding: '12px 16px',
            background: T.whisper,
            border: `1px dashed ${T.ghost}`,
            borderRadius: 3,
            textAlign: 'center',
            fontFamily: FONT.label,
            fontSize: 10,
            color: T.ghost,
            letterSpacing: '0.1em',
            cursor: 'pointer',
          }}
        >
          LIBÉRER
        </div>
      </div>

      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: T.void + 'cc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontFamily: FONT.label, fontSize: 11, color: T.secondary, letterSpacing: '0.1em' }}>
            CHARGEMENT...
          </div>
        </div>
      )}
    </motion.div>
  )
}
