// Don — Ground truth. What the machine actually did.
//
// This is the tagline made literal, and it is Don's moat: seed production
// rates are generic and wrong for any particular outfit, so the second bid on
// similar dirt should price off THEIR numbers, not ours.
//
// The screen answers two questions in order. Per job: where did this one run
// over? Across jobs: what should Don change about how he bids?

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Gauge, Plus, RefreshCw, Clock, Truck, TrendingUp, TrendingDown, Minus,
  ChevronRight, TriangleAlert, CheckCircle2, Timer, HelpCircle,
} from 'lucide-react'
import { useStore } from '../../../lib/store'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { supabase } from '../../../lib/supabase'
import { estimateDig, WORK_TYPES, DEFAULT_BID_SETTINGS } from '../../../lib/digEstimator'
import {
  summarizeTakeoff, buildSamples, computeFactors, toCalibrationRows,
  explainFactor, MACHINE, SHIFT,
} from '../../../lib/digCalibration'
import {
  T, Screen, Card, Btn, Chip, Field, NumInput, Select, Sheet,
  Empty, Badge, SectionLabel, Note, fmtNum,
} from '../../../components/don/DonUI'

const WORK_TYPE_OPTIONS = Object.entries(WORK_TYPES).map(([value, w]) => ({ value, label: w.label }))

const blankLog = {
  takeoff_id: '', work_type: '', actual_hours: '', actual_loads: '',
  actual_tons: '', equipment: '', work_date: '', hours_kind: MACHINE,
}

