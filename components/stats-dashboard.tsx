'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { T, FONT, fadeUp, GROUP_COLORS } from '@/lib/design'
import type { GroupUsageStats } from '@/types/studio'

interface StatsDashboardProps {
  month?: string
}

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                     'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

export function StatsDashboard({ month }: StatsDashboardProps) {
  const [stats, setStats] = useState<GroupUsageStats[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(month || new Date().toISOString().slice(0, 7))

  useEffect(() => {
    fetchStats()
  }, [selectedMonth])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stats?month=' + selectedMonth)
      const data = await res.json()
      setStats(data.groups || [])
    } catch (e) {
      console.error('Failed to fetch stats', e)
    } finally {
      setLoading(false)
    }
  }

  const yearMonth = selectedMonth.split('-')
  const monthLabel = MONTH_NAMES[parseInt(yearMonth[1]) - 1] + ' ' + yearMonth[0]

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      style={{
        background: T.surface,
        border: '1px solid ' + T.whisper,
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid ' + T.whisper,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontFamily: FONT.label, fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', color: T.primary }}>
            STATISTIQUES
          </div>
          <div style={{ fontFamily: FONT.reading, fontSize: 14, color: T.secondary, marginTop: 2 }}>
            {monthLabel}
          </div>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, color: T.ghost }}>
            Chargement...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {stats.map((groupStat) => {
              const groupColor = GROUP_COLORS[groupStat.group.slug as keyof typeof GROUP_COLORS] || T.primary
              const barWidth = Math.min(100, groupStat.percentage)

              return (
                <div key={groupStat.group.id} style={{
                  background: T.void,
                  border: '1px solid ' + T.whisper,
                  borderRadius: 4,
                  padding: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{
                      fontFamily: FONT.label,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      color: groupColor,
                      textTransform: 'uppercase',
                    }}>
                      {groupStat.group.name}
                    </div>
                    <div style={{ fontFamily: FONT.mono, fontSize: 12, color: T.primary }}>
                      {groupStat.total_days}/{groupStat.allocation} jours ({groupStat.percentage}%)
                    </div>
                  </div>

                  <div style={{
                    height: 6,
                    background: T.whisper,
                    borderRadius: 3,
                    overflow: 'hidden',
                    marginBottom: 12,
                  }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: barWidth + '%' }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      style={{ height: '100%', background: groupColor, borderRadius: 3 }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {groupStat.members.map((memberStat) => (
                      <div key={memberStat.member_id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '4px 8px',
                        background: groupColor + '11',
                        borderRadius: 2,
                      }}>
                        <span style={{ fontFamily: FONT.body, fontSize: 11, color: T.secondary }}>
                          {memberStat.member?.display_name || 'Membre'}
                        </span>
                        <span style={{ fontFamily: FONT.mono, fontSize: 10, color: T.ghost }}>
                          {memberStat.total_days}j - {memberStat.mix_slots}M/{memberStat.session_slots}S/{memberStat.night_slots}N
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
