import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import {
  Camera, Upload, CheckCircle2, X, ChevronDown, Loader2,
  Shield, Star, AlertTriangle, Trash2, Image, Briefcase,
  RefreshCw, MapPin, Lightbulb, Wrench, Sparkles
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)'
}

const gradeColors = { 'A': '#22c55e', 'B': '#3b82f6', 'C': '#f59e0b', 'D': '#f97316', 'F': '#ef4444' }

const PHOTO_TYPES = [
  { id: 'completion', label: 'Completed Work' },
  { id: 'work_quality', label: 'Work Quality' },
  { id: 'cleanliness', label: 'Cleanliness' },
  { id: 'before', label: 'Before' },
  { id: 'after', label: 'After' },
  { id: 'general', label: 'General' },
]

const DAILY_PHOTO_TYPES = [
  { id: 'vehicle', label: 'Truck / Vehicle' },
  { id: 'jobsite', label: 'Jobsite Condition' },
  { id: 'tools', label: 'Tools & Equipment' },
  { id: 'general', label: 'General' },
]

const LIGHTING_CHECKLIST = [
  { item: 'Lights commissioned and powered on', category: 'Completion' },
  { item: 'Correct LED replacements installed (wattage verified)', category: 'Completion' },
  { item: 'Wiring clean and secured, no exposed conductors', category: 'Quality' },
  { item: 'Old ballasts removed or disconnected', category: 'Quality' },
  { item: 'Labels applied to new fixtures', category: 'Quality' },
  { item: 'Control systems / dimmers programmed', category: 'Completion' },
  { item: 'Customer trained on controls / apps', category: 'Handoff' },
  { item: 'Documentation provided to customer', category: 'Handoff' },
  { item: 'Work area clean, no debris', category: 'Cleanliness' },
  { item: 'Ceiling tiles replaced, no gaps', category: 'Cleanliness' },
  { item: 'Tools and equipment secured / removed', category: 'Cleanliness' },
]

const GENERAL_CHECKLIST = [
  { item: 'Work completed per scope of work', category: 'Completion' },
  { item: 'Work area clean and debris removed', category: 'Cleanliness' },
  { item: 'Tools and equipment secured / removed', category: 'Cleanliness' },
  { item: 'Customer walkthrough completed', category: 'Handoff' },
  { item: 'Customer sign-off obtained', category: 'Handoff' },
  { item: 'Documentation / warranty info provided', category: 'Handoff' },
  { item: 'Safety hazards addressed', category: 'Quality' },
  { item: 'Final after photos taken', category: 'Completion' },
]

const DAILY_CHECKLIST = [
  { item: 'Work area swept and clean', category: 'Cleanliness' },
  { item: 'All tools gathered and accounted for', category: 'Tools' },
  { item: 'Ladders secured on truck', category: 'Vehicle' },
  { item: 'Trash and debris removed from site', category: 'Cleanliness' },
  { item: 'Vehicle interior tidied', category: 'Vehicle' },
  { item: 'PPE stored properly', category: 'Safety' },
  { item: 'Customer property undamaged', category: 'Site' },
  { item: 'No materials left behind on site', category: 'Site' },
]

