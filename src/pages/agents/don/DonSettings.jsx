// Don — settings. The vertical toggles live here.
//
// Turning a vertical on decides which work types the takeoff picker offers and
// which price-book pack is available to install. One engine underneath either
// way — the toggles tidy the UI, they do not fork the product.

import { useState, useEffect } from 'react'
import * as Icons from 'lucide-react'
import { Save, CheckCircle2 } from 'lucide-react'
import { useStore } from '../../../lib/store'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { supabase } from '../../../lib/supabase'
import { SOIL_PROFILES, TRUCK_TYPES, EQUIPMENT, verticalsForWorkTypes } from '../../../lib/digEstimator'
import { VERTICALS, DEFAULT_VERTICALS } from '../../../lib/donPriceBook'
import {
  T, Screen, Card, Btn, Field, NumInput, Select, Toggle,
  SectionLabel, Note, Badge,
} from '../../../components/don/DonUI'

const SOIL_OPTIONS = Object.entries(SOIL_PROFILES).map(([value, s]) => ({ value, label: s.label }))
const TRUCK_OPTIONS = Object.entries(TRUCK_TYPES).map(([value, t]) => ({ value, label: `${t.label} · ${t.volumetric_cy} CY / ${t.payload_tons} t` }))
const EQUIP_OPTIONS = Object.entries(EQUIPMENT).map(([value, e]) => ({ value, label: e.label }))

