import { useEffect, useState } from 'react'
import { Radar, Copy, Check, ExternalLink, Mail, AlertTriangle } from 'lucide-react'
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
// by Sal directly (Phase 1). SAL_SCOUT_PLAN.md §3 is the full table.
const PORTALS = [
  { name: 'SAM.gov', covers: 'All federal solicitations', how: 'Sal polls the official API. Register your entity (UEI) at sam.gov to bid.', url: 'https://sam.gov/', method: 'api' },
  { name: 'Utah Public Procurement Place (Bonfire)', covers: 'State of Utah, DFCM, Salt Lake County, Salt Lake City, most Utah cities and districts', how: 'Register as a vendor, pick commodity codes, set the notification email to Sal\'s address.', url: 'https://utah.bonfirehub.com/portal/?tab=openOpportunities', method: 'email' },
  { name: 'Arizona Procurement Portal', covers: 'State of Arizona agencies', how: 'Register, pick commodity codes, notifications to Sal\'s address.', url: 'https://app.az.gov/', method: 'email' },
  { name: 'City of Phoenix (OpenGov)', covers: 'Phoenix, and any other OpenGov city you subscribe to', how: 'Sign up, subscribe by category, notifications to Sal\'s address.', url: 'https://procurement.opengov.com/portal/phoenix', method: 'email' },
  { name: 'BidNet Direct', covers: 'Maricopa County, University of Utah, many counties and districts (Arizona and Utah Purchasing Groups)', how: 'Free "Limited Access" account → email alerts to Sal\'s address.', url: 'https://www.bidnetdirect.com/', method: 'email' },
  { name: 'DemandStar', covers: 'Smaller cities, school and special districts', how: 'Free account, commodity codes, alerts to Sal\'s address.', url: 'https://network.demandstar.com/', method: 'email' },
  { name: 'PlanHub', covers: 'Regional GC invitations to bid', how: 'Free subcontractor account; ITB emails to Sal\'s address.', url: 'https://planhub.com/subcontractors/', method: 'email' },
  { name: 'BuildingConnected', covers: 'National GC invitations to bid', how: 'Free account; ITB emails to Sal\'s address.', url: 'https://construction.autodesk.com/products/buildingconnected/', method: 'email' },
  { name: 'Anything else', covers: 'A GC\'s email, a property manager\'s RFP, a public notice', how: 'Forward it to Sal\'s address. Attachments come along.', url: null, method: 'forward' },
]

export default function SalSources() {
  const companyId = useStore((s) => s.companyId)
  const themeCtx = useTheme()
  const theme = themeCtx?.theme || defaultTheme
  const isMobile = useIsMobile()
  const [address, setAddress] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    const run = async () => {
      if (!companyId) return
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
  }, [companyId])

  const copy = async () => {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      toast.success('Copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy — select the address and copy it')
    }
  }

  const pad = isMobile ? '16px' : '24px'
  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: isMobile ? '14px' : '20px' }

  return (
    <div style={{ padding: pad, maxWidth: '960px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Mail size={18} style={{ color: theme.accent }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: theme.text }}>Sal's address</div>
            <div style={{ fontSize: '12px', color: theme.textMuted, lineHeight: 1.4 }}>Paste it into each portal's notification settings, or forward bid emails to it. Everything that arrives lands on the Inbox tab with its attachments.</div>
          </div>
        </div>
        {error ? (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', color: '#b91c1c', fontSize: '13px', marginTop: '10px' }}><AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />{error}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) auto', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
            <code style={{ display: 'block', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, fontSize: '14px', color: theme.text, overflowWrap: 'anywhere', minHeight: '44px' }}>{address || 'Loading…'}</code>
            <button onClick={copy} disabled={!address} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '44px', padding: '0 16px', borderRadius: '8px', border: 'none', backgroundColor: theme.accent, color: '#fff', fontSize: '13px', fontWeight: 600, cursor: address ? 'pointer' : 'default', opacity: address ? 1 : 0.6 }}>
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 10px' }}>
          <Radar size={18} style={{ color: theme.accent }} />
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: theme.text, margin: 0 }}>Where the bids come from</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {PORTALS.map((p) => (
            <div key={p.name} style={{ ...card, padding: '12px 14px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '10px', alignItems: 'start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text }}>{p.name}
                  <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: theme.textMuted, padding: '1px 6px', borderRadius: '999px', border: `1px solid ${theme.border}` }}>{p.method === 'api' ? 'API' : p.method === 'forward' ? 'Forward' : 'Email alerts'}</span>
                </div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>{p.covers}</div>
                <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px', lineHeight: 1.45 }}>{p.how}</div>
              </div>
              {p.url && (
                <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '8px', border: `1px solid ${theme.border}`, color: theme.accent, flexShrink: 0 }} aria-label={`Open ${p.name}`}>
                  <ExternalLink size={16} />
                </a>
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
