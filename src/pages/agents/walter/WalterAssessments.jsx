// Walter — assessment list. One row per visit to a building's glass.
//
// The figures here come from the engine, not from the rollup columns on the
// row. The assessment table carries expected_total / zones_counted / tech_days
// for a later phase that writes them on save, and a cache with no writer yet
// is a cache that shows dashes or, worse, drifts away from the detail page.
// So the register comes down with the assessment and windowEstimator prices
// it, exactly as it does one screen deeper. One source for the arithmetic.

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Grid3X3, ChevronRight, MapPin, Layers, AlertTriangle } from 'lucide-react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/ThemeContext'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { supabase } from '../../../lib/supabase'
import { priceAssessment } from '../../../lib/walterRows'

const money = (n) =>
  n == null || Number.isNaN(Number(n))
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n))

const STATUS_TONE = {
  draft: 'muted',
  final: 'accent',
  sent: 'info',
  won: 'success',
  lost: 'danger',
}

export default function WalterAssessments() {
  const companyId = useStore((s) => s.companyId)
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isMobile = useIsMobile()
  const [raw, setRaw] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('glass_assessments')
        .select('*, glass_damage_items(*)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (!cancelled) {
        setRaw(data || [])
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [companyId])

  const rows = useMemo(
    () => raw.map((a) => ({ a, ...priceAssessment(a) })),
    [raw],
  )

  const tone = (name) => ({
    muted: { bg: 'rgba(125,138,127,0.12)', fg: theme.textMuted },
    accent: { bg: theme.accentBg, fg: theme.accent },
    info: { bg: 'rgba(59,130,246,0.12)', fg: '#2563eb' },
    success: { bg: 'rgba(34,197,94,0.12)', fg: '#16a34a' },
    danger: { bg: 'rgba(239,68,68,0.12)', fg: '#dc2626' },
  }[name] || { bg: 'rgba(125,138,127,0.12)', fg: theme.textMuted })

  return (
    <div style={{ background: theme.bg, minHeight: '100%' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '16px 16px 96px' : '24px' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: theme.textMuted }}>Loading assessments…</div>
        ) : rows.length === 0 ? (
          <div style={{
            background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: 40, textAlign: 'center',
          }}>
            <Grid3X3 size={32} style={{ color: theme.textMuted, marginBottom: 12 }} />
            <div style={{ fontSize: 17, fontWeight: 700, color: theme.text, marginBottom: 6 }}>
              No assessments yet
            </div>
            <p style={{ fontSize: 14, color: theme.textMuted, margin: 0, lineHeight: 1.5 }}>
              An assessment is one visit to a building's glass — panes counted on the cleaning
              side, damage zones logged on the restoration side, and a bid in three tiers out
              the other end.
            </p>
          </div>
        ) : (
          <>
            <div style={{
              fontSize: 11, fontWeight: 700, color: theme.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10,
            }}>
              {rows.length} assessment{rows.length === 1 ? '' : 's'}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
              gap: 12,
            }}>
              {rows.map(({ a, bid, counts }) => {
                const t = tone(STATUS_TONE[a.status])
                return (
                  <div
                    key={a.id}
                    onClick={() => navigate(`/agents/walter/assessment/${a.id}`)}
                    style={{
                      background: theme.bgCard, border: `1px solid ${theme.border}`,
                      borderRadius: 12, padding: 14, cursor: 'pointer', boxShadow: theme.shadow,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 16, fontWeight: 700, color: theme.text,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {a.site_name || `Assessment #${a.id}`}
                        </div>
                        <div style={{
                          fontSize: 13, color: theme.textMuted,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          <MapPin size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                          {a.address || a.city || 'No address'}
                        </div>
                      </div>
                      <ChevronRight size={18} style={{ color: theme.textMuted, flexShrink: 0 }} />
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      <Pill bg={t.bg} fg={t.fg}>{a.status || 'draft'}</Pill>
                      {a.vertical && (
                        <Pill bg={theme.accentBg} fg={theme.accent}>
                          <Layers size={11} /> {a.vertical}
                        </Pill>
                      )}
                      {counts.blocked > 0 && (
                        <Pill bg="rgba(234,179,8,0.14)" fg="#a16207">
                          <AlertTriangle size={11} /> {counts.blocked} of {counts.marks} excluded
                        </Pill>
                      )}
                      {bid.value?.below_typical_band && (
                        <Pill bg="rgba(239,68,68,0.12)" fg="#dc2626">
                          <AlertTriangle size={11} /> under the band
                        </Pill>
                      )}
                    </div>

                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
                      gap: 8, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${theme.border}`,
                    }}>
                      <Stat theme={theme} label="Zones" value={counts.to_resurface || '—'} />
                      <Stat theme={theme} label="Tech days" value={bid.restoration?.days?.billable ?? '—'} />
                      <Stat theme={theme} label="Expected" value={money(bid.expected)} strong />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Pill({ children, bg, fg }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg, color: fg, borderRadius: 999,
      padding: '3px 9px', fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
    }}>
      {children}
    </span>
  )
}

function Stat({ theme, label, value, strong }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: theme.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>{label}</div>
      <div style={{
        fontSize: strong ? 17 : 15, fontWeight: 700,
        color: strong ? theme.accent : theme.text,
        fontVariantNumeric: 'tabular-nums',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value}</div>
    </div>
  )
}