export default function DonSettings() {
  const companyId = useStore((s) => s.companyId)
  const isMobile = useIsMobile()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await supabase.from('dig_settings').select('*').eq('company_id', companyId).maybeSingle()
      setForm(data || {
        company_id: companyId,
        verticals: DEFAULT_VERTICALS,
        default_soil_class: 'common_earth',
        default_truck: 'tri_axle',
        default_equipment: 'ex_160',
        default_overdig_ft: 2,
        efficiency: 0.83,
        overhead_percent: 0.10,
        profit_percent: 0.10,
        tax_rate: 0,
        mobilization: 0,
        confidence_threshold: 0.7,
        price_book_seeded: {},
      })
    })()
  }, [companyId])

  if (!form) return <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, background: T.bg, minHeight: '100%' }}>Loading…</div>

  const verticals = form.verticals || DEFAULT_VERTICALS
  const enabledCount = verticalsForWorkTypes(verticals).length

  const toggleVertical = (key) => {
    setForm({ ...form, verticals: { ...verticals, [key]: !verticals[key] } })
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.from('dig_settings').upsert({
      company_id: companyId,
      verticals: form.verticals,
      default_soil_class: form.default_soil_class,
      default_truck: form.default_truck,
      default_equipment: form.default_equipment,
      default_overdig_ft: num(form.default_overdig_ft),
      efficiency: num(form.efficiency),
      overhead_percent: num(form.overhead_percent),
      profit_percent: num(form.profit_percent),
      tax_rate: num(form.tax_rate),
      mobilization: num(form.mobilization),
      confidence_threshold: num(form.confidence_threshold),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })
    setSaving(false)
    if (error) { alert('Save failed: ' + error.message); return }
    setSaved(true)
  }

  const pct = (v) => (v == null ? '' : Math.round(Number(v) * 100))
  const setPct = (field, v) => { setForm({ ...form, [field]: v === '' ? 0 : Number(v) / 100 }); setSaved(false) }

  return (
    <div style={{ background: T.bg, minHeight: '100%' }}>
      <Screen>
        <SectionLabel right={<Badge tone="muted">{enabledCount} work types</Badge>}>
          What kind of dirt work do you do?
        </SectionLabel>

        <Note tone="info">
          These switches decide what the takeoff picker offers and which starter prices are available.
          The math underneath is the same either way — turn on everything you actually bid.
        </Note>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
          gap: 10, marginTop: 12,
        }}>
          {Object.entries(VERTICALS).map(([key, v]) => {
            const Icon = Icons[v.icon] || Icons.Circle
            return (
              <Card key={key} accent={verticals[key] ? T.accent : undefined} style={{ padding: 0 }}>
                <button
                  onClick={() => toggleVertical(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                    minHeight: 64, padding: 14, textAlign: 'left',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                  }}
                >
                  <Icon size={22} style={{ color: verticals[key] ? T.accent : T.textMuted, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{v.label}</div>
                    <div style={{ fontSize: 12, color: T.textMuted }}>{v.blurb}</div>
                  </div>
                  <div style={{
                    width: 46, height: 28, borderRadius: 999, flexShrink: 0,
                    background: verticals[key] ? T.accent : '#cfc8b6', position: 'relative',
                  }}>
                    <div style={{
                      position: 'absolute', top: 3, left: verticals[key] ? 21 : 3,
                      width: 22, height: 22, borderRadius: '50%', background: '#fff',
                      transition: 'left 120ms', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                </button>
              </Card>
            )
          })}
        </div>

        <SectionLabel>Job defaults</SectionLabel>
        <Card>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))',
            gap: 14,
          }}>
            <Field label="Default soil" hint="New sites start here">
              <Select value={form.default_soil_class} onChange={(v) => { setForm({ ...form, default_soil_class: v }); setSaved(false) }} options={SOIL_OPTIONS} />
            </Field>
            <Field label="Default truck" hint="Weight limits bind before the box on heavy material">
              <Select value={form.default_truck} onChange={(v) => { setForm({ ...form, default_truck: v }); setSaved(false) }} options={TRUCK_OPTIONS} />
            </Field>
            <Field label="Default machine">
              <Select value={form.default_equipment} onChange={(v) => { setForm({ ...form, default_equipment: v }); setSaved(false) }} options={EQUIP_OPTIONS} />
            </Field>
            <Field label="Footing working room" hint="Each side">
              <NumInput value={form.default_overdig_ft} onChange={(v) => { setForm({ ...form, default_overdig_ft: v }); setSaved(false) }} unit="ft" />
            </Field>
            <Field label="Efficiency" hint="0.83 = the standard 50-minute hour">
              <NumInput value={form.efficiency} onChange={(v) => { setForm({ ...form, efficiency: v }); setSaved(false) }} />
            </Field>
            <Field label="Confidence threshold" hint="AI guesses below this must be confirmed before a bid can send">
              <NumInput value={form.confidence_threshold} onChange={(v) => { setForm({ ...form, confidence_threshold: v }); setSaved(false) }} />
            </Field>
          </div>
        </Card>

        <SectionLabel>Bid markup</SectionLabel>
        <Card>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
            gap: 12,
          }}>
            <Field label="Overhead"><NumInput value={pct(form.overhead_percent)} onChange={(v) => setPct('overhead_percent', v)} unit="%" /></Field>
            <Field label="Profit"><NumInput value={pct(form.profit_percent)} onChange={(v) => setPct('profit_percent', v)} unit="%" /></Field>
            <Field label="Tax"><NumInput value={pct(form.tax_rate)} onChange={(v) => setPct('tax_rate', v)} unit="%" /></Field>
            <Field label="Mobilization"><NumInput value={form.mobilization} onChange={(v) => { setForm({ ...form, mobilization: v }); setSaved(false) }} unit="$" /></Field>
          </div>
        </Card>

        <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
          <Btn onClick={save} disabled={saving} full={isMobile}>
            <Save size={18} /> {saving ? 'Saving…' : 'Save settings'}
          </Btn>
          {saved && !isMobile && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.success, fontSize: 14, fontWeight: 600 }}>
              <CheckCircle2 size={16} /> Saved
            </span>
          )}
        </div>
        {saved && isMobile && (
          <div style={{ marginTop: 10 }}><Note tone="accent" icon={CheckCircle2}>Saved.</Note></div>
        )}
      </Screen>
    </div>
  )
}

const num = (v) => (v === '' || v == null ? null : Number(v))
