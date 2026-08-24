// Don — the takeoff editor. This is the screen that has to feel good.
//
// The phone experience is the point: an excavator standing on the site adds
// items one at a time and watches the yardage, the truck count and the dollar
// figure move at the bottom of the screen. Add-item is a bottom sheet with a
// live readout that recomputes on every keystroke — including the moment they
// flip a trench from shored to sloped and watch the CY jump 4.75x. That
// moment is the product demo, so it happens inline, not in a report.
//
// All arithmetic comes from digEstimator (pure, 69 tests). Nothing here does
// math of its own.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus, Trash2, ArrowLeft, Send, AlertTriangle, CheckCircle2, Layers,
  Truck, Clock, Pencil, ShieldCheck, TriangleAlert, FileText, ScanLine, Ruler,
} from 'lucide-react'
import { useStore } from '../../../lib/store'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { supabase } from '../../../lib/supabase'
import {
  estimateDig, quantifyItem, priceItem, toIntakeLines,
  SOIL_PROFILES, WORK_TYPES, verticalsForWorkTypes, TRUCK_TYPES, EQUIPMENT,
  DEFAULT_BID_SETTINGS,
} from '../../../lib/digEstimator'
import { createEstimateFromIntake } from '../../../lib/estimateIntake'
import { DEFAULT_VERTICALS } from '../../../lib/donPriceBook'
import ReadSheet from '../../../components/don/ReadSheet'
import PlanMeasure from '../../../components/don/PlanMeasure'
import {
  T, Screen, Card, Btn, Chip, Field, TextInput, NumInput, Select, Sheet,
  Empty, Badge, SectionLabel, Note, StatBar, SourceBadge, fmtNum, fmtMoney,
  STATBAR_HEIGHT,
} from '../../../components/don/DonUI'
import { MOBILE_TABBAR_HEIGHT } from '../../../components/AgentHeader'

const SOIL_OPTIONS = Object.entries(SOIL_PROFILES).map(([value, s]) => ({ value, label: s.label }))
const EQUIP_OPTIONS = Object.entries(EQUIPMENT).map(([value, e]) => ({ value, label: e.label }))
const TRUCK_OPTIONS = Object.entries(TRUCK_TYPES).map(([value, t]) => ({ value, label: `${t.label} · ${t.volumetric_cy} CY / ${t.payload_tons} t` }))

const blankItem = {
  work_type: '', label: '', soil_class: '',
  length_ft: '', width_ft: '', depth_ft: '', perimeter_ft: '',
  area_sf: '', top_area_sf: '', bottom_area_sf: '', count: '',
  protection: 'sloped', slope_ratio: '', overdig_each_side_ft: '',
  volume_bcy_input: '', tons_input: '', loads_input: '', equipment: '', truck: '', notes: '',
}

// Row shape the engine wants — strings from inputs become numbers here, once.
function toEngineItem(row, site) {
  const n = (v) => (v === '' || v == null ? undefined : Number(v))
  return {
    work_type: row.work_type,
    label: row.label || undefined,
    soil_class: row.soil_class || site?.default_soil_class || undefined,
    length_ft: n(row.length_ft),
    width_ft: n(row.width_ft),
    depth_ft: n(row.depth_ft),
    perimeter_ft: n(row.perimeter_ft),
    area_sf: n(row.area_sf),
    top_area_sf: n(row.top_area_sf),
    bottom_area_sf: n(row.bottom_area_sf),
    count: n(row.count),
    protection: row.protection || 'sloped',
    slope_ratio: n(row.slope_ratio),
    overdig_each_side_ft: n(row.overdig_each_side_ft),
    volume_bcy: n(row.volume_bcy_input) ?? n(row.volume_bcy),
    // Stated beats derived — see digEstimator.quantifyItem.
    tons: n(row.tons_input),
    loads: n(row.loads_input),
    equipment: row.equipment || undefined,
    truck: row.truck || undefined,
    source: row.source || 'manual',
    source_ref: row.source_ref || undefined,
    confidence: row.confidence ?? undefined,
    confirmed_by: row.confirmed_by ?? undefined,
  }
}

