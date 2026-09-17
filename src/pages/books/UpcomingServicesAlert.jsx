// Extracted from Books.jsx (2026-09-17) — self-contained; Books renders it.
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// Small alert that fetches the count of services due in next 30 days and
// renders a yellow banner on the Money tab. Kept here (not its own file)
// because it's only used by Books and has no other dependencies.
export default function UpcomingServicesAlert({ companyId, navigate }) {
  const [count, setCount] = useState(0)
  const [nextDue, setNextDue] = useState(null)
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const horizon = new Date(today); horizon.setDate(today.getDate() + 30)
      const { data } = await supabase
        .from('jobs')
        .select('id, service_due_date, status')
        .eq('company_id', companyId)
        .not('service_due_date', 'is', null)
        .lte('service_due_date', horizon.toISOString().slice(0, 10))
        .order('service_due_date', { ascending: true })
        .limit(100)
      if (cancelled) return
      const filtered = (data || []).filter(j => !['Completed', 'Verified Complete', 'Paid', 'Closed', 'Archived'].includes(j.status))
      setCount(filtered.length)
      setNextDue(filtered[0]?.service_due_date || null)
    })()
    return () => { cancelled = true }
  }, [companyId])
  if (count === 0) return null
  return (
    <div style={{
      marginBottom: '24px', padding: '14px 16px',
      borderRadius: '12px', border: '1px solid rgba(217,119,6,0.28)',
      backgroundColor: 'rgba(217,119,6,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#92400e' }}>
          {count} service visit{count === 1 ? '' : 's'} due in the next 30 days
        </div>
        <div style={{ fontSize: '12px', color: '#92400e', marginTop: '2px' }}>
          Call customers to schedule before the due date.
          {nextDue && ` Next due: ${new Date(nextDue).toLocaleDateString()}.`}
        </div>
      </div>
      <button onClick={() => navigate('/services/upcoming')} style={{
        padding: '8px 14px', borderRadius: '8px', border: 'none',
        backgroundColor: '#d97706', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
      }}>
        Review services
      </button>
    </div>
  )
}
