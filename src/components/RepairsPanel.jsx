// Repairs, tyres and damage — the unplanned spend that decides when to sell.
//
// fleet_repairs has existed since the economics migration and nothing has ever
// written to it. Before that, a repair was four columns on the fleet row —
// repair_date, repair_cost, repair_description, repair_id — which allowed
// exactly one repair per machine for its entire life, and gave tyres nowhere
// to live at all despite being the fifth largest cost in a fleet.
//
// This matters beyond bookkeeping. The replacement decision rests on operating
// cost RISING as a machine ages, and repairs are that curve. Scheduled
// maintenance is predictable and roughly flat; repairs are what climb. Kept in
// one bucket they average out and flatten the exact signal the sell-or-keep
// call depends on, which is why fleet_maintenance and fleet_repairs are
// separate tables rather than one with a type column.
//
// Built for the phone first: this gets filled in standing at a counter holding
// an invoice, not at a desk.

import { useEffect, useMemo, useState } from 'react'
import { Wrench, Plus, X, CircleDot, AlertTriangle, ShieldCheck, Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'

// Tyres get their own category rather than hiding inside "repair" because
// they are a top-five fleet cost and behave differently: predictable by
// mileage, and a fleet that knows its tyre spend can negotiate on it.
const CATEGORIES = [
  { value: 'repair',   label: 'Repair',   icon: Wrench,      colour: '#c2410c' },
  { value: 'tires',    label: 'Tires',    icon: CircleDot,   colour: '#4d5a52' },
  { value: 'damage',   label: 'Damage',   icon: AlertTriangle, colour: '#b91c1c' },
  { value: 'warranty', label: 'Warranty', icon: ShieldCheck, colour: '#15803d' },
  { value: 'other',    label: 'Other',    icon: Package,     colour: '#7d8a7f' },
]

const catMeta = v => CATEGORIES.find(c => c.value === v) || CATEGORIES[4]
const money = n => (n === null || n === undefined || n === '' ? '—' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

const emptyForm = () => ({
  repair_date: new Date().toISOString().slice(0, 10),
  category: 'repair',
  description: '',
  cost: '',
  vendor: '',
  invoice_number: '',
  meter: '',
  downtime_days: '',
})

export default function RepairsPanel({ asset, theme, onChanged }) {
  const isMobile = useIsMobile()
  const [rows, setRows] = useState(null)   // null = not fetched yet
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const basis = asset?.meter_basis === 'hours' ? 'hours' : 'miles'
  const loading = rows === null

  const load = async () => {
    if (!asset?.id) return
    const { data } = await supabase
      .from('fleet_repairs')
      .select('*')
      .eq('company_id', asset.company_id)
      .eq('fleet_id', asset.id)
      .order('repair_date', { ascending: false })
    setRows(data || [])
  }

  useEffect(() => {
    // Guarded so a fast unmount (tapping through vehicles) cannot set state
    // on a component that has gone, and so the lint can see the write is
    // asynchronous rather than part of the effect's own tick.
    let cancelled = false
    if (!asset?.id) return
    ;(async () => {
      const { data } = await supabase
        .from('fleet_repairs')
        .select('*')
        .eq('company_id', asset.company_id)
        .eq('fleet_id', asset.id)
        .order('repair_date', { ascending: false })
      if (!cancelled) setRows(data || [])
    })()
    return () => { cancelled = true }
  }, [asset?.id, asset?.company_id])

  const totals = useMemo(() => {
    const byCat = {}
    let all = 0
    let downtime = 0
    for (const r of rows || []) {
      const c = Number(r.cost) || 0
      // Warranty work costs nothing and must not inflate the running-cost
      // curve — but it is still worth recording, because a machine needing
      // repeated warranty work is telling you something.
      if (r.category !== 'warranty') { all += c; byCat[r.category] = (byCat[r.category] || 0) + c }
      downtime += Number(r.downtime_days) || 0
    }
    return { all, byCat, downtime }
  }, [rows])

  const save = async () => {
    if (!form.repair_date) { setError('Pick a date.'); return }
    setSaving(true)
    setError(null)
    const num = v => (v === '' || v === null || v === undefined ? null : Number(v))
    const { error: err } = await supabase.from('fleet_repairs').insert({
      company_id: asset.company_id,
      fleet_id: asset.id,
      repair_date: form.repair_date,
      category: form.category,
      description: form.description || null,
      cost: num(form.cost),
      vendor: form.vendor || null,
      invoice_number: form.invoice_number || null,
      // Spend is placed on the meter, not just the calendar. Two machines a
      // year apart in age can be thousands of hours apart in wear, and a
      // cost-per-hour curve built on dates alone says nothing.
      hours_at_repair: basis === 'hours' ? num(form.meter) : null,
      odometer_at_repair: basis === 'miles' ? num(form.meter) : null,
      downtime_days: num(form.downtime_days),
    })
    setSaving(false)
    if (err) { setError(err.message); return }

    // A meter reading taken off the machine at the shop is a human-verified
    // anchor, which is worth more than anything telematics can supply.
    if (form.meter) {
      await supabase.from('fleet_meter_readings').insert({
        company_id: asset.company_id,
        fleet_id: asset.id,
        recorded_at: new Date(`${form.repair_date}T12:00:00`).toISOString(),
        [basis === 'hours' ? 'engine_hours' : 'odometer_miles']: Number(form.meter),
        source: 'maintenance',
        notes: 'Meter read at a repair',
      }).then(() => {}, () => {})
    }

    setForm(emptyForm())
    setOpen(false)
    await load()
    onChanged?.()
  }

  const field = {
    width: '100%', minHeight: 44, padding: '0 10px', boxSizing: 'border-box',
    background: theme.bg, border: `1px solid ${theme.border}`,
    borderRadius: 8, color: theme.text, fontSize: 16,   // 16px: iOS zooms the page on any smaller input
  }
  const label = { fontSize: 11, color: theme.textMuted, display: 'block', marginBottom: 4 }

  return (
    <div style={{ background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 12, padding: isMobile ? 16 : 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: theme.text }}>Repairs &amp; tires</h3>
        <button
          onClick={() => { setForm(emptyForm()); setOpen(true) }}
          style={{
            minHeight: 44, padding: '0 14px', borderRadius: 8, border: 'none',
            background: theme.accent, color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}
        >
          <Plus size={16} /> Add
        </button>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: theme.textMuted }}>
        Unplanned spend. This is the cost that climbs as a machine ages, and the reason a
        replacement eventually pays for itself.
      </p>

      {(rows?.length || 0) > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(0, 130px))',
          gap: 10, marginBottom: 14,
        }}>
          <Stat theme={theme} label="Total" value={money(totals.all)} />
          {totals.byCat.tires > 0 && <Stat theme={theme} label="Tires" value={money(totals.byCat.tires)} />}
          {totals.downtime > 0 && (
            // Days off the road are usually the larger loss and almost never
            // recorded anywhere.
            <Stat theme={theme} label="Days down" value={String(totals.downtime)} />
          )}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: theme.textMuted, padding: 12 }}>Loading…</div>
      ) : (rows?.length || 0) === 0 ? (
        <div style={{
          textAlign: 'center', padding: 20, fontSize: 13, color: theme.textMuted,
          background: theme.bg, border: `1px dashed ${theme.border}`, borderRadius: 8,
        }}>
          Nothing logged yet. Add repairs and tires as they happen and Freddy can tell you
          when this machine stops being worth keeping.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(rows || []).map(r => {
            const meta = catMeta(r.category)
            const Icon = meta.icon
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12,
                background: theme.bg, border: `1px solid ${theme.border}`,
                borderLeft: `3px solid ${meta.colour}`, borderRadius: 8,
              }}>
                <Icon size={16} style={{ color: meta.colour, marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                    {r.description || meta.label}
                  </div>
                  <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                    {r.repair_date}
                    {r.vendor ? ` · ${r.vendor}` : ''}
                    {r.odometer_at_repair ? ` · ${Number(r.odometer_at_repair).toLocaleString()} mi` : ''}
                    {r.hours_at_repair ? ` · ${Number(r.hours_at_repair).toLocaleString()} hrs` : ''}
                    {r.downtime_days ? ` · ${r.downtime_days}d down` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: r.category === 'warranty' ? '#15803d' : theme.text, flexShrink: 0 }}>
                  {r.category === 'warranty' && !Number(r.cost) ? 'covered' : money(r.cost)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 90 }} />
          <div style={{
            position: 'fixed', zIndex: 91, background: theme.bgCard,
            // A bottom sheet on a phone — reachable, and it does not fight the
            // keyboard the way a centred dialog does. A centred modal on a
            // laptop.
            ...(isMobile
              ? { left: 0, right: 0, bottom: 0, borderRadius: '16px 16px 0 0', maxHeight: '90vh' }
              : { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 520, maxWidth: '92vw', borderRadius: 12, maxHeight: '86vh' }),
            overflowY: 'auto', padding: 20,
            paddingBottom: isMobile ? 'calc(20px + env(safe-area-inset-bottom, 0px))' : 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: theme.text }}>Log a repair</h3>
              <button onClick={() => setOpen(false)} style={{ width: 44, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            {/* Category as buttons, not a select. Five options, and the whole
                point is that tyres are one tap rather than buried in a list. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {CATEGORIES.map(c => {
                const Icon = c.icon
                const on = form.category === c.value
                return (
                  <button
                    key={c.value}
                    onClick={() => setForm(f => ({ ...f, category: c.value }))}
                    style={{
                      minHeight: 44, padding: '0 12px', borderRadius: 22, cursor: 'pointer',
                      border: `1.5px solid ${on ? c.colour : theme.border}`,
                      background: on ? `${c.colour}1a` : 'transparent',
                      color: on ? c.colour : theme.textSecondary,
                      fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <Icon size={14} /> {c.label}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
              <div>
                <label style={label}>Date</label>
                <input type="date" value={form.repair_date} onChange={e => setForm(f => ({ ...f, repair_date: e.target.value }))} style={field} />
              </div>
              <div>
                <label style={label}>Cost</label>
                <input type="number" inputMode="decimal" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} placeholder="$" style={field} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={label}>What was done</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Front brakes and rotors" style={field} />
              </div>
              <div>
                <label style={label}>Vendor</label>
                <input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} style={field} />
              </div>
              <div>
                <label style={label}>Invoice #</label>
                <input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} style={field} />
              </div>
              <div>
                <label style={label}>{basis === 'hours' ? 'Hours at repair' : 'Odometer at repair'}</label>
                <input type="number" inputMode="numeric" value={form.meter} onChange={e => setForm(f => ({ ...f, meter: e.target.value }))} placeholder="off the dash" style={field} />
              </div>
              <div>
                <label style={label}>Days out of service</label>
                <input type="number" inputMode="numeric" value={form.downtime_days} onChange={e => setForm(f => ({ ...f, downtime_days: e.target.value }))} style={field} />
              </div>
            </div>

            {error && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#b91c1c', display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertTriangle size={13} /> {error}
              </div>
            )}

            <button
              onClick={save}
              disabled={saving}
              style={{
                width: '100%', minHeight: 48, marginTop: 16, borderRadius: 10, border: 'none',
                background: theme.accent, color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ theme, label, value }) {
  return (
    <div style={{ background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{value}</div>
      <div style={{ fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    </div>
  )
}
