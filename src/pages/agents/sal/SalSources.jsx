import { useEffect, useState } from 'react'
import { Radar, Copy, Check, ExternalLink, Mail, AlertTriangle, Rss, Plus, Trash2, Power, Globe } from 'lucide-react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { supabase } from '../../../lib/supabase'
import { toast } from '../../../lib/toast'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const defaultTheme = { bg: '#f7f5ef', bgCard: '#fff', border: '#d6cdb8', text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,.12)' }

// Where the bids come from, and how each one reaches Sal. Every portal here
// emails alerts to a registered vendor; none offers an API and every one
// forbids scraping, so the tenant registers once (free) and points the
// alerts at Sal's address. SAM.gov is the one official API and is polled
// each morning; RSS feeds are read every two hours. SAL_SCOUT_PLAN.md §3.
const PORTALS = [
  { name: 'SAM.gov', covers: 'All federal solicitations', how: 'Sal polls the official API each morning for the states below. Register your entity (UEI) at sam.gov to bid.', url: 'https://sam.gov/', method: 'api' },
  { name: 'Utah Public Procurement Place (Bonfire)', covers: 'State of Utah, DFCM, Salt Lake County, Salt Lake City, most Utah cities and districts', how: 'Register as a vendor, pick commodity codes, set the notification email to Sal\'s address.', url: 'https://utah.bonfirehub.com/portal/?tab=openOpportunities', method: 'email' },
  { name: 'Utah Public Notice Website', covers: 'Every Utah public body is required to post there, including invitations to bid', how: 'Subscribe to a body\'s RSS feed and paste the feed link below.', url: 'https://www.utah.gov/pmn/', method: 'rss' },
  { name: 'Arizona Procurement Portal', covers: 'State of Arizona agencies', how: 'Register, pick commodity codes, notifications to Sal\'s address.', url: 'https://app.az.gov/', method: 'email' },
  { name: 'City of Phoenix (OpenGov)', covers: 'Phoenix, and any other OpenGov city you subscribe to', how: 'Sign up, subscribe by category, notifications to Sal\'s address.', url: 'https://procurement.opengov.com/portal/phoenix', method: 'email' },
  { name: 'BidNet Direct', covers: 'Maricopa County, University of Utah, many counties and districts (Arizona and Utah Purchasing Groups)', how: 'Free "Limited Access" account → email alerts to Sal\'s address.', url: 'https://www.bidnetdirect.com/', method: 'email' },
  { name: 'DemandStar', covers: 'Smaller cities, school and special districts', how: 'Free account, commodity codes, alerts to Sal\'s address.', url: 'https://network.demandstar.com/', method: 'email' },
  { name: 'PlanHub', covers: 'Regional GC invitations to bid', how: 'Free subcontractor account; ITB emails to Sal\'s address.', url: 'https://planhub.com/subcontractors/', method: 'email' },
  { name: 'BuildingConnected', covers: 'National GC invitations to bid', how: 'Free account; ITB emails to Sal\'s address.', url: 'https://construction.autodesk.com/products/buildingconnected/', method: 'email' },
  { name: 'Google Alerts', covers: 'Agencies that post only on their own site', how: 'Make an alert for "invitation to bid" plus your trade and county, deliver as RSS, paste the feed link below.', url: 'https://www.google.com/alerts', method: 'rss' },
  { name: 'Anything else', covers: 'A GC\'s email, a property manager\'s RFP, a public notice', how: 'Forward it to Sal\'s address, or paste the link on the Board.', url: null, method: 'forward' },
]
const METHOD_LABEL = { api: 'API', rss: 'RSS', forward: 'Forward', email: 'Email alerts' }
const HEALTH_COLOR = { ok: '#16a34a', stale: '#ca8a04', error: '#b91c1c' }
const ago = (iso) => { if (!iso) return 'never'; const h = (Date.now() - new Date(iso).getTime()) / 3600000; return h < 1 ? 'just now' : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} d ago` }
const uncsv = (s) => String(s || '').split(/[,\n ]/).map((x) => x.trim().toUpperCase()).filter(Boolean)

export default function SalSources() {
  const companyId = useStore((s) => s.companyId)
  const themeCtx = useTheme()
  const theme = themeCtx?.theme || defaultTheme
  const isMobile = useIsMobile()
  const [address, setAddress] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [sources, setSources] = useState([])
  const [rssUrl, setRssUrl] = useState('')
  const [rssLabel, setRssLabel] = useState('')

  const loadSources = async () => {
    if (!companyId) return
    const { data } = await supabase.from('bid_sources').select('*').eq('company_id', companyId).order('kind').order('id')
    setSources(data || [])
  }

  useEffect(() => {
    let alive = true
    const run = async () => {
      if (!companyId) return
      loadSources()
      try {
        const { data: sess } = await supabase.auth.getSession()
        const token = sess?.session?.access_token
        const res = await fetch(`${SUPABASE_URL}/functions/v1/sal-inbox-address`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ANON_KEY}`, apikey: ANON_KEY },
          body: JSON.stringify({ company_id: companyId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!alive) return
        if (!res.ok || !data.address) { setError(data.error || `Could not get the address (${res.status})`); return }
        setAddress(data.address)
      } catch (e) {
        if (alive) setError(e.message)
      }
    }
    run()
    return () => { alive = false }
  }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    if (!address) return
    try { await navigator.clipboard.writeText(address); setCopied(true); toast.success('Copied'); setTimeout(() => setCopied(false), 2000) }
    catch { toast.error('Could not copy — select the address and copy it') }
  }

  const sam = sources.find((s) => s.kind === 'sam')
  const saveSam = async (patch) => {
    const config = { states: [], naics: [], ...(sam?.config || {}), ...patch }
    if (sam) {
      const { error: e } = await supabase.from('bid_sources').update({ config, updated_at: new Date().toISOString() }).eq('id', sam.id)
      if (e) { toast.error(e.message); return }
    } else {
      const { error: e } = await supabase.from('bid_sources').insert({ company_id: companyId, kind: 'sam', label: 'SAM.gov', config })
      if (e) { toast.error(e.message); return }
    }
    toast.success('SAM.gov source saved — polled each morning')
    loadSources()
  }
  const addRss = async () => {
    const u = rssUrl.trim()
    if (!/^https?:\/\//i.test(u)) { toast.error('Paste a feed link that starts with http'); return }
    const { error: e } = await supabase.from('bid_sources').insert({ company_id: companyId, kind: 'rss', label: rssLabel.trim() || u.replace(/^https?:\/\//, '').slice(0, 60), config: { url: u } })
    if (e) { toast.error(e.message); return }
    setRssUrl(''); setRssLabel('')
    toast.success('Feed added — Sal reads it within two hours')
    loadSources()
  }
  const toggle = async (s) => { await supabase.from('bid_sources').update({ enabled: !s.enabled, updated_at: new Date().toISOString() }).eq('id', s.id); loadSources() }
  const remove = async (s) => { if (!window.confirm(`Remove ${s.label}?`)) return; await supabase.from('bid_sources').delete().eq('id', s.id); loadSources() }

  const pad = isMobile ? '16px' : '24px'
  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: isMobile ? '14px' : '20px' }
  const input = { minHeight: '44px', padding: '0 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, fontSize: '14px', minWidth: 0, width: '100%', boxSizing: 'border-box' }
  const btn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '44px', padding: '0 14px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }
  const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, cursor: 'pointer', flexShrink: 0 }
  const h = (icon, t) => <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 10px' }}>{icon}<h3 style={{ fontSize: '15px', fontWeight: 700, color: theme.text, margin: 0 }}>{t}</h3></div>

  return (
    <div style={{ padding: pad, maxWidth: '960px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* The address */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Mail size={18} style={{ color: theme.accent }} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: theme.text }}>Sal's address</div>
            <div style={{ fontSize: '12px', color: theme.textMuted, lineHeight: 1.4 }}>Paste it into each portal's notification settings, or forward bid emails to it. Everything that arrives lands on the Inbox tab and is read within ten minutes.</div>
          </div>
        </div>
        {error ? (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', color: '#b91c1c', fontSize: '13px', marginTop: '10px' }}><AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />{error}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) auto', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
            <code style={{ display: 'block', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, fontSize: '14px', color: theme.text, overflowWrap: 'anywhere', minHeight: '44px' }}>{address || 'Loading…'}</code>
            <button onClick={copy} disabled={!address} style={{ ...btn, border: 'none', backgroundColor: theme.accent, color: '#fff', opacity: address ? 1 : 0.6 }}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}</button>
          </div>
        )}
      </div>

      {/* SAM.gov */}
      <div style={card}>
        {h(<Globe size={18} style={{ color: theme.accent }} />, 'SAM.gov (federal)')}
        <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '8px', lineHeight: 1.45 }}>Polled each morning through the official API for the states below, filtered to your NAICS codes. {sam && <span style={{ color: HEALTH_COLOR[sam.health] || theme.textMuted, fontWeight: 600 }}>{sam.health === 'ok' ? `Last polled ${ago(sam.last_polled_at)}` : sam.error_text || sam.health}</span>}</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))', gap: '8px' }}>
          <div><div style={{ fontSize: '12px', fontWeight: 600, color: theme.textSecondary, marginBottom: '4px' }}>States (two letters, comma separated)</div><input style={input} defaultValue={(sam?.config?.states || []).join(', ')} onBlur={(e) => saveSam({ states: uncsv(e.target.value).filter((s) => s.length === 2) })} placeholder="UT, AZ" /></div>
          <div><div style={{ fontSize: '12px', fontWeight: 600, color: theme.textSecondary, marginBottom: '4px' }}>NAICS codes (empty = all)</div><input style={input} defaultValue={(sam?.config?.naics || []).join(', ')} onBlur={(e) => saveSam({ naics: uncsv(e.target.value) })} placeholder="238210, 561720" /></div>
        </div>
      </div>

      {/* RSS */}
      <div style={card}>
        {h(<Rss size={18} style={{ color: theme.accent }} />, 'Feeds Sal reads')}
        <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '8px', lineHeight: 1.45 }}>RSS from the Utah Public Notice Website (one feed per public body), Google Alerts, or an agency's own bids page. Read every two hours; each new notice goes through the same reader as an email.</div>
        {sources.filter((s) => s.kind === 'rss').map((s) => (
          <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: '8px', alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${theme.border}` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: s.enabled ? theme.text : theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</div>
              <div style={{ fontSize: '12px', color: HEALTH_COLOR[s.health] || theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{!s.enabled ? 'Off' : s.health === 'ok' ? `Read ${ago(s.last_polled_at)}${s.last_item_at ? ` · newest item ${ago(s.last_item_at)}` : ''}` : s.error_text || s.health}</div>
            </div>
            <button onClick={() => toggle(s)} aria-label={s.enabled ? 'Turn off' : 'Turn on'} style={{ ...iconBtn, color: s.enabled ? theme.accent : theme.textMuted }}><Power size={16} /></button>
            <button onClick={() => remove(s)} aria-label="Remove" style={{ ...iconBtn, color: '#b91c1c' }}><Trash2 size={16} /></button>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,2fr) minmax(0,1fr) auto', gap: '8px', marginTop: '8px' }}>
          <input style={input} value={rssUrl} onChange={(e) => setRssUrl(e.target.value)} placeholder="https://www.utah.gov/pmn/… feed link" />
          <input style={input} value={rssLabel} onChange={(e) => setRssLabel(e.target.value)} placeholder="Label (Ogden City)" />
          <button onClick={addRss} style={btn}><Plus size={15} /> Add feed</button>
        </div>
      </div>

      {/* Portals */}
      <div>
        {h(<Radar size={18} style={{ color: theme.accent }} />, 'Where the bids come from')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {PORTALS.map((p) => (
            <div key={p.name} style={{ ...card, padding: '12px 14px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '10px', alignItems: 'start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text }}>{p.name}
                  <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: theme.textMuted, padding: '1px 6px', borderRadius: '999px', border: `1px solid ${theme.border}` }}>{METHOD_LABEL[p.method]}</span>
                </div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>{p.covers}</div>
                <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px', lineHeight: 1.45 }}>{p.how}</div>
              </div>
              {p.url && (
                <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ ...iconBtn, color: theme.accent, textDecoration: 'none' }} aria-label={`Open ${p.name}`}><ExternalLink size={16} /></a>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: theme.accentBg, fontSize: '12px', color: theme.textSecondary, lineHeight: 1.5 }}>
        Registration on every portal above is free and done once by you; Sal cannot register for you, log in for you, or read a portal without you. That is by design: every portal forbids automated access, and a banned vendor account would take your own bidding with it.
      </div>
    </div>
  )
}
