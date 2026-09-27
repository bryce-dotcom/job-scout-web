import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Radar, ChevronDown, ChevronUp, Star, X, Check, ExternalLink, Paperclip, AlertTriangle, RotateCcw, Upload, ClipboardList, Link2, Lightbulb } from 'lucide-react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { supabase } from '../../../lib/supabase'
import { toast } from '../../../lib/toast'
import { countdown, DISMISS_REASONS, STATUS_LABEL } from '../../../lib/bidFit'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const defaultTheme = { bg: '#f7f5ef', bgCard: '#fff', border: '#d6cdb8', text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,.12)' }

const FILTERS = [
  { key: 'open', label: 'Open', statuses: ['new', 'shortlisted'] },
  { key: 'chosen', label: 'Chosen', statuses: ['chosen', 'building', 'ready', 'submitted'] },
  { key: 'dismissed', label: 'Dismissed', statuses: ['dismissed', 'expired'] },
  { key: 'closed', label: 'Closed', statuses: ['won', 'lost', 'no_award'] },
]
const SOURCE_LABEL = { sam: 'SAM.gov', email: 'Portal alert', rss: 'Public notice', manual: 'Added by hand' }
const LEVEL_LABEL = { federal: 'Federal', state: 'State', county: 'County', city: 'City', district: 'District', utility: 'Utility', gc: 'GC', private: 'Private', unknown: '' }

