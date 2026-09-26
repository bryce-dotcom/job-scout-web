import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, ChevronRight, AlertTriangle, CheckCircle, Lightbulb } from 'lucide-react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { supabase } from '../../../lib/supabase'
import BidIntakeCard from '../../../components/benny/BidIntakeCard'
import { bidIntakeOf, fmtMoney } from '../../../lib/bidSchedule'

const defaultTheme = { bg: '#f7f5ef', bgCard: '#fff', border: '#d6cdb8', text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,.12)' }

// Benny's desk: drop a bid package here, and every bid he has built so far
// with how much of it still needs a human's eyes.
export default function BennyBids() {
  const navigate = useNavigate()
  const companyId = useStore((s) => s.companyId)
  const themeCtx = useTheme()
  const theme = themeCtx?.theme || defaultTheme
  const isMobile = useIsMobile()
  const [bids, setBids] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!companyId) return
    setLoading(true)
    const { data: quotes } = await supabase
      .from('quotes')
      .select('id, quote_id, estimate_name, status, quote_amount, bid_intake, created_at, customer:customers!customer_id(name, business_name), lead:leads!lead_id(customer_name, business_name)')
      .eq('company_id', companyId)
      .not('bid_intake', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50)
    const ids = (quotes || []).map((q) => q.id)
    let unverified = {}
    if (ids.length) {
      const { data: lines } = await supabase
        .from('quote_lines')
        .select('quote_id')
        .in('quote_id', ids)
        .eq('price_source', 'ai_sourced')
        .is('price_verified_at', null)
      for (const l of lines || []) unverified[l.quote_id] = (unverified[l.quote_id] || 0) + 1
    }
    setBids((quotes || []).map((q) => ({ ...q, unverified: unverified[q.id] || 0 })))
    setLoading(false)
  }
  useEffect(() => { load() }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '960px' }}>
      <BidIntakeCard theme={theme} mode="create" onDone={(quoteId) => navigate(`/estimates/${quoteId}`)} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '24px 0 10px' }}>
        <ClipboardList size={18} style={{ color: theme.accent }} />
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: theme.text, margin: 0 }}>Bids Benny has built</h3>
      </div>

      {loading ? (
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>Loading…</div>
      ) : bids.length === 0 ? (
        <div style={{ padding: '20px', border: `1px dashed ${theme.border}`, borderRadius: '10px', color: theme.textMuted, fontSize: '13px' }}>
          None yet. Drop the first bid package in above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {bids.map((b) => {
            const bi = bidIntakeOf(b)
            const who = b.customer?.business_name || b.customer?.name || b.lead?.business_name || b.lead?.customer_name || bi.buyer || 'Customer'
            return (
              <button key={b.id} onClick={() => navigate(`/estimates/${b.id}`)} style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', padding: '12px 14px', minHeight: '56px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', cursor: 'pointer', width: '100%' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {bi.bid_number ? `${bi.bid_number} — ` : ''}{bi.project || bi.title || b.estimate_name || b.quote_id || `#${b.id}`}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                    {who}{bi.due_at ? ` · due ${new Date(bi.due_at).toLocaleDateString()}` : ''} · {b.status}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: theme.text }}>{fmtMoney(b.quote_amount)}</div>
                  {b.unverified > 0 ? (
                    <div style={{ fontSize: '11px', color: '#b91c1c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}><AlertTriangle size={12} />{b.unverified} to verify</div>
                  ) : (
                    <div style={{ fontSize: '11px', color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}><CheckCircle size={12} />ready</div>
                  )}
                </div>
                <ChevronRight size={16} style={{ color: theme.textMuted, flexShrink: 0 }} />
              </button>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '24px', padding: '12px 14px', borderRadius: '10px', backgroundColor: theme.accentBg, fontSize: '12px', color: theme.textSecondary, lineHeight: 1.5 }}>
        <Lightbulb size={16} style={{ color: theme.accent, flexShrink: 0, marginTop: '1px' }} />
        <div>
          A price Benny had to source comes from a supplier page he found on the web — the link is on the line. It stays redlined, and the bid cannot be sent, until someone opens that page and marks it verified. (Handwritten lighting takeoff forms are Dougie's job, inside Lenard's audit pages.)
        </div>
      </div>
    </div>
  )
}
