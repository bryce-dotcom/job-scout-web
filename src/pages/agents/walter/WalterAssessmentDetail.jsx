// Walter — one assessment, from damage register to three tiers.
//
// This page computes NOTHING. Every figure on it comes out of
// src/lib/windowEstimator.js, which is the whole reason that file exists. If
// something needs a number the engine does not return, it gets added to the
// engine with a test rather than worked out here — a page that multiplies is
// a second pricing engine nobody knows about.

import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, AlertTriangle, Copy, Sparkles, Layers, Info, Scale,
} from 'lucide-react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/ThemeContext'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { supabase } from '../../../lib/supabase'
import {
  countableZones, excludedZones, splitBySeverity,
  SEVERITY_PROFILES, ACCESS_PROFILES, CONDITION_PROFILES,
  TYPICAL_SHARE_OF_REPLACEMENT,
} from '../../../lib/windowEstimator'
import { priceAssessment } from '../../../lib/walterRows'

const money = (n) =>
  n == null || Number.isNaN(Number(n))
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n))

const money2 = (n) =>
  n == null || Number.isNaN(Number(n))
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n))

// The engine returns shares as fractions; this only formats them.
const pct = (f) => (f == null || Number.isNaN(Number(f)) ? '—' : `${Math.round(Number(f) * 100)}%`)

// Why a mark will not be resurfaced, in words a customer can be shown.
const NOT_RESTORABLE_LABEL = {
  coated_surface: 'Coated surface — cannot be abraded',
  factory_defect: 'Looks like a factory defect — warranty, not restoration',
  through_crack: 'Crack through the glass — replacement, not restoration',
}

