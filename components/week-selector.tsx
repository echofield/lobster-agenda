'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { T, FONT } from '@/lib/design'
import { getNextWeekKeys, getWeekDisplayLabel, getCurrentWeekKey } from '@/lib/week-utils'
import { getWeekType } from '@/lib/validator'

interface WeekSelectorProps {
  selectedWeek: string
  onSelect: (weekKey: string) => void
  weeksToShow?: number
}

export function WeekSelector({ selectedWeek, onSelect, weeksToShow = 8 }: WeekSelectorProps) {
  const weeks = useMemo(() => getNextWeekKeys(weeksToShow), [weeksToShow])
  const currentWeek = getCurrentWeekKey()

  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 0' }}>
      {weeks.map(weekKey => {
        const isSelected = weekKey === selectedWeek
        const isCurrent = weekKey === currentWeek
        const weekType = getWeekType(weekKey)

        return (
          <motion.button
            key={weekKey}
            onClick={() => onSelect(weekKey)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              padding: '10px 16px',
              background: isSelected ? T.surfaceRaised : T.surface,
              border: `1px solid ${isSelected ? T.primary + '44' : T.whisper}`,
              borderRadius: 3,
              cursor: 'pointer',
              minWidth: 140,
              textAlign: 'left',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 10, fontWeight: 600, color: isSelected ? T.primary : T.secondary }}>
                {weekKey}
              </span>
              <span
                style={{
                  padding: '1px 4px',
                  background: weekType === 'A' ? T.gold + '22' : T.calm + '22',
                  borderRadius: 2,
                  fontFamily: FONT.label,
                  fontSize: 8,
                  fontWeight: 600,
                  color: weekType === 'A' ? T.gold : T.calm,
                }}
              >
                {weekType}
              </span>
              {isCurrent && (
                <span
                  style={{
                    padding: '1px 4px',
                    background: T.meridian + '33',
                    borderRadius: 2,
                    fontFamily: FONT.label,
                    fontSize: 8,
                    color: T.calm,
                  }}
                >
                  ACTUEL
                </span>
              )}
            </div>
            <div style={{ fontFamily: FONT.label, fontSize: 10, color: T.ghost }}>
              {getWeekDisplayLabel(weekKey)}
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
