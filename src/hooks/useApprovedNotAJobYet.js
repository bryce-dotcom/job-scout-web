import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchApprovedNotAJobYet } from '../lib/soldTotals'

// Approved estimates that are not a job yet, for the company — the rows a sold
// figure adds to its jobs (lib/soldTotals soldRowsOf). Re-reads when the
// store's quotes or jobs change, so converting one drops it straight away.
export function useApprovedNotAJobYet(companyId, ...deps) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    if (!companyId) { setRows([]); return }
    let alive = true
    fetchApprovedNotAJobYet(supabase, companyId).then((r) => { if (alive) setRows(r) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, ...deps])
  return rows
}