export default function WalterAssessmentDetail() {
  const { id } = useParams()
  const companyId = useStore((s) => s.companyId)
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isMobile = useIsMobile()

  const [assessment, setAssessment] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId || !id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [{ data: a }, { data: rows }] = await Promise.all([
        supabase.from('glass_assessments').select('*')
          .eq('company_id', companyId).eq('id', id).maybeSingle(),
        supabase.from('glass_damage_items').select('*')
          .eq('company_id', companyId).eq('assessment_id', id)
          .order('code', { ascending: true }),
      ])
      if (!cancelled) {
        setAssessment(a || null)
        setItems(rows || [])
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [companyId, id])

  // The same mapping the list uses, so the two screens cannot disagree about
  // what a register is worth. See lib/walterRows.
  const { bid, zones, counts } = useMemo(
    () => (assessment
      ? priceAssessment(assessment, items)
      : { bid: null, zones: [], counts: null }),
    [assessment, items],
  )

  if (loading) {
    return <Shell theme={theme} isMobile={isMobile}>
      <div style={{ padding: 40, textAlign: 'center', color: theme.textMuted }}>Loading…</div>
    </Shell>
  }
  if (!assessment) {
    return <Shell theme={theme} isMobile={isMobile}>
      <Card theme={theme}>
        <div style={{ fontWeight: 700, color: theme.text }}>Assessment not found</div>
        <p style={{ color: theme.textMuted, fontSize: 14 }}>
          It may belong to another company, or have been removed.
        </p>
        <Btn theme={theme} onClick={() => navigate('/agents/walter')}>Back to assessments</Btn>
      </Card>
    </Shell>
  }

  const counted = countableZones(zones)
  const excluded = excludedZones(zones)
  const split = splitBySeverity(zones)
  const severityCount = (lvl) => counted.filter((z) => z.severity === lvl).length

  // Every figure here comes from the engine's valueCheck — this page does not
  // divide the bid by anything.
  const value = bid?.value || null

  // The engine counts the marks it will WORK; one logged mark can still be a
  // duplicate photograph. Rows less duplicates is how many real marks the
  // building has, which is the number the "68 is really 23" line is about.
  const distinctMarks = counts.rows - counts.duplicates

  const BASIS = {
    value: {
      label: 'What the glass is worth',
      tone: 'accent',
      body: 'Priced against what replacing this glass would cost, not against our labour — which is how the trade sells it.',
    },
    cost_floor: {
      label: 'Cost floor',
      tone: 'warning',
      body: 'Value pricing stopped applying here: a share of replacement came out BELOW cost plus margin, so the floor set the price instead. Cheap glass with a lot of marks on it does this.',
    },
    cost_plus: {
      label: 'Cost plus margin',
      tone: 'warning',
      body: 'The lines already add up to more than a share of replacement would, so this is priced on what the work costs plus margin. That happens when the glass is cheap against the number of marks on it — or when nobody priced the replacement at all.',
    },
  }
  const basis = BASIS[bid?.pricing_basis] || null

  return (
    <Shell theme={theme} isMobile={isMobile}>
      <button
        onClick={() => navigate('/agents/walter')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none',
          border: 'none', color: theme.textMuted, fontSize: 13, fontWeight: 600,
          cursor: 'pointer', padding: 0, marginBottom: 14,
        }}
      >
        <ArrowLeft size={15} /> Assessments
      </button>

      {/* ── the building ───────────────────────────────────────────── */}
      <Card theme={theme}>
        <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>
          {assessment.site_name || `Assessment #${assessment.id}`}
        </div>
        {(assessment.address || assessment.city) && (
          <div style={{ fontSize: 14, color: theme.textMuted, marginTop: 2 }}>
            {[assessment.address, assessment.city, assessment.state].filter(Boolean).join(', ')}
          </div>
        )}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
          gap: 12, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${theme.border}`,
        }}>
          <Field theme={theme} label="Glass">
            {[assessment.glass_make, assessment.glass_product].filter(Boolean).join(' · ') || '—'}
          </Field>
          <Field theme={theme} label="Access">
            {ACCESS_PROFILES[assessment.access]?.label || assessment.access || '—'}
          </Field>
          <Field theme={theme} label="Condition">
            {CONDITION_PROFILES[assessment.condition]?.label || assessment.condition || '—'}
          </Field>
          <Field theme={theme} label="Scope">
            <span style={{ textTransform: 'capitalize' }}>{assessment.vertical || 'both'}</span>
          </Field>
        </div>
        {assessment.coatings?.length > 0 && (
          <Note theme={theme} tone="warning" icon={AlertTriangle}>
            Coatings present: <strong>{assessment.coatings.join(', ')}</strong>. A coating on the
            room side cannot be abraded without destroying it, and abrading coated glass may void
            the window warranty — get the builder's sign-off in writing.
          </Note>
        )}
      </Card>

      {/* ── the bid, in three tiers ────────────────────────────────── */}
      <SectionLabel theme={theme}>The bid</SectionLabel>
      <Card theme={theme}>
        <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 14px', lineHeight: 1.55 }}>
          Quoted as a range and said to be a range. What is under construction residue is not
          known until someone stands there with a test patch, so this is not a per-scratch,
          per-pane or per-square-foot price. The middle tier <strong>is</strong> the bid; the
          others are a spread around it, not a markup on top.
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(3, minmax(0,1fr))',
          gap: 10,
        }}>
          <Tier theme={theme} label="Favourable conditions" amount={bid?.tiers?.favourable} />
          <Tier theme={theme} label="Expected scope" amount={bid?.tiers?.expected} primary />
          <Tier theme={theme} label="Difficult conditions" amount={bid?.tiers?.difficult} />
        </div>

      </Card>

      {/* ── against replacing the glass ────────────────────────────── */}
      {/* The sales argument for this whole service line, and the reason the
          bid is not cost-plus. The customer's alternative is not a cheaper
          polisher, it is new glass. A demo that shows three tiers without this
          is showing half the product. */}
      {/* Only when restoration is actually in scope. A window-cleaning bid is
          not an alternative to new glass, so comparing the two would be a
          meaningless number with a scary flag attached to it. */}
      {value && bid.restoration && (
        <>
          <SectionLabel theme={theme}>Against replacing the glass</SectionLabel>
          <Card theme={theme}>
            <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 14px', lineHeight: 1.55 }}>
              Restoration is not a cost-plus trade. What the customer is really choosing between is
              this bid and a glazier's invoice, so that is what the bid gets compared to — the
              labour underneath is the floor, not the price.
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
              gap: 12,
            }}>
              <MiniStat theme={theme} label="The bid" value={money(value.bid)} strong />
              <MiniStat
                theme={theme}
                label="Share of replacement"
                value={
                  value.share_of_replacement_low != null
                    ? `${pct(value.share_of_replacement_low)}–${pct(value.share_of_replacement_high)}`
                    : '—'
                }
              />
              <MiniStat theme={theme} label="Direct cost" value={money(value.direct_cost)} />
              <MiniStat
                theme={theme}
                label="Gross margin"
                value={`${money(value.gross_margin)} · ${pct(value.gross_margin_pct)}`}
              />
            </div>

            {basis && (
              <Note theme={theme} tone={basis.tone} icon={basis.tone === 'accent' ? Scale : AlertTriangle}>
                <strong>Priced on: {basis.label}.</strong> {basis.body}
                {bid.pricing_basis !== 'value' && bid.cost_floor != null && (
                  <> The floor is {money(bid.cost_floor)} against a direct cost of{' '}
                  {money(bid.direct_cost)}.</>
                )}
              </Note>
            )}

            <Note theme={theme} tone="info" icon={Info}>
              Replacing this glass would run{' '}
              <strong>{money(value.replacement_low)}–{money(value.replacement_high)}</strong>. The
              trade normally sells somewhere between{' '}
              {pct(TYPICAL_SHARE_OF_REPLACEMENT.low)} and {pct(TYPICAL_SHARE_OF_REPLACEMENT.high)}{' '}
              of that.
            </Note>

            {value.below_typical_band && (
              <Note theme={theme} tone="warning" icon={AlertTriangle}>
                <strong>This bid sits under the band the trade sells at.</strong> At{' '}
                {pct(value.share_of_replacement_high)} of the cheapest replacement quote it is
                below the {pct(TYPICAL_SHARE_OF_REPLACEMENT.low)} floor — worth a second look
                before it goes out. The engine flags it and changes nothing; the number is a
                person's call.
              </Note>
            )}
          </Card>
        </>
      )}

      {/* ── the lines ──────────────────────────────────────────────── */}
      <SectionLabel theme={theme}>What makes it up</SectionLabel>
      <Card theme={theme} pad={0}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 520 }}>
            <Row theme={theme} head cols={isMobile}>
              <span>Line</span><span>Qty</span><span>Price</span><span>Total</span>
            </Row>
            {(bid?.lines || []).map((l, i) => (
              <Row theme={theme} key={`${l.work_type}-${i}`} cols={isMobile}>
                <span>
                  <span style={{ fontWeight: 700, color: theme.text }}>{l.item_name}</span>
                  {l.description && (
                    <span style={{ display: 'block', fontSize: 12, color: theme.textMuted }}>
                      {l.description}
                    </span>
                  )}
                </span>
                <span>{l.quantity} {l.unit_of_measure}</span>
                <span>{money2(l.price)}</span>
                <span style={{ fontWeight: 700 }}>{money2(l.line_total)}</span>
              </Row>
            ))}
            <Row theme={theme} total cols={isMobile}>
              <span>Expected scope</span><span /><span />
              <span style={{ fontWeight: 800, color: theme.accent }}>{money2(bid?.expected)}</span>
            </Row>
          </div>
        </div>
      </Card>

      {bid?.restoration && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
          gap: 10, marginTop: 10,
        }}>
          <MiniStat theme={theme} label="Tech days billed" value={bid.restoration.days?.billable} />
          <MiniStat theme={theme} label="Days, exact" value={bid.restoration.days?.exact} />
          <MiniStat theme={theme} label="Sub cost under the markup" value={money(bid.restoration.sub_cost)} />
          <MiniStat theme={theme} label="Zones resurfaced" value={bid.restoration.zones_counted} />
        </div>
      )}

      {/* ── the register ───────────────────────────────────────────── */}
      <SectionLabel theme={theme}>The damage register</SectionLabel>
      <Card theme={theme}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
          gap: 12,
        }}>
          <MiniStat theme={theme} label="Rows logged" value={counts.rows} />
          <MiniStat theme={theme} label="Duplicate photos" value={counts.duplicates} />
          <MiniStat theme={theme} label="Zones to resurface" value={counts.to_resurface} strong />
          <MiniStat theme={theme} label="Excluded with a reason" value={counts.excluded} />
        </div>

        {counts.duplicates > 0 && (
          <Note theme={theme} tone="accent" icon={Copy}>
            <strong>{counts.rows} rows logged across {distinctMarks} marks is not {counts.rows}{' '}
            scratches.</strong> The same mark was photographed from several angles, so{' '}
            {counts.duplicates} row{counts.duplicates === 1 ? ' is a duplicate and is' : 's are duplicates and are'}{' '}
            never counted twice. Bidding all {counts.rows} would have roughly tripled the tech days.
          </Note>
        )}

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
          gap: 10, marginTop: 12,
        }}>
          {['L0', 'L1', 'L2'].map((lvl) => (
            <div key={lvl} style={{
              background: theme.bg, border: `1px solid ${theme.border}`,
              borderRadius: 10, padding: 10, minWidth: 0,
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: theme.text }}>{lvl}</div>
              <div style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.35 }}>
                {SEVERITY_PROFILES[lvl]?.label?.replace(/^L\d — /, '') || ''}
              </div>
              <div style={{
                fontSize: 18, fontWeight: 800, color: theme.accent,
                fontVariantNumeric: 'tabular-nums', marginTop: 4,
              }}>
                {severityCount(lvl)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── what was not counted, and why ──────────────────────────── */}
      <SectionLabel theme={theme}>What was not counted, and why</SectionLabel>
      <Card theme={theme}>
        <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 12px', lineHeight: 1.55 }}>
          A bid has to say this out loud. Roughly a quarter of the marks on a job like this can
          turn out to have come from the manufacturer rather than the trades, which makes them a
          warranty question and not a restoration line — a conversation to have before the work,
          not after.
        </p>

        {split.cleaning.length > 0 && (
          <Note theme={theme} tone="accent" icon={Sparkles}>
            <strong>{split.cleaning.length} mark{split.cleaning.length === 1 ? '' : 's'} routed to
            cleaning.</strong> An L0 is probably residue — it gets tried with a rag first, at a
            fraction of the price. Resurfacing one would burn a tech day on work a cloth would
            have done.
          </Note>
        )}

        {counts.excluded === 0 && counts.duplicates === 0 ? (
          <div style={{ fontSize: 14, color: theme.textMuted }}>
            Every logged mark was counted.
          </div>
        ) : (
          <div style={{ marginTop: 4 }}>
            {Object.entries(
              excluded
                // Duplicates inherit their parent's reason, so listing them
                // here would name A20, A20-b and A20-c for one mark and print
                // thirteen codes under a count of five.
                .filter((z) => z.not_restorable_reason && !z.duplicate_of)
                .reduce((acc, z) => {
                  acc[z.not_restorable_reason] = (acc[z.not_restorable_reason] || []).concat(z.id)
                  return acc
                }, {}),
            ).map(([reason, ids]) => (
              <div key={reason} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '8px 0', borderTop: `1px solid ${theme.border}`,
              }}>
                <AlertTriangle size={15} style={{ color: '#a16207', flexShrink: 0, marginTop: 2 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>
                    {NOT_RESTORABLE_LABEL[reason] || reason}
                  </div>
                  <div style={{ fontSize: 12, color: theme.textMuted, wordBreak: 'break-word' }}>
                    {ids.join(', ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── the register, row by row ───────────────────────────────── */}
      <SectionLabel theme={theme}>Every mark logged</SectionLabel>
      <Card theme={theme} pad={0}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 640 }}>
            <RegRow theme={theme} head>
              <span>Mark</span><span>Location</span><span>Face</span>
              <span>Sev</span><span>Edge</span><span>Counted</span>
            </RegRow>
            {items.map((r) => {
              const isDupe = !!r.duplicate_of
              const isBlocked = !!r.not_restorable_reason
              const isL0 = r.severity === 'L0'
              return (
                <RegRow theme={theme} key={r.id} dim={isDupe || isBlocked}>
                  <span style={{ fontWeight: 700, color: theme.text }}>{r.code}</span>
                  <span>{r.location || '—'}</span>
                  <span>{r.face === 'in' ? 'Inside' : r.face === 'out' ? 'Outside' : '—'}</span>
                  <span>{r.severity}</span>
                  <span>{r.edge ? 'Yes' : '—'}</span>
                  <span>
                    {isDupe
                      ? <Tag theme={theme} tone="muted">dup of {r.duplicate_of}</Tag>
                      : isBlocked
                        ? <Tag theme={theme} tone="warn">excluded</Tag>
                        : isL0
                          ? <Tag theme={theme} tone="accent">→ cleaning</Tag>
                          : <Tag theme={theme} tone="ok">counted</Tag>}
                  </span>
                </RegRow>
              )
            })}
          </div>
        </div>
      </Card>

      <p style={{
        fontSize: 12, color: theme.textMuted, marginTop: 16, lineHeight: 1.6,
        paddingBottom: isMobile ? 80 : 0,
      }}>
        A range, not a guarantee, and neither a minimum nor a maximum. Lift and scaffold are
        excluded unless they appear as a line above. Weld spatter is tested only — removal is not
        guaranteed. Extra work needs a written change order.
      </p>
    </Shell>
  )
}

/* ── small pieces ──────────────────────────────────────────────────── */

function Shell({ theme, isMobile, children }) {
  return (
    <div style={{ background: theme.bg, minHeight: '100%' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '16px 16px 96px' : '24px' }}>
        {children}
      </div>
    </div>
  )
}

function Card({ theme, children, pad = 16 }) {
  return (
    <div style={{
      background: theme.bgCard, border: `1px solid ${theme.border}`,
      borderRadius: 12, padding: pad, boxShadow: theme.shadow, marginBottom: 4,
    }}>
      {children}
    </div>
  )
}

function SectionLabel({ theme, children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: theme.textMuted,
      textTransform: 'uppercase', letterSpacing: '0.05em',
      margin: '18px 0 8px',
    }}>
      {children}
    </div>
  )
}

function Field({ theme, label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: theme.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>{label}</div>
      <div style={{ fontSize: 14, color: theme.text, wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}

function Tier({ theme, label, amount, primary }) {
  return (
    <div style={{
      background: primary ? theme.accentBg : theme.bg,
      border: `1px solid ${primary ? theme.accent : theme.border}`,
      borderRadius: 10, padding: 14, minWidth: 0,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: primary ? theme.accent : theme.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: primary ? 28 : 22, fontWeight: 800,
        color: primary ? theme.accent : theme.text,
        fontVariantNumeric: 'tabular-nums', marginTop: 4,
      }}>
        {money(amount)}
      </div>
      {primary && (
        <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, marginTop: 2 }}>
          This is the bid
        </div>
      )}
    </div>
  )
}

function MiniStat({ theme, label, value, strong }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: theme.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>{label}</div>
      <div style={{
        fontSize: 18, fontWeight: 800,
        color: strong ? theme.accent : theme.text,
        fontVariantNumeric: 'tabular-nums',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value ?? '—'}</div>
    </div>
  )
}

function Note({ theme, children, tone = 'warning', icon: Icon }) {
  const tones = {
    warning: { bg: 'rgba(234,179,8,0.10)', bd: 'rgba(234,179,8,0.35)', fg: '#a16207' },
    info: { bg: 'rgba(59,130,246,0.09)', bd: 'rgba(59,130,246,0.30)', fg: '#2563eb' },
    accent: { bg: theme.accentBg, bd: theme.accent, fg: theme.accent },
  }
  const t = tones[tone] || tones.warning
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 10,
      padding: '10px 12px', marginTop: 12,
    }}>
      {Icon && <Icon size={16} style={{ color: t.fg, flexShrink: 0, marginTop: 2 }} />}
      <div style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.55, minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}

function Btn({ theme, children, onClick }) {
  return (
    <button onClick={onClick} style={{
      marginTop: 12, padding: '10px 16px', borderRadius: 10, border: 'none',
      background: theme.accent, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
    }}>
      {children}
    </button>
  )
}

function Row({ theme, children, head, total }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0,2.4fr) minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,0.9fr)',
      gap: 10, padding: '10px 16px',
      borderTop: head ? 'none' : `1px solid ${theme.border}`,
      background: head ? theme.bg : total ? theme.accentBg : 'transparent',
      fontSize: head ? 10 : 13,
      fontWeight: head ? 700 : 500,
      color: head ? theme.textMuted : theme.textSecondary,
      textTransform: head ? 'uppercase' : 'none',
      letterSpacing: head ? '0.05em' : 'normal',
      fontVariantNumeric: 'tabular-nums',
      alignItems: 'center',
    }}>
      {children}
    </div>
  )
}

function RegRow({ theme, children, head, dim }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns:
        'minmax(0,0.7fr) minmax(0,2.2fr) minmax(0,0.9fr) minmax(0,0.6fr) minmax(0,0.6fr) minmax(0,1.3fr)',
      gap: 10, padding: '9px 16px',
      borderTop: head ? 'none' : `1px solid ${theme.border}`,
      background: head ? theme.bg : 'transparent',
      fontSize: head ? 10 : 13,
      fontWeight: head ? 700 : 500,
      color: head ? theme.textMuted : theme.textSecondary,
      textTransform: head ? 'uppercase' : 'none',
      letterSpacing: head ? '0.05em' : 'normal',
      opacity: dim ? 0.55 : 1,
      alignItems: 'center',
    }}>
      {children}
    </div>
  )
}

function Tag({ theme, children, tone }) {
  const tones = {
    ok: { bg: 'rgba(34,197,94,0.14)', fg: '#16a34a' },
    warn: { bg: 'rgba(234,179,8,0.16)', fg: '#a16207' },
    accent: { bg: theme.accentBg, fg: theme.accent },
    muted: { bg: 'rgba(125,138,127,0.14)', fg: theme.textMuted },
  }
  const t = tones[tone] || tones.muted
  return (
    <span style={{
      background: t.bg, color: t.fg, borderRadius: 999,
      padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}
