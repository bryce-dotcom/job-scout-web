import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import {
  Settings, Bell, Mail, MessageSquare, Clock,
  Save, CheckCircle2, DollarSign, Shield
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)',
  shadow: '0 1px 3px rgba(0,0,0,0.08)',
}

const defaultSettings = {
  auto_reminders: false,
  reminder_schedule: 'weekly',
  friendly_days: 7,
  firm_days: 21,
  urgent_days: 45,
  final_days: 60,
  email_reminders: true,
  sms_reminders: false,
  anomaly_alerts: true,
  anomaly_threshold: 150,
  low_margin_threshold: 15,
  collection_footer: '',
  daily_brief: false,
  daily_brief_recipients: '',
}

export default function FrankieSettings() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const companyId = useStore(s => s.companyId)
  const getCompanyAgent = useStore(s => s.getCompanyAgent)
  const companyAgent = getCompanyAgent('frankie-finance')

  const [settings, setSettings] = useState(defaultSettings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (companyAgent?.settings) {
      setSettings(prev => ({ ...prev, ...companyAgent.settings }))
    }
  }, [companyAgent])

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  // Upsert a key/value row in the settings table (the autopilot + daily
  // brief edge functions read these — company_agents.settings is the UI
  // store, the settings rows are what the crons act on).
  const upsertSettingsRow = async (key, valueObj) => {
    const valueStr = JSON.stringify(valueObj)
    const { data: existing } = await supabase
      .from('settings').select('id').eq('company_id', companyId).eq('key', key).maybeSingle()
    if (existing) {
      await supabase.from('settings').update({ value: valueStr, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('settings').insert({ company_id: companyId, key, list_name: 'Frankie Automations', value: valueStr })
    }
  }

  const handleSave = async () => {
    if (!companyAgent?.id) return
    setSaving(true)
    try {
      await supabase
        .from('company_agents')
        .update({ settings, updated_at: new Date().toISOString() })
        .eq('id', companyAgent.id)

      // Mirror the automation switches into the settings rows the daily
      // crons read. The cron functions are DEFAULT OFF — they only act on
      // companies whose row says enabled:true.
      await upsertSettingsRow('collections_autopilot', {
        enabled: !!settings.auto_reminders,
        t1_days: Number(settings.friendly_days) || 7,
        t2_days: Number(settings.firm_days) || 14,
        t3_days: Number(settings.urgent_days) || 30,
        sms_enabled: !!settings.sms_reminders,
        max_per_run: 25,
      })
      await upsertSettingsRow('frankie_daily_brief', {
        enabled: !!settings.daily_brief,
        recipients: String(settings.daily_brief_recipients || '')
          .split(',').map(s => s.trim()).filter(Boolean),
      })

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      console.error('Error saving settings:', e)
    } finally {
      setSaving(false)
    }
  }

  // Preview what the autopilot WOULD send right now — no emails go out.
  const [previewing, setPreviewing] = useState(false)
  const [previewResult, setPreviewResult] = useState(null)
  const handlePreviewAutopilot = async () => {
    setPreviewing(true)
    setPreviewResult(null)
    try {
      const { data } = await supabase.functions.invoke('collections-autopilot', {
        body: { company_id: companyId, preview: true },
      })
      const r = data?.results?.[0]
      setPreviewResult(r || { error: data?.error || 'No response' })
    } catch (e) {
      setPreviewResult({ error: e.message })
    } finally {
      setPreviewing(false)
    }
  }

  const Toggle = ({ value, onChange }) => (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: '44px', height: '24px', borderRadius: '12px',
        background: value ? theme.accent : theme.border,
        border: 'none', cursor: 'pointer', position: 'relative',
        transition: 'background 0.2s', flexShrink: 0
      }}
    >
      <div style={{
        width: '18px', height: '18px', borderRadius: '50%',
        background: '#fff', position: 'absolute', top: '3px',
        left: value ? '23px' : '3px',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
      }} />
    </button>
  )

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: `1px solid ${theme.border}`, background: theme.bg,
    color: theme.text, fontSize: '14px', outline: 'none',
    fontFamily: 'inherit'
  }

  const labelStyle = {
    fontSize: '13px', fontWeight: '600', color: theme.text,
    display: 'block', marginBottom: '6px'
  }

  const sectionStyle = {
    background: theme.bgCard, borderRadius: '12px',
    border: `1px solid ${theme.border}`, padding: '20px',
    marginBottom: '16px', boxShadow: theme.shadow
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
          Frankie Settings
        </h1>
        <p style={{ fontSize: '14px', color: theme.textMuted, marginTop: '4px' }}>
          Configure your AI CFO's behavior and alert preferences
        </p>
      </div>

      {/* Collection Reminders */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Bell size={20} style={{ color: theme.accent }} />
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Collection Reminders
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Automatic Reminders</div>
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              Automatically send reminders based on escalation schedule
            </div>
          </div>
          <Toggle value={settings.auto_reminders} onChange={v => updateSetting('auto_reminders', v)} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Email Reminders</div>
            <div style={{ fontSize: '13px', color: theme.textMuted }}>Send collection reminders via email</div>
          </div>
          <Toggle value={settings.email_reminders} onChange={v => updateSetting('email_reminders', v)} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>SMS Reminders</div>
            <div style={{ fontSize: '13px', color: theme.textMuted }}>Send collection reminders via text message</div>
          </div>
          <Toggle value={settings.sms_reminders} onChange={v => updateSetting('sms_reminders', v)} />
        </div>

        {settings.auto_reminders && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '12px' }}>
              Escalation Schedule (days after due date)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '12px' }}>
              {[
                { key: 'friendly_days', label: 'Friendly', color: '#3b82f6' },
                { key: 'firm_days', label: 'Firm', color: '#f59e0b' },
                { key: 'urgent_days', label: 'Urgent', color: '#f97316' },
                { key: 'final_days', label: 'Final Notice', color: '#ef4444' },
              ].map(level => (
                <div key={level.key}>
                  <label style={{ ...labelStyle, color: level.color }}>{level.label}</label>
                  <input
                    type="number"
                    value={settings[level.key]}
                    onChange={e => updateSetting(level.key, parseInt(e.target.value) || 0)}
                    style={inputStyle}
                    min="1"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Anomaly Detection */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Shield size={20} style={{ color: theme.accent }} />
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Anomaly Detection
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Expense Anomaly Alerts</div>
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              Flag unusual spending spikes and potential duplicates
            </div>
          </div>
          <Toggle value={settings.anomaly_alerts} onChange={v => updateSetting('anomaly_alerts', v)} />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>
            Spike Threshold ({settings.anomaly_threshold}% of average)
          </label>
          <input
            type="range" min="110" max="300" value={settings.anomaly_threshold}
            onChange={e => updateSetting('anomaly_threshold', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: theme.accent }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.textMuted }}>
            <span>110% (sensitive)</span><span>200%</span><span>300% (relaxed)</span>
          </div>
        </div>

        <div>
          <label style={labelStyle}>
            Low Margin Alert Threshold ({settings.low_margin_threshold}%)
          </label>
          <input
            type="range" min="5" max="40" value={settings.low_margin_threshold}
            onChange={e => updateSetting('low_margin_threshold', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: theme.accent }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.textMuted }}>
            <span>5%</span><span>20%</span><span>40%</span>
          </div>
        </div>
      </div>

      {/* Autopilot preview — see exactly what the daily run WOULD send,
          without sending anything. Builds trust before flipping the
          Automatic Reminders switch. */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>
              Autopilot Preview
            </h2>
            <p style={{ fontSize: '13px', color: theme.textMuted, margin: '4px 0 0' }}>
              Dry-run the collections autopilot — shows who would get a reminder today. Nothing is sent.
            </p>
          </div>
          <button
            onClick={handlePreviewAutopilot}
            disabled={previewing}
            style={{
              padding: '10px 16px', borderRadius: '8px', border: `1px solid ${theme.accent}`,
              background: 'transparent', color: theme.accent, fontWeight: 600, fontSize: '13px',
              cursor: previewing ? 'wait' : 'pointer',
            }}
          >
            {previewing ? 'Checking…' : 'Run Preview'}
          </button>
        </div>
        {previewResult && (
          <div style={{ marginTop: '14px', borderTop: `1px solid ${theme.border}`, paddingTop: '12px' }}>
            {previewResult.error ? (
              <div style={{ fontSize: '13px', color: '#ef4444' }}>Preview failed: {String(previewResult.error)}</div>
            ) : (
              <>
                <div style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '8px' }}>
                  {(previewResult.wouldSend || []).length === 0
                    ? 'Nothing to send — no invoices past the first reminder threshold.'
                    : `${(previewResult.wouldSend || []).length} reminder${(previewResult.wouldSend || []).length === 1 ? '' : 's'} would go out (of ${previewResult.totalEligible} eligible, capped at ${previewResult.cap}/run):`}
                </div>
                {(previewResult.wouldSend || []).map((p, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap',
                    fontSize: '12px', color: theme.text, padding: '6px 8px',
                    backgroundColor: theme.bg, borderRadius: '6px', marginBottom: '4px',
                  }}>
                    <span><strong>{p.customerName || 'Unknown'}</strong> · {p.invoiceNumber}</span>
                    <span>{'$' + Number(p.balance).toLocaleString()} · {p.daysOverdue}d late · Tier {p.tier} ({p.tone}{p.phone ? ' + SMS' : ''})</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Daily Brief */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Clock size={20} style={{ color: theme.accent }} />
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Daily Brief
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Morning email from Frankie</div>
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              Every morning at 7am: available cash, yesterday's money in/out, receivables, and what to focus on today.
            </div>
          </div>
          <Toggle value={settings.daily_brief} onChange={v => updateSetting('daily_brief', v)} />
        </div>
        {settings.daily_brief && (
          <div>
            <label style={labelStyle}>Recipients (comma-separated — defaults to the owner email)</label>
            <input
              type="text"
              value={settings.daily_brief_recipients || ''}
              onChange={e => updateSetting('daily_brief_recipients', e.target.value)}
              placeholder="bryce@hhh.services, tracy@hhh.services"
              style={inputStyle}
            />
          </div>
        )}
      </div>

      {/* Collection Message Footer */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Mail size={20} style={{ color: theme.accent }} />
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Collection Message
          </h2>
        </div>

        <div>
          <label style={labelStyle}>Custom Footer (appended to all reminders)</label>
          <textarea
            value={settings.collection_footer}
            onChange={e => updateSetting('collection_footer', e.target.value)}
            placeholder="e.g., Payment can be made at pay.yourcompany.com or by calling (555) 123-4567"
            rows={3}
            style={{
              ...inputStyle,
              resize: 'vertical', minHeight: '80px'
            }}
          />
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          width: '100%', padding: '12px',
          background: saved ? '#22c55e' : theme.accent,
          color: '#fff', border: 'none', borderRadius: '10px',
          cursor: saving ? 'default' : 'pointer',
          fontWeight: '600', fontSize: '15px',
          opacity: saving ? 0.7 : 1,
          transition: 'background 0.2s'
        }}
      >
        {saved ? (
          <><CheckCircle2 size={18} /> Saved!</>
        ) : saving ? (
          <>Saving...</>
        ) : (
          <><Save size={18} /> Save Settings</>
        )}
      </button>
    </div>
  )
}