const scoreColor = (s) => (s == null ? '#7d8a7f' : s >= 70 ? '#16a34a' : s >= 45 ? '#ca8a04' : '#b91c1c')
const urgencyColor = { past: '#7d8a7f', red: '#b91c1c', amber: '#ca8a04', ok: '#4d5a52', none: '#7d8a7f' }
const fmtMoney = (n) => (n == null ? null : `$${Math.round(Number(n)).toLocaleString()}`)
const whenLocal = (iso, tz) => { if (!iso) return ''; try { return new Date(iso).toLocaleString('en-US', { timeZone: tz || undefined, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + (tz ? ` (${tz.split('/').pop().replace('_', ' ')})` : '') } catch { return new Date(iso).toLocaleString() } }

async function callSal(fn, body) {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ANON_KEY}`, apikey: ANON_KEY }, body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok && data.ok !== false, status: res.status, data }
}

// The board: what Sal found, scored, for a person to Shortlist, Dismiss or
// Choose. Choose is the hand-off — the lead, the calendar dates, the package
// on Benny — and it is a Manager's click (sal-choose enforces it).
export default function SalBoard() {
  const navigate = useNavigate()
  const companyId = useStore((s) => s.companyId)
  const themeCtx = useTheme()
  const theme = themeCtx?.theme || defaultTheme
  const isMobile = useIsMobile()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open')
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(null)
  const [dismissing, setDismissing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [addUrl, setAddUrl] = useState('')
  const [now, setNow] = useState(() => new Date())

  const load = async () => {
    if (!companyId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('bid_opportunities')
      .select('id, source_kind, title, buyer, buyer_level, solicitation_number, notice_type, summary, naics, set_aside, estimated_value_low, estimated_value_high, place, due_at, due_tz, prebid_at, prebid_mandatory, questions_due_at, requirements, submit_method, documents, url, fit_score, fit_reasons, blockers, effort_estimate, status, dismissed_reason, dismissed_by, chosen_by, lead_id, quote_id, build_error, scored_at, created_at')
      .eq('company_id', companyId)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(300)
    if (error) toast.error(`Could not load the board: ${error.message}`)
    setRows(data || [])
    setLoading(false)
    setNow(new Date())
  }
  useEffect(() => { load() }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t) }, [])
  // While Benny is building, the row changes under us: poll until it settles.
  const building = rows.some((r) => r.status === 'building')
  useEffect(() => { if (!building) return; const t = setInterval(load, 15000); return () => clearInterval(t) }, [building]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) || FILTERS[0]
    const list = rows.filter((r) => f.statuses.includes(r.status))
    if (filter === 'open') list.sort((a, b) => (Number(b.fit_score) || 0) - (Number(a.fit_score) || 0) || (a.due_at || '').localeCompare(b.due_at || ''))
    return list
  }, [rows, filter])
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter((r) => f.statuses.includes(r.status)).length])), [rows])

  const act = async (row, action, extra = {}) => {
    setBusy(row.id)
    const r = await callSal('sal-choose', { company_id: companyId, opportunity_id: row.id, action, ...extra })
    setBusy(null)
    if (r.data?.needs_override) {
      if (window.confirm(`${r.data.error}\n\nPursue it anyway?`)) return act(row, action, { ...extra, override_blockers: true })
      return
    }
    if (!r.ok) { toast.error(r.data?.error || `Sal could not ${action} that (${r.status})`); if (r.data?.lead_id) await load(); return }
    if (action === 'choose' || action === 'build') {
      if (r.data.status === 'building') toast.success('Benny has the package — the card turns "Bid ready" when he is done')
      else if (r.data.status === 'ready') toast.success(`Benny built the bid: ${r.data.benny?.lines ?? '?'} lines, ${r.data.benny?.unverified ?? 0} to verify`)
      else toast.success(r.data.message || 'Chosen — lead and deadlines made')
    } else if (action === 'dismiss') toast.success('Dismissed')
    else if (action === 'shortlist') toast.success('Shortlisted')
    setDismissing(null)
    await load()
  }

  const uploadPackage = async (row, file) => {
    if (!file) return
    setBusy(row.id)
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
      const path = `bids/${companyId}/opps/${row.id}/${Date.now()}_${safe}`
      const { error: upErr } = await supabase.storage.from('project-documents').upload(path, file, { contentType: file.type || 'application/pdf', upsert: false })
      if (upErr) throw new Error(upErr.message)
      setBusy(null)
      await act(row, 'build', { storage_path: path, file_name: file.name, media_type: file.type || 'application/pdf' })
    } catch (e) { setBusy(null); toast.error(`Upload failed: ${e.message}`) }
  }

  const addByUrl = async () => {
    const u = addUrl.trim()
    if (!/^https?:\/\//i.test(u)) { toast.error('Paste a link that starts with http') ; return }
    setAdding(true)
    const r = await callSal('sal-ingest', { company_id: companyId, url: u })
    setAdding(false)
    if (!r.ok) { toast.error(r.data?.error || 'Sal could not read that link'); return }
    if (r.data.ignored) { toast.error(`Sal read it but found no solicitation: ${r.data.note || ''}`); return }
    toast.success(`Sal added ${r.data.opportunities?.length || 0} opportunity${r.data.opportunities?.length === 1 ? '' : 'ies'}`)
    setAddUrl('')
    await load()
  }

  const openDoc = async (d) => {
    if (d.storage_path) {
      const { data, error } = await supabase.storage.from(d.bucket || 'project-documents').createSignedUrl(d.storage_path, 600)
      if (error || !data?.signedUrl) { toast.error('Could not open the file'); return }
      window.open(data.signedUrl, '_blank', 'noopener')
    } else if (d.url) window.open(d.url, '_blank', 'noopener')
  }

  const pad = isMobile ? '16px' : '24px'
  const chip = (active) => ({ minHeight: '36px', padding: '0 12px', borderRadius: '999px', border: `1px solid ${active ? theme.accent : theme.border}`, backgroundColor: active ? theme.accent : theme.bgCard, color: active ? '#fff' : theme.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' })
  const btn = (kind) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '44px', padding: '0 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    border: kind === 'primary' ? 'none' : `1px solid ${theme.border}`, backgroundColor: kind === 'primary' ? theme.accent : theme.bgCard, color: kind === 'primary' ? '#fff' : kind === 'danger' ? '#b91c1c' : theme.text,
  })

  return (
    <div style={{ padding: pad, maxWidth: '1040px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <Radar size={18} style={{ color: theme.accent }} />
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: theme.text, margin: 0, flex: 1 }}>Bids worth a look</h3>
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', maxWidth: '100%' }}>
          {FILTERS.map((f) => <button key={f.key} onClick={() => setFilter(f.key)} style={chip(filter === f.key)}>{f.label}{counts[f.key] ? ` · ${counts[f.key]}` : ''}</button>)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) auto', gap: '8px', marginBottom: '14px' }}>
        <input value={addUrl} onChange={(e) => setAddUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addByUrl() }} placeholder="Paste a link to a solicitation and Sal reads it" style={{ minHeight: '44px', padding: '0 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, fontSize: '14px', minWidth: 0 }} />
        <button onClick={addByUrl} disabled={adding || !addUrl.trim()} style={{ ...btn('secondary'), opacity: adding || !addUrl.trim() ? 0.6 : 1 }}><Link2 size={15} /> {adding ? 'Reading…' : 'Add'}</button>
      </div>

      {loading ? (
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ padding: '20px', border: `1px dashed ${theme.border}`, borderRadius: '10px', color: theme.textSecondary, fontSize: '13px', lineHeight: 1.5 }}>
          {filter === 'open' ? (
            <>Nothing open. Alerts arrive on the Inbox tab and Sal reads them within ten minutes; SAM.gov is polled each morning. Point more portals at his address on the Sources tab, or paste a link above.</>
          ) : `Nothing ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()}.`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {visible.map((r) => {
            const cd = countdown(r.due_at, now)
            const isOpen = open === r.id
            const docs = Array.isArray(r.documents) ? r.documents : []
            const stored = docs.filter((d) => d.storage_path).length
            const reasons = Array.isArray(r.fit_reasons) ? r.fit_reasons : []
            const blockers = Array.isArray(r.blockers) ? r.blockers : []
            const value = r.estimated_value_low || r.estimated_value_high ? [fmtMoney(r.estimated_value_low), fmtMoney(r.estimated_value_high)].filter(Boolean).join(' – ') : null
            const openStatus = ['new', 'shortlisted'].includes(r.status)
            return (
              <div key={r.id} style={{ backgroundColor: theme.bgCard, border: `1px solid ${r.status === 'shortlisted' ? theme.accent : theme.border}`, borderRadius: '10px' }}>
                <button onClick={() => setOpen(isOpen ? null : r.id)} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', alignItems: 'center', gap: '12px', textAlign: 'left', padding: '12px 14px', minHeight: '64px', width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div title={reasons[0] || ''} style={{ width: '44px', height: '44px', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: `${scoreColor(r.fit_score)}18`, color: scoreColor(r.fit_score), fontWeight: 800, fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>
                    {r.fit_score == null ? '–' : Math.round(r.fit_score)}<span style={{ fontSize: '9px', fontWeight: 600, opacity: 0.8 }}>fit</span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.status === 'shortlisted' && <Star size={13} style={{ color: theme.accent, marginRight: '4px', verticalAlign: '-2px' }} />}{r.title}
                    </div>
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[r.buyer, LEVEL_LABEL[r.buyer_level], r.place?.city && r.place?.state ? `${r.place.city}, ${r.place.state}` : r.place?.state, value].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: urgencyColor[cd.urgency] }}>{cd.label}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: theme.textMuted, padding: '1px 6px', borderRadius: '999px', border: `1px solid ${theme.border}` }}>{SOURCE_LABEL[r.source_kind] || r.source_kind}</span>
                      {!openStatus && <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: theme.accent, padding: '1px 6px', borderRadius: '999px', border: `1px solid ${theme.accent}` }}>{STATUS_LABEL[r.status] || r.status}</span>}
                      {blockers.length > 0 && <span style={{ fontSize: '11px', color: '#b91c1c', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}><AlertTriangle size={11} />{blockers.length} blocker{blockers.length === 1 ? '' : 's'}</span>}
                      {docs.length > 0 && <span style={{ fontSize: '11px', color: theme.textMuted, display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Paperclip size={11} />{stored}/{docs.length}</span>}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={16} style={{ color: theme.textMuted }} /> : <ChevronDown size={16} style={{ color: theme.textMuted }} />}
                </button>

                {isOpen && (
                  <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${theme.border}`, fontSize: '13px', color: theme.textSecondary, lineHeight: 1.5 }}>
                    {r.summary && <p style={{ margin: '10px 0' }}>{r.summary}</p>}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))', gap: '4px 16px', margin: '8px 0' }}>
                      {r.solicitation_number && <div><b>Number:</b> {r.solicitation_number}{r.notice_type ? ` (${r.notice_type.toUpperCase()})` : ''}</div>}
                      {r.due_at && <div><b>Due:</b> {whenLocal(r.due_at, r.due_tz)}</div>}
                      {r.prebid_at && <div><b>Pre-bid{r.prebid_mandatory ? ' (mandatory)' : ''}:</b> {whenLocal(r.prebid_at, r.due_tz)}</div>}
                      {r.questions_due_at && <div><b>Questions due:</b> {whenLocal(r.questions_due_at, r.due_tz)}</div>}
                      {r.set_aside && <div><b>Set-aside:</b> {r.set_aside}</div>}
                      {(r.naics || []).length > 0 && <div><b>NAICS:</b> {r.naics.join(', ')}</div>}
                      {r.submit_method && r.submit_method !== 'unknown' && <div><b>Submit by:</b> {r.submit_method}</div>}
                      {r.requirements?.bond_pct != null && <div><b>Bid bond:</b> {r.requirements.bond_pct}%</div>}
                      {r.requirements?.license && <div><b>License:</b> {String(r.requirements.license)}</div>}
                    </div>
                    {reasons.length > 0 && (
                      <div style={{ margin: '8px 0' }}><b>Why {r.fit_score != null ? `${Math.round(r.fit_score)}` : 'this score'}:</b>
                        <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>{reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </div>
                    )}
                    {blockers.length > 0 && (
                      <div style={{ margin: '8px 0', color: '#b91c1c' }}><b>Blockers:</b>
                        <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>{blockers.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      </div>
                    )}
                    {r.dismissed_reason && <div style={{ margin: '8px 0', color: theme.textMuted }}>Dismissed{r.dismissed_by ? ` by ${r.dismissed_by}` : ''}: {DISMISS_REASONS.find((d) => d.key === r.dismissed_reason)?.label || r.dismissed_reason}</div>}
                    {r.build_error && <div style={{ margin: '8px 0', color: '#b91c1c', display: 'flex', gap: '6px' }}><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />Benny could not build it: {r.build_error}</div>}

                    {(docs.length > 0 || r.url) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0' }}>
                        {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ ...btn('secondary'), minHeight: '36px', textDecoration: 'none' }}><ExternalLink size={13} /> Notice</a>}
                        {docs.map((d, i) => (
                          <button key={i} onClick={() => openDoc(d)} title={d.error || ''} style={{ ...btn('secondary'), minHeight: '36px', color: d.storage_path ? theme.text : d.error ? '#b91c1c' : theme.textSecondary, maxWidth: '100%' }}>
                            <Paperclip size={13} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>{!d.storage_path && !d.error && <span style={{ fontSize: '10px', color: theme.textMuted }}>link</span>}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Decisions */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
                      {openStatus && dismissing !== r.id && (
                        <>
                          <button disabled={busy === r.id} onClick={() => act(r, 'choose')} style={btn('primary')}><Check size={15} /> Choose — make the lead, hand to Benny</button>
                          {r.status === 'new' && <button disabled={busy === r.id} onClick={() => act(r, 'shortlist')} style={btn('secondary')}><Star size={15} /> Shortlist</button>}
                          <button disabled={busy === r.id} onClick={() => setDismissing(r.id)} style={btn('danger')}><X size={15} /> Dismiss</button>
                        </>
                      )}
                      {openStatus && dismissing === r.id && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: theme.textMuted }}>Why?</span>
                          {DISMISS_REASONS.map((d) => <button key={d.key} disabled={busy === r.id} onClick={() => act(r, 'dismiss', { reason: d.key })} style={{ ...btn('secondary'), minHeight: '36px' }}>{d.label}</button>)}
                          <button onClick={() => setDismissing(null)} style={{ ...btn('secondary'), minHeight: '36px' }}>Cancel</button>
                        </div>
                      )}
                      {['dismissed', 'expired'].includes(r.status) && <button disabled={busy === r.id} onClick={() => act(r, 'reopen')} style={btn('secondary')}><RotateCcw size={15} /> Reopen</button>}
                      {r.status === 'chosen' && !r.quote_id && (
                        <label style={{ ...btn('primary'), cursor: busy === r.id ? 'wait' : 'pointer' }}>
                          <Upload size={15} /> {r.build_error ? 'Try Benny again with a package' : 'Drop the bid package — Benny builds it'}
                          <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" style={{ display: 'none' }} disabled={busy === r.id} onChange={(e) => uploadPackage(r, e.target.files?.[0])} />
                        </label>
                      )}
                      {r.status === 'building' && <span style={{ fontSize: '13px', color: theme.accent, fontWeight: 600 }}>Benny is building the bid… (a plan takeoff takes a few minutes)</span>}
                      {r.status === 'chosen' && !r.quote_id && stored > 0 && <button disabled={busy === r.id} onClick={() => act(r, 'build')} style={btn('secondary')}><ClipboardList size={15} /> Send the stored package to Benny</button>}
                      {r.quote_id && <button onClick={() => navigate(`/estimates/${r.quote_id}`)} style={btn('primary')}><ClipboardList size={15} /> Open the bid Benny built</button>}
                      {r.lead_id && <button onClick={() => navigate(`/leads/${r.lead_id}`)} style={btn('secondary')}>Open the lead</button>}
                      {busy === r.id && <span style={{ fontSize: '12px', color: theme.textMuted }}>Working…</span>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '24px', padding: '12px 14px', borderRadius: '10px', backgroundColor: theme.accentBg, fontSize: '12px', color: theme.textSecondary, lineHeight: 1.5 }}>
        <Lightbulb size={16} style={{ color: theme.accent, flexShrink: 0, marginTop: '1px' }} />
        <div>
          The fit score is Sal's read of the notice against your Profile: trade, area, size, certifications, deadline. He never sets a price and never chooses. Choose makes the lead, puts the deadlines on the calendar, and drops the package on Benny; a Manager or above clicks it. Every dismissal reason teaches Sal what to score lower next time.
        </div>
      </div>
    </div>
  )
}
