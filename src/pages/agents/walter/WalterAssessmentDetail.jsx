// Walter — one assessment, from damage register to three tiers.
//
// This page computes NOTHING. Every figure on it comes out of
// src/lib/windowEstimator.js, which is the whole reason that file exists. If
// something needs a number the engine does not return, it gets added to the
// engine with a test rather than worked out here — a page that multiplies is
// a second pricing engine nobody knows about.
//
// It is also where the register is edited, because the register IS the bid:
// changing a severity or marking a photograph as a duplicate moves the tiers
// at the top of the same screen, and that is the thing worth seeing.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, AlertTriangle, Copy, Sparkles, Info, Scale, Pencil, Plus,
} from 'lucide-react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/ThemeContext'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { supabase } from '../../../lib/supabase'
import {
  countableZones, excludedZones, splitBySeverity, validateRegister,
  SEVERITY_PROFILES, ACCESS_PROFILES, CONDITION_PROFILES,
  TYPICAL_SHARE_OF_REPLACEMENT,
} from '../../../lib/windowEstimator'
import { priceAssessment } from '../../../lib/walterRows'
import WalterMarkSheet from './WalterMarkSheet'
import WalterDetailsSheet from './WalterDetailsSheet'
import { Card, SectionLabel, Field, MiniStat, Note, Btn, Tag } from './WalterUI'
import { money, money2, pct } from '../../../lib/walterFormat'

// Why a mark will not be resurfaced, in words a customer can be shown.
const NOT_RESTORABLE_LABEL = {
  coated_surface: 'Coated surface — cannot be abraded',
  factory_defect: 'Looks like a factory defect — warranty, not restoration',
  through_crack: 'Crack through the glass — replacement, not restoration',
}

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

