import { useState } from 'react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { Zap, Plus, X, Play } from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
}

const PRESET_AUTOMATIONS = [
  {
    name: 'Post-Audit Follow Up',
    description: 'Send a follow-up email 3 days after a lighting audit is completed.',
    trigger_type: 'audit_completed',
    trigger_config: { delay_days: 3 },
  },
  {
    name: 'Quote Reminder',
    description: 'Remind customers about outstanding quotes after 7 days with no response.',
    trigger_type: 'quote_no_response',
    trigger_config: { delay_days: 7 },
  },
  {
    name: 'Job Completed Thank You',
    description: 'Send a thank-you email 1 day after a job is marked complete.',
    trigger_type: 'job_completed',
    trigger_config: { delay_days: 1 },
  },
  {
    name: 'Win Back',
    description: 'Reach out to inactive customers on their anniversary.',
    trigger_type: 'customer_anniversary',
    trigger_config: { delay_days: 365 },
  },
  {
    name: 'Seasonal Campaign',
    description: 'Automatically send seasonal promotions to your contact list.',
    trigger_type: 'seasonal',
    trigger_config: {},
  },
]

const TRIGGER_TYPES = [
  { value: 'audit_completed', label: 'Audit Completed' },
  { value: 'quote_sent', label: 'Quote Sent' },
  { value: 'quote_no_response', label: 'Quote No Response' },
  { value: 'job_completed', label: 'Job Completed' },
  { value: 'customer_anniversary', label: 'Customer Anniversary' },
  { value: 'seasonal', label: 'Seasonal' },
]

