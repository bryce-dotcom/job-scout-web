import { useState, useEffect } from 'react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { Save, CheckCircle2, DollarSign, Scissors, Sprout, Wrench, Calculator } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { DEFAULT_PRICING, estimateProgram } from '../../../lib/lawnEstimator'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)', success: '#22c55e',
  shadow: '0 1px 3px rgba(0,0,0,0.08)',
}

export default function ZachPricing() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()
  const companyId = useStore(s => s.companyId)
  const lawnPricing = useStore(s => s.lawnPricing)
  const fetchLawnPricing = useStore(s => s.fetchLawnPricing)

  const [form, setForm] = useState(DEFAULT_PRICING)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!companyId) return
    fetchLawnPricing()
  }, [companyId])

  useEffect(() => {
    if (lawnPricing) setForm({ ...DEFAULT_PRICING, ...lawnPricing })
  }, [lawnPricing])

  const update = (k, v) => { setForm(p => ({ ...p, [k]: v })); setSaved(false) }

  const save = async () => {
    setSaving(true); setError(null)
    const payload = {
      company_id: companyId,
      mow_per_sqft: num(form.mow_per_sqft),
      mow_minimum: num(form.mow_minimum),
      mow_minutes_per_1000sqft: num(form.mow_minutes_per_1000sqft),
      edging_per_lin_ft: num(form.edging_per_lin_ft),
      edging_default_lin_ft: int(form.edging_default_lin_ft),
      fert_per_1000sqft: num(form.fert_per_1000sqft),
      weed_per_1000sqft: num(form.weed_per_1000sqft),
      grub_per_1000sqft: num(form.grub_per_1000sqft),
      iron_per_1000sqft: num(form.iron_per_1000sqft),
      lime_per_1000sqft: num(form.lime_per_1000sqft),
      pre_emergent_per_1000sqft: num(form.pre_emergent_per_1000sqft),
      aeration_per_1000sqft: num(form.aeration_per_1000sqft),
      aeration_minimum: num(form.aeration_minimum),
      overseed_per_1000sqft: num(form.overseed_per_1000sqft),
      cleanup_per_hour: num(form.cleanup_per_hour),
      travel_per_visit: num(form.travel_per_visit),
      tax_rate: num(form.tax_rate),
      margin_multiplier: num(form.margin_multiplier),
      updated_at: new Date().toISOString(),
    }
    let result
    if (lawnPricing?.id) {
      result = await supabase.from('lawn_pricing').update(payload).eq('id', lawnPricing.id)
    } else {
      result = await supabase.from('lawn_pricing').insert(payload)
    }
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    setSaved(true); setTimeout(() => setSaved(false), 3000)
    fetchLawnPricing()
  }

  // Live preview against a 6,000 sqft sample lawn
  const preview = estimateProgram({
    property: { turf_size_sqft: 6000, mow_frequency: 'Weekly', service_start_month: 4, service_end_month: 10 },
    pricing: form,
  })

  const inputStyle = { width: '100%', padding: '10px 12px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bg, color: theme.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: theme.textSecondary, marginBottom: 4 }
  const sectionStyle = { background: theme.bgCard, borderRadius: 12, border: `1px solid ${theme.border}`, padding: 20, marginBottom: 16, boxShadow: theme.shadow }

  return (
    <div style={{ padding: isMobile ? 16 : 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: theme.text, margin: 0 }}>Pricing</h1>
        <p style={{ fontSize: 14, color: theme.textMuted, marginTop: 4 }}>Your rate card. Zach uses these numbers to price every property.</p>
      </div>

      {/* Mowing */}
      <div style={sectionStyle}>
        <Header icon={Scissors} title="Mowing" theme={theme} />
        <Grid>
          <NumField label="$ per sqft" step="0.0001" value={form.mow_per_sqft} onChange={v => update('mow_per_sqft', v)} {...{ inputStyle, labelStyle }} hint="e.g. 0.012 = $0.012/sqft" />
          <NumField label="Minimum charge ($)" step="0.50" value={form.mow_minimum} onChange={v => update('mow_minimum', v)} {...{ inputStyle, labelStyle }} hint="floor — small lawns" />
          <NumField label="Minutes per 1k sqft" step="0.5" value={form.mow_minutes_per_1000sqft} onChange={v => update('mow_minutes_per_1000sqft', v)} {...{ inputStyle, labelStyle }} hint="powers the learning loop" />
        </Grid>
        <Grid>
          <NumField label="Edging $/lin ft" step="0.01" value={form.edging_per_lin_ft} onChange={v => update('edging_per_lin_ft', v)} {...{ inputStyle, labelStyle }} />
          <NumField label="Default edging lf" step="10" value={form.edging_default_lin_ft} onChange={v => update('edging_default_lin_ft', v)} {...{ inputStyle, labelStyle }} />
          <NumField label="Travel/visit ($)" step="1" value={form.travel_per_visit} onChange={v => update('travel_per_visit', v)} {...{ inputStyle, labelStyle }} />
        </Grid>
      </div>

      {/* Treatments */}
      <div style={sectionStyle}>
        <Header icon={Sprout} title="Treatments — $/1,000 sqft" theme={theme} />
        <Grid>
          <NumField label="Pre-emergent" value={form.pre_emergent_per_1000sqft} onChange={v => update('pre_emergent_per_1000sqft', v)} {...{ inputStyle, labelStyle }} step="0.50" />
          <NumField label="Fertilizer" value={form.fert_per_1000sqft} onChange={v => update('fert_per_1000sqft', v)} {...{ inputStyle, labelStyle }} step="0.50" />
          <NumField label="Weed control" value={form.weed_per_1000sqft} onChange={v => update('weed_per_1000sqft', v)} {...{ inputStyle, labelStyle }} step="0.50" />
        </Grid>
        <Grid>
          <NumField label="Grub control" value={form.grub_per_1000sqft} onChange={v => update('grub_per_1000sqft', v)} {...{ inputStyle, labelStyle }} step="0.50" />
          <NumField label="Iron" value={form.iron_per_1000sqft} onChange={v => update('iron_per_1000sqft', v)} {...{ inputStyle, labelStyle }} step="0.50" />
          <NumField label="Lime" value={form.lime_per_1000sqft} onChange={v => update('lime_per_1000sqft', v)} {...{ inputStyle, labelStyle }} step="0.50" />
        </Grid>
      </div>

      {/* Aeration / overseed / cleanup */}
      <div style={sectionStyle}>
        <Header icon={Wrench} title="Aeration, overseed & cleanup" theme={theme} />
        <Grid>
          <NumField label="Aeration $/1k sqft" value={form.aeration_per_1000sqft} onChange={v => update('aeration_per_1000sqft', v)} {...{ inputStyle, labelStyle }} step="0.50" />
          <NumField label="Aeration minimum ($)" value={form.aeration_minimum} onChange={v => update('aeration_minimum', v)} {...{ inputStyle, labelStyle }} step="1" />
          <NumField label="Overseed $/1k sqft" value={form.overseed_per_1000sqft} onChange={v => update('overseed_per_1000sqft', v)} {...{ inputStyle, labelStyle }} step="0.50" />
          <NumField label="Cleanup $/hr" value={form.cleanup_per_hour} onChange={v => update('cleanup_per_hour', v)} {...{ inputStyle, labelStyle }} step="1" />
        </Grid>
      </div>

      {/* Tax & margin */}
      <div style={sectionStyle}>
        <Header icon={DollarSign} title="Tax & margin" theme={theme} />
        <Grid>
          <NumField label="Tax rate (decimal)" value={form.tax_rate} onChange={v => update('tax_rate', v)} {...{ inputStyle, labelStyle }} step="0.0001" hint="0.0825 = 8.25%" />
          <NumField label="Margin multiplier" value={form.margin_multiplier} onChange={v => update('margin_multiplier', v)} {...{ inputStyle, labelStyle }} step="0.01" hint="1.0 = baseline. 1.10 = +10%" />
        </Grid>
      </div>

      {/* Live preview */}
      <div style={{ ...sectionStyle, background: theme.accentBg, borderColor: theme.accent }}>
        <Header icon={Calculator} title="Live preview · 6,000 sqft sample lawn" theme={theme} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
          <Stat label="Per mow visit" value={`$${preview.per_visit.grand_total.toFixed(2)}`} sub={`${preview.per_visit.predicted_minutes} min`} theme={theme} />
          <Stat label={`${preview.mows_per_season} mows/season`} value={`$${preview.mows_total.toLocaleString()}`} theme={theme} />
          <Stat label="Annual program" value={`$${preview.annual_program_total.toLocaleString()}`} sub="mow + treatments" theme={theme} />
        </div>
      </div>

      {error && <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 8, color: '#ef4444', marginBottom: 12, fontSize: 13 }}>{error}</div>}

      <button onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: 12, minHeight: 44, background: saved ? theme.success : theme.accent, color: '#fff', border: 'none', borderRadius: 10, cursor: saving ? 'default' : 'pointer', fontWeight: 600, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
        {saved ? <><CheckCircle2 size={18} /> Saved!</> : saving ? 'Saving…' : <><Save size={18} /> Save Pricing</>}
      </button>
    </div>
  )
}

function Header({ icon: Icon, title, theme }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <Icon size={20} style={{ color: theme.accent }} />
      <h2 style={{ fontSize: 16, fontWeight: 700, color: theme.text, margin: 0 }}>{title}</h2>
    </div>
  )
}

function Grid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>{children}</div>
}

function NumField({ label, hint, value, onChange, step = '0.01', inputStyle, labelStyle }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input type="number" step={step} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} style={inputStyle} />
      {hint && <div style={{ fontSize: 11, color: '#7d8a7f', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

function Stat({ label, value, sub, theme }) {
  return (
    <div style={{ background: theme.bgCard, borderRadius: 10, padding: 14, border: `1px solid ${theme.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0 }
function int(v) { const n = parseInt(v); return Number.isFinite(n) ? n : 0 }
