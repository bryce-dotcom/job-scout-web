import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { MAX_TOUCHES, LEAD_STATUSES, TOUCH_KINDS, TEXT_MAX, newTouch, audienceLabel, campaignProblem, campaignNumbers, touchesSummary, bookedCount, MERGE_FIELDS } from '../../lib/campaigns'
import { Send, Plus, Trash2, Sparkles, Pause, Play, Pencil, X, Loader2, Users, Mail, Reply, Ban, MessageSquare, Phone, CalendarCheck } from 'lucide-react'

// Campaigns — ONE object: who, what, where results land. Three things on the
// screen: the list, a card per campaign, and one sheet to make or edit one.
// No sequences, no lists, no plays. If it needs a tutorial it is wrong.
//
// Touches: an email (subject + note), a text (only to people who said yes to
// texts; the server checks consent on every send), or a call (nothing is
// sent — on its day the lead becomes a Callback card with the script on it).

const MKT = '#e11d48'
const MKT_BG = 'rgba(225,29,72,0.10)'
const STATUS = {
  draft:   { label: 'Draft',   color: '#7d8a7f' },
  running: { label: 'Running', color: '#22c55e' },
  paused:  { label: 'Paused',  color: '#a16207' },
  done:    { label: 'Done',    color: '#3b82f6' },
}
const KIND_ICON = { email: Mail, text: MessageSquare, call: Phone }
const input = (theme) => ({ width: '100%', boxSizing: 'border-box', padding: '10px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${theme.border}`, background: '#fff', color: theme.text, fontSize: 14, outline: 'none' })
const primary = (color = MKT) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', minHeight: 44, borderRadius: 8, border: 'none', background: color, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' })
const ghost = (theme) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bgCard, color: theme.text, fontSize: 14, fontWeight: 500, cursor: 'pointer' })
const label = (theme) => ({ fontSize: 12, fontWeight: 700, color: theme.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 })
const pill = (color) => ({ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color, background: `${color}22` })
const chip = (theme, on) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', minHeight: 32, borderRadius: 999, border: `1px solid ${on ? MKT : theme.border}`, background: on ? MKT_BG : theme.bgCard, color: on ? MKT : theme.textSecondary, fontSize: 12, fontWeight: on ? 700 : 500, cursor: 'pointer' })

