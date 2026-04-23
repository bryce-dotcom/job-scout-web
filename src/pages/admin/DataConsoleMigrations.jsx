import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { dataConsoleTheme as theme } from './DataConsole'
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'

// Migrations console — one place to see every HCP import / backfill /
// reconciliation run that has been recorded into the migration_jobs
// table, drill into the report JSON, and (eventually) trigger a new run.
//
// migration_jobs schema:
//   id, company_id, source, status, started_at, finished_at,
//   error, counts jsonb, report jsonb, triggered_by uuid

export default function DataConsoleMigrations() {
  const company = useStore(s => s.company)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState({})
  const [scope, setScope] = useState('all') // all | mine

  const load = async () => {
    setLoading(true)
    let q = supabase.from('migration_jobs').select('*').order('id', { ascending: false }).limit(100)
    if (scope === 'mine' && company?.id) q = q.eq('company_id', company.id)
    const { data } = await q
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [scope, company?.id])

  const fmtDate = (s) => s ? new Date(s).toLocaleString() : '—'
  const StatusIcon = ({ s }) => {
    if (s === 'finished') return <CheckCircle2 size={14} color={theme.success} />
    if (s === 'error' || s === 'failed') return <AlertTriangle size={14} color={theme.error} />
    return <Clock size={14} color={theme.warning} />
  }

  return (
    <div style={{ padding: 24, color: theme.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Migrations</h2>
          <div style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>
            Every HCP import, backfill, and reconciliation run, with trust reports.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={scope} onChange={e => setScope(e.target.value)} style={{ background: theme.bgCard, color: theme.text, border: `1px solid ${theme.border}`, padding: '6px 10px', borderRadius: 6 }}>
            <option value="all">All companies</option>
            <option value="mine">Current company only</option>
          </select>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.bgCard, color: theme.text, border: `1px solid ${theme.border}`, padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: theme.textMuted }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: theme.textMuted, padding: 40, textAlign: 'center', border: `1px dashed ${theme.border}`, borderRadius: 8 }}>
          No migration runs yet. Trigger one from the Onboarding wizard or CLI scripts.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(r => {
            const isOpen = !!open[r.id]
            return (
              <div key={r.id} style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 8 }}>
                <div onClick={() => setOpen(o => ({ ...o, [r.id]: !o[r.id] }))} style={{ padding: 12, display: 'grid', gridTemplateColumns: '20px 60px 1fr 200px 200px 100px', gap: 12, alignItems: 'center', cursor: 'pointer' }}>
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div style={{ color: theme.textMuted, fontSize: 12 }}>#{r.id}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{r.source}</div>
                    <div style={{ color: theme.textMuted, fontSize: 12 }}>company {r.company_id}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <StatusIcon s={r.status} /> {r.status || '—'}
                  </div>
                  <div style={{ color: theme.textMuted, fontSize: 12 }}>{fmtDate(r.finished_at || r.started_at)}</div>
                  <div style={{ color: theme.textMuted, fontSize: 12 }}>
                    {r.counts ? Object.entries(r.counts).slice(0, 2).map(([k, v]) => `${k}:${v}`).join(' ') : ''}
                  </div>
                </div>
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${theme.border}`, padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>Counts</div>
                      <pre style={{ margin: 0, background: '#000', padding: 8, borderRadius: 4, fontSize: 12, overflow: 'auto', maxHeight: 240 }}>{JSON.stringify(r.counts, null, 2)}</pre>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
                        Report {r.report?.fidelity ? `(fidelity: q${r.report.fidelity.quotes}% / j${r.report.fidelity.jobs}% / i${r.report.fidelity.invoices}% / lines${r.report.fidelity.lines}%)` : ''}
                      </div>
                      <pre style={{ margin: 0, background: '#000', padding: 8, borderRadius: 4, fontSize: 12, overflow: 'auto', maxHeight: 240 }}>{JSON.stringify(r.report, null, 2)}</pre>
                    </div>
                    {r.error && (
                      <div style={{ gridColumn: '1 / -1', color: theme.error, fontSize: 13 }}>
                        Error: {r.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
