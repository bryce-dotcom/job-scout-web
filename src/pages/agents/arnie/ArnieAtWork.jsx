// Arnie at work — the owner's screen: what he did, for whom, what it cost.
//
// Counts, not transcripts. An owner can see who talks to Arnie and what
// he drafted for them (the drafts are the audit trail — request_text is
// what the person asked him to do), never the conversation itself.
// Admin and up; the numbers come from lib/arnieUsage.js.

import { useEffect, useState } from 'react'
import { Activity } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { summarizeArnie } from '../../../lib/arnieUsage'

// PostgREST caps a page at 1000 rows; a busy month of Arnie is more than that.
async function pageAll(query) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999)
    if (error) return { data: out, error }
    out.push(...(data || []))
    if (!data || data.length < 1000) return { data: out, error: null }
  }
}

const t = { ink: '#2c3530', sub: '#4d5a52', muted: '#7d8a7f', line: '#d6cdb8', card: '#ffffff', bg: '#f7f5ef', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.10)', green: '#22c55e', amber: '#b45309', red: '#ef4444' }
const WINDOWS = [7, 30, 90]
const usd = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const when = (iso) => { const d = new Date(iso); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }
const STATUS_COLOR = { approved: t.green, 'rolled back': t.amber, rejected: t.muted, waiting: t.accent }

export default function ArnieAtWork() {
  const companyId = useStore((s) => s.companyId)
  const employees = useStore((s) => s.employees) || []
  const [days, setDays] = useState(30)
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!companyId) return
    let live = true
    ;(async () => {
      const since = new Date(Date.now() - 90 * 86400000).toISOString()
      const [p, s, u] = await Promise.all([
        supabase.from('arnie_proposals').select('id,created_by,target,status,created_at,request_text,summary').eq('company_id', companyId).gte('created_at', since).order('created_at', { ascending: false }).limit(2000),
        supabase.from('ai_sessions').select('id,session_id,user_email,started').eq('company_id', companyId).eq('current_module', 'arnie').gte('started', since).limit(2000),
        pageAll((from, to) => supabase.from('ai_usage').select('est_cost_usd,success,created_at').eq('company_id', companyId).eq('feature', 'arnie-chat').gte('created_at', since).order('id').range(from, to)),
      ])
      const err = p.error || s.error || u.error
      if (!live) return
      if (err) { setError(err.message); return }
      const ids = (s.data || []).map((x) => x.session_id).filter(Boolean)
      const m = ids.length ? await supabase.from('ai_messages').select('session_id,role').eq('company_id', companyId).in('session_id', ids).limit(20000) : { data: [] }
      if (!live) return
      if (m.error) { setError(m.error.message); return }
      setRows({ proposals: p.data || [], sessions: s.data || [], messages: m.data || [], usage: u.data || [] })
    })()
    return () => { live = false }
  }, [companyId])

  const sum = rows ? summarizeArnie({ ...rows, employees }, days) : null

  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 16, marginBottom: 18, textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: t.accentBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: t.accent }}><Activity size={18} /></span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, color: t.ink }}>Arnie at work</div>
          <div style={{ fontSize: 12.5, color: t.muted }}>What he drafted, who approved it, what it cost. Counts and the audit trail — never the conversations themselves.</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {WINDOWS.map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} style={{ minHeight: 32, padding: '4px 10px', borderRadius: 8, border: `1px solid ${days === d ? t.accent : t.line}`, background: days === d ? t.accentBg : t.card, color: days === d ? t.accent : t.sub, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{d} days</button>
          ))}
        </div>
      </div>

      {error && <div style={{ fontSize: 13, color: t.red, padding: '6px 0' }}>{error}</div>}
      {!rows && !error && <div style={{ fontSize: 13, color: t.muted, padding: '8px 0' }}>Loading…</div>}
      {sum && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
            {[
              ['Conversations', sum.conversations, `${sum.asked} question${sum.asked === 1 ? '' : 's'} from ${sum.people} ${sum.people === 1 ? 'person' : 'people'}`],
              ['Drafts', sum.drafted, sum.drafted ? `${sum.approved} approved · ${sum.rejected} rejected · ${sum.rolledBack} rolled back${sum.pending ? ` · ${sum.pending} waiting` : ''}` : 'nothing drafted yet'],
              ['Approved', sum.approvalRate == null ? '—' : sum.approvalRate + '%', 'of what he drafted went through'],
              ['Cost', usd(sum.cost), `${sum.calls} call${sum.calls === 1 ? '' : 's'}${sum.failed ? ` · ${sum.failed} failed` : ''}`],
            ].map(([label, big, small]) => (
              <div key={label} style={{ background: t.bg, border: `1px solid ${t.line}`, borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
                <div style={{ fontSize: 11.5, color: t.muted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: t.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{big}</div>
                <div style={{ fontSize: 12, color: t.sub }}>{small}</div>
              </div>
            ))}
          </div>

          {(sum.kinds.length > 0 || sum.persons.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 14, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink, marginBottom: 6 }}>By kind</div>
                {sum.kinds.length === 0 && <div style={{ fontSize: 12.5, color: t.muted }}>No drafts in this window.</div>}
                {sum.kinds.slice(0, 10).map((k) => (
                  <div key={k.kind} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, color: t.sub, padding: '3px 0', borderBottom: `1px solid ${t.line}` }}>
                    <span style={{ color: t.ink }}>{k.kind}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{k.approved} of {k.drafted} approved</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink, marginBottom: 6 }}>By person</div>
                {sum.persons.length === 0 && <div style={{ fontSize: 12.5, color: t.muted }}>Nobody has talked to Arnie in this window.</div>}
                {sum.persons.slice(0, 10).map((p) => (
                  <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, color: t.sub, padding: '3px 0', borderBottom: `1px solid ${t.line}` }}>
                    <span style={{ color: t.ink }}>{p.name}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.conversations} conv · {p.approved}/{p.drafted} drafts</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sum.recent.length > 0 && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink, marginBottom: 6 }}>Latest drafts</div>
              {sum.recent.map((r) => (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'baseline', fontSize: 13, padding: '5px 0', borderBottom: `1px solid ${t.line}` }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ color: t.ink, fontWeight: 600 }}>{r.who}</span>
                    <span style={{ color: t.muted }}> · {r.kind} · {when(r.when)}</span>
                    {r.asked && <div style={{ color: t.sub, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.asked}</div>}
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: STATUS_COLOR[r.status] || t.sub, border: `1px solid ${STATUS_COLOR[r.status] || t.line}`, borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap' }}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