export default function WalterAssessmentDetail() {
  const { id } = useParams()
  const companyId = useStore((s) => s.companyId)
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isMobile = useIsMobile()

  // undefined = not fetched yet, null = fetched and there is nothing there.
  // One piece of state instead of two, so there is no second flag to keep in
  // step with the data and nothing to set from inside an effect.
  const [assessment, setAssessment] = useState(undefined)
  const [items, setItems] = useState([])
  const [markSheet, setMarkSheet] = useState({ open: false, editing: null })
  const [detailsOpen, setDetailsOpen] = useState(false)

  const load = useCallback(async () => {
    if (!companyId || !id) return
    const [{ data: a }, { data: rows }] = await Promise.all([
      supabase.from('glass_assessments').select('*')
        .eq('company_id', companyId).eq('id', id).maybeSingle(),
      supabase.from('glass_damage_items').select('*')
        .eq('company_id', companyId).eq('assessment_id', id)
        .order('code', { ascending: true }),
    ])
    setAssessment(a || null)
    setItems(rows || [])
  }, [companyId, id])

  // load() runs again after every saved mark, and deliberately does not
  // touch `loading` — flipping the page back to a spinner mid-edit would
  // throw away the register you are looking at.
  useEffect(() => { (async () => { await load() })() }, [load])

  const loading = assessment === undefined

  // The same mapping the list uses, so the two screens cannot disagree about
  // what a register is worth. See lib/walterRows.
  const { bid, zones, counts } = useMemo(
    () => (assessment
      ? priceAssessment(assessment, items)
      : { bid: null, zones: [], counts: null }),
    [assessment, items],
  )

  // What is wrong with the register, decided by the engine that prices it.
  const problems = useMemo(() => validateRegister(zones).problems, [zones])

  if (loading) {
    return <Shell theme={theme} isMobile={isMobile}>
      <div style={{ padding: 40, textAlign: 'center', color: theme.textMuted }}>Loading…</div>
    </Shell>
  }
  if (!assessment) {
    return <Shell theme={theme} isMobile={isMobile}>
      <Card>
        <div style={{ fontWeight: 700, color: theme.text }}>Assessment not found</div>
        <p style={{ color: theme.textMuted, fontSize: 14 }}>
          It may belong to another company, or have been removed.
        </p>
        <Btn onClick={() => navigate('/agents/walter')}>Back to assessments</Btn>
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
  const basis = BASIS[bid?.pricing_basis] || null

  // The engine counts the marks it will WORK; one logged mark can still be a
  // duplicate photograph. distinct_marks is how many real marks the building
  // has, which is the number the "68 is really 23" line is about.
  const distinctMarks = counts.distinct_marks ?? (counts.rows - counts.duplicates)

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
      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: theme.text }}>
              {assessment.site_name || `Assessment #${assessment.id}`}
            </div>
            {(assessment.address || assessment.city) && (
              <div style={{ fontSize: 14, color: theme.textMuted, marginTop: 2 }}>
                {[assessment.address, assessment.city, assessment.state].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
          <Btn variant="secondary" onClick={() => setDetailsOpen(true)}>
            <Pencil size={14} /> Edit
          </Btn>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
          gap: 12, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${theme.border}`,
        }}>
          <Field label="Glass">
            {[assessment.glass_make, assessment.glass_product].filter(Boolean).join(' · ') || '—'}
          </Field>
          <Field label="Access">
            {ACCESS_PROFILES[assessment.access]?.label || assessment.access || '—'}
          </Field>
          <Field label="Condition">
            {CONDITION_PROFILES[assessment.condition]?.label || assessment.condition || '—'}
          </Field>
          <Field label="Scope">
            <span style={{ textTransform: 'capitalize' }}>{assessment.vertical || 'both'}</span>
          </Field>
        </div>
        {assessment.coatings?.length > 0 && (
          <Note tone="warning" icon={AlertTriangle}>
            Coatings present: <strong>{assessment.coatings.join(', ')}</strong>. A coating on the
            room side cannot be abraded without destroying it, and abrading coated glass may void
            the window warranty — get the builder's sign-off in writing.
          </Note>
        )}
      </Card>

      {/* ── anything that would silently lose a mark ───────────────── */}
      {problems.length > 0 && (
        <Note tone="danger" icon={AlertTriangle}>
          <strong>
            {problems.length} thing{problems.length === 1 ? '' : 's'} to fix in the register.
          </strong>{' '}
          It still prices — a half-typed register has to — but these marks are not being counted
          the way whoever logged them meant.
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {problems.slice(0, 6).map((p, i) => (
              <li key={`${p.kind}-${p.code ?? i}`} style={{ marginBottom: 2 }}>{p.message}</li>
            ))}
          </ul>
          {problems.length > 6 && <div style={{ marginTop: 4 }}>…and {problems.length - 6} more.</div>}
        </Note>
      )}

      {/* ── the bid, in three tiers ────────────────────────────────── */}
      <SectionLabel>The bid</SectionLabel>
      <Card>
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
      {/* Only when restoration is actually in scope. A window-cleaning bid is
          not an alternative to new glass, and comparing the two would be a
          meaningless number with a scary flag attached to it. */}
      {value && bid.restoration && (
        <>
          <SectionLabel>Against replacing the glass</SectionLabel>
          <Card>
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
              <MiniStat label="The bid" value={money(value.bid)} strong />
              <MiniStat
                label="Share of replacement"
                value={
                  value.share_of_replacement_low != null
                    ? `${pct(value.share_of_replacement_low)}–${pct(value.share_of_replacement_high)}`
                    : '—'
                }
              />
              <MiniStat label="Direct cost" value={money(value.direct_cost)} />
              <MiniStat
                label="Gross margin"
                value={`${money(value.gross_margin)} · ${pct(value.gross_margin_pct)}`}
              />
            </div>

            {basis && (
              <Note tone={basis.tone} icon={basis.tone === 'accent' ? Scale : AlertTriangle}>
                <strong>Priced on: {basis.label}.</strong> {basis.body}
                {bid.pricing_basis !== 'value' && bid.cost_floor != null && (
                  <> The floor is {money(bid.cost_floor)} against a direct cost of{' '}
                  {money(bid.direct_cost)}.</>
                )}
              </Note>
            )}

            <Note tone="info" icon={Info}>
              Replacing this glass would run{' '}
              <strong>{money(value.replacement_low)}–{money(value.replacement_high)}</strong>. The
              trade normally sells somewhere between{' '}
              {pct(TYPICAL_SHARE_OF_REPLACEMENT.low)} and {pct(TYPICAL_SHARE_OF_REPLACEMENT.high)}{' '}
              of that.
            </Note>

            {value.below_typical_band && (
              <Note tone="warning" icon={AlertTriangle}>
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
      <SectionLabel>What makes it up</SectionLabel>
      <Card pad={0}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 520 }}>
            <Row theme={theme} head>
              <span>Line</span><span>Qty</span><span>Price</span><span>Total</span>
            </Row>
            {(bid?.lines || []).map((l, i) => (
              <Row theme={theme} key={`${l.work_type}-${i}`}>
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
            <Row theme={theme} total>
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
          <MiniStat label="Tech days billed" value={bid.restoration.days?.billable} />
          <MiniStat label="Days, exact" value={bid.restoration.days?.exact} />
          <MiniStat label="Sub cost under the markup" value={money(bid.restoration.sub_cost)} />
          <MiniStat label="Zones resurfaced" value={bid.restoration.zones_counted} />
        </div>
      )}

      {/* ── the register ───────────────────────────────────────────── */}
      <SectionLabel
        right={
          <Btn onClick={() => setMarkSheet({ open: true, editing: null })}>
            <Plus size={15} /> Add a mark
          </Btn>
        }
      >
        The damage register
      </SectionLabel>
      <Card>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
          gap: 12,
        }}>
          <MiniStat label="Rows logged" value={counts.rows} />
          <MiniStat label="Duplicate photos" value={counts.duplicates} />
          <MiniStat label="Zones to resurface" value={counts.to_resurface} strong />
          <MiniStat label="Excluded with a reason" value={counts.excluded} />
        </div>

        {counts.duplicates > 0 && (
          <Note tone="accent" icon={Copy}>
            <strong>{counts.rows} rows logged across {distinctMarks}{' '}
            mark{distinctMarks === 1 ? '' : 's'} is not {counts.rows} scratches.</strong> The same mark was photographed from several angles, so{' '}
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
      <SectionLabel>What was not counted, and why</SectionLabel>
      <Card>
        <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 12px', lineHeight: 1.55 }}>
          A bid has to say this out loud. Roughly a quarter of the marks on a job like this can
          turn out to have come from the manufacturer rather than the trades, which makes them a
          warranty question and not a restoration line — a conversation to have before the work,
          not after.
        </p>

        {split.cleaning.length > 0 && (
          <Note tone="accent" icon={Sparkles}>
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
      <SectionLabel>Every mark logged</SectionLabel>
      <Card pad={0}>
        {items.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, marginBottom: 4 }}>
              Nothing logged yet
            </div>
            <p style={{ fontSize: 13, color: theme.textMuted, margin: '0 0 12px', lineHeight: 1.5 }}>
              Add one row per mark, including the extra photographs — mark those as duplicates and
              they will not be counted twice.
            </p>
            <Btn onClick={() => setMarkSheet({ open: true, editing: null })}>
              <Plus size={15} /> Add the first mark
            </Btn>
          </div>
        ) : (
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
                  <RegRow
                    theme={theme}
                    key={r.id}
                    dim={isDupe || isBlocked}
                    onClick={() => setMarkSheet({ open: true, editing: r })}
                  >
                    <span style={{ fontWeight: 700, color: theme.text }}>{r.code}</span>
                    <span>{r.location || '—'}</span>
                    <span>{r.face === 'in' ? 'Inside' : r.face === 'out' ? 'Outside' : '—'}</span>
                    <span>{r.severity}</span>
                    <span>{r.edge ? 'Yes' : '—'}</span>
                    <span>
                      {isDupe
                        ? <Tag tone="muted">dup of {r.duplicate_of}</Tag>
                        : isBlocked
                          ? <Tag tone="warn">excluded</Tag>
                          : isL0
                            ? <Tag tone="accent">→ cleaning</Tag>
                            : <Tag tone="ok">counted</Tag>}
                    </span>
                  </RegRow>
                )
              })}
            </div>
          </div>
        )}
      </Card>

      <p style={{
        fontSize: 12, color: theme.textMuted, marginTop: 16, lineHeight: 1.6,
        paddingBottom: isMobile ? 80 : 0,
      }}>
        A range, not a guarantee, and neither a minimum nor a maximum. Lift and scaffold are
        excluded unless they appear as a line above. Weld spatter is tested only — removal is not
        guaranteed. Extra work needs a written change order.
      </p>

      {markSheet.open && <WalterMarkSheet
        key={markSheet.editing?.id ?? 'new'}
        editing={markSheet.editing}
        rows={items}
        companyId={companyId}
        assessmentId={assessment.id}
        isMobile={isMobile}
        onClose={() => setMarkSheet({ open: false, editing: null })}
        onSaved={load}
      />}
      {detailsOpen && <WalterDetailsSheet
        assessment={assessment}
        companyId={companyId}
        isMobile={isMobile}
        onClose={() => setDetailsOpen(false)}
        onSaved={load}
      />}
    </Shell>
  )
}

/* ── table rows, which are this page's own shape ───────────────────── */

function Shell({ theme, isMobile, children }) {
  return (
    <div style={{ background: theme.bg, minHeight: '100%' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '16px 16px 96px' : '24px' }}>
        {children}
      </div>
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

function RegRow({ theme, children, head, dim, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
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
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </div>
  )
}