export default function CampaignsTab({ theme, isMobile, companyId, brands = [], brand = '', invoke, preset = null, onPresetUsed }) {
  const [campaigns, setCampaigns] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // the campaign in the sheet, or null

  const load = useCallback(async () => {
    const [{ data: cs }, { data: ms }] = await Promise.all([
      supabase.from('marketing_campaigns').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(100),
      supabase.from('campaign_members').select('campaign_id, state, touch_index, replied_at').eq('company_id', companyId).limit(20000),
    ])
    setCampaigns(cs || [])
    setMembers(ms || [])
    setLoading(false)
  }, [companyId])
  useEffect(() => { load() }, [load])

  // "Add to a campaign" from the Find tab lands here with the people already picked.
  useEffect(() => {
    if (!preset) return
    setEditing({ company_id: companyId, brand: brand || null, name: '', audience: preset, touches: [newTouch([])], stop_on_reply: true, status: 'draft' })
    onPresetUsed?.()
  }, [preset]) // eslint-disable-line react-hooks/exhaustive-deps

  const membersOf = useMemo(() => {
    const m = {}
    for (const r of members) (m[r.campaign_id] ||= []).push(r)
    return m
  }, [members])
  const visible = brands.length > 1 ? campaigns.filter((c) => (c.brand || '') === (brand || '')) : campaigns

  const act = async (c, action) => {
    const r = await invoke('marketing-campaign', { action, campaign_id: c.id })
    if (!r.ok) { toast.error(r.error || 'Could not do that'); return }
    if (action === 'start') toast.success(`Going out to ${r.people} ${r.people === 1 ? 'person' : 'people'}.${r.skipped?.suppressed ? ` ${r.skipped.suppressed} unsubscribed, skipped.` : ''}`)
    if (action === 'pause') toast.success('Paused. Nothing more goes out until you resume.')
    if (action === 'resume') toast.success('Running again.')
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: theme.textMuted }}>
          Who it goes to, what it says, and replies land on the Lead Setter board. Emails, texts to people who said yes, and call cards for the setters.
        </div>
        <button type="button" style={primary()} onClick={() => setEditing({ company_id: companyId, brand: brand || null, name: '', audience: {}, touches: [newTouch([])], stop_on_reply: true, status: 'draft' })}>
          <Plus size={16} /> New campaign
        </button>
      </div>

      {loading ? null : !visible.length ? (
        <div style={{ textAlign: 'center', padding: '40px 16px', background: theme.bgCard, border: `1px dashed ${theme.border}`, borderRadius: 12 }}>
          <Send size={32} color={theme.textMuted} />
          <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, marginTop: 10 }}>No campaigns yet</div>
          <div style={{ fontSize: 13, color: theme.textMuted, marginTop: 4, maxWidth: 420, margin: '4px auto 0' }}>Find people on the Find tab and press Add to a campaign, or start one here from your leads or past customers.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {visible.map((c) => <CampaignCard key={c.id} theme={theme} c={c} members={membersOf[c.id] || []} onEdit={() => setEditing(c)} onAct={(a) => act(c, a)} />)}
        </div>
      )}

      {editing && (
        <CampaignSheet theme={theme} isMobile={isMobile} companyId={companyId} brands={brands} invoke={invoke} initial={editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

function CampaignCard({ theme, c, members, onEdit, onAct }) {
  const n = campaignNumbers(members)
  const st = STATUS[c.status] || STATUS.draft
  const touches = Array.isArray(c.touches) ? c.touches : []
  return (
    <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || 'Untitled campaign'}</div>
        <span style={pill(st.color)}>{st.label}</span>
      </div>
      <div style={{ fontSize: 13, color: theme.textSecondary, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span>{audienceLabel(c.audience)} ·</span>
        <span style={{ display: 'inline-flex', gap: 3 }}>{touches.map((t, i) => { const I = KIND_ICON[t.kind] || Mail; return <I key={i} size={13} /> })}</span>
        <span>{touchesSummary(touches)}</span>
      </div>
      {c.status !== 'draft' && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: theme.text }}>
          <span title="People in it"><Users size={13} style={{ verticalAlign: -2 }} /> {n.people}</span>
          <span title="Reached at least once"><Send size={13} style={{ verticalAlign: -2 }} /> {n.sent}</span>
          <span title="Replied" style={{ color: n.replied ? '#16a34a' : theme.text }}><Reply size={13} style={{ verticalAlign: -2 }} /> {n.replied}</span>
          <span title="Unsubscribed or bounced" style={{ color: theme.textMuted }}><Ban size={13} style={{ verticalAlign: -2 }} /> {n.unsubscribed + n.bounced}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {c.status === 'draft' && <button type="button" style={primary()} onClick={() => onAct('start')}><Play size={15} /> Start</button>}
        {c.status === 'running' && <button type="button" style={ghost(theme)} onClick={() => onAct('pause')}><Pause size={15} /> Pause</button>}
        {c.status === 'paused' && <button type="button" style={primary()} onClick={() => onAct('resume')}><Play size={15} /> Resume</button>}
        <button type="button" style={ghost(theme)} onClick={onEdit}><Pencil size={15} /> {c.status === 'draft' ? 'Edit' : 'Open'}</button>
      </div>
    </div>
  )
}

function CampaignSheet({ theme, isMobile, companyId, brands, invoke, initial, onClose, onSaved }) {
  const [c, setC] = useState(() => ({ ...initial, touches: (Array.isArray(initial.touches) && initial.touches.length ? initial.touches : [newTouch([])]).map((t) => ({ kind: 'email', ...t })) }))
  const [saving, setSaving] = useState(false)
  const [writing, setWriting] = useState(null) // touch index being written
  const [preview, setPreview] = useState(null) // {count, textable, sample, skipped}
  const [testing, setTesting] = useState(null)
  const started = c.status && c.status !== 'draft'
  const set = (patch) => setC((x) => ({ ...x, ...patch }))
  const setTouch = (i, patch) => setC((x) => ({ ...x, touches: x.touches.map((t, j) => (j === i ? { ...t, ...patch } : t)) }))
  const previewTimer = useRef(null)
  const kinds = useMemo(() => [...new Set(c.touches.map((t) => t.kind || 'email'))], [c.touches])
  const hasText = kinds.includes('text')

  // The audience, counted as it would be reached. Debounced: the picker changes fast.
  useEffect(() => {
    if (!c.audience?.kind) { setPreview(null); return }
    clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(async () => {
      const r = await invoke('marketing-campaign', { action: 'preview_audience', audience: c.audience, kinds })
      if (r.ok) setPreview(r)
    }, 400)
    return () => clearTimeout(previewTimer.current)
  }, [JSON.stringify(c.audience), kinds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const row = { company_id: companyId, brand: c.brand || null, name: c.name.trim(), audience: c.audience, touches: c.touches, stop_on_reply: c.stop_on_reply !== false }
    setSaving(true)
    let saved
    if (c.id) {
      const { data, error } = await supabase.from('marketing_campaigns').update(row).eq('id', c.id).eq('company_id', companyId).select().maybeSingle()
      if (error) { toast.error(error.message); setSaving(false); return null }
      saved = data
    } else {
      const { data, error } = await supabase.from('marketing_campaigns').insert({ ...row, status: 'draft' }).select().maybeSingle()
      if (error) { toast.error(error.message); setSaving(false); return null }
      saved = data
    }
    setSaving(false)
    return saved
  }
  const saveDraft = async () => {
    if (!c.name.trim()) { toast.error('Give the campaign a name.'); return }
    const s = await save()
    if (s) { toast.success('Saved.'); onSaved() }
  }
  const start = async () => {
    const problem = campaignProblem(c)
    if (problem) { toast.error(problem); return }
    const s = await save()
    if (!s) return
    const r = await invoke('marketing-campaign', { action: 'start', campaign_id: s.id })
    if (!r.ok) { toast.error(r.error || 'Could not start'); return }
    toast.success(`Going out to ${r.people} ${r.people === 1 ? 'person' : 'people'}. The first touch goes within 15 minutes, 8am to 7pm.`)
    onSaved()
  }
  const write = async (i) => {
    setWriting(i)
    const r = await invoke('marketing-campaign', { action: 'write', campaign: { ...c, about: c.about || '' }, index: i })
    setWriting(null)
    if (!r.ok) { toast.error(r.error || 'Could not write it'); return }
    setTouch(i, { subject: r.subject || '', body: r.body })
  }
  const test = async (i) => {
    const t = c.touches[i]
    if (!t?.body?.trim() || (t.kind === 'email' && !t.subject?.trim())) { toast.error('Write it first.'); return }
    setTesting(i)
    const r = await invoke('marketing-campaign', { action: 'test', campaign: { ...c, id: c.id || 0 }, index: i })
    setTesting(null)
    if (!r.ok) { toast.error(r.error || 'Could not send the test'); return }
    toast.success(`Sent to ${r.to}.`)
  }

  const aud = c.audience || {}
  const pickAud = (next) => set({ audience: next })
  const Choice = ({ on, onClick, title, body }) => (
    <button type="button" onClick={onClick} style={{ textAlign: 'left', padding: 12, borderRadius: 10, border: `1px solid ${on ? MKT : theme.border}`, background: on ? MKT_BG : theme.bgCard, cursor: 'pointer', color: theme.text, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{body}</div>
    </button>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 120, display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }} onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div role="dialog" aria-label="Campaign" style={{ width: isMobile ? '100%' : 720, maxWidth: '100%', maxHeight: isMobile ? '100dvh' : '92vh', background: theme.bg, borderRadius: isMobile ? 0 : 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: theme.bgCard, borderBottom: `1px solid ${theme.border}` }}>
          <Send size={18} color={MKT} />
          <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: theme.text }}>{c.id ? (started ? 'Campaign' : 'Edit campaign') : 'New campaign'}</div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: 8 }}><X size={20} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={label(theme)}>Name</div>
            <input style={input(theme)} value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder="Spring roof checks, Utah County" disabled={started} />
          </div>
          {brands.length > 1 && (
            <div>
              <div style={label(theme)}>From</div>
              <select style={input(theme)} value={c.brand || ''} onChange={(e) => set({ brand: e.target.value || null })} disabled={started}>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <div style={label(theme)}>Who</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))', gap: 8 }}>
              {aud.kind === 'leads' && <Choice on title={`${(aud.ids || []).length} ${(aud.ids || []).length === 1 ? 'person' : 'people'} you picked`} body="From the Find tab." onClick={() => {}} />}
              <Choice on={aud.kind === 'prospects'} onClick={() => !started && pickAud({ kind: 'prospects' })} title="Prospects" body="Businesses Prospect Scout found that nobody has reached yet." />
              <Choice on={aud.kind === 'lead_status'} onClick={() => !started && pickAud({ kind: 'lead_status', status: aud.status || 'New' })} title="Leads by stage" body="Everyone on the board at one stage." />
              <Choice on={aud.kind === 'customers'} onClick={() => !started && pickAud({ kind: 'customers', months: aud.months || 0 })} title="Past customers" body="People who said yes to marketing." />
            </div>
            {aud.kind === 'lead_status' && (
              <select style={{ ...input(theme), marginTop: 8 }} value={aud.status || 'New'} onChange={(e) => pickAud({ kind: 'lead_status', status: e.target.value })} disabled={started}>
                {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {aud.kind === 'customers' && (
              <select style={{ ...input(theme), marginTop: 8 }} value={aud.months || 0} onChange={(e) => pickAud({ kind: 'customers', months: Number(e.target.value) })} disabled={started}>
                <option value={0}>Everyone who opted in</option>
                <option value={6}>No job in the last 6 months</option>
                <option value={12}>No job in the last 12 months</option>
                <option value={24}>No job in the last 2 years</option>
              </select>
            )}
            {preview && (
              <div style={{ fontSize: 13, color: preview.count ? theme.textSecondary : '#b45309', marginTop: 8 }}>
                {preview.count ? <>Reaches <b>{preview.count}</b> {preview.count === 1 ? 'person' : 'people'}{preview.sample?.length ? ` — ${preview.sample.slice(0, 3).join(', ')}${preview.count > 3 ? '…' : ''}` : ''}.</> : (hasText && kinds.length === 1 ? 'Nobody here has said yes to texts yet, so a text-only campaign reaches no one. Add an email or a call, or tick Texting OK on the leads who agreed.' : 'Nobody here can be reached by these touches.')}
                {hasText && preview.count ? <> <b>{preview.textable || 0}</b> {preview.textable === 1 ? 'has' : 'have'} said yes to texts; the rest skip the text touch.</> : ''}
                {preview.skipped?.no_email ? ` ${preview.skipped.no_email} have no email.` : ''}{preview.skipped?.suppressed ? ` ${preview.skipped.suppressed} unsubscribed.` : ''}
              </div>
            )}
          </div>

          <div>
            <div style={label(theme)}>What to say (optional, for the writer)</div>
            <input style={input(theme)} value={c.about || ''} onChange={(e) => set({ about: e.target.value })} placeholder="Free roof check before the snow; we're in their area next month" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {c.touches.map((t, i) => {
              const kind = t.kind || 'email'
              const Icon = KIND_ICON[kind]
              return (
                <div key={i} style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Icon size={15} color={MKT} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>Touch {i + 1}</span>
                    <span style={{ fontSize: 13, color: theme.textMuted }}>on day</span>
                    <input type="number" min={i === 0 ? 0 : Number(c.touches[i - 1].day) + 1} max={60} value={t.day} onChange={(e) => setTouch(i, { day: Number(e.target.value) })} disabled={started || i === 0}
                      style={{ ...input(theme), width: 72, minHeight: 36, padding: '6px 8px' }} />
                    <span style={{ flex: 1 }} />
                    <button type="button" style={{ ...ghost(theme), minHeight: 36, padding: '6px 10px', fontSize: 13 }} onClick={() => write(i)} disabled={writing != null}>
                      {writing === i ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {t.subject || t.body ? 'Rewrite' : 'Write it for me'}
                    </button>
                    {c.touches.length > 1 && !started && <button type="button" aria-label="Remove" style={{ ...ghost(theme), minHeight: 36, padding: '6px 8px' }} onClick={() => set({ touches: c.touches.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}
                  </div>
                  {!started && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {TOUCH_KINDS.map((k) => <button key={k.id} type="button" title={k.body} style={chip(theme, kind === k.id)} onClick={() => setTouch(i, { kind: k.id })}>{k.label}</button>)}
                      <span style={{ fontSize: 12, color: theme.textMuted, alignSelf: 'center' }}>{TOUCH_KINDS.find((k) => k.id === kind)?.body}</span>
                    </div>
                  )}
                  {kind === 'email' && <input style={input(theme)} value={t.subject || ''} onChange={(e) => setTouch(i, { subject: e.target.value })} placeholder="Subject" />}
                  <textarea style={{ ...input(theme), minHeight: kind === 'email' ? 120 : 88, resize: 'vertical', fontFamily: 'inherit' }} value={t.body || ''}
                    maxLength={kind === 'text' ? TEXT_MAX : undefined}
                    onChange={(e) => setTouch(i, { body: e.target.value })}
                    placeholder={kind === 'email' ? 'Hi {{first_name}},\n\n…' : kind === 'text' ? 'Hi {{first_name}}, this is {{our_company}}. …' : 'Who is calling and why · one question · the offer · the ask'} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: theme.textMuted }}>
                    <span>
                      {kind === 'email' && <>Fields: {MERGE_FIELDS.join(' ')}. Your signature and an unsubscribe line are added.</>}
                      {kind === 'text' && <>{(t.body || '').length}/{TEXT_MAX}. "Reply STOP to opt out" is added. Goes only to people who said yes to texts.</>}
                      {kind === 'call' && <>On day {t.day} the lead becomes a Callback card on the Lead Setter board with this script; the setter is notified.</>}
                    </span>
                    <span style={{ flex: 1 }} />
                    {kind !== 'call' && <button type="button" style={{ ...ghost(theme), minHeight: 32, padding: '4px 10px', fontSize: 12 }} onClick={() => test(i)} disabled={testing != null}>{testing === i ? 'Sending…' : 'Send me a test'}</button>}
                  </div>
                </div>
              )
            })}
            {c.touches.length < MAX_TOUCHES && !started && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={ghost(theme)} onClick={() => set({ touches: [...c.touches, newTouch(c.touches, 'email')] })}><Plus size={15} /> Email</button>
                <button type="button" style={ghost(theme)} onClick={() => set({ touches: [...c.touches, newTouch(c.touches, 'text')] })}><Plus size={15} /> Text</button>
                <button type="button" style={ghost(theme)} onClick={() => set({ touches: [...c.touches, newTouch(c.touches, 'call')] })}><Plus size={15} /> Call</button>
              </div>
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: theme.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={c.stop_on_reply !== false} onChange={(e) => set({ stop_on_reply: e.target.checked })} style={{ width: 18, height: 18 }} />
            Stop when they reply <span style={{ fontSize: 12, color: theme.textMuted }}>— a reply lands on the Lead Setter board either way.</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: theme.bgCard, borderTop: `1px solid ${theme.border}`, flexWrap: 'wrap' }}>
          <button type="button" style={ghost(theme)} onClick={onClose} disabled={saving}>Cancel</button>
          <span style={{ flex: 1 }} />
          <button type="button" style={ghost(theme)} onClick={saveDraft} disabled={saving}>{started ? 'Save' : 'Save draft'}</button>
          {!started && <button type="button" style={primary()} onClick={start} disabled={saving}><Play size={15} /> Start</button>}
        </div>
      </div>
    </div>
  )
}

/**
 * The campaign numbers for the Performance tab: per campaign, how many people,
 * how many reached, how many replied, how many booked (the lead has an
 * appointment or moved past the board). Reads what the board already knows;
 * nothing here is a new source of truth.
 */
export function CampaignPerformance({ theme, isMobile, companyId, brands = [], brand = '' }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: cs } = await supabase.from('marketing_campaigns').select('id, name, brand, status, started_at, touches').eq('company_id', companyId).neq('status', 'draft').order('created_at', { ascending: false }).limit(50)
      if (!cs?.length) { if (live) setRows([]); return }
      const { data: ms } = await supabase.from('campaign_members').select('campaign_id, lead_id, customer_id, state, touch_index, replied_at').eq('company_id', companyId).in('campaign_id', cs.map((c) => c.id)).limit(20000)
      const leadIds = [...new Set((ms || []).map((m) => m.lead_id).filter(Boolean))]
      const leadsById = {}
      for (let i = 0; i < leadIds.length; i += 500) {
        const { data: ls } = await supabase.from('leads').select('id, status, appointment_id, converted_at').eq('company_id', companyId).in('id', leadIds.slice(i, i + 500))
        for (const l of ls || []) leadsById[l.id] = l
      }
      if (!live) return
      setRows(cs.map((c) => {
        const mine = (ms || []).filter((m) => m.campaign_id === c.id)
        return { c, n: campaignNumbers(mine), booked: bookedCount(mine, leadsById) }
      }))
    })()
    return () => { live = false }
  }, [companyId])
  const visible = (rows || []).filter((r) => brands.length <= 1 || (r.c.brand || '') === (brand || ''))
  if (!rows || !visible.length) return null
  return (
    <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>Campaigns</div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr) repeat(4, 56px)' : 'minmax(0,1fr) repeat(4, 90px)', gap: 6, fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>
        <span /><span style={{ textAlign: 'right' }}><Users size={12} style={{ verticalAlign: -2 }} /> People</span><span style={{ textAlign: 'right' }}><Send size={12} style={{ verticalAlign: -2 }} /> Reached</span><span style={{ textAlign: 'right' }}><Reply size={12} style={{ verticalAlign: -2 }} /> Replied</span><span style={{ textAlign: 'right' }}><CalendarCheck size={12} style={{ verticalAlign: -2 }} /> Booked</span>
      </div>
      {visible.map(({ c, n, booked }) => (
        <div key={c.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr) repeat(4, 56px)' : 'minmax(0,1fr) repeat(4, 90px)', gap: 6, fontSize: 13, color: theme.text, alignItems: 'center' }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || 'Untitled'} <span style={{ ...pill((STATUS[c.status] || STATUS.draft).color), marginLeft: 6 }}>{(STATUS[c.status] || STATUS.draft).label}</span></span>
          <span style={{ textAlign: 'right' }}>{n.people}</span>
          <span style={{ textAlign: 'right' }}>{n.sent}</span>
          <span style={{ textAlign: 'right', color: n.replied ? '#16a34a' : theme.text }}>{n.replied}</span>
          <span style={{ textAlign: 'right', fontWeight: booked ? 700 : 400 }}>{booked}</span>
        </div>
      ))}
    </div>
  )
}
