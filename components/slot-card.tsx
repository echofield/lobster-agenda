'use client'

import { motion } from 'framer-motion'
import { T, FONT, scaleIn } from '@/lib/design'
import type { StudioSlot, StudioEntity, ValidationStatus } from '@/types/studio'
import { ENTITY_INFO, SLOT_LABELS } from '@/types/studio'

interface SlotCardProps {
  slot: StudioSlot
  onAssign: (assignee: StudioEntity | null) => void
  isDragging?: boolean
  compact?: boolean
}

const STATUS_COLORS: Record<ValidationStatus, string> = {
  ok: T.calm,
  warn: T.gold,
  block: T.alert,
}

export function SlotCard({ slot, onAssign, isDragging, compact }: SlotCardProps) {
  const assigneeInfo = slot.assignee ? ENTITY_INFO[slot.assignee] : null
  const statusColor = STATUS_COLORS[slot.validation_status]

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('slot_id', slot.id)
    e.dataTransfer.setData('current_assignee', slot.assignee || '')
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleClick = () => {
    if (!slot.assignee) {
      onAssign('roman')
    } else if (slot.assignee === 'roman') {
      onAssign('lobster')
    } else {
      onAssign(null)
    }
  }

  return (
    <motion.div
      variants={scaleIn}
      initial="hidden"
      animate="visible"
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      style={{
        background: slot.assignee ? assigneeInfo?.color + '22' : T.surface,
        border: `1px solid ${slot.assignee ? assigneeInfo?.color + '55' : T.whisper}`,
        borderRadius: 3,
        padding: compact ? '6px 8px' : '8px 12px',
        cursor: 'grab',
        userSelect: 'none',
        opacity: isDragging ? 0.5 : 1,
        transition: 'all 0.2s ease',
        position: 'relative',
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98, cursor: 'grabbing' }}
    >
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

      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: compact ? 9 : 10,
          color: T.ghost,
          marginBottom: 4,
        }}
      >
        {slot.start_time}–{slot.end_time}
      </div>

      <div
        style={{
          fontFamily: FONT.label,
          fontSize: compact ? 10 : 11,
          fontWeight: 600,
          letterSpacing: '0.1em',
          color: T.secondary,
          marginBottom: slot.assignee ? 4 : 0,
        }}
      >
        {SLOT_LABELS[slot.slot_type]}
      </div>

      {slot.assignee && assigneeInfo && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 6px',
            background: assigneeInfo.color + '33',
            border: `1px solid ${assigneeInfo.color}55`,
            borderRadius: 2,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: assigneeInfo.color,
            }}
          />
          <span
            style={{
              fontFamily: FONT.label,
              fontSize: 9,
              fontWeight: 500,
              color: assigneeInfo.color,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {assigneeInfo.name}
          </span>
        </div>
      )}

      {!slot.assignee && (
        <div
          style={{
            fontFamily: FONT.label,
            fontSize: 9,
            color: T.ghost,
            fontStyle: 'italic',
          }}
        >
          libre
        </div>
      )}
    </motion.div>
  )
}
