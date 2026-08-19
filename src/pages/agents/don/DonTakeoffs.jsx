// Don — Takeoff list. Every bid attempt across every site, newest first.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ruler, ChevronRight, MapPin, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useStore } from '../../../lib/store'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { supabase } from '../../../lib/supabase'
import { T, Screen, Card, Btn, Empty, Badge, SectionLabel, fmtNum, fmtMoney } from '../../../components/don/DonUI'

export default function DonTakeoffs() {
  const companyId = useStore((s) => s.companyId)
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('dig_takeoffs')
        .select('*, site:dig_sites(site_name, address, city)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      setRows(data || [])
      setLoading(false)
    })()
  }, [companyId])

  const statusTone = { draft: 'muted', final: 'accent', sent: 'info', won: 'success', lost: 'danger' }

  return (
    <div style={{ background: T.bg, minHeight: '100%' }}>
      <Screen>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: T.textMuted }}>Loading takeoffs…</div>
        ) : rows.length === 0 ? (
          <Empty
            icon={Ruler}
            title="No takeoffs yet"
            body="A takeoff is one bid attempt against a site — quantities in, unit prices applied, bid out. Start one from any site."
            action={<Btn onClick={() => navigate('/agents/don')}><MapPin size={18} /> Go to sites</Btn>}
          />
        ) : (
          <>
            <SectionLabel>{rows.length} takeoff{rows.length === 1 ? '' : 's'}</SectionLabel>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
              gap: 12,
            }}>
              {rows.map((t) => (
                <Card key={t.id} onClick={() => navigate(`/agents/don/takeoff/${t.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 16, fontWeight: 700, color: T.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {t.name || `Takeoff #${t.id}`}
                      </div>
                      <div style={{
                        fontSize: 13, color: T.textMuted,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {t.site?.site_name || t.site?.address || 'No site'}
                        {t.revision_label ? ` · ${t.revision_label}` : ''}
                      </div>
                    </div>
                    <ChevronRight size={18} style={{ color: T.textMuted, flexShrink: 0 }} />
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    <Badge tone={statusTone[t.status] || 'muted'}>{t.status}</Badge>
                    {t.ready_to_send
                      ? <Badge tone="success"><CheckCircle2 size={11} /> Ready</Badge>
                      : <Badge tone="warning"><AlertTriangle size={11} /> Needs review</Badge>}
                    {t.quote_id && <Badge tone="info">Quote #{t.quote_id}</Badge>}
                  </div>

                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
                    gap: 8, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}`,
                  }}>
                    <Stat label="Bank CY" value={fmtNum(t.total_bcy)} />
                    <Stat label="Loads" value={fmtNum(t.total_loads)} />
                    <Stat label="Bid" value={fmtMoney(t.bid_total)} strong />
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </Screen>
    </div>
  )
}

function Stat({ label, value, strong }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{
        fontSize: strong ? 17 : 15, fontWeight: 700, color: strong ? T.accent : T.text,
        fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value}</div>
    </div>
  )
}
