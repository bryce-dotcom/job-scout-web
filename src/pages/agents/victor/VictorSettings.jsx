import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { Settings, Save, CheckCircle2 } from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)'
}

export default function VictorSettings() {
  const companyId = useStore(s => s.companyId)
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const [thresholds, setThresholds] = useState({ A: 90, B: 80, C: 70, D: 60 })
  const [passingScore, setPassingScore] = useState(70)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!companyId) return
    loadSettings()
  }, [companyId])

  const loadSettings = async () => {
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .eq('company_id', companyId)
      .in('key', ['victor_thresholds', 'victor_passing_score'])

    for (const s of (data || [])) {
      try {
        const val = JSON.parse(s.value)
        if (s.key === 'victor_thresholds') setThresholds(val)
        if (s.key === 'victor_passing_score') setPassingScore(val)
      } catch {}
    }
  }

  const saveSetting = async (key, value) => {
    const { data: existing } = await supabase.from('settings').select('id').eq('company_id', companyId).eq('key', key).single()
    if (existing) {
      await supabase.from('settings').update({ value: JSON.stringify(value) }).eq('id', existing.id)
    } else {
      await supabase.from('settings').insert({ company_id: companyId, key, value: JSON.stringify(value) })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    await saveSetting('victor_thresholds', thresholds)
    await saveSetting('victor_passing_score', passingScore)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputStyle = {
    width: '80px', padding: '8px', border: `1px solid ${theme.border}`,
    borderRadius: '6px', fontSize: '14px', color: theme.text,
    backgroundColor: theme.bgCard, textAlign: 'center'
  }

  return (
    <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: '700', color: theme.text, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Settings size={20} /> Victor Settings
      </h2>

      {/* Grade Thresholds */}
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>Grade Thresholds</h3>
        <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '16px' }}>Minimum score for each letter grade</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {['A', 'B', 'C', 'D'].map(grade => (
            <div key={grade} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{
                width: '32px', height: '32px', borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: '700', fontSize: '16px',
                backgroundColor: grade === 'A' ? '#dcfce7' : grade === 'B' ? '#dbeafe' : grade === 'C' ? '#fef3c7' : '#ffedd5',
                color: grade === 'A' ? '#16a34a' : grade === 'B' ? '#2563eb' : grade === 'C' ? '#d97706' : '#ea580c'
              }}>{grade}</span>
              <input
                type="number"
                value={thresholds[grade]}
                onChange={e => setThresholds(prev => ({ ...prev, [grade]: parseInt(e.target.value) || 0 }))}
                style={inputStyle}
                min="0" max="100"
              />
              <span style={{ fontSize: '13px', color: theme.textMuted }}>and above</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              width: '32px', height: '32px', borderRadius: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: '700', fontSize: '16px', backgroundColor: '#fee2e2', color: '#dc2626'
            }}>F</span>
            <span style={{ fontSize: '13px', color: theme.textMuted }}>Below {thresholds.D}</span>
          </div>
        </div>
      </div>

      {/* Passing Score */}
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Minimum Passing Score</h3>
        <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>Jobs below this score will be flagged for review</p>
        <input
          type="number"
          value={passingScore}
          onChange={e => setPassingScore(parseInt(e.target.value) || 0)}
          style={{ ...inputStyle, width: '100px' }}
          min="0" max="100"
        />
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%', padding: '12px', backgroundColor: saved ? '#22c55e' : theme.accent,
          color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer',
          fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '8px', transition: 'background-color 0.3s'
        }}
      >
        {saved ? <><CheckCircle2 size={16} /> Saved!</> : saving ? 'Saving...' : <><Save size={16} /> Save Settings</>}
      </button>
    </div>
  )
}