export default function ConradAutomations() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const companyId = useStore(s => s.companyId)
  const emailAutomations = useStore(s => s.emailAutomations)
  const emailTemplates = useStore(s => s.emailTemplates)
  const createEmailAutomation = useStore(s => s.createEmailAutomation)
  const updateEmailAutomation = useStore(s => s.updateEmailAutomation)
  const deleteEmailAutomation = useStore(s => s.deleteEmailAutomation)

  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customForm, setCustomForm] = useState({
    name: '',
    trigger_type: 'audit_completed',
    delay_days: 3,
    template_id: '',
  })
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    color: theme.text,
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: '4px'
  }

  // Merge presets with existing automations
  const getExistingForPreset = (preset) => {
    return emailAutomations.find(a => a.trigger_type === preset.trigger_type)
  }

  const handleTogglePreset = async (preset) => {
    const existing = getExistingForPreset(preset)

    if (existing) {
      // Toggle active state
      await updateEmailAutomation(existing.id, { active: !existing.active })
    } else {
      // Create new automation from preset
      await createEmailAutomation({
        name: preset.name,
        trigger_type: preset.trigger_type,
        trigger_config: preset.trigger_config,
        active: true,
      })
    }
  }

  const handlePresetTemplateChange = async (preset, templateId) => {
    const existing = getExistingForPreset(preset)
    if (existing) {
      await updateEmailAutomation(existing.id, { template_id: templateId || null })
    }
  }

  const handlePresetDelayChange = async (preset, delayDays) => {
    const existing = getExistingForPreset(preset)
    if (existing) {
      await updateEmailAutomation(existing.id, {
        trigger_config: { ...existing.trigger_config, delay_days: parseInt(delayDays) || 0 }
      })
    }
  }

  const handleCreateCustom = async () => {
    setSaving(true)
    try {
      await createEmailAutomation({
        name: customForm.name,
        trigger_type: customForm.trigger_type,
        trigger_config: { delay_days: parseInt(customForm.delay_days) || 0 },
        template_id: customForm.template_id || null,
        active: true,
      })
      setShowCustomModal(false)
      setCustomForm({ name: '', trigger_type: 'audit_completed', delay_days: 3, template_id: '' })
    } catch (e) {
      console.error('Create automation error:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleRunNow = async () => {
    setRunning(true)
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cc-run-automations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ company_id: companyId })
        }
      )
    } catch (e) {
      console.error('Run automations error:', e)
    } finally {
      setRunning(false)
    }
  }

  // Sort: active first, inactive after
  const activeAutomations = emailAutomations.filter(a => a.active)
  const inactiveAutomations = emailAutomations.filter(a => !a.active)

  // Custom automations (not matching any preset trigger_type, or extras beyond preset)
  const presetTriggers = PRESET_AUTOMATIONS.map(p => p.trigger_type)
  const customAutomations = emailAutomations.filter(a =>
    !presetTriggers.includes(a.trigger_type) ||
    emailAutomations.filter(ea => ea.trigger_type === a.trigger_type).length > 1
  )

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>Automations</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleRunNow}
            disabled={running}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              background: 'transparent',
              color: theme.accent,
              borderRadius: '8px',
              border: `1px solid ${theme.accent}`,
              cursor: running ? 'wait' : 'pointer',
              fontWeight: '600',
              fontSize: '13px',
              opacity: running ? 0.7 : 1
            }}
          >
            <Play size={16} />
            {running ? 'Running...' : 'Run Now'}
          </button>
          <button
            onClick={() => setShowCustomModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              background: theme.accent,
              color: '#fff',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '13px'
            }}
          >
            <Plus size={16} />
            Create Custom
          </button>
        </div>
      </div>

      {/* Preset Automation Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
        {PRESET_AUTOMATIONS.map(preset => {
          const existing = getExistingForPreset(preset)
          const isActive = existing?.active || false

          return (
            <div
              key={preset.trigger_type}
              style={{
                background: theme.bgCard,
                borderRadius: '12px',
                border: `1px solid ${isActive ? theme.accent : theme.border}`,
                padding: '20px',
                opacity: isActive ? 1 : 0.75,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <Zap size={16} style={{ color: isActive ? theme.accent : theme.textMuted }} />
                    <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, margin: 0 }}>{preset.name}</h3>
                    {existing?.times_triggered > 0 && (
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        backgroundColor: theme.accentBg,
                        color: theme.accent
                      }}>
                        {existing.times_triggered}x triggered
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '13px', color: theme.textSecondary, margin: 0 }}>{preset.description}</p>
                </div>

                {/* Toggle Switch */}
                <button
                  onClick={() => handleTogglePreset(preset)}
                  style={{
                    width: '44px',
                    height: '24px',
                    borderRadius: '12px',
                    border: 'none',
                    background: isActive ? theme.accent : theme.border,
                    cursor: 'pointer',
                    position: 'relative',
                    flexShrink: 0,
                    transition: 'background 0.2s',
                    marginLeft: '16px'
                  }}
                >
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: '#fff',
                    position: 'absolute',
                    top: '3px',
                    left: isActive ? '23px' : '3px',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                  }} />
                </button>
              </div>

              {/* Config row (only show when active/existing) */}
              {existing && (
                <div style={{ display: 'flex', gap: '12px', marginTop: '12px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Template</label>
                    <select
                      value={existing.template_id || ''}
                      onChange={(e) => handlePresetTemplateChange(preset, e.target.value)}
                      style={{ ...inputStyle, fontSize: '13px', padding: '8px 10px' }}
                    >
                      <option value="">-- Select Template --</option>
                      {emailTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  {preset.trigger_config.delay_days !== undefined && (
                    <div style={{ width: '120px' }}>
                      <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Delay (days)</label>
                      <input
                        type="number"
                        min="0"
                        value={existing.trigger_config?.delay_days ?? preset.trigger_config.delay_days}
                        onChange={(e) => handlePresetDelayChange(preset, e.target.value)}
                        style={{ ...inputStyle, fontSize: '13px', padding: '8px 10px' }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Custom Automations Section */}
      {customAutomations.length > 0 && (
        <>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Custom Automations</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
            {customAutomations.map(auto => (
              <div
                key={auto.id}
                style={{
                  background: theme.bgCard,
                  borderRadius: '12px',
                  border: `1px solid ${auto.active ? theme.accent : theme.border}`,
                  padding: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>{auto.name}</div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                    Trigger: {auto.trigger_type} | Template: {auto.template?.name || 'None'} | Triggered {auto.times_triggered}x
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={() => updateEmailAutomation(auto.id, { active: !auto.active })}
                    style={{
                      width: '44px',
                      height: '24px',
                      borderRadius: '12px',
                      border: 'none',
                      background: auto.active ? theme.accent : theme.border,
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'background 0.2s'
                    }}
                  >
                    <div style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#fff',
                      position: 'absolute',
                      top: '3px',
                      left: auto.active ? '23px' : '3px',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }} />
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete "${auto.name}"?`)) deleteEmailAutomation(auto.id) }}
                    style={{
                      padding: '6px',
                      background: 'transparent',
                      border: `1px solid ${theme.border}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: '#ef4444',
                      fontSize: '12px'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create Custom Modal */}
      {showCustomModal && (
        <>
          <div onClick={() => setShowCustomModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 }} />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            border: `1px solid ${theme.border}`,
            width: '100%',
            maxWidth: '480px',
            maxHeight: '90vh',
            overflow: 'auto',
            zIndex: 51,
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>Create Custom Automation</h2>
              <button onClick={() => setShowCustomModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  value={customForm.name}
                  onChange={(e) => setCustomForm(prev => ({ ...prev, name: e.target.value }))}
                  style={inputStyle}
                  placeholder="Automation name"
                />
              </div>

              <div>
                <label style={labelStyle}>Trigger Type</label>
                <select
                  value={customForm.trigger_type}
                  onChange={(e) => setCustomForm(prev => ({ ...prev, trigger_type: e.target.value }))}
                  style={inputStyle}
                >
                  {TRIGGER_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Delay (days)</label>
                <input
                  type="number"
                  min="0"
                  value={customForm.delay_days}
                  onChange={(e) => setCustomForm(prev => ({ ...prev, delay_days: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Template</label>
                <select
                  value={customForm.template_id}
                  onChange={(e) => setCustomForm(prev => ({ ...prev, template_id: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">-- Select Template --</option>
                  {emailTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleCreateCustom}
                disabled={!customForm.name || saving}
                style={{
                  padding: '10px 16px',
                  background: theme.accent,
                  color: '#fff',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: (!customForm.name || saving) ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '13px',
                  opacity: (!customForm.name || saving) ? 0.5 : 1
                }}
              >
                {saving ? 'Creating...' : 'Create Automation'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
