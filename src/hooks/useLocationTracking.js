import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { recordPing } from '../lib/locationPing'

const PING_INTERVAL = 15 * 60 * 1000 // 15 minutes

export function useLocationTracking() {
  const user = useStore(s => s.user)
  const companyId = useStore(s => s.companyId)
  const employees = useStore(s => s.employees)
  const intervalRef = useRef(null)
  const lastPingRef = useRef(0)
  const activeEntryRef = useRef(null)
  const checkingRef = useRef(false)

  useEffect(() => {
    if (!user?.email || !companyId) return

    const emp = employees?.find(e => e.email === user.email)
    if (!emp) return
    const employeeId = emp.id

    // One writer for every fix in the app (lib/locationPing), so a ping taken
    // by this timer and one taken when a tech finishes a job are the same
    // shape and carry why they happened.
    const sendPing = async (entryId, reason = 'interval') => {
      const got = await recordPing({ companyId, employeeId, timeClockId: entryId, reason })
      if (got) lastPingRef.current = Date.now()
    }

    const checkAndStart = async () => {
      if (checkingRef.current) return
      checkingRef.current = true
      try {
        const { data } = await supabase
          .from('time_clock')
          .select('id')
          .eq('company_id', companyId)
          .eq('employee_id', employeeId)
          .is('clock_out', null)
          .order('clock_in', { ascending: false })
          .limit(1)

        const activeEntry = data?.[0]

        if (activeEntry && activeEntry.id !== activeEntryRef.current) {
          // New active entry — start tracking
          activeEntryRef.current = activeEntry.id
          if (intervalRef.current) clearInterval(intervalRef.current)

          // Send first ping immediately
          await sendPing(activeEntry.id)

          intervalRef.current = setInterval(() => {
            if (activeEntryRef.current) sendPing(activeEntryRef.current)
          }, PING_INTERVAL)
        } else if (!activeEntry && activeEntryRef.current) {
          // Clocked out — stop tracking
          activeEntryRef.current = null
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
        }
      } catch (_) {
        // Query may fail — silent
      } finally {
        checkingRef.current = false
      }
    }

    // Check on mount
    checkAndStart()

    // Re-check every 2 minutes (catches clock in/out from other tabs)
    const recheckInterval = setInterval(checkAndStart, 120000)

    // When tab becomes visible, catch up if needed
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastPingRef.current
        if (activeEntryRef.current && elapsed >= PING_INTERVAL) {
          // Back in the app after a while — this is the fix that actually
          // lands for a field tech, because the timer was asleep.
          sendPing(activeEntryRef.current, 'resume')
        }
        // Also re-check active entry state
        checkAndStart()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      clearInterval(recheckInterval)
      document.removeEventListener('visibilitychange', handleVisibility)
      activeEntryRef.current = null
    }
  }, [user?.email, companyId, employees])
}
