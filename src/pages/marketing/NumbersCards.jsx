import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { sourceLabel } from '../../lib/utm'
import { Globe, Star, Copy, Check, Search, RefreshCw, ExternalLink, MessageSquareHeart } from 'lucide-react'

// The numbers the Marketing page did not have: the company's own website,
// counted by a snippet they paste once, and the Google listing's rating and
// review count. Social numbers come from the publisher; campaign numbers
// from the board. One tab shows them side by side.

const MKT = '#e11d48'
const input = (theme) => ({ width: '100%', boxSizing: 'border-box', padding: '10px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${theme.border}`, background: '#fff', color: theme.text, fontSize: 14, outline: 'none' })
const ghost = (theme) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bgCard, color: theme.text, fontSize: 14, fontWeight: 500, cursor: 'pointer' })
const primary = (color = MKT) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', minHeight: 44, borderRadius: 8, border: 'none', background: color, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' })
const card = (theme) => ({ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 })
const SITE_KEY = 'marketing_site_key'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

const monthStart = (offset = 0) => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() + offset); return d }
const randomKey = () => { const b = new Uint8Array(12); crypto.getRandomValues(b); return [...b].map((x) => (x % 36).toString(36)).join('') }

/** Visits this month and last, plus what sent them. One read of site_hits. */
export function useSiteNumbers(companyId) {
  const [state, setState] = useState({ loading: true, key: null, thisMonth: 0, lastMonth: 0, visitors: 0, firstAt: null, sources: [] })
  const load = useCallback(async () => {
    const since = monthStart(-1).toISOString()
    const [{ data: keyRows }, { data: hits }, { data: first }] = await Promise.all([
      supabase.from('settings').select('value').eq('company_id', companyId).eq('key', SITE_KEY).limit(1),
      supabase.from('site_hits').select('at, event, referrer_host, utm_source, utm_medium, utm_campaign, visitor').eq('company_id', companyId).gte('at', since).order('at', { ascending: false }).limit(20000),
      supabase.from('site_hits').select('at').eq('company_id', companyId).order('at', { ascending: true }).limit(1),
    ])
    const cut = monthStart(0).getTime()
    let thisMonth = 0, lastMonth = 0
    const visitors = new Set()
    const bySource = {}
    for (const h of hits || []) {
      const t = new Date(h.at).getTime()
      if (t >= cut) { thisMonth += 1; if (h.visitor) visitors.add(h.visitor) } else lastMonth += 1
      if (t >= cut) {
        const s = sourceLabel(h)
        const k = `${s.kind}:${s.id ?? s.label}`
        bySource[k] = bySource[k] || { ...s, visits: 0, quotes: 0 }
        bySource[k].visits += 1
        if (h.event !== 'view') bySource[k].quotes += 1
      }
    }
    setState({ loading: false, key: keyRows?.[0]?.value || null, thisMonth, lastMonth, visitors: visitors.size, firstAt: first?.[0]?.at || null, sources: Object.values(bySource).sort((a, b) => b.visits - a.visits) })
  }, [companyId])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

/** Setup: the snippet to paste, and whether visits are arriving. */
export function WebsiteCard({ theme, companyId, isManager, website }) {
  const site = useSiteNumbers(companyId)
  const [copied, setCopied] = useState(false)
  const makeKey = async () => {
    const key = randomKey()
    const { error } = await supabase.from('settings').insert({ company_id: companyId, key: SITE_KEY, value: key })
    if (error) { toast.error(error.message); return }
    site.reload()
  }
  const tag = site.key ? `<script src="${SUPABASE_URL}/functions/v1/marketing-hit?js=${site.key}" async></script>` : ''
  const copy = async () => { try { await navigator.clipboard.writeText(tag); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { toast.error('Copy it by hand.') } }
  return (
    <div style={card(theme)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Globe size={16} color={MKT} />
        <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, flex: 1 }}>Your website{website ? ` · ${website.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : ''}</div>
        {site.firstAt && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>Counting since {new Date(site.firstAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
      </div>
      <div style={{ fontSize: 12, color: theme.textMuted }}>Paste this one line into your site, before the closing &lt;/body&gt; tag (or in your site builder's "custom code" box). Visits, where they came from, and which post or campaign sent them show on the Numbers tab. No cookies, nothing personal.</div>
      {site.key ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <code style={{ flex: 1, minWidth: 240, fontSize: 12, padding: '10px 12px', background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8, overflowX: 'auto', whiteSpace: 'nowrap', color: theme.text }}>{tag}</code>
          <button type="button" style={ghost(theme)} onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}</button>
        </div>
      ) : isManager ? (
        <button type="button" style={{ ...primary(), alignSelf: 'flex-start' }} onClick={makeKey} disabled={site.loading}>Make my snippet</button>
      ) : <div style={{ fontSize: 13, color: theme.textMuted }}>A Manager or above makes the snippet.</div>}
      {site.key && !site.firstAt && !site.loading && <div style={{ fontSize: 12, color: '#b45309' }}>No visits yet. Once the line is on your site, the first visit shows here within a minute.</div>}
    </div>
  )
}

/** Setup: the Google listing — find it, set it, see the rating. */
export function GoogleListingCard({ theme, companyId, isManager, invoke }) {
  const [status, setStatus] = useState(null)
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { const r = await invoke('marketing-google', { action: 'status' }); setStatus(r) }, [invoke])
  useEffect(() => { load() }, [load])
  const find = async () => {
    setBusy(true)
    const r = await invoke('marketing-google', { action: 'find', query: query.trim() || undefined })
    setBusy(false)
    if (!r.ok) { toast.error(r.error || 'Could not search'); return }
    if (!query) setQuery(r.query || '')
    setCandidates(r.candidates || [])
    if (!r.candidates?.length) toast.error('Nothing matched. Try the name and the town.')
  }
  const pick = async (c) => {
    setBusy(true)
    const r = await invoke('marketing-google', { action: 'set', place_id: c.place_id })
    setBusy(false)
    if (!r.ok) { toast.error(r.error || 'Could not save'); return }
    toast.success(`Listing set: ${c.name}`)
    setCandidates(null)
    load()
  }
  const m = status?.latest?.metrics
  return (
    <div style={card(theme)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Star size={16} color={MKT} />
        <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, flex: 1 }}>Google listing</div>
        {status?.configured && m?.maps_url && <a href={m.maps_url} target="_blank" rel="noreferrer" style={{ ...ghost(theme), minHeight: 32, padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}><ExternalLink size={13} /> Open</a>}
      </div>
      {status?.configured && m ? (
        <div style={{ fontSize: 13, color: theme.text }}>
          <b>{m.name || 'Your listing'}</b> · {m.rating != null ? `${m.rating} ★` : 'no rating yet'} · {m.reviews ?? 0} {m.reviews === 1 ? 'review' : 'reviews'}
          {status.before?.metrics && m.reviews != null && status.before.metrics.reviews != null && m.reviews !== status.before.metrics.reviews && (
            <span style={{ color: m.reviews > status.before.metrics.reviews ? '#16a34a' : theme.textMuted }}> ({m.reviews > status.before.metrics.reviews ? '+' : ''}{m.reviews - status.before.metrics.reviews} since {new Date(status.before.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})</span>
          )}
        </div>
      ) : status && !status.configured ? (
        <div style={{ fontSize: 12, color: theme.textMuted }}>Not linked yet. Find it once and the rating and review count follow every night.</div>
      ) : null}
      {isManager && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...input(theme), flex: 1, minWidth: 200 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Business name and town (blank = what Settings says)" />
          <button type="button" style={ghost(theme)} onClick={find} disabled={busy}>{busy ? <RefreshCw size={15} className="spin" /> : <Search size={15} />} {status?.configured ? 'Change listing' : 'Find my listing'}</button>
        </div>
      )}
      {candidates && candidates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {candidates.map((c) => (
            <button key={c.place_id} type="button" onClick={() => pick(c)} disabled={busy} style={{ textAlign: 'left', padding: 10, borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, cursor: 'pointer', color: theme.text }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{c.name} {c.rating != null && <span style={{ fontWeight: 400, color: theme.textMuted }}>· {c.rating} ★ · {c.reviews ?? 0} reviews</span>}</div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>{c.address}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Numbers tab: Website and Google blocks, and the list of what sent people this month. */
export function NumbersBlocks({ theme, isMobile, companyId, invoke, postsById = {} }) {
  const site = useSiteNumbers(companyId)
  const [google, setGoogle] = useState(null)
  const [campaignsById, setCampaignsById] = useState({})
  useEffect(() => { let live = true; invoke('marketing-google', { action: 'status' }).then((r) => { if (live) setGoogle(r) }); return () => { live = false } }, [invoke])
  useEffect(() => {
    let live = true
    supabase.from('marketing_campaigns').select('id, name').eq('company_id', companyId).limit(200).then(({ data }) => { if (live) setCampaignsById(Object.fromEntries((data || []).map((c) => [c.id, c]))) })
    return () => { live = false }
  }, [companyId])
  const g = google?.latest?.metrics
  const delta = site.lastMonth ? Math.round(((site.thisMonth - site.lastMonth) / site.lastMonth) * 100) : null
  const Block = ({ label, value, sub, tone }) => (
    <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '10px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: theme.text }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: tone || theme.textMuted }}>{sub}</div>}
    </div>
  )
  const named = (s) => {
    if (s.kind === 'campaign') return campaignsById[s.id]?.name ? `Campaign · ${campaignsById[s.id].name}` : s.label
    if (s.kind === 'post') { const p = postsById[s.id]; return p?.caption ? `Post · ${p.caption.slice(0, 50)}${p.caption.length > 50 ? '…' : ''}` : s.label }
    return s.label
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        <Block label="Website · this month" value={site.key ? site.thisMonth.toLocaleString() : '—'}
          sub={!site.key ? 'Add the snippet on the Setup tab' : delta == null ? `${site.visitors} ${site.visitors === 1 ? 'visitor' : 'visitors'}` : `${delta >= 0 ? '+' : ''}${delta}% vs last month · ${site.visitors} visitors`}
          tone={delta == null ? undefined : delta >= 0 ? '#16a34a' : '#b45309'} />
        <Block label="Google listing" value={google?.configured && g ? `${g.rating ?? '—'} ★` : '—'}
          sub={google?.configured && g ? `${g.reviews ?? 0} reviews${google.before?.metrics?.reviews != null && g.reviews != null && g.reviews !== google.before.metrics.reviews ? ` · ${g.reviews > google.before.metrics.reviews ? '+' : ''}${g.reviews - google.before.metrics.reviews} this month` : ''}` : google && !google.configured ? 'Link your listing on the Setup tab' : ''}
          tone={google?.before?.metrics?.reviews != null && g?.reviews > google.before.metrics.reviews ? '#16a34a' : undefined} />
      </div>
      {site.key && site.sources.length > 0 && (
        <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>What sent people to your site this month</div>
          {site.sources.slice(0, 10).map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: theme.text }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{named(s)}</span>
              <span style={{ fontWeight: 700 }}>{s.visits}</span>
              <span style={{ fontSize: 12, color: theme.textMuted, width: 70, textAlign: 'right' }}>{s.quotes ? `${s.quotes} ${s.quotes === 1 ? 'form' : 'forms'}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const REVIEW_KEY = 'marketing_review_ask'
const REVIEW_DEFAULTS = {
  subject: 'How did we do, {{first_name}}?',
  text: 'Hi {{first_name}}, thanks for having {{our_company}} out. If we did right by you, a quick Google review helps a small company more than you would think. It takes a minute:',
  delay_hours: 3,
}
const parseSetting = (v) => { if (v == null) return null; if (typeof v === 'object') return v; try { return JSON.parse(v) } catch { return null } }

/**
 * Setup: ask every finished job's customer for a review. One switch, the
 * wording, and when. The campaign tick sends it — a text if the customer
 * said yes to texts, else an email — once per job, never twice in 90 days
 * to the same customer, with the company's review link.
 */
export function ReviewAskCard({ theme, companyId, isManager, invoke, reviewLink }) {
  const [rowId, setRowId] = useState(null)
  const [cfg, setCfg] = useState({ enabled: false, ...REVIEW_DEFAULTS })
  const [saved, setSaved] = useState(true)
  const [asks, setAsks] = useState(null)
  const [testing, setTesting] = useState(false)
  const load = useCallback(async () => {
    const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0)
    const [{ data: rows }, { count }] = await Promise.all([
      supabase.from('settings').select('id, value').eq('company_id', companyId).eq('key', REVIEW_KEY).limit(1),
      supabase.from('review_asks').select('id', { count: 'exact', head: true }).eq('company_id', companyId).not('sent_at', 'is', null).gte('sent_at', m0.toISOString()),
    ])
    const r = rows?.[0]
    if (r) { setRowId(r.id); setCfg({ enabled: false, ...REVIEW_DEFAULTS, ...(parseSetting(r.value) || {}) }) }
    setAsks(count || 0)
  }, [companyId])
  useEffect(() => { load() }, [load])
  const set = (patch) => { setCfg((c) => ({ ...c, ...patch })); setSaved(false) }
  const save = async (next = cfg) => {
    const value = JSON.stringify(next)
    const { error } = rowId
      ? await supabase.from('settings').update({ value }).eq('id', rowId).eq('company_id', companyId)
      : await supabase.from('settings').insert({ company_id: companyId, key: REVIEW_KEY, value }).select('id').maybeSingle().then((r) => { if (r.data?.id) setRowId(r.data.id); return r })
    if (error) { toast.error(error.message); return }
    setSaved(true)
  }
  const toggle = async (on) => {
    if (on && !reviewLink) { toast.error('Link your Google listing first (the card above), so the message has somewhere to send people.'); return }
    const next = { ...cfg, enabled: on }
    setCfg(next); await save(next)
    toast.success(on ? 'On. Finished jobs get a review request from the next tick.' : 'Off.')
  }
  const test = async () => {
    setTesting(true)
    const r = await invoke('marketing-campaign', { action: 'test', campaign: { id: 0, touches: [{ day: 0, kind: 'email', subject: cfg.subject, body: `${cfg.text}\n\n${reviewLink || 'https://example.com/your-review-link'}` }] }, index: 0 })
    setTesting(false)
    if (!r.ok) { toast.error(r.error || 'Could not send the test'); return }
    toast.success(`Sent to ${r.to}.`)
  }
  return (
    <div style={card(theme)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MessageSquareHeart size={16} color={MKT} />
        <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, flex: 1 }}>Ask for a review after every finished job</div>
        {isManager && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: theme.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={cfg.enabled === true} onChange={(e) => toggle(e.target.checked)} style={{ width: 18, height: 18 }} /> {cfg.enabled ? 'On' : 'Off'}
          </label>
        )}
      </div>
      <div style={{ fontSize: 12, color: theme.textMuted }}>
        A text if the customer said yes to texts, otherwise an email, with your Google review link. Once per job, never twice in 90 days to the same person, 8am to 7pm.
        {asks != null && asks > 0 ? <> <b style={{ color: theme.text }}>{asks}</b> sent this month.</> : ''}
        {!reviewLink && <span style={{ color: '#b45309' }}> No review link yet: link your Google listing above, or put one in the brand kit's links.</span>}
      </div>
      {isManager && (
        <>
          <input style={input(theme)} value={cfg.subject} onChange={(e) => set({ subject: e.target.value })} placeholder={REVIEW_DEFAULTS.subject} />
          <textarea style={{ ...input(theme), minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }} value={cfg.text} onChange={(e) => set({ text: e.target.value })} placeholder={REVIEW_DEFAULTS.text} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: theme.textMuted }}>
            <span>Send</span>
            <select style={{ ...input(theme), width: 'auto', minHeight: 36, padding: '6px 10px' }} value={cfg.delay_hours} onChange={(e) => set({ delay_hours: Number(e.target.value) })}>
              <option value={1}>an hour after the job is marked done</option>
              <option value={3}>a few hours after</option>
              <option value={18}>the next morning</option>
              <option value={48}>two days later</option>
            </select>
            <span>The link goes at the end. Fields: {'{{first_name}} {{our_company}}'}.</span>
            <span style={{ flex: 1 }} />
            <button type="button" style={{ ...ghost(theme), minHeight: 32, padding: '4px 10px', fontSize: 12 }} onClick={test} disabled={testing}>{testing ? 'Sending…' : 'Send me a test'}</button>
            {!saved && <button type="button" style={{ ...primary(), minHeight: 32, padding: '4px 12px', fontSize: 12 }} onClick={() => save()}>Save</button>}
          </div>
        </>
      )}
    </div>
  )
}
