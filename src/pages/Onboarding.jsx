import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Building2, Briefcase, Settings, Upload, Check, ChevronRight, ChevronLeft } from 'lucide-react'

const theme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentHover: '#4a5239',
  accentBg: 'rgba(90,99,73,0.12)',
  shadowLg: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.08)'
}

const TopoBackground = () => (
  <svg style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.06, pointerEvents: 'none' }} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="topoPatternOnboard" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
        <path d="M0,40 Q30,20 60,35 Q100,55 140,30 Q180,10 200,40" fill="none" stroke="#c4b59a" strokeWidth="1" />
        <path d="M0,70 Q50,50 100,70 T200,70" fill="none" stroke="#c4b59a" strokeWidth="1" />
        <path d="M0,100 Q25,80 50,95 Q80,115 120,85 Q160,55 200,100" fill="none" stroke="#c4b59a" strokeWidth="1" />
        <path d="M0,130 Q40,110 80,125 Q130,145 170,115 Q200,90 200,130" fill="none" stroke="#c4b59a" strokeWidth="1" />
        <path d="M0,160 Q60,140 100,160 T200,160" fill="none" stroke="#c4b59a" strokeWidth="1" />
        <path d="M0,190 Q35,170 70,185 Q110,200 150,175 Q200,150 200,190" fill="none" stroke="#c4b59a" strokeWidth="1" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#topoPatternOnboard)" />
  </svg>
)

const INDUSTRIES = [
  'Lighting / Electrical',
  'HVAC',
  'Plumbing',
  'General Contracting',
  'Landscaping',
  'Cleaning',
  'Other'
]

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu'
]

const STEPS = [
  { label: 'Company Info', icon: Building2 },
  { label: 'Industry', icon: Briefcase },
  { label: 'Preferences', icon: Settings },
  { label: 'Logo', icon: Upload }
]

