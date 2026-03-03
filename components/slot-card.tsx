'use client'

import { motion } from 'framer-motion'
import { T, FONT, scaleIn } from '@/lib/design'
import type { StudioSlot, StudioEntity, ValidationStatus } from '@/types/studio'
import { ENTITY_INFO, SLOT_LABELS } from '@/types/studio'
import { PERSON_DISPLAY, ENTITY_DISPLAY, type PersonSlug, type EntitySlug } from '@/types/fairness'

interface SlotCardProps {
  slot: StudioSlot & {
    person_slug?: string | null
    person_name?: string | null
    entity_slug?: string | null
    entity_name?: string | null
    entity_color?: string | null
    status?: string
  }
  onAssign: (assignee: StudioEntity | null) => void
  onPersonAssign?: (person: PersonSlug | null) => void
  isDragging?: boolean
  compact?: boolean
}

const STATUS_COLORS: Record<ValidationStatus, string> = {
  ok: T.calm,
  warn: T.gold,
  block: T.alert,
}

// Click cycle: null → roman → leonard → martial → alexandre → hedi → null
const PERSON_CYCLE: (PersonSlug | null)[] = [null, 'roman', 'leonard', 'martial', 'alexandre', 'hedi']

export function SlotCard({ slot, onAssign, onPersonAssign, isDragging, compact }: SlotCardProps) {
  const assigneeInfo = slot.assignee ? ENTITY_INFO[slot.assignee] : null
  const statusColor = STATUS_COLORS[slot.validation_status]

  // Person-level info
  const personSlug = slot.person_slug as PersonSlug | null
  const personInfo = personSlug ? PERSON_DISPLAY[personSlug] : null
  const displayColor = personInfo?.color || assigneeInfo?.color || T.ghost
  const displayName = slot.person_name || assigneeInfo?.name || null
  const entityBadge = slot.entity_slug
    ? ENTITY_DISPLAY[slot.entity_slug as EntitySlug]?.name
    : slot.assignee
      ? (slot.assignee === 'roman' ? 'R.L' : 'LOBSTER')
      : null

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('slot_id', slot.id)
    e.dataTransfer.setData('current_assignee', slot.assignee || '')
    e.dataTransfer.setData('current_person', personSlug || '')
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleClick = () => {
    if (onPersonAssign) {
      const currentIdx = PERSON_CYCLE.indexOf(personSlug)
      const nextIdx = (currentIdx + 1) % PERSON_CYCLE.length
      onPersonAssign(PERSON_CYCLE[nextIdx])
    } else {
      // Legacy entity cycling
      if (!slot.assignee) onAssign('roman')
      else if (slot.assignee === 'roman') onAssign('lobster')
      else onAssign(null)
    }
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      style={{ cursor: 'grab' }}
    >
      <motion.div
        variants={scaleIn}
        initial="hidden"
        animate="visible"
        style={{
          background: displayName ? displayColor + '18' : T.surface,
          border: `1px solid ${displayName ? displayColor + '44' : T.whisper}`,
          borderRadius: 3,
          padding: compact ? '6px 8px' : '8px 12px',
          userSelect: 'none',
          opacity: isDragging ? 0.5 : 1,
          transition: 'all 0.2s ease',
          position: 'relative',
        }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {/* Validation dot */}
        {slot.validation_status !== 'ok' && (
          <div
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: statusColor,
            }}
            title={slot.validation_reasons.join('\n')}
          />
        )}

        {/* Lock indicator */}
        {slot.status === 'locked' && (
          <div style={{ position: 'absolute', top: 3, left: 3, fontSize: 7 }}>🔒</div>
        )}

        {/* Time */}
        <div style={{
          fontFamily: FONT.mono,
          fontSize: compact ? 9 : 10,
          color: T.ghost,
          marginBottom: 4,
        }}>
          {slot.start_time}–{slot.end_time}
        </div>

        {/* Slot type */}
        <div style={{
          fontFamily: FONT.label,
          fontSize: compact ? 10 : 11,
          fontWeight: 600,
          letterSpacing: '0.1em',
          color: T.secondary,
          marginBottom: displayName ? 4 : 0,
        }}>
          {SLOT_LABELS[slot.slot_type]}
        </div>

        {/* Person + entity */}
        {displayName && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              background: displayColor + '28',
              border: `1px solid ${displayColor}44`,
              borderRadius: 2,
              alignSelf: 'flex-start',
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%', background: displayColor,
              }} />
              <span style={{
                fontFamily: FONT.label, fontSize: 9, fontWeight: 500,
                color: displayColor, letterSpacing: '0.05em',
              }}>
                {displayName}
              </span>
            </div>
            {entityBadge && (
              <span style={{
                fontFamily: FONT.mono, fontSize: 7, color: T.ghost, letterSpacing: '0.05em',
              }}>
                {entityBadge}
              </span>
            )}
          </div>
        )}

        {!displayName && (
          <div style={{
            fontFamily: FONT.label, fontSize: 9, color: T.ghost, fontStyle: 'italic',
          }}>
            libre
          </div>
        )}
      </motion.div>
    </div>
  )
}