export default function DonTakeoffDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((s) => s.companyId)
  const user = useStore((s) => s.user)
  const employees = useStore((s) => s.employees)
  const fetchLeads = useStore((s) => s.fetchLeads)
  const isMobile = useIsMobile()

  const currentEmployeeId = useMemo(
    () => (employees || []).find((e) => e.email === user?.email)?.id || null,
    [employees, user]
  )

  const [takeoff, setTakeoff] = useState(null)
  const [site, setSite] = useState(null)
  const [rows, setRows] = useState([])
  const [priceBook, setPriceBook] = useState([])
  const [settings, setSettings] = useState(null)
  const [calibration, setCalibration] = useState({})
  const [loading, setLoading] = useState(true)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [readOpen, setReadOpen] = useState(false)
  const [measureOpen, setMeasureOpen] = useState(false)
  const [draft, setDraft] = useState(blankItem)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [flash, setFlash] = useState('')

  // ── load ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!companyId || !id) return
    setLoading(true)
    const [{ data: t }, { data: items }, { data: book }, { data: setg }, { data: cal }] = await Promise.all([
      supabase.from('dig_takeoffs').select('*, site:dig_sites(*)').eq('company_id', companyId).eq('id', id).single(),
      supabase.from('dig_takeoff_items').select('*').eq('company_id', companyId).eq('takeoff_id', id).order('sort_order'),
      supabase.from('dig_rates').select('*').eq('company_id', companyId).eq('active', true).order('sort_order'),
      supabase.from('dig_settings').select('*').eq('company_id', companyId).maybeSingle(),
      supabase.from('dig_calibration').select('*').eq('company_id', companyId),
    ])
    setTakeoff(t || null)
    setSite(t?.site || null)
    setRows(items || [])
    setPriceBook(book || [])
    setSettings(setg || null)
    const calMap = {}
    ;(cal || []).forEach((c) => { calMap[c.work_type] = { factor: Number(c.factor) || 1, sample_n: c.sample_n } })
    setCalibration(calMap)
    setLoading(false)
  }, [companyId, id])

  useEffect(() => { load() }, [load])

  // ── the estimate, recomputed from the engine on every change ───────────
  const ctx = useMemo(() => ({
    default_soil: site?.default_soil_class || settings?.default_soil_class || 'common_earth',
    default_truck: settings?.default_truck || 'tri_axle',
    default_equipment: settings?.default_equipment || 'ex_160',
    default_overdig_ft: settings?.default_overdig_ft ?? 2,
    efficiency: settings?.efficiency ?? undefined,
    calibration,
  }), [site, settings, calibration])

  const bidSettings = useMemo(() => ({
    ...DEFAULT_BID_SETTINGS,
    overhead_percent: settings?.overhead_percent ?? DEFAULT_BID_SETTINGS.overhead_percent,
    profit_percent: settings?.profit_percent ?? DEFAULT_BID_SETTINGS.profit_percent,
    tax_rate: settings?.tax_rate ?? 0,
    confidence_threshold: settings?.confidence_threshold ?? 0.7,
    mobilization: takeoff?.settings?.mobilization ?? settings?.mobilization ?? 0,
  }), [settings, takeoff])

  const result = useMemo(
    () => estimateDig({
      items: rows.map((r) => toEngineItem(r, site)),
      priceBook,
      settings: bidSettings,
      ctx,
    }),
    [rows, priceBook, bidSettings, ctx]
  )

  // Live preview for whatever is in the add sheet right now.
  const preview = useMemo(() => {
    if (!draft.work_type) return null
    const q = quantifyItem(toEngineItem(draft, site), ctx)
    return priceItem(q, priceBook, ctx)
  }, [draft, site, ctx, priceBook])

  // Shored-vs-sloped comparison, so the difference is visible while choosing.
  const protectionDelta = useMemo(() => {
    if (!draft.work_type || WORK_TYPES[draft.work_type]?.geometry !== 'trench') return null
    if (!draft.length_ft || !draft.width_ft || !draft.depth_ft) return null
    const base = toEngineItem(draft, site)
    const shored = quantifyItem({ ...base, protection: 'shored' }, ctx)
    const sloped = quantifyItem({ ...base, protection: 'sloped' }, ctx)
    if (!shored.volume_bcy) return null
    return { shored: shored.volume_bcy, sloped: sloped.volume_bcy, ratio: sloped.volume_bcy / shored.volume_bcy }
  }, [draft, site, ctx])

  const enabledVerticals = settings?.verticals || DEFAULT_VERTICALS
  const workTypeOptions = useMemo(() => verticalsForWorkTypes(enabledVerticals), [enabledVerticals])

  // ── persist the rollup so lists don't have to recompute ────────────────
  useEffect(() => {
    if (loading || !takeoff) return
    const totals = {
      total_bcy: result.volumes.bcy,
      total_lcy: result.volumes.lcy,
      total_loads: result.loads,
      total_machine_hours: result.machine_hours,
      bid_total: result.rollup.total,
      ready_to_send: result.ready_to_send,
      totals: result.rollup,
      updated_at: new Date().toISOString(),
    }
    const same =
      Number(takeoff.bid_total) === totals.bid_total &&
      Number(takeoff.total_bcy) === totals.total_bcy &&
      takeoff.ready_to_send === totals.ready_to_send
    if (same) return
    supabase.from('dig_takeoffs').update(totals).eq('id', takeoff.id).then(() => {
      setTakeoff((t) => (t ? { ...t, ...totals } : t))
    })
  }, [result, takeoff, loading])

  // ── item CRUD ──────────────────────────────────────────────────────────
  const openAdd = () => { setDraft({ ...blankItem, soil_class: site?.default_soil_class || '' }); setEditingId(null); setSheetOpen(true) }
  const openEdit = (row) => {
    setDraft({
      ...blankItem,
      ...row,
      length_ft: row.length_ft ?? '', width_ft: row.width_ft ?? '', depth_ft: row.depth_ft ?? '',
      perimeter_ft: row.perimeter_ft ?? '', area_sf: row.area_sf ?? '',
      top_area_sf: row.top_area_sf ?? '', bottom_area_sf: row.bottom_area_sf ?? '',
      count: row.count ?? '', slope_ratio: row.slope_ratio ?? '',
      overdig_each_side_ft: row.overdig_each_side_ft ?? '',
      volume_bcy_input: row.volume_bcy_input ?? '',
      tons_input: row.tons_input ?? '', loads_input: row.loads_input ?? '',
      equipment: row.equipment ?? '', truck: row.truck ?? '',
      soil_class: row.soil_class ?? '',
    })
    setEditingId(row.id)
    setSheetOpen(true)
  }

  const saveItem = async () => {
    if (!draft.work_type || !preview) return
    setSaving(true)
    const p = preview
    const payload = {
      company_id: companyId,
      takeoff_id: Number(id),
      sort_order: editingId ? undefined : rows.length,
      work_type: draft.work_type,
      label: draft.label || p.label,
      soil_class: p.soil_class,
      length_ft: draft.length_ft === '' ? null : Number(draft.length_ft),
      width_ft: draft.width_ft === '' ? null : Number(draft.width_ft),
      depth_ft: draft.depth_ft === '' ? null : Number(draft.depth_ft),
      perimeter_ft: draft.perimeter_ft === '' ? null : Number(draft.perimeter_ft),
      area_sf: draft.area_sf === '' ? null : Number(draft.area_sf),
      top_area_sf: draft.top_area_sf === '' ? null : Number(draft.top_area_sf),
      bottom_area_sf: draft.bottom_area_sf === '' ? null : Number(draft.bottom_area_sf),
      count: draft.count === '' ? null : Number(draft.count),
      protection: draft.protection || null,
      slope_ratio: draft.slope_ratio === '' ? null : Number(draft.slope_ratio),
      overdig_each_side_ft: draft.overdig_each_side_ft === '' ? null : Number(draft.overdig_each_side_ft),
      volume_bcy_input: draft.volume_bcy_input === '' ? null : Number(draft.volume_bcy_input),
      tons_input: draft.tons_input === '' || draft.tons_input == null ? null : Number(draft.tons_input),
      loads_input: draft.loads_input === '' || draft.loads_input == null ? null : Number(draft.loads_input),
      equipment: draft.equipment || null,
      truck: draft.truck || null,
      // Engine output, persisted so PDFs and lists never recompute.
      volume_bcy: p.volume_bcy, volume_lcy: p.volume_lcy, volume_ccy: p.volume_ccy,
      loads: p.loads, tons: p.tons, machine_hours: p.machine_hours,
      rate_code: p.rate_code, unit_of_measure: p.uom, quantity: p.quantity,
      unit_price: p.unit_price, extension: p.extension, cost: p.cost, kind: p.kind,
      source: draft.source || 'manual',
      source_ref: draft.source_ref || null,
      confidence: draft.confidence ?? null,
      warnings: p.warnings?.length ? p.warnings : null,
      notes: draft.notes || null,
      updated_at: new Date().toISOString(),
    }
    if (editingId) delete payload.sort_order

    const res = editingId
      ? await supabase.from('dig_takeoff_items').update(payload).eq('id', editingId)
      : await supabase.from('dig_takeoff_items').insert(payload)
    setSaving(false)
    if (res.error) { alert('Could not save: ' + res.error.message); return }
    setSheetOpen(false)
    load()
  }

  const deleteItem = async (rowId) => {
    if (!confirm('Remove this item from the takeoff?')) return
    await supabase.from('dig_takeoff_items').delete().eq('id', rowId)
    load()
  }

  const confirmItem = async (row) => {
    await supabase.from('dig_takeoff_items')
      .update({ confirmed_by: currentEmployeeId, confirmed_at: new Date().toISOString() })
      .eq('id', row.id)
    load()
  }

  // ── push to the sales pipeline ─────────────────────────────────────────
  // One shared intake writes the quote and its lines (lib/estimateIntake), so
  // Don invents neither a second money path nor a second quote_lines shape.
  // It also owns the rollback: if the lines fail or come back short, the
  // header is undone rather than left looking finished.
  const pushToQuote = async () => {
    if (!result.ready_to_send) return
    setPushing(true)
    const siteLabel = site?.site_name || site?.address || `Site #${site?.id}`
    try {
      const { quote, lineCount } = await createEstimateFromIntake(supabase, {
        source: 'don',
        company_id: companyId,
        lead_id: site?.lead_id || null,
        customer_id: site?.customer_id || null,
        salesperson_id: currentEmployeeId,
        // Deliberately null, not takeoff.id — see the audit_id note on
        // EstimateIntake. The link to the takeoff lives on dig_takeoffs.quote_id.
        audit_id: null,
        audit_type: 'excavation',
        service_type: 'Excavation',
        estimate_name: `Excavation — ${siteLabel}`,
        summary: `${fmtNum(result.volumes.bcy)} BCY · ${fmtNum(result.loads)} loads · ${fmtNum(result.machine_hours, 1)} machine hrs`,
        notes: result.assumptions.join(String.fromCharCode(10)),
        // No quote_amount on purpose: the header is whatever the lines add up
        // to, so a customer reading the body cannot find a different number
        // at the top.
        lines: toIntakeLines(result),
      })

      await supabase.from('dig_takeoffs')
        .update({ quote_id: quote.id, status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', takeoff.id)
      if (site?.lead_id) fetchLeads?.()

      // Count what the database confirmed, never what we hoped to send.
      setFlash(`Pushed to the pipeline as Quote #${quote.id} with ${lineCount} line items.`)
      load()
    } catch (e) {
      setFlash(e.message)
    } finally {
      setPushing(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, background: T.bg, minHeight: '100%' }}>Loading takeoff…</div>
  }
  if (!takeoff) {
    return (
      <Screen>
        <Empty icon={AlertTriangle} title="Takeoff not found" body="It may have been deleted." action={<Btn onClick={() => navigate('/agents/don/takeoff')}>Back to takeoffs</Btn>} />
      </Screen>
    )
  }

  const geometry = WORK_TYPES[draft.work_type]?.geometry
  // The phone stacks up to three fixed bars along the bottom: the agent tab
  // bar, Don's running total above it, and push-to-quote above that when it's
  // showing. The page has to clear whichever are present — 9px short and the
  // last line of the exclusions sits behind a button.
  const PUSH_BAR = 64
  const showsPushBar = isMobile && rows.length > 0 && !takeoff?.quote_id
  const barHeight = isMobile
    ? STATBAR_HEIGHT + MOBILE_TABBAR_HEIGHT + (showsPushBar ? PUSH_BAR : 0) + 16
    : 0

  return (
    <div style={{ background: T.bg, minHeight: '100%' }}>
      <Screen bottomInset={barHeight}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, minWidth: 0 }}>
          <button
            onClick={() => navigate('/agents/don/takeoff')}
            style={{
              minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, color: T.textSecondary,
              cursor: 'pointer', flexShrink: 0,
            }}
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {takeoff.name || `Takeoff #${takeoff.id}`}
            </div>
            <div style={{ fontSize: 13, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {site?.site_name || site?.address || 'No site'}
              {site?.default_soil_class ? ` · ${SOIL_PROFILES[site.default_soil_class]?.label}` : ''}
            </div>
          </div>
          {!isMobile && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <Btn variant="ghost" onClick={() => setMeasureOpen(true)}><Ruler size={18} /> Measure</Btn>
              <Btn variant="clay" onClick={() => setReadOpen(true)}><ScanLine size={18} /> Read a page</Btn>
              <Btn onClick={openAdd}><Plus size={18} /> Add item</Btn>
            </div>
          )}
        </div>

        {flash && <div style={{ marginBottom: 12 }}><Note tone="accent" icon={CheckCircle2}>{flash}</Note></div>}

        {priceBook.length === 0 && (
          <div style={{ marginBottom: 12 }}>
            <Note tone="warning" icon={TriangleAlert}>
              No price book yet — quantities will compute but every line prices at zero.{' '}
              <a onClick={() => navigate('/agents/don/price-book')} style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>
                Install a starter price book
              </a>.
            </Note>
          </div>
        )}

        {/* Items */}
        {rows.length === 0 ? (
          <Empty
            icon={Layers}
            title="Nothing taken off yet"
            body="Photograph the notes you already wrote, or add items by hand. Either way the volumes, truck loads and machine hours come out the other side."
            action={
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Btn variant="clay" onClick={() => setReadOpen(true)}><ScanLine size={18} /> Read a page</Btn>
                <Btn variant="ghost" onClick={() => setMeasureOpen(true)}><Ruler size={18} /> Measure</Btn>
                <Btn variant="ghost" onClick={openAdd}><Plus size={18} /> Add by hand</Btn>
              </div>
            }
          />
        ) : (
          <>
            <SectionLabel right={
              <span style={{ fontSize: 12, color: T.textMuted }}>
                {fmtNum(result.machine_hours, 1)} machine hrs
              </span>
            }>
              {rows.length} item{rows.length === 1 ? '' : 's'}
            </SectionLabel>

            <div style={{ display: 'grid', gap: 10 }}>
              {result.bidItems.map((b, i) => {
                const row = rows[i]
                const needsReview = b.confidence != null && b.confidence < (bidSettings.confidence_threshold) && !b.confirmed_by
                return (
                  <Card key={row?.id ?? i} accent={b.unpriced ? T.warning : needsReview ? T.clay : undefined}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {b.label}
                        </div>
                        <div style={{ fontSize: 13, color: T.textSecondary, marginTop: 2 }}>
                          {fmtNum(b.quantity, b.uom === 'SF' ? 0 : 1)} {b.uom}
                          {b.unit_price > 0 && <> @ ${fmtNum(b.unit_price, 2)}</>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: b.unpriced ? T.warning : T.accent, fontVariantNumeric: 'tabular-nums' }}>
                          {b.unpriced ? '—' : fmtMoney(b.extension)}
                        </div>
                      </div>
                    </div>

                    {/* The volume story, which is the number they actually argue about */}
                    {b.volume_bcy > 0 && (
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(0, 1fr))',
                        gap: 8, marginTop: 10, padding: '8px 10px',
                        background: T.bgSunk, borderRadius: 8, fontSize: 12, color: T.textSecondary,
                      }}>
                        <span style={{ whiteSpace: 'nowrap' }}><strong style={{ color: T.text }}>{fmtNum(b.volume_bcy)}</strong> bank</span>
                        <span style={{ whiteSpace: 'nowrap' }}><strong style={{ color: T.text }}>{fmtNum(b.volume_lcy)}</strong> loose</span>
                        {b.loads > 0 && <span style={{ whiteSpace: 'nowrap' }}><Truck size={11} style={{ verticalAlign: -1 }} /> <strong style={{ color: T.text }}>{b.loads}</strong></span>}
                        {b.machine_hours > 0 && <span style={{ whiteSpace: 'nowrap' }}><Clock size={11} style={{ verticalAlign: -1 }} /> <strong style={{ color: T.text }}>{fmtNum(b.machine_hours, 1)}</strong> h</span>}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' }}>
                      <SourceBadge source={b.source} confidence={b.confidence} confirmed={!!b.confirmed_by} />
                      <Badge tone="muted">{b.soil_label}</Badge>
                      {b.geometry?.slope_ratio > 0 && <Badge tone="clay">sloped {b.geometry.slope_ratio}:1</Badge>}
                      {b.min_charge_applied && <Badge tone="muted">minimum</Badge>}
                      <div style={{ flex: 1 }} />
                      {needsReview && (
                        <button onClick={() => confirmItem(row)} style={iconBtn}><ShieldCheck size={16} /></button>
                      )}
                      <button onClick={() => openEdit(row)} style={iconBtn} aria-label="Edit item"><Pencil size={16} /></button>
                      <button onClick={() => deleteItem(row.id)} style={iconBtn} aria-label="Delete item"><Trash2 size={16} /></button>
                    </div>

                    {(b.warnings || []).map((w, wi) => (
                      <div key={wi} style={{ marginTop: 8 }}>
                        <Note tone="warning" icon={TriangleAlert}>{w}</Note>
                      </div>
                    ))}
                  </Card>
                )
              })}
            </div>

            {/* Rollup */}
            <SectionLabel>Bid</SectionLabel>
            <Card>
              <RollRow label="Line items" value={fmtMoney(result.rollup.subtotal)} />
              {result.rollup.mobilization > 0 && <RollRow label="Mobilization" value={fmtMoney(result.rollup.mobilization)} />}
              <RollRow label={`Overhead ${Math.round(bidSettings.overhead_percent * 100)}%`} value={fmtMoney(result.rollup.overhead)} />
              <RollRow label={`Profit ${Math.round(bidSettings.profit_percent * 100)}%`} value={fmtMoney(result.rollup.profit)} />
              {result.rollup.tax > 0 && <RollRow label="Tax" value={fmtMoney(result.rollup.tax)} />}
              <div style={{ borderTop: `2px solid ${T.accent}`, marginTop: 8, paddingTop: 8 }}>
                <RollRow label="Bid total" value={fmtMoney(result.rollup.total)} big />
              </div>
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 6 }}>
                Cost {fmtMoney(result.rollup.direct_cost)} · margin {fmtMoney(result.rollup.margin)} ({Math.round(result.rollup.margin_percent * 100)}%)
              </div>
            </Card>

            {/* Assumptions — the engine writes its own exclusions page */}
            {result.assumptions.length > 0 && (
              <>
                <SectionLabel>Qualifications & exclusions</SectionLabel>
                <Card>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: T.textSecondary, lineHeight: 1.6 }}>
                    {result.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </Card>
              </>
            )}

            {/* Push */}
            {!isMobile && (
              <div style={{ marginTop: 16 }}>
                {takeoff.quote_id ? (
                  <Note tone="accent" icon={FileText}>
                    Pushed to the pipeline as{' '}
                    <button onClick={() => navigate(`/estimates/${takeoff.quote_id}`)} style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>Quote #{takeoff.quote_id}</button>.
                  </Note>
                ) : (
                  <Btn onClick={pushToQuote} disabled={!result.ready_to_send || pushing} full>
                    <Send size={18} /> {pushing ? 'Pushing…' : 'Push to quote'}
                  </Btn>
                )}
                {!result.ready_to_send && <ReadyHint result={result} />}
              </div>
            )}
          </>
        )}
      </Screen>

      {/* Running total — pinned on the phone, sticky on the laptop */}
      {rows.length > 0 && (
        <StatBar
          isMobile={isMobile}
          stats={[
            { label: 'Bank CY', value: fmtNum(result.volumes.bcy) },
            { label: 'Loads', value: fmtNum(result.loads) },
            { label: 'Bid', value: fmtMoney(result.rollup.total), color: T.accent, big: true },
          ]}
          action={
            isMobile ? (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <Btn variant="ghost" onClick={() => setMeasureOpen(true)} style={{ padding: '0 11px' }} aria-label="Measure off a plan">
                  <Ruler size={19} />
                </Btn>
                <Btn variant="clay" onClick={() => setReadOpen(true)} style={{ padding: '0 11px' }} aria-label="Read a page">
                  <ScanLine size={20} />
                </Btn>
                <Btn onClick={openAdd} style={{ padding: '0 13px' }} aria-label="Add item">
                  <Plus size={20} />
                </Btn>
              </div>
            ) : null
          }
        />
      )}

      {/* Phone-only push bar sits above the stat bar as a full-width action */}
      {isMobile && rows.length > 0 && !takeoff.quote_id && (
        <div style={{
          position: 'fixed',
          bottom: `calc(${MOBILE_TABBAR_HEIGHT}px + ${STATBAR_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
          left: 0, right: 0, padding: '0 14px 8px', zIndex: 54,
        }}>
          <Btn onClick={pushToQuote} disabled={!result.ready_to_send || pushing} full variant="clay">
            <Send size={18} /> {pushing ? 'Pushing…' : result.ready_to_send ? 'Push to quote' : 'Not ready to send'}
          </Btn>
        </div>
      )}

      {/* ── Don reads a page ──────────────────────────────────────────── */}
      <ReadSheet
        open={readOpen}
        onClose={() => setReadOpen(false)}
        isMobile={isMobile}
        takeoffId={Number(id)}
        site={site}
        existingCount={rows.length}
        onAdded={({ items, corrections, actuals }) => {
          setFlash(
            `Added ${items} item${items === 1 ? '' : 's'} from the page` +
            (corrections ? ` · ${corrections} correction${corrections === 1 ? '' : 's'} logged, Don will remember` : '') +
            (actuals ? ` · ${actuals} logged to actuals` : '') + '.'
          )
          load()
        }}
      />

      <PlanMeasure
        open={measureOpen}
        onClose={() => setMeasureOpen(false)}
        takeoffId={Number(id)}
        site={site}
        existingCount={rows.length}
        onAdded={({ label }) => { setFlash(`Traced ${label.toLowerCase()} off the sheet and added it.`); load() }}
      />

      {/* ── Add / edit item sheet ─────────────────────────────────────── */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        isMobile={isMobile}
        title={editingId ? 'Edit item' : 'Add takeoff item'}
        footer={
          <div style={{ display: 'grid', gap: 8 }}>
            {preview && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                fontSize: 13, color: T.textSecondary, padding: '0 2px',
              }}>
                <span>{fmtNum(preview.quantity, 1)} {preview.uom}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: T.accent, fontVariantNumeric: 'tabular-nums' }}>
                  {preview.unpriced ? 'unpriced' : fmtMoney(preview.extension)}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setSheetOpen(false)} style={{ flex: 1 }}>Cancel</Btn>
              <Btn onClick={saveItem} disabled={!draft.work_type || saving} style={{ flex: 2 }}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add to takeoff'}
              </Btn>
            </div>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
          {/* Work type — big chips, filtered to the verticals they turned on */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 8 }}>What are we doing?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {workTypeOptions.map((w) => (
                <Chip
                  key={w.key}
                  active={draft.work_type === w.key}
                  onClick={() => setDraft({ ...draft, work_type: w.key, label: '' })}
                >
                  {w.label}
                </Chip>
              ))}
            </div>
          </div>

          {draft.work_type && (
            <>
              {/* Geometry — only the fields this work type actually uses */}
              {geometry === 'trench' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                    <Field label="Length"><NumInput big value={draft.length_ft} onChange={(v) => setDraft({ ...draft, length_ft: v })} unit="ft" /></Field>
                    <Field label="Width"><NumInput big value={draft.width_ft} onChange={(v) => setDraft({ ...draft, width_ft: v })} unit="ft" /></Field>
                    <Field label="Depth"><NumInput big value={draft.depth_ft} onChange={(v) => setDraft({ ...draft, depth_ft: v })} unit="ft" /></Field>
                  </div>

                  {/* The moment that sells the product */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, marginBottom: 8 }}>How are the walls held up?</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
                      <Chip active={draft.protection === 'shored'} onClick={() => setDraft({ ...draft, protection: 'shored' })} style={{ justifyContent: 'center', minHeight: 52 }}>
                        Trench box
                      </Chip>
                      <Chip active={draft.protection === 'sloped'} onClick={() => setDraft({ ...draft, protection: 'sloped' })} style={{ justifyContent: 'center', minHeight: 52 }}>
                        Sloped back
                      </Chip>
                    </div>
                    {protectionDelta && (
                      <div style={{ marginTop: 8 }}>
                        <Note tone={draft.protection === 'sloped' ? 'warning' : 'info'} icon={TriangleAlert}>
                          Box <strong>{fmtNum(protectionDelta.shored)} CY</strong> · sloped <strong>{fmtNum(protectionDelta.sloped)} CY</strong>
                          {' '}— <strong>{protectionDelta.ratio.toFixed(1)}×</strong> the dirt. Laying the walls back is the quantity most bids get wrong.
                        </Note>
                      </div>
                    )}
                  </div>
                </>
              )}

              {geometry === 'prism' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
                  <Field label="Area"><NumInput big value={draft.area_sf} onChange={(v) => setDraft({ ...draft, area_sf: v })} unit="sf" /></Field>
                  <Field label="Avg depth"><NumInput big value={draft.depth_ft} onChange={(v) => setDraft({ ...draft, depth_ft: v })} unit="ft" /></Field>
                </div>
              )}

              {geometry === 'footing' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                    <Field label="Perimeter"><NumInput big value={draft.perimeter_ft} onChange={(v) => setDraft({ ...draft, perimeter_ft: v })} unit="ft" /></Field>
                    <Field label="Width"><NumInput big value={draft.width_ft} onChange={(v) => setDraft({ ...draft, width_ft: v })} unit="ft" /></Field>
                    <Field label="Depth"><NumInput big value={draft.depth_ft} onChange={(v) => setDraft({ ...draft, depth_ft: v })} unit="ft" /></Field>
                  </div>
                  <Field label="Working room each side" hint="Somewhere for a person and a form to stand. Default 2 ft.">
                    <NumInput value={draft.overdig_each_side_ft} onChange={(v) => setDraft({ ...draft, overdig_each_side_ft: v })} unit="ft" placeholder="2" />
                  </Field>
                </>
              )}

              {geometry === 'basin' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                  <Field label="Top area"><NumInput big value={draft.top_area_sf} onChange={(v) => setDraft({ ...draft, top_area_sf: v })} unit="sf" /></Field>
                  <Field label="Bottom area"><NumInput big value={draft.bottom_area_sf} onChange={(v) => setDraft({ ...draft, bottom_area_sf: v })} unit="sf" /></Field>
                  <Field label="Depth"><NumInput big value={draft.depth_ft} onChange={(v) => setDraft({ ...draft, depth_ft: v })} unit="ft" /></Field>
                </div>
              )}

              {geometry === 'area' && (
                <Field label="Area"><NumInput big value={draft.area_sf} onChange={(v) => setDraft({ ...draft, area_sf: v })} unit="sf" /></Field>
              )}

              {geometry === 'volume' && (
                <Field label="Volume" hint="Bank cubic yards — Don converts to loose for the truck count.">
                  <NumInput big value={draft.volume_bcy_input} onChange={(v) => setDraft({ ...draft, volume_bcy_input: v })} unit="bcy" />
                </Field>
              )}

              {WORK_TYPES[draft.work_type]?.uom === 'EA' && (
                <Field label="How many"><NumInput big value={draft.count} onChange={(v) => setDraft({ ...draft, count: v })} unit="ea" /></Field>
              )}

              {/* Stated beats derived. A delivery ticket knows the tonnage
                  better than anything we work out from a volume, and a load
                  somebody counted is not up for recalculation. */}
              {WORK_TYPES[draft.work_type]?.uom === 'TON' && (
                <Field label="Tons" hint="Off the ticket. Leave blank to derive it from the volume above.">
                  <NumInput big value={draft.tons_input} onChange={(v) => setDraft({ ...draft, tons_input: v })} unit="ton" />
                </Field>
              )}
              {WORK_TYPES[draft.work_type]?.uom === 'LOAD' && (
                <Field label="Loads" hint="If you counted them. Leave blank and Don works them out from the loose volume.">
                  <NumInput big value={draft.loads_input} onChange={(v) => setDraft({ ...draft, loads_input: v })} unit="loads" />
                </Field>
              )}

              {/* The live readout — this is what makes the sheet feel alive */}
              {preview && preview.volume_bcy > 0 && (
                <div style={{
                  background: T.accentBg, border: `1px solid ${T.accent}44`,
                  borderRadius: 12, padding: 12,
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
                    <Readout label="Bank" value={`${fmtNum(preview.volume_bcy)} CY`} />
                    <Readout label="Loose (hauled)" value={`${fmtNum(preview.volume_lcy)} CY`} />
                    <Readout label="Truck loads" value={fmtNum(preview.loads)} sub={preview.truck_bound_by === 'weight' ? `weight-limited @ ${preview.truck_effective_cy} CY` : null} />
                    <Readout label="Machine hours" value={fmtNum(preview.machine_hours, 1)} sub={preview.equipment_label} />
                  </div>
                </div>
              )}

              {/* Soil — defaults from the site, overridable per item */}
              <Field label="Soil" hint={site?.default_soil_class ? `Site default: ${SOIL_PROFILES[site.default_soil_class]?.label}` : undefined}>
                <Select
                  value={draft.soil_class}
                  onChange={(v) => setDraft({ ...draft, soil_class: v })}
                  placeholder="Use site default"
                  options={SOIL_OPTIONS}
                />
              </Field>

              <details>
                <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: T.textSecondary, minHeight: 44, display: 'flex', alignItems: 'center' }}>
                  Equipment, truck and label
                </summary>
                <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
                  <Field label="Label" hint="Leave blank to use the work type name">
                    <TextInput value={draft.label} onChange={(v) => setDraft({ ...draft, label: v })} placeholder={WORK_TYPES[draft.work_type]?.label} />
                  </Field>
                  <Field label="Equipment">
                    <Select value={draft.equipment} onChange={(v) => setDraft({ ...draft, equipment: v })} placeholder="Use default" options={EQUIP_OPTIONS} />
                  </Field>
                  <Field label="Truck">
                    <Select value={draft.truck} onChange={(v) => setDraft({ ...draft, truck: v })} placeholder="Use default" options={TRUCK_OPTIONS} />
                  </Field>
                </div>
              </details>

              {preview?.unpriced && (
                <Note tone="warning" icon={TriangleAlert}>
                  No price-book row matches <strong>{WORK_TYPES[draft.work_type]?.label}</strong>. The quantity still lands on the bid, priced at zero, so nothing hides.
                </Note>
              )}
            </>
          )}
        </div>
      </Sheet>
    </div>
  )
}

const iconBtn = {
  minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer',
}

function RollRow({ label, value, big }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', gap: 12 }}>
      <div style={{ fontSize: big ? 16 : 14, fontWeight: big ? 700 : 500, color: big ? T.text : T.textSecondary }}>{label}</div>
      <div style={{ fontSize: big ? 22 : 15, fontWeight: big ? 700 : 600, color: big ? T.accent : T.text, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function Readout({ label, value, sub }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.clay, fontWeight: 600 }}>{sub}</div>}
    </div>
  )
}

function ReadyHint({ result }) {
  const bits = []
  if (result.unpriced_count) bits.push(`${result.unpriced_count} line${result.unpriced_count === 1 ? '' : 's'} without a price`)
  if (result.low_confidence_count) bits.push(`${result.low_confidence_count} unconfirmed AI guess${result.low_confidence_count === 1 ? '' : 'es'}`)
  if (!bits.length) return null
  return (
    <div style={{ marginTop: 8 }}>
      <Note tone="warning" icon={AlertTriangle}>
        Not ready to send: {bits.join(' and ')}. A bid does not leave here with a hole in it.
      </Note>
    </div>
  )
}
