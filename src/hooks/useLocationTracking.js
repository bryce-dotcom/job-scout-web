import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'

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

    const sendPing = async (entryId) => {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 60000,
          })
        })
        await supabase.from('location_pings').insert({
          company_id: companyId,
          employee_id: employeeId,
          time_clock_id: entryId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null,
          pinged_at: new Date().toISOString(),
        })
        lastPingRef.current = Date.now()
      } catch (_) {
        // Geolocation may fail — silent
      }
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
          sendPing(activeEntryRef.current)
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