export default function Onboarding() {
  const navigate = useNavigate()
  const company = useStore((state) => state.company)
  const setCompany = useStore((state) => state.setCompany)

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)

  const [formData, setFormData] = useState({
    company_name: company?.company_name || '',
    phone: company?.phone || '',
    address: company?.address || '',
    city: company?.city || '',
    state: company?.state || '',
    zip: company?.zip || '',
    website: company?.website || '',
    industry: company?.industry || '',
    timezone: company?.timezone || 'America/Denver',
    primary_color: company?.primary_color || '#5a6349',
    logo_url: company?.logo_url || ''
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${company.id}/${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(fileName, file, { upsert: true })

      if (uploadError) {
        // Try public bucket fallback
        const { error: publicError } = await supabase.storage
          .from('public')
          .upload(`company-logos/${fileName}`, file, { upsert: true })

        if (publicError) {
          setError('Failed to upload logo. The storage bucket may not be configured yet.')
          setUploading(false)
          return
        }

        const { data: { publicUrl } } = supabase.storage
          .from('public')
          .getPublicUrl(`company-logos/${fileName}`)

        setFormData(prev => ({ ...prev, logo_url: publicUrl }))
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('company-logos')
          .getPublicUrl(fileName)

        setFormData(prev => ({ ...prev, logo_url: publicUrl }))
      }
    } catch (err) {
      setError('Failed to upload logo')
    }

    setUploading(false)
  }

  const handleComplete = async () => {
    setSaving(true)
    setError(null)

    const { data, error: updateError } = await supabase
      .from('companies')
      .update({
        company_name: formData.company_name,
        phone: formData.phone || null,
        address: formData.address || null,
        city: formData.city || null,
        state: formData.state || null,
        zip: formData.zip || null,
        website: formData.website || null,
        industry: formData.industry || null,
        timezone: formData.timezone || 'America/Denver',
        primary_color: formData.primary_color || null,
        logo_url: formData.logo_url || null,
        setup_complete: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', company.id)
      .select()
      .single()

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    setCompany(data)
    navigate('/', { replace: true })
  }

  const canAdvance = () => {
    if (step === 0) return formData.company_name.trim().length > 0
    return true
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: '10px',
    color: theme.text,
    fontSize: '15px',
    outline: 'none',
    transition: 'all 0.15s ease',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: theme.textSecondary
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative'
    }}>
      <TopoBackground />

      <div style={{ width: '100%', maxWidth: '560px', position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src="/Scout_LOGO_GUY.png" alt="Job Scout" style={{ width: '80px', height: '80px', objectFit: 'contain', marginBottom: '12px' }} />
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.accent, marginBottom: '8px' }}>Welcome to Job Scout</h1>
          <p style={{ fontSize: '14px', color: theme.textMuted }}>Let's set up your company in a few quick steps</p>
        </div>

        {/* Step Progress */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '32px' }}>
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const isActive = i === step
            const isComplete = i < step
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
                  backgroundColor: isActive ? theme.accentBg : isComplete ? theme.accent : 'transparent',
                  borderRadius: '20px', border: `1px solid ${isActive ? theme.accent : isComplete ? theme.accent : theme.border}`,
                  transition: 'all 0.2s ease'
                }}>
                  {isComplete ? <Check size={16} style={{ color: '#fff' }} /> : <Icon size={16} style={{ color: isActive ? theme.accent : theme.textMuted }} />}
                  <span style={{
                    fontSize: '13px', fontWeight: isActive ? '600' : '400',
                    color: isComplete ? '#fff' : isActive ? theme.accent : theme.textMuted,
                    display: isActive ? 'inline' : 'none'
                  }}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && <div style={{ width: '24px', height: '1px', backgroundColor: theme.border }} />}
              </div>
            )
          })}
        </div>

        {/* Card */}
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '16px',
          padding: '32px',
          border: `1px solid ${theme.border}`,
          boxShadow: theme.shadowLg,
          minHeight: '300px'
        }}>
          {error && (
            <div style={{ marginBottom: '20px', padding: '14px 16px', backgroundColor: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '10px', color: '#b91c1c', fontSize: '14px' }}>
              {error}
            </div>
          )}

          {/* Step 1: Company Info */}
          {step === 0 && (
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>Company Information</h2>
              <p style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '24px' }}>Basic details about your business</p>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Company Name *</label>
                <input type="text" name="company_name" value={formData.company_name} onChange={handleChange} required placeholder="Your Company LLC" style={inputStyle} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Phone</label>
                <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="(555) 123-4567" style={inputStyle} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Address</label>
                <input type="text" name="address" value={formData.address} onChange={handleChange} placeholder="123 Main St" style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>City</label>
                  <input type="text" name="city" value={formData.city} onChange={handleChange} placeholder="Denver" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>State</label>
                  <input type="text" name="state" value={formData.state} onChange={handleChange} placeholder="CO" maxLength={2} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>ZIP</label>
                  <input type="text" name="zip" value={formData.zip} onChange={handleChange} placeholder="80202" style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Website</label>
                <input type="url" name="website" value={formData.website} onChange={handleChange} placeholder="https://yourcompany.com" style={inputStyle} />
              </div>
            </div>
          )}

          {/* Step 2: Industry */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>Your Industry</h2>
              <p style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '24px' }}>Select the industry that best describes your business</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {INDUSTRIES.map(ind => (
                  <button
                    key={ind}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, industry: ind }))}
                    style={{
                      padding: '20px 16px',
                      backgroundColor: formData.industry === ind ? theme.accentBg : theme.bg,
                      border: `2px solid ${formData.industry === ind ? theme.accent : theme.border}`,
                      borderRadius: '12px',
                      color: formData.industry === ind ? theme.accent : theme.textSecondary,
                      fontSize: '15px',
                      fontWeight: formData.industry === ind ? '600' : '400',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      textAlign: 'center'
                    }}
                  >
                    {ind}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Preferences */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>Preferences</h2>
              <p style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '24px' }}>Customize your experience</p>

              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>Timezone</label>
                <select name="timezone" value={formData.timezone} onChange={handleChange} style={inputStyle}>
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>{tz.replace('America/', '').replace('Pacific/', '').replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Brand Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <input
                    type="color"
                    name="primary_color"
                    value={formData.primary_color}
                    onChange={handleChange}
                    style={{ width: '56px', height: '56px', border: `2px solid ${theme.border}`, borderRadius: '12px', cursor: 'pointer', padding: '2px' }}
                  />
                  <div>
                    <p style={{ fontSize: '14px', color: theme.text, fontWeight: '500' }}>{formData.primary_color}</p>
                    <p style={{ fontSize: '13px', color: theme.textMuted }}>Used for accents in your workspace</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Logo Upload */}
          {step === 3 && (
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>Company Logo</h2>
              <p style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '24px' }}>Upload your company logo (optional)</p>

              <div style={{
                border: `2px dashed ${theme.border}`,
                borderRadius: '16px',
                padding: '40px',
                textAlign: 'center',
                backgroundColor: theme.bg,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}>
                {formData.logo_url ? (
                  <div>
                    <img src={formData.logo_url} alt="Logo" style={{ maxWidth: '200px', maxHeight: '120px', objectFit: 'contain', marginBottom: '16px', borderRadius: '8px' }} />
                    <p style={{ fontSize: '14px', color: theme.accent, fontWeight: '500', marginBottom: '8px' }}>Logo uploaded</p>
                    <label style={{ fontSize: '13px', color: theme.textMuted, cursor: 'pointer', textDecoration: 'underline' }}>
                      Change logo
                      <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                    </label>
                  </div>
                ) : (
                  <label style={{ cursor: 'pointer', display: 'block' }}>
                    <Upload size={40} style={{ color: theme.textMuted, marginBottom: '12px' }} />
                    <p style={{ fontSize: '15px', color: theme.textSecondary, fontWeight: '500', marginBottom: '4px' }}>
                      {uploading ? 'Uploading...' : 'Click to upload your logo'}
                    </p>
                    <p style={{ fontSize: '13px', color: theme.textMuted }}>PNG, JPG, or SVG up to 5MB</p>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploading} style={{ display: 'none' }} />
                  </label>
                )}
              </div>

              <p style={{ fontSize: '13px', color: theme.textMuted, marginTop: '16px', textAlign: 'center' }}>
                You can always add or change your logo later in Settings
              </p>
            </div>
          )}

          {/* Navigation Buttons */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
            {step > 0 && (
              <button
                type="button"
                onClick={() => { setStep(step - 1); setError(null) }}
                style={{
                  flex: 1, padding: '14px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`,
                  borderRadius: '10px', color: theme.textSecondary, fontSize: '15px', fontWeight: '500', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}
              >
                <ChevronLeft size={18} /> Back
              </button>
            )}

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => { setStep(step + 1); setError(null) }}
                disabled={!canAdvance()}
                style={{
                  flex: 1, padding: '14px', backgroundColor: theme.accent, color: '#fff', border: 'none',
                  borderRadius: '10px', fontSize: '15px', fontWeight: '600', cursor: canAdvance() ? 'pointer' : 'not-allowed',
                  opacity: canAdvance() ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  transition: 'all 0.15s ease'
                }}
              >
                Next <ChevronRight size={18} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleComplete}
                disabled={saving}
                style={{
                  flex: 1, padding: '14px', backgroundColor: theme.accent, color: '#fff', border: 'none',
                  borderRadius: '10px', fontSize: '15px', fontWeight: '600',
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  transition: 'all 0.15s ease'
                }}
              >
                {saving ? 'Finishing setup...' : 'Complete Setup'} <Check size={18} />
              </button>
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: theme.textMuted }}>
          Powered by OG DiX Apps Annex
        </p>
      </div>
    </div>
  )
}
