import { useState, useEffect, useCallback } from 'react'
import { UserPlus, ChevronDown, ChevronRight, AlertCircle, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'

// Sold work nobody is credited for.
//
// 168 jobs worth $406,042 were sold in 2026 with no salesperson on them —
// 24% of the year, and $369,177 of it lighting-side. Nothing in the data
// links them to a rep (no lead, no quote, no salesperson_id), so no code can
// recover them; a person has to say whose they are. Until they are claimed
// they count toward nobody's number, which is what made Cole's year look
// short.
//
// Deliberately a claim list, not an auto-assign: guessing an owner would put
// commission-bearing work on the wrong person's name.

const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function UnassignedSalesPanel({ theme, companyId, employees = [], cutoff = null, onAssigned }) {
  const [jobs, setJobs] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [bulkTo, setBulkTo] = useState('')
  const [selected, setSelected] = useState(() => new Set())

  const reps = employees.filter(e => e.active !== false)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    let q = supabase
      .from('jobs')
      .select('id, job_id, job_title, job_total, business_unit, created_at')
      .eq('company_id', companyId)
      .is('salesperson_id', null)
      .gt('job_total', 0)
      .order('job_total', { ascending: false })
      .limit(500)
    if (cutoff) q = q.gte('created_at', cutoff)
    const { data, error } = await q
    if (error) console.error('UnassignedSalesPanel:', error.message)
    setJobs(data || [])
    setLoading(false)
  }, [companyId, cutoff])

  useEffect(() => { load() }, [load])

  const total = jobs.reduce((s, j) => s + (Number(j.job_total) || 0), 0)
  if (!loading && jobs.length === 0) return null

  const assign = async (jobIds, employeeId) => {
    if (!employeeId || jobIds.length === 0) return
    setSavingId(jobIds.length === 1 ? jobIds[0] : 'bulk')
    const { error } = await supabase
      .from('jobs')
      .update({ salesperson_id: parseInt(employeeId), updated_at: new Date().toISOString() })
      .in('id', jobIds)
      .eq('company_id', companyId)   // never reach outside this tenant
    setSavingId(null)
    if (error) { toast.error('Could not assign: ' + error.message); return }
    const name = reps.find(r => String(r.id) === String(employeeId))?.name || 'the rep'
    toast.success(`${jobIds.length} job${jobIds.length === 1 ? '' : 's'} credited to ${name}`)
    setJobs(prev => prev.filter(j => !jobIds.includes(j.id)))
    setSelected(prev => { const n = new Set(prev); jobIds.forEach(id => n.delete(id)); return n })
    onAssigned?.()
  }

  const toggle = (id) => setSelected(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  const btn = {
    minHeight: '44px', padding: '0 14px', borderRadius: '8px', cursor: 'pointer',
    border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text,
    fontSize: '14px',
  }
  const sel = { ...btn, minWidth: '180px' }

  return (
    <div style={{
      backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
      borderLeft: `4px solid ${theme.warning}`, borderRadius: '10px',
      marginBottom: '16px', overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', minHeight: '44px', padding: '12px 14px', display: 'flex',
          alignItems: 'center', gap: '10px', background: 'none', border: 'none',
          cursor: 'pointer', color: theme.text, textAlign: 'left',
        }}
      >
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <AlertCircle size={18} style={{ color: theme.warning, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: '15px' }}>
          {money(total)} of sold work has no salesperson
        </span>
        <span style={{ color: theme.textMuted, fontSize: '13px' }}>
          {jobs.length} job{jobs.length === 1 ? '' : 's'} — credited to nobody until claimed
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          <div style={{
            display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center',
            padding: '10px 0', borderTop: `1px solid ${theme.border}`, marginBottom: '4px',
          }}>
            <span style={{ fontSize: '13px', color: theme.textSecondary }}>
              {selected.size} selected
            </span>
            <select value={bulkTo} onChange={e => setBulkTo(e.target.value)} style={sel}>
              <option value="">Assign selected to…</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button
              onClick={() => assign([...selected], bulkTo)}
              disabled={!bulkTo || selected.size === 0 || savingId === 'bulk'}
              style={{
                ...btn,
                backgroundColor: (!bulkTo || selected.size === 0) ? theme.bgCardHover : theme.accent,
                color: (!bulkTo || selected.size === 0) ? theme.textMuted : '#fff',
                borderColor: (!bulkTo || selected.size === 0) ? theme.border : theme.accent,
                cursor: (!bulkTo || selected.size === 0) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <UserPlus size={16} />
              {savingId === 'bulk' ? 'Assigning…' : 'Assign'}
            </button>
          </div>

          <div style={{ maxHeight: '420px', overflowY: 'auto', overflowX: 'auto' }}>
            {jobs.map(j => (
              <div key={j.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0',
                borderBottom: `1px solid ${theme.border}`, minHeight: '44px',
              }}>
                <input
                  type="checkbox"
                  checked={selected.has(j.id)}
                  onChange={() => toggle(j.id)}
                  style={{ width: '18px', height: '18px', flexShrink: 0, cursor: 'pointer' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '14px', color: theme.text, fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {j.job_title || j.job_id}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>
                    {j.job_id} · {j.business_unit || 'no business unit'} · {(j.created_at || '').slice(0, 10)}
                  </div>
                </div>
                <div style={{
                  fontSize: '14px', fontWeight: 600, color: theme.text,
                  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                }}>
                  {money(j.job_total)}
                </div>
                <select
                  defaultValue=""
                  onChange={e => e.target.value && assign([j.id], e.target.value)}
                  disabled={savingId === j.id}
                  style={{ ...btn, minWidth: '150px', flexShrink: 0 }}
                >
                  <option value="">{savingId === j.id ? 'Saving…' : 'Credit to…'}</option>
                  {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            ))}
            {loading && (
              <div style={{ padding: '12px', color: theme.textMuted, fontSize: '13px' }}>Loading…</div>
            )}
            {!loading && jobs.length === 0 && (
              <div style={{ padding: '12px', color: theme.success, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Check size={16} /> Every sold job has a salesperson.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
