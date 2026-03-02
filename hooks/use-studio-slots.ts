'use client'

import { useState, useEffect, useCallback } from 'react'
import type { StudioSlot, WeekSchedule } from '@/types/studio'
import { buildWeekSchedule, getCurrentWeekKey } from '@/lib/week-utils'

interface UseStudioSlotsOptions {
  weekKey?: string
  pollInterval?: number
}

interface UseStudioSlotsReturn {
  slots: StudioSlot[]
  schedule: WeekSchedule | null
  weekKey: string
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  setWeekKey: (key: string) => void
  assignSlot: (slotId: string, assignee: 'roman' | 'lobster' | null) => Promise<{ success: boolean; error?: string }>
}

export function useStudioSlots(options: UseStudioSlotsOptions = {}): UseStudioSlotsReturn {
  const [weekKey, setWeekKey] = useState(options.weekKey || getCurrentWeekKey())
  const [slots, setSlots] = useState<StudioSlot[]>([])
  const [schedule, setSchedule] = useState<WeekSchedule | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSlots = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/slots?week=${weekKey}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch slots')
      }

      const fetchedSlots = data.slots as StudioSlot[]
      setSlots(fetchedSlots)
      setSchedule(buildWeekSchedule(weekKey, fetchedSlots))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setSlots([])
      setSchedule(null)
    } finally {
      setLoading(false)
    }
  }, [weekKey])

  const assignSlot = useCallback(async (
    slotId: string,
    assignee: 'roman' | 'lobster' | null,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: slotId, assignee }),
      })

      const data = await res.json()

      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to assign slot' }
      }

      // Rebuild schedule after assignment
      setSlots(prev => {
        const updatedSlots = prev.map(s =>
          s.id === slotId
            ? { ...s, assignee, validation_status: data.validation?.status || 'ok', validation_reasons: data.validation?.reasons || [] }
            : s
        )
        setSchedule(buildWeekSchedule(weekKey, updatedSlots))
        return updatedSlots
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }, [weekKey])

  useEffect(() => {
    fetchSlots()

    if (options.pollInterval && options.pollInterval > 0) {
      const interval = setInterval(fetchSlots, options.pollInterval)
      return () => clearInterval(interval)
    }
  }, [fetchSlots, options.pollInterval])

  return { slots, schedule, weekKey, loading, error, refetch: fetchSlots, setWeekKey, assignSlot }
}
