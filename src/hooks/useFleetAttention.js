// What across the fleet needs somebody to do something.
//
// The counts exist because the fleet layer was, until now, purely a place you
// went to look things up. Nothing ever came and found you. A service request
// filed by a driver on a Tuesday sat on a detail page nobody opened, and a
// schedule went overdue in a view nobody queried.
//
// Two queries for the whole fleet rather than per asset: a forty-machine yard
// draws its list from two requests, and the counts stay consistent with the
// per-asset panels because both read the same view.
//
// Deliberately not a notification system. It returns numbers and the ids
// behind them; where those get shown, and how loudly, is the caller's call.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'

const OPEN_STATUSES = ['open', 'acknowledged', 'scheduled']

async function fetchAttention(companyId) {
  if (!companyId) return null
  const [r, p] = await Promise.all([
    supabase.from('fleet_service_requests')
      .select('id,fleet_id,severity,status,description,reported_at')
      .eq('company_id', companyId).in('status', OPEN_STATUSES),
    supabase.from('fleet_pm_status')
      .select('schedule_id,fleet_id,name,status,days_remaining,meter_remaining')
      .eq('company_id', companyId).in('status', ['overdue', 'due_soon']),
  ])
  return { requests: r.data || [], pm: p.data || [] }
}

export function useFleetAttention() {
  const companyId = useStore(s => s.companyId)
  const [requests, setRequests] = useState(null)
  const [pm, setPm] = useState(null)

  const load = useCallback(async () => {
    const r = await fetchAttention(companyId)
    if (!r) return
    setRequests(r.requests)
    setPm(r.pm)
  }, [companyId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const r = await fetchAttention(companyId)
      if (cancelled || !r) return
      setRequests(r.requests)
      setPm(r.pm)
    })()
    return () => { cancelled = true }
  }, [companyId])

  return useMemo(() => {
    const reqs = requests || []
    const due = pm || []

    // Per asset, so a card can show its own badge without a second query.
    const byAsset = new Map()
    const bump = (id, key) => {
      if (id == null) return
      const e = byAsset.get(id) || { requests: 0, unsafe: 0, overdue: 0, dueSoon: 0 }
      e[key] += 1
      byAsset.set(id, e)
    }
    for (const r of reqs) {
      bump(r.fleet_id, 'requests')
      // 'safety' is a claim that the machine should not be operated, which is
      // a different thing from a long repair queue and must not be averaged
      // into one.
      if (r.severity === 'safety') bump(r.fleet_id, 'unsafe')
    }
    for (const s of due) bump(s.fleet_id, s.status === 'overdue' ? 'overdue' : 'dueSoon')

    return {
      loading: requests === null || pm === null,
      requests: reqs,
      pmDue: due,
      byAsset,
      counts: {
        requests: reqs.length,
        unsafe: reqs.filter(r => r.severity === 'safety').length,
        overdue: due.filter(s => s.status === 'overdue').length,
        dueSoon: due.filter(s => s.status === 'due_soon').length,
      },
      refresh: load,
    }
  }, [requests, pm, load])
}