export default function VictorVerify({
  embeddedMode = false,
  verificationType: verificationTypeProp,
  preselectedJobId,
  onComplete,
  onClose
} = {}) {
  const navigate = useNavigate()
  const { jobId: urlJobId } = useParams()
  const companyId = useStore(s => s.companyId)
  const user = useStore(s => s.user)
  const employees = useStore(s => s.employees)
  const jobs = useStore(s => s.jobs)
  const fetchJobs = useStore(s => s.fetchJobs)
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const fileInputRef = useRef(null)

  const verificationType = verificationTypeProp || 'completion'
  const isDaily = verificationType === 'daily'
  const activePhotoTypes = isDaily ? DAILY_PHOTO_TYPES : PHOTO_TYPES

  const initialJobId = preselectedJobId ? String(preselectedJobId) : (urlJobId || '')
  const skipJobSelection = isDaily || !!preselectedJobId

  const [selectedJobId, setSelectedJobId] = useState(initialJobId)
  const [selectedJob, setSelectedJob] = useState(null)
  const [industry, setIndustry] = useState('general')
  const [checklist, setChecklist] = useState([])
  const [photos, setPhotos] = useState([]) // { file, preview, photoType, base64 }
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [step, setStep] = useState(skipJobSelection ? 2 : 1) // 1: select job, 2: checklist + photos, 3: results

  const currentEmployee = employees.find(e => e.email === user?.email)

  useEffect(() => { if (companyId && jobs.length === 0) fetchJobs() }, [companyId])

  // Initialize daily checklist when in daily mode
  useEffect(() => {
    if (isDaily && checklist.length === 0) {
      setChecklist(DAILY_CHECKLIST.map(c => ({ ...c, checked: false, notes: '' })))
    }
  }, [isDaily])

  // When job changes, detect industry and set checklist (completion mode only)
  useEffect(() => {
    if (isDaily) return
    if (!selectedJobId) { setSelectedJob(null); return }
    const job = jobs.find(j => String(j.id) === String(selectedJobId))
    setSelectedJob(job)

    // Detect industry from business_unit or job details
    const bu = (job?.business_unit || '').toLowerCase()
    const title = (job?.job_title || '').toLowerCase()
    const details = (job?.details || '').toLowerCase()
    const combined = `${bu} ${title} ${details}`

    if (combined.includes('light') || combined.includes('led') || combined.includes('retrofit') || combined.includes('energy')) {
      setIndustry('lighting')
      setChecklist(LIGHTING_CHECKLIST.map(c => ({ ...c, checked: false, notes: '' })))
    } else {
      setIndustry('general')
      setChecklist(GENERAL_CHECKLIST.map(c => ({ ...c, checked: false, notes: '' })))
    }
  }, [selectedJobId, jobs, isDaily])

  const toggleChecklistItem = (idx) => {
    setChecklist(prev => prev.map((item, i) => i === idx ? { ...item, checked: !item.checked } : item))
  }

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    const defaultType = isDaily ? 'vehicle' : 'completion'
    for (const file of files) {
      const preview = URL.createObjectURL(file)
      // Read base64
      const base64 = await new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.readAsDataURL(file)
      })
      setPhotos(prev => [...prev, { file, preview, photoType: defaultType, base64 }])
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePhoto = (idx) => {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const setPhotoType = (idx, type) => {
    setPhotos(prev => prev.map((p, i) => i === idx ? { ...p, photoType: type } : p))
  }

  const handleBack = () => {
    if (embeddedMode && onClose) {
      onClose()
    } else {
      navigate(-1)
    }
  }

  const runVerification = async () => {
    if (photos.length === 0) { setError('Please upload at least one photo'); return }
    if (!isDaily && !selectedJob) { setError('Please select a job'); return }

    setAnalyzing(true)
    setError(null)

    try {
      // 1. Create verification report record
      const insertData = {
        company_id: companyId,
        verified_by: currentEmployee?.id || null,
        verification_type: verificationType,
        industry: isDaily ? 'daily' : industry,
        checklist_items: checklist,
        status: 'analyzing',
        created_at: new Date().toISOString()
      }
      if (selectedJobId) {
        insertData.job_id = parseInt(selectedJobId)
      }

      const { data: report, error: insertError } = await supabase
        .from('verification_reports')
        .insert(insertData)
        .select()
        .single()

      if (insertError) throw new Error(insertError.message)

      // 2. Upload photos to storage
      const uploadedPhotos = []
      const storagePath = selectedJobId
        ? `jobs/${selectedJobId}/verification/${report.id}`
        : `daily-verification/${report.id}`

      for (const photo of photos) {
        const safeName = photo.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const filePath = `${storagePath}/${Date.now()}_${safeName}`

        const { error: uploadErr } = await supabase.storage
          .from('project-documents')
          .upload(filePath, photo.file)

        if (!uploadErr) {
          const photoInsert = {
            company_id: companyId,
            verification_id: report.id,
            file_path: filePath,
            storage_bucket: 'project-documents',
            photo_type: photo.photoType,
            created_at: new Date().toISOString()
          }
          if (selectedJobId) {
            photoInsert.job_id = parseInt(selectedJobId)
          }
          await supabase.from('verification_photos').insert(photoInsert)
          uploadedPhotos.push({ filePath, photoType: photo.photoType })
        }
      }

      // 3. Call Victor AI via edge function
      const body = {
        images: photos.map(p => ({
          base64: p.base64,
          mediaType: p.file.type || 'image/jpeg',
          photoType: p.photoType
        })),
        checklist: checklist.map(c => ({ item: c.item, checked: c.checked, category: c.category })),
        verificationType
      }

      if (!isDaily && selectedJob) {
        body.jobContext = {
          jobTitle: selectedJob.job_title || '',
          serviceType: selectedJob.business_unit || '',
          industry,
          address: selectedJob.job_address || '',
          assignedTeam: selectedJob.assigned_team || '',
          details: selectedJob.details || ''
        }
      }

      const { data: aiResult, error: aiError } = await supabase.functions.invoke('victor-verify', { body })

      if (aiError) throw new Error(aiError.message)

      const analysis = aiResult?.analysis || aiResult || {}

      // 4. Update report with AI results
      const score = analysis.overall_score || 0
      // Use saved settings thresholds if available, otherwise defaults
      let gradeThresholds = { A: 90, B: 80, C: 70, D: 60 }
      try {
        const { data: thresholdSetting } = await supabase.from('settings').select('value').eq('company_id', companyId).eq('key', 'victor_thresholds').single()
        if (thresholdSetting) gradeThresholds = JSON.parse(thresholdSetting.value)
      } catch {}
      const grade = analysis.grade || (score >= gradeThresholds.A ? 'A' : score >= gradeThresholds.B ? 'B' : score >= gradeThresholds.C ? 'C' : score >= gradeThresholds.D ? 'D' : 'F')

      await supabase.from('verification_reports').update({
        ai_analysis: analysis,
        score,
        grade,
        status: 'complete',
        summary: analysis.summary || null,
        issues_found: analysis.issues_found || [],
        updated_at: new Date().toISOString()
      }).eq('id', report.id)

      // 5. Update per-photo AI analysis
      if (analysis.photo_analyses) {
        for (const pa of analysis.photo_analyses) {
          const photoRecord = uploadedPhotos[pa.photo_index]
          if (photoRecord) {
            await supabase.from('verification_photos').update({
              ai_analysis: pa,
              ai_score: pa.score || null
            }).eq('verification_id', report.id).eq('file_path', photoRecord.filePath)
          }
        }
      }

      setResult({ ...analysis, reportId: report.id, score, grade })
      setStep(3)
    } catch (err) {
      console.error('[Victor] Verification error:', err)
      setError(err.message || 'Verification failed')
    } finally {
      setAnalyzing(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: `1px solid ${theme.border}`,
    borderRadius: '8px', fontSize: '14px', color: theme.text,
    backgroundColor: theme.bgCard, outline: 'none'
  }

  const labelStyle = {
    display: 'block', fontSize: '13px', fontWeight: '600',
    color: theme.textSecondary, marginBottom: '6px'
  }

  // Available jobs for verification
  const verifiableJobs = jobs.filter(j =>
    j.status === 'In Progress' || j.status === 'Completed' || j.status === 'Complete' || j.status === 'Scheduled'
  )

  // Checklist categories depend on type
  const checklistCategories = isDaily
    ? ['Cleanliness', 'Tools', 'Vehicle', 'Safety', 'Site']
    : ['Completion', 'Quality', 'Cleanliness', 'Handoff']

  const checklistTitle = isDaily
    ? 'End-of-Day Housekeeping'
    : (industry === 'lighting' ? 'Lighting' : 'General')

  const photoUploadLabel = isDaily
    ? 'Tap to take photos of your truck, site, and tools'
    : 'Tap to select or take photos of completed work'

  return (
    <div style={{ padding: embeddedMode ? '0' : '24px', maxWidth: embeddedMode ? '100%' : '800px', margin: '0 auto' }}>

      {/* Step 1: Select Job (skipped for daily and preselected) */}
      {step === 1 && (
        <div>
          {!embeddedMode && (
            <>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: theme.text, marginBottom: '8px' }}>
                <Shield size={22} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-bottom' }} />
                Start Verification
              </h2>
              <p style={{ color: theme.textMuted, fontSize: '14px', marginBottom: '24px' }}>
                Select a job to verify. Victor will analyze photos and your checklist to score the work.
              </p>
            </>
          )}

          <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: embeddedMode ? 'none' : `1px solid ${theme.border}`, padding: embeddedMode ? '0' : '24px' }}>
            <label style={labelStyle}>Select Job</label>
            <select
              value={selectedJobId}
              onChange={e => setSelectedJobId(e.target.value)}
              style={inputStyle}
            >
              <option value="">-- Choose a job --</option>
              {verifiableJobs.map(job => (
                <option key={job.id} value={job.id}>
                  {job.job_title || job.job_id} — {job.customer?.name || job.customer_name || 'No customer'} ({job.status})
                </option>
              ))}
            </select>

            {selectedJob && (
              <div style={{
                marginTop: '16px', padding: '16px', backgroundColor: theme.accentBg,
                borderRadius: '8px', fontSize: '13px'
              }}>
                <div style={{ fontWeight: '600', color: theme.text, marginBottom: '8px' }}>
                  {selectedJob.job_title || selectedJob.job_id}
                </div>
                {selectedJob.job_address && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: theme.textSecondary, marginBottom: '4px' }}>
                    <MapPin size={12} /> {selectedJob.job_address}
                  </div>
                )}
                {selectedJob.assigned_team && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: theme.textSecondary, marginBottom: '4px' }}>
                    <Wrench size={12} /> Team: {selectedJob.assigned_team}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: theme.textSecondary }}>
                  {industry === 'lighting' ? <Lightbulb size={12} /> : <Briefcase size={12} />}
                  Industry: {industry.charAt(0).toUpperCase() + industry.slice(1)}
                </div>
              </div>
            )}

            <div style={{ marginTop: '16px' }}>
              <label style={labelStyle}>Industry</label>
              <select value={industry} onChange={e => {
                setIndustry(e.target.value)
                setChecklist((e.target.value === 'lighting' ? LIGHTING_CHECKLIST : GENERAL_CHECKLIST)
                  .map(c => ({ ...c, checked: false, notes: '' })))
              }} style={inputStyle}>
                <option value="general">General</option>
                <option value="lighting">Lighting / Energy</option>
              </select>
            </div>

            <button
              onClick={() => selectedJobId && setStep(2)}
              disabled={!selectedJobId}
              style={{
                marginTop: '20px', width: '100%', padding: '12px',
                backgroundColor: selectedJobId ? theme.accent : theme.border,
                color: selectedJobId ? '#fff' : theme.textMuted,
                border: 'none', borderRadius: '8px', cursor: selectedJobId ? 'pointer' : 'not-allowed',
                fontWeight: '600', fontSize: '14px'
              }}
            >
              Continue to Checklist & Photos
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Checklist + Photos */}
      {step === 2 && (
        <div>
          {!skipJobSelection && (
            <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, fontSize: '13px', marginBottom: '12px' }}>
              ← Back to Job Selection
            </button>
          )}
          {skipJobSelection && embeddedMode && onClose && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, fontSize: '13px', marginBottom: '12px' }}>
              ← Cancel
            </button>
          )}

          <h2 style={{ fontSize: '20px', fontWeight: '700', color: theme.text, marginBottom: '4px' }}>
            {isDaily ? 'End-of-Day Check' : `Verify: ${selectedJob?.job_title || 'Job'}`}
          </h2>
          <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '20px' }}>
            {isDaily
              ? 'Complete the housekeeping checklist and snap a few photos before heading out.'
              : 'Complete the checklist and upload photos of the finished work.'}
          </p>

          {/* Checklist */}
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} style={{ color: theme.accent }} />
              Verification Checklist — {checklistTitle}
            </h3>

            {checklistCategories.map(cat => {
              const items = checklist.filter(c => c.category === cat)
              if (items.length === 0) return null
              return (
                <div key={cat} style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                    {cat}
                  </div>
                  {items.map((item, i) => {
                    const globalIdx = checklist.indexOf(item)
                    return (
                      <label key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 12px', cursor: 'pointer', fontSize: '13px', color: theme.text,
                        borderBottom: `1px solid ${theme.border}`,
                        backgroundColor: item.checked ? 'rgba(34,197,94,0.06)' : 'transparent'
                      }}>
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => toggleChecklistItem(globalIdx)}
                          style={{ width: '18px', height: '18px', accentColor: '#22c55e' }}
                        />
                        <span style={{ flex: 1 }}>{item.item}</span>
                        {item.checked && <CheckCircle2 size={14} style={{ color: '#22c55e', flexShrink: 0 }} />}
                      </label>
                    )
                  })}
                </div>
              )
            })}

            <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '8px' }}>
              {checklist.filter(c => c.checked).length} / {checklist.length} items checked
            </div>
          </div>

          {/* Photo Upload */}
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Camera size={16} style={{ color: theme.accent }} />
              Photos ({photos.length})
            </h3>

            {/* Upload Button */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${theme.border}`, borderRadius: '10px',
                padding: '30px', textAlign: 'center', cursor: 'pointer',
                backgroundColor: theme.accentBg, marginBottom: photos.length > 0 ? '16px' : 0,
                transition: 'border-color 0.2s'
              }}
            >
              <Upload size={28} style={{ color: theme.textMuted, margin: '0 auto 8px' }} />
              <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Upload Photos</div>
              <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>{photoUploadLabel}</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={handlePhotoUpload}
                style={{ display: 'none' }}
              />
            </div>

            {/* Photo Grid */}
            {photos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                {photos.map((photo, idx) => (
                  <div key={idx} style={{
                    borderRadius: '8px', border: `1px solid ${theme.border}`,
                    overflow: 'hidden', position: 'relative'
                  }}>
                    <img
                      src={photo.preview}
                      alt={`Photo ${idx + 1}`}
                      style={{ width: '100%', height: '120px', objectFit: 'cover' }}
                    />
                    <button
                      onClick={() => removePhoto(idx)}
                      style={{
                        position: 'absolute', top: '4px', right: '4px',
                        width: '24px', height: '24px', borderRadius: '50%',
                        backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
                        border: 'none', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <X size={14} />
                    </button>
                    <div style={{ padding: '6px' }}>
                      <select
                        value={photo.photoType}
                        onChange={e => setPhotoType(idx, e.target.value)}
                        style={{ width: '100%', fontSize: '11px', padding: '4px', border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.text, backgroundColor: theme.bgCard }}
                      >
                        {activePhotoTypes.map(t => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '14px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {/* Run Verification */}
          <button
            onClick={runVerification}
            disabled={analyzing || photos.length === 0}
            style={{
              width: '100%', padding: '14px',
              backgroundColor: analyzing ? theme.border : '#0ea5e9',
              color: '#fff', border: 'none', borderRadius: '10px',
              cursor: analyzing ? 'not-allowed' : 'pointer',
              fontWeight: '700', fontSize: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
            }}
          >
            {analyzing ? (
              <><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Victor is Analyzing...</>
            ) : (
              <><Sparkles size={20} /> {isDaily ? 'Run End-of-Day Check' : 'Run Victor Verification'}</>
            )}
          </button>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 3 && result && (
        <div>
          <button onClick={() => { setStep(2); setResult(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, fontSize: '13px', marginBottom: '12px' }}>
            ← Back
          </button>

          {/* Score Card */}
          <div style={{
            backgroundColor: theme.bgCard, borderRadius: '16px',
            border: `2px solid ${gradeColors[result.grade] || theme.border}`,
            padding: '32px', textAlign: 'center', marginBottom: '20px'
          }}>
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              backgroundColor: `${gradeColors[result.grade] || theme.accent}15`,
              border: `3px solid ${gradeColors[result.grade] || theme.accent}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', fontSize: '36px', fontWeight: '800',
              color: gradeColors[result.grade] || theme.text
            }}>
              {result.grade}
            </div>
            <div style={{ fontSize: '42px', fontWeight: '800', color: theme.text }}>{result.score}<span style={{ fontSize: '20px', color: theme.textMuted }}>/100</span></div>
            <p style={{ fontSize: '15px', color: theme.textSecondary, marginTop: '8px', maxWidth: '500px', margin: '8px auto 0' }}>
              {result.summary || 'Verification complete.'}
            </p>
          </div>

          {/* Sub-scores */}
          {(result.work_quality_score || result.cleanliness_score || result.completeness_score || result.customer_readiness_score) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
              {[
                { label: isDaily ? 'Vehicle/Site' : 'Work Quality', score: result.work_quality_score, icon: Wrench },
                { label: 'Cleanliness', score: result.cleanliness_score, icon: Sparkles },
                { label: isDaily ? 'Tools Gathered' : 'Completeness', score: result.completeness_score, icon: CheckCircle2 },
                { label: isDaily ? 'Nothing Left Behind' : 'Customer Ready', score: result.customer_readiness_score, icon: Star },
              ].filter(s => s.score).map(sub => (
                <div key={sub.label} style={{
                  backgroundColor: theme.bgCard, borderRadius: '10px',
                  border: `1px solid ${theme.border}`, padding: '16px',
                  display: 'flex', alignItems: 'center', gap: '12px'
                }}>
                  <sub.icon size={18} style={{ color: sub.score >= 80 ? '#22c55e' : sub.score >= 60 ? '#f59e0b' : '#ef4444' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>{sub.label}</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: theme.text }}>{sub.score}</div>
                  </div>
                  <div style={{
                    width: '60px', height: '6px', borderRadius: '3px', backgroundColor: theme.border, overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${sub.score}%`, height: '100%', borderRadius: '3px',
                      backgroundColor: sub.score >= 80 ? '#22c55e' : sub.score >= 60 ? '#f59e0b' : '#ef4444'
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Issues */}
          {result.issues_found && result.issues_found.length > 0 && (
            <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                Issues Found ({result.issues_found.length})
              </h3>
              {result.issues_found.map((issue, i) => (
                <div key={i} style={{
                  padding: '12px', borderRadius: '8px', marginBottom: '8px',
                  backgroundColor: issue.severity === 'critical' ? '#fef2f2' : issue.severity === 'major' ? '#fffbeb' : theme.accentBg,
                  border: `1px solid ${issue.severity === 'critical' ? '#fecaca' : issue.severity === 'major' ? '#fde68a' : theme.border}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      fontSize: '10px', fontWeight: '700', textTransform: 'uppercase',
                      padding: '2px 6px', borderRadius: '4px',
                      backgroundColor: issue.severity === 'critical' ? '#dc2626' : issue.severity === 'major' ? '#d97706' : '#6b7280',
                      color: '#fff'
                    }}>{issue.severity}</span>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{issue.issue}</span>
                  </div>
                  {issue.recommendation && (
                    <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}>
                      Fix: {issue.recommendation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Checklist Verification */}
          {result.checklist_verification && (
            <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
                Checklist Verification
              </h3>
              {result.checklist_verification.map((cv, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 0', borderBottom: `1px solid ${theme.border}`, fontSize: '13px'
                }}>
                  <div style={{ color: cv.ai_verified ? '#22c55e' : '#ef4444' }}>
                    {cv.ai_verified ? <CheckCircle2 size={16} /> : <X size={16} />}
                  </div>
                  <span style={{ flex: 1, color: theme.text }}>{cv.item}</span>
                  {cv.confidence && (
                    <span style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase' }}>{cv.confidence}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                if (embeddedMode && onComplete) {
                  onComplete(result.reportId)
                } else {
                  navigate(`/agents/victor/report/${result.reportId}`)
                }
              }}
              style={{
                flex: 1, padding: '12px', backgroundColor: theme.accent,
                color: '#fff', border: 'none', borderRadius: '8px',
                cursor: 'pointer', fontWeight: '600', fontSize: '14px'
              }}
            >
              {embeddedMode ? 'Done' : 'View Full Report'}
            </button>
            <button
              onClick={() => {
                if (embeddedMode && onClose) {
                  onClose()
                } else {
                  setStep(skipJobSelection ? 2 : 1)
                  setResult(null)
                  setPhotos([])
                  if (!skipJobSelection) setSelectedJobId('')
                }
              }}
              style={{
                flex: 1, padding: '12px', border: `1px solid ${theme.border}`,
                backgroundColor: 'transparent', color: theme.text,
                borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
              }}
            >
              {embeddedMode ? 'Close' : 'New Verification'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
