import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { Save, CheckCircle2, Sprout, Scissors, Calendar } from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
  shadow: '0 1px 3px rgba(0,0,0,0.08)',
  success: '#22c55e',
}

const defaultSettings = {
  default_mow_height_inches: 3.0,
  default_mow_frequency: 'Weekly',
  default_crew_size: 2,
  season_start_month: 4,
  season_end_month: 10,
  treatment_program: 'standard-6-round',
  remind_day_before: true,
  default_service_state: 'UT',
}

const FREQUENCIES = ['Weekly', 'Bi-Weekly', 'Every 10 days', 'Monthly', 'On Call']
const PROGRAMS = [
  { value: 'standard-6-round', label: '6-Round (pre-em, fert x4, winterizer)' },
  { value: 'organic-4-round', label: '4-Round Organic' },
  { value: 'fert-only', label: 'Fertilizer only' },
  { value: 'custom', label: 'Custom' },
]
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function ZachSettings() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const getCompanyAgent = useStore(s => s.getCompanyAgent)
  const companyAgent = getCompanyAgent('zach-yard-yeti')

  const [settings, setSettings] = useState(defaultSettings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (companyAgent?.settings) {
      setSettings(prev => ({ ...prev, ...companyAgent.settings }))
    }
  }, [companyAgent])

  const update = (k, v) => { setSettings(p => ({ ...p, [k]: v })); setSaved(false) }

  const save = async () => {
    if (!companyAgent?.id) return
    setSaving(true)
    try {
      await supabase.from('company_agents').update({ settings, updated_at: new Date().toISOString() }).eq('id', companyAgent.id)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const Toggle = ({ value, onChange }) => (
    <button onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, background: value ? theme.accent : theme.border, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: value ? 23 : 3, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { fontSize: 13, fontWeight: 600, color: theme.text, display: 'block', marginBottom: 6 }
  const sectionStyle = { background: theme.bgCard, borderRadius: 12, border: `1px solid ${theme.border}`, padding: 20, marginBottom: 16, boxShadow: theme.shadow }

  return (
    <div style={{ padding: isMobile ? 16 : 24, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: theme.text, margin: 0 }}>Zach Settings</h1>
        <p style={{ fontSize: 14, color: theme.textMuted, marginTop: 4 }}>Defaults Zach uses when you create new properties and treatment rounds.</p>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Scissors size={20} style={{ color: theme.accent }} />
          <h2 style={{ fontSize: 16, fontWeight: 700, color: theme.text, margin: 0 }}>Mowing defaults</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          <div>
            <label style={labelStyle}>Default mow height (inches)</label>
            <input type="number" step="0.25" style={inputStyle} value={settings.default_mow_height_inches} onChange={e => update('default_mow_height_inches', parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label style={labelStyle}>Default frequency</label>
            <select style={inputStyle} value={settings.default_mow_frequency} onChange={e => update('default_mow_frequency', e.target.value)}>
              {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Default crew size</label>
            <input type="number" min="1" max="10" style={inputStyle} value={settings.default_crew_size} onChange={e => update('default_crew_size', parseInt(e.target.value) || 1)} />
          </div>
          <div>
            <label style={labelStyle}>Default service state</label>
            <input maxLength={2} style={inputStyle} value={settings.default_service_state} onChange={e => update('default_service_state', e.target.value.toUpperCase())} />
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Calendar size={20} style={{ color: theme.accent }} />
          <h2 style={{ fontSize: 16, fontWeight: 700, color: theme.text, margin: 0 }}>Season window</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={labelStyle}>Season starts</label>
            <select style={inputStyle} value={settings.season_start_month} onChange={e => update('season_start_month', parseInt(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Season ends</label>
            <select style={inputStyle} value={settings.season_end_month} onChange={e => update('season_end_month', parseInt(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>Remind crew the day before</div>
            <div style={{ fontSize: 13, color: theme.textMuted }}>Push notification to the assigned crew the evening before each scheduled visit.</div>
          </div>
          <Toggle value={settings.remind_day_before} onChange={v => update('remind_day_before', v)} />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Sprout size={20} style={{ color: theme.accent }} />
          <h2 style={{ fontSize: 16, fontWeight: 700, color: theme.text, margin: 0 }}>Treatment program</h2>
        </div>
        <label style={labelStyle}>Default program template</label>
        <select style={inputStyle} value={settings.treatment_program} onChange={e => update('treatment_program', e.target.value)}>
          {PROGRAMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>
          When you add a new property, Zach can pre-stage rounds based on this template.
        </div>
      </div>

      <button onClick={save} disabled={saving} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: 12, minHeight: 44, background: saved ? theme.success : theme.accent, color: '#fff', border: 'none', borderRadius: 10, cursor: saving ? 'default' : 'pointer', fontWeight: 600, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
        {saved ? <><CheckCircle2 size={18} /> Saved!</> : saving ? <>Saving...</> : <><Save size={18} /> Save Settings</>}
      </button>
    </div>
  )
}