export default function DonGroundTruth() {
  const companyId = useStore((s) => s.companyId)
  const isMobile = useIsMobile()
  const navigate = useNavigate()

  const [takeoffs, setTakeoffs] = useState([])
  const [itemsByTakeoff, setItemsByTakeoff] = useState({})
  const [actualsByTakeoff, setActualsByTakeoff] = useState({})
  const [priceBook, setPriceBook] = useState([])
  const [settings, setSettings] = useState(null)
  const [stored, setStored] = useState([])
  const [loading, setLoading] = useState(true)
  const [logOpen, setLogOpen] = useState(false)
  const [log, setLog] = useState(blankLog)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [flash, setFlash] = useState('')
  const [pulling, setPulling] = useState(false)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const [{ data: tos }, { data: items }, { data: acts }, { data: book }, { data: setg }, { data: cal }] = await Promise.all([
      supabase.from('dig_takeoffs').select('*, site:dig_sites(site_name, address, default_soil_class)').eq('company_id', companyId).order('created_at', { ascending: false }),
      supabase.from('dig_takeoff_items').select('*').eq('company_id', companyId),
      supabase.from('dig_actuals').select('*').eq('company_id', companyId).order('work_date', { ascending: false, nullsFirst: false }),
      supabase.from('dig_rates').select('*').eq('company_id', companyId).eq('active', true),
      supabase.from('dig_settings').select('*').eq('company_id', companyId).maybeSingle(),
      supabase.from('dig_calibration').select('*').eq('company_id', companyId),
    ])
    setTakeoffs(tos || [])
    const ib = {}, ab = {}
    ;(items || []).forEach((i) => { (ib[i.takeoff_id] ||= []).push(i) })
    ;(acts || []).forEach((a) => { (ab[a.takeoff_id] ||= []).push(a) })
    setItemsByTakeoff(ib)
    setActualsByTakeoff(ab)
    setPriceBook(book || [])
    setSettings(setg || null)
    setStored(cal || [])
    setLoading(false)
  }, [companyId])

  useEffect(() => { load() }, [load])

  // Re-derive each takeoff's estimate from the engine rather than trusting a
  // stored snapshot — if somebody edits an item, the comparison should move
  // with it instead of judging the bid against a number that no longer exists.
  const summaries = useMemo(() => {
    const ctx = {
      default_truck: settings?.default_truck || 'tri_axle',
      default_equipment: settings?.default_equipment || 'ex_160',
      efficiency: settings?.efficiency ?? undefined,
      // Deliberately no calibration here: measuring the raw estimate against
      // reality is the point. Feeding the factor back in would flatter it.
      calibration: {},
    }
    return takeoffs
      .map((t) => {
        const items = itemsByTakeoff[t.id] || []
        const actuals = actualsByTakeoff[t.id] || []
        if (!items.length && !actuals.length) return null
        const est = estimateDig({
          items: items.map((r) => toEngineRow(r, t.site)),
          priceBook,
          settings: { ...DEFAULT_BID_SETTINGS },
          ctx: { ...ctx, default_soil: t.site?.default_soil_class || 'common_earth' },
        })
        return { takeoff: t, takeoff_id: t.id, summary: summarizeTakeoff({ bidItems: est.bidItems, actuals }) }
      })
      .filter(Boolean)
  }, [takeoffs, itemsByTakeoff, actualsByTakeoff, priceBook, settings])

  const withActuals = summaries.filter((s) => s.summary.totals.actual_hours > 0 || s.summary.totals.shift_hours > 0)
  const factors = useMemo(() => computeFactors(buildSamples(summaries)), [summaries])
  const factorList = Object.values(factors).sort((a, b) => b.sample_n - a.sample_n)
  const storedByType = useMemo(() => Object.fromEntries(stored.map((s) => [s.work_type, s])), [stored])

  const pendingChanges = factorList.filter(
    (f) => f.applied && Math.abs((storedByType[f.work_type]?.factor ?? 1) - f.factor) > 0.005
  )

  // What a factor actually moves depends on how the price book bills. It always
  // changes the HOURS forecast — which is how you decide whether a job is three
  // days or four, and how many machines you commit. It only changes the PRICE
  // on rows billed by the hour or the day. Somebody who applies a factor to an
  // all-unit-price book and sees the bid total sit still deserves to have been
  // told why, rather than concluding the feature is broken.
  const timeBilledRows = priceBook.filter((r) => ['HR', 'DAY'].includes((r.uom || '').toUpperCase())).length

  // ── log an actual ──────────────────────────────────────────────────────
  const saveLog = async () => {
    if (!log.takeoff_id || !log.work_type) return
    setSaving(true)
    const { error } = await supabase.from('dig_actuals').insert({
      company_id: companyId,
      takeoff_id: Number(log.takeoff_id),
      work_type: log.work_type,
      actual_hours: log.actual_hours === '' ? null : Number(log.actual_hours),
      actual_loads: log.actual_loads === '' ? null : Number(log.actual_loads),
      actual_tons: log.actual_tons === '' ? null : Number(log.actual_tons),
      equipment: log.equipment || null,
      work_date: log.work_date || null,
      hours_kind: log.hours_kind,
      counts_toward_calibration: log.hours_kind === MACHINE,
      source: 'manual',
    })
    setSaving(false)
    if (error) { setFlash('Could not log that: ' + error.message); return }
    setLogOpen(false)
    setLog(blankLog)
    load()
  }

  // ── pull shift hours from the time clock ───────────────────────────────
  const pullFromTimeClock = async (t) => {
    if (!t.job_id) return
    setPulling(true)
    const { data: shifts } = await supabase
      .from('time_clock')
      .select('id, total_hours, clock_in')
      .eq('company_id', companyId)
      .eq('job_id', t.job_id)
      .not('total_hours', 'is', null)

    const existing = new Set((actualsByTakeoff[t.id] || []).map((a) => a.time_clock_id).filter(Boolean))
    const rows = (shifts || [])
      .filter((s) => !existing.has(s.id))
      .map((s) => ({
        company_id: companyId,
        takeoff_id: t.id,
        job_id: t.job_id,
        work_type: null,
        actual_hours: Number(s.total_hours) || null,
        work_date: s.clock_in ? String(s.clock_in).slice(0, 10) : null,
        // A shift is not a machine hour. It lands visible but inert.
        hours_kind: SHIFT,
        counts_toward_calibration: false,
        source: 'time_clock',
        time_clock_id: s.id,
      }))
    if (rows.length) {
      const { error } = await supabase.from('dig_actuals').insert(rows)
      if (error) { setPulling(false); setFlash('Pull failed: ' + error.message); return }
    }
    setPulling(false)
    setFlash(rows.length
      ? `Pulled ${rows.length} shift${rows.length === 1 ? '' : 's'} from the time clock. These are shift hours — assign a work type and mark them as machine time if you want them tuning your rates.`
      : 'Nothing new on the time clock for that job.')
    load()
  }

  // ── apply the factors ──────────────────────────────────────────────────
  const applyFactors = async () => {
    setApplying(true)
    const rows = toCalibrationRows(factors, companyId)
    if (rows.length) {
      const { error } = await supabase
        .from('dig_calibration')
        .upsert(rows, { onConflict: 'company_id,work_type,soil_class' })
      if (error) {
        // The unique index coalesces a null soil_class, which upsert's
        // conflict target can't name — fall back to explicit writes.
        for (const r of rows) {
          const hit = stored.find((s) => s.work_type === r.work_type && !s.soil_class)
          if (hit) await supabase.from('dig_calibration').update(r).eq('id', hit.id)
          else await supabase.from('dig_calibration').insert(r)
        }
      }
    }
    setApplying(false)
    setFlash(`${rows.length} rate${rows.length === 1 ? '' : 's'} now tuned to your own jobs. New bids price off these.`)
    load()
  }

  const markAsMachine = async (actualId) => {
    await supabase.from('dig_actuals')
      .update({ hours_kind: MACHINE, counts_toward_calibration: true })
      .eq('id', actualId)
    load()
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, background: T.bg, minHeight: '100%' }}>Loading actuals…</div>
  }

  return (
    <div style={{ background: T.bg, minHeight: '100%' }}>
      <Screen>
        {flash && <div style={{ marginBottom: 12 }}><Note tone="accent" icon={CheckCircle2}>{flash}</Note></div>}

        {summaries.length === 0 ? (
          <Empty
            icon={Gauge}
            title="No jobs to measure yet"
            body="Once a takeoff has work logged against it, this is where you find out whether the bid was right — and Don starts pricing off your real production instead of generic rates."
            action={<Btn onClick={() => navigate('/agents/don/takeoff')}>Go to takeoffs</Btn>}
          />
        ) : (
          <>
            {/* ── what Don has learned ─────────────────────────────────── */}
            <SectionLabel right={
              pendingChanges.length > 0 ? (
                <Btn onClick={applyFactors} disabled={applying} style={{ minHeight: 38, padding: '0 12px', fontSize: 13 }}>
                  <RefreshCw size={15} /> {applying ? 'Applying…' : `Apply ${pendingChanges.length}`}
                </Btn>
              ) : null
            }>
              Your production rates
            </SectionLabel>

            {factorList.length === 0 ? (
              <Note tone="info" icon={HelpCircle}>
                Nothing to learn from yet. Log machine hours against a takeoff and after three jobs
                of a given work type Don starts pricing off your numbers instead of the seed rates.
              </Note>
            ) : (
              <>
              <div style={{ marginBottom: 10 }}>
                <Note tone="info" icon={HelpCircle}>
                  A factor always retunes the <strong>hours</strong> Don forecasts — that is what tells you
                  whether a job is three days or four, and how many machines to commit.
                  {timeBilledRows > 0
                    ? ` It also moves the price on your ${timeBilledRows} hourly and daily rate${timeBilledRows === 1 ? '' : 's'}.`
                    : ' Your price book is entirely unit-price, so the bid total will not move — unit prices are yours to set; only the hours behind them change.'}
                </Note>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
                gap: 10,
              }}>
                {factorList.map((f) => {
                  const live = storedByType[f.work_type]
                  const isLive = live && Math.abs(live.factor - f.factor) <= 0.005
                  return (
                    <Card key={f.work_type} accent={f.applied ? (f.factor > 1 ? T.clay : T.success) : undefined}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{f.label}</div>
                          <div style={{ fontSize: 12, color: T.textMuted }}>
                            {f.sample_n} job{f.sample_n === 1 ? '' : 's'} logged
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{
                            fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                            color: !f.applied ? T.textMuted : f.factor > 1 ? T.clay : T.success,
                          }}>
                            ×{f.factor.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 8, lineHeight: 1.45 }}>
                        {explainFactor(f)}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        {f.applied && (isLive
                          ? <Badge tone="success"><CheckCircle2 size={11} /> Live on new bids</Badge>
                          : <Badge tone="warning">Not applied yet</Badge>)}
                        {!f.applied && <Badge tone="muted">{f.needed} more job{f.needed === 1 ? '' : 's'} needed</Badge>}
                        {f.clamped && <Badge tone="warning">capped</Badge>}
                      </div>
                    </Card>
                  )
                })}
              </div>
              </>
            )}

            {/* ── per job ──────────────────────────────────────────────── */}
            <SectionLabel right={
              <Btn onClick={() => { setLog({ ...blankLog, takeoff_id: String(summaries[0]?.takeoff_id || '') }); setLogOpen(true) }}
                   style={{ minHeight: 38, padding: '0 12px', fontSize: 13 }}>
                <Plus size={15} /> Log work
              </Btn>
            }>
              Job by job
            </SectionLabel>

            {withActuals.length === 0 && (
              <Note tone="info" icon={Timer}>
                No hours logged against any takeoff yet. Log a day’s machine time and the comparison starts here.
              </Note>
            )}

            <div style={{ display: 'grid', gap: 12 }}>
              {summaries.map(({ takeoff, summary }) => {
                const hasAny = summary.totals.actual_hours > 0 || summary.totals.shift_hours > 0
                if (!hasAny) return null
                const v = summary.totals.hours_variance
                const shiftRows = (actualsByTakeoff[takeoff.id] || []).filter(
                  (a) => a.hours_kind === SHIFT && a.counts_toward_calibration !== true
                )
                return (
                  <Card key={takeoff.id}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {takeoff.name || `Takeoff #${takeoff.id}`}
                        </div>
                        <div style={{ fontSize: 12, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {takeoff.site?.site_name || takeoff.site?.address || 'No site'}
                        </div>
                      </div>
                      {v != null && <VarianceBadge v={v} />}
                    </div>

                    <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                      {summary.rows.filter((r) => r.estimated_hours > 0 || r.actual_hours > 0).map((r) => (
                        <div key={r.work_type} style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0,1fr) auto',
                          gap: 8, alignItems: 'center',
                          padding: '7px 9px', background: T.bgSunk, borderRadius: 8,
                        }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.label}
                            </div>
                            <div style={{ fontSize: 11, color: T.textMuted }}>
                              {r.estimated_hours > 0 ? `bid ${fmtNum(r.estimated_hours, 1)} h` : 'not bid'}
                              {r.actual_hours > 0 ? ` · ran ${fmtNum(r.actual_hours, 1)} h` : ''}
                              {r.actual_loads > 0 ? ` · ${r.actual_loads} loads` : ''}
                            </div>
                          </div>
                          <StatusPill status={r.status} delta={r.hours_delta} />
                        </div>
                      ))}
                    </div>

                    {summary.totals.shift_hours > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <Note tone="info" icon={Clock}>
                          {fmtNum(summary.totals.shift_hours, 1)} shift hours on the clock against
                          {' '}{fmtNum(summary.totals.actual_hours, 1)} machine hours.
                          Shift time covers travel, fuelling and waiting on trucks, so it doesn’t tune production rates —
                          but a big gap is worth a look.
                        </Note>
                      </div>
                    )}

                    {shiftRows.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {shiftRows.slice(0, 4).map((a) => (
                          <button
                            key={a.id}
                            onClick={() => markAsMachine(a.id)}
                            style={{
                              minHeight: 40, padding: '0 10px', borderRadius: 8, cursor: 'pointer',
                              border: `1px dashed ${T.border}`, background: 'transparent',
                              color: T.textSecondary, fontSize: 12, fontWeight: 600,
                            }}
                          >
                            {fmtNum(a.actual_hours, 1)}h {a.work_date || 'shift'} → mark as machine time
                          </button>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <Btn variant="ghost" onClick={() => navigate(`/agents/don/takeoff/${takeoff.id}`)} style={{ flex: 1, minWidth: 120, padding: '0 10px' }}>
                        Open takeoff <ChevronRight size={15} />
                      </Btn>
                      {takeoff.job_id && (
                        <Btn variant="ghost" onClick={() => pullFromTimeClock(takeoff)} disabled={pulling} style={{ padding: '0 12px' }}>
                          <Clock size={16} /> Time clock
                        </Btn>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          </>
        )}
      </Screen>

      {/* ── log work sheet ────────────────────────────────────────────── */}
      <Sheet
        open={logOpen}
        onClose={() => setLogOpen(false)}
        isMobile={isMobile}
        title="Log what actually happened"
        footer={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={() => setLogOpen(false)} style={{ flex: 1 }}>Cancel</Btn>
            <Btn onClick={saveLog} disabled={saving || !log.takeoff_id || !log.work_type} style={{ flex: 2 }}>
              {saving ? 'Saving…' : 'Log it'}
            </Btn>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <Field label="Which job">
            <Select
              value={log.takeoff_id}
              onChange={(v) => setLog({ ...log, takeoff_id: v })}
              placeholder="Pick a takeoff"
              options={summaries.map(({ takeoff }) => ({
                value: String(takeoff.id),
                label: takeoff.name || `Takeoff #${takeoff.id}`,
              }))}
            />
          </Field>

          <Field label="What work">
            <Select
              value={log.work_type}
              onChange={(v) => setLog({ ...log, work_type: v })}
              placeholder="Pick a work type"
              options={WORK_TYPE_OPTIONS}
            />
          </Field>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 8 }}>What kind of hours?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
              <Chip active={log.hours_kind === MACHINE} onClick={() => setLog({ ...log, hours_kind: MACHINE })} style={{ justifyContent: 'center', minHeight: 52 }}>
                Machine running
              </Chip>
              <Chip active={log.hours_kind === SHIFT} onClick={() => setLog({ ...log, hours_kind: SHIFT })} style={{ justifyContent: 'center', minHeight: 52 }}>
                Shift on the clock
              </Chip>
            </div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 8, lineHeight: 1.45 }}>
              {log.hours_kind === MACHINE
                ? 'Machine hours tune your production rates — this is the number that makes the next bid better.'
                : 'Shift hours include travel, fuelling, lunch and waiting. Recorded and shown, but they don’t tune rates.'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
            <Field label="Hours"><NumInput big value={log.actual_hours} onChange={(v) => setLog({ ...log, actual_hours: v })} unit="h" /></Field>
            <Field label="Loads"><NumInput big value={log.actual_loads} onChange={(v) => setLog({ ...log, actual_loads: v })} /></Field>
            <Field label="Tons"><NumInput big value={log.actual_tons} onChange={(v) => setLog({ ...log, actual_tons: v })} /></Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
            <Field label="Date">
              <input
                type="date"
                value={log.work_date}
                onChange={(e) => setLog({ ...log, work_date: e.target.value })}
                style={{
                  width: '100%', minHeight: 48, padding: '10px 12px',
                  border: `1px solid ${T.border}`, borderRadius: 10,
                  background: T.bg, color: T.text, fontSize: 16, boxSizing: 'border-box',
                }}
              />
            </Field>
            <Field label="Machine">
              <Select
                value={log.equipment}
                onChange={(v) => setLog({ ...log, equipment: v })}
                placeholder="Optional"
                options={[
                  { value: 'mini_ex', label: 'Mini excavator' },
                  { value: 'ex_160', label: '160-class' },
                  { value: 'ex_320', label: '320-class' },
                  { value: 'dozer_d6', label: 'D6 dozer' },
                  { value: 'skid_steer', label: 'Skid steer' },
                  { value: 'backhoe', label: 'Backhoe' },
                ]}
              />
            </Field>
          </div>
        </div>
      </Sheet>
    </div>
  )
}

// Same mapping the takeoff editor uses — stored inputs, not engine outputs.
function toEngineRow(row, site) {
  const n = (v) => (v === '' || v == null ? undefined : Number(v))
  return {
    work_type: row.work_type,
    soil_class: row.soil_class || site?.default_soil_class || undefined,
    length_ft: n(row.length_ft), width_ft: n(row.width_ft), depth_ft: n(row.depth_ft),
    perimeter_ft: n(row.perimeter_ft), area_sf: n(row.area_sf),
    top_area_sf: n(row.top_area_sf), bottom_area_sf: n(row.bottom_area_sf),
    count: n(row.count), protection: row.protection || 'sloped',
    slope_ratio: n(row.slope_ratio), overdig_each_side_ft: n(row.overdig_each_side_ft),
    volume_bcy: n(row.volume_bcy_input) ?? n(row.volume_bcy),
    tons: n(row.tons_input), loads: n(row.loads_input),
    equipment: row.equipment || undefined, truck: row.truck || undefined,
  }
}

function VarianceBadge({ v }) {
  const over = v > 1.05, under = v < 0.95
  const Icon = over ? TrendingUp : under ? TrendingDown : Minus
  return (
    <Badge tone={over ? 'danger' : under ? 'success' : 'muted'}>
      <Icon size={11} /> {Math.round(v * 100)}% of bid
    </Badge>
  )
}

function StatusPill({ status, delta }) {
  if (status === 'incomplete') return <Badge tone="muted">—</Badge>
  const tone = status === 'over' ? 'danger' : status === 'under' ? 'success' : 'muted'
  const sign = delta > 0 ? '+' : ''
  return <Badge tone={tone}>{sign}{fmtNum(delta, 1)} h</Badge>
}
