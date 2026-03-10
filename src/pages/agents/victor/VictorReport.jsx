import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import {
  Shield, Star, CheckCircle2, X, AlertTriangle, Camera,
  ChevronLeft, Wrench, Sparkles, MapPin, User, Calendar
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)'
}
const gradeColors = { 'A': '#22c55e', 'B': '#3b82f6', 'C': '#f59e0b', 'D': '#f97316', 'F': '#ef4444' }

export default function VictorReport() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore(s => s.companyId)
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const [report, setReport] = useState(null)
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id || !companyId) return
    fetchReport()
  }, [id, companyId])

  const fetchReport = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('verification_reports')
      .select('*, job:jobs!job_id(id, job_id, job_title, job_address, customer_name, assigned_team, business_unit), verifier:employees!verified_by(id, name)')
      .eq('id', id)
      .eq('company_id', companyId)
      .single()

    setReport(data)

    const { data: photoData } = await supabase
      .from('verification_photos')
      .select('*')
      .eq('verification_id', id)
      .order('created_at')

    // Get signed URLs for photos
    const photosWithUrls = await Promise.all((photoData || []).map(async (p) => {
      const { data: urlData } = await supabase.storage
        .from(p.storage_bucket)
        .createSignedUrl(p.file_path, 3600)
      return { ...p, url: urlData?.signedUrl }
    }))

    setPhotos(photosWithUrls)
    setLoading(false)
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: defaultTheme.textMuted }}>Loading report...</div>
  if (!report) return <div style={{ padding: '40px', textAlign: 'center', color: defaultTheme.textMuted }}>Report not found</div>

  const analysis = report.ai_analysis || {}

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <button onClick={() => navigate('/agents/victor/history')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <ChevronLeft size={14} /> Back to History
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', marginBottom: '24px' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '16px',
          backgroundColor: `${gradeColors[report.grade] || theme.accent}15`,
          border: `3px solid ${gradeColors[report.grade] || theme.accent}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '32px', fontWeight: '800', color: gradeColors[report.grade] || theme.text,
          flexShrink: 0
        }}>
          {report.grade || '—'}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: theme.text, margin: 0 }}>
            {report.job?.job_title || `Job #${report.job?.job_id}`}
          </h1>
          <div style={{ fontSize: '36px', fontWeight: '800', color: theme.text }}>
            {report.score}<span style={{ fontSize: '18px', color: theme.textMuted }}>/100</span>
          </div>
          <div style={{ fontSize: '13px', color: theme.textMuted, display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '4px' }}>
            {report.verifier?.name && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><User size={12} /> {report.verifier.name}</span>}
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /> {new Date(report.created_at).toLocaleDateString()}</span>
            {report.job?.job_address && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> {report.job.job_address}</span>}
          </div>
        </div>
      </div>

      {/* Summary */}
      {report.summary && (
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Victor's Assessment</h3>
          <p style={{ fontSize: '14px', color: theme.textSecondary, lineHeight: '1.6', margin: 0 }}>{report.summary}</p>
        </div>
      )}

      {/* Sub-scores */}
      {(analysis.work_quality_score || analysis.cleanliness_score) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Work Quality', score: analysis.work_quality_score, icon: Wrench },
            { label: 'Cleanliness', score: analysis.cleanliness_score, icon: Sparkles },
            { label: 'Completeness', score: analysis.completeness_score, icon: CheckCircle2 },
            { label: 'Customer Ready', score: analysis.customer_readiness_score, icon: Star },
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
              <div style={{ width: '60px', height: '6px', borderRadius: '3px', backgroundColor: theme.border, overflow: 'hidden' }}>
                <div style={{ width: `${sub.score}%`, height: '100%', borderRadius: '3px', backgroundColor: sub.score >= 80 ? '#22c55e' : sub.score >= 60 ? '#f59e0b' : '#ef4444' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Photos */}
      {photos.length > 0 && (
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={16} style={{ color: theme.accent }} />
            Verification Photos ({photos.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
            {photos.map(photo => (
              <div key={photo.id} style={{ borderRadius: '8px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
                {photo.url && <img src={photo.url} alt="" style={{ width: '100%', height: '160px', objectFit: 'cover' }} />}
                <div style={{ padding: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '4px' }}>{photo.photo_type?.replace('_', ' ')}</div>
                  {photo.ai_score && (
                    <div style={{ fontSize: '13px', fontWeight: '700', color: photo.ai_score >= 80 ? '#22c55e' : photo.ai_score >= 60 ? '#f59e0b' : '#ef4444' }}>
                      Score: {photo.ai_score}/100
                    </div>
                  )}
                  {photo.ai_analysis?.observations && (
                    <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}>{photo.ai_analysis.observations}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Issues */}
      {report.issues_found && report.issues_found.length > 0 && (
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
            Issues Found ({report.issues_found.length})
          </h3>
          {report.issues_found.map((issue, i) => (
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
              {issue.recommendation && <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}>Fix: {issue.recommendation}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Checklist */}
      {report.checklist_items && report.checklist_items.length > 0 && (
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Crew Checklist</h3>
          {report.checklist_items.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 0', borderBottom: `1px solid ${theme.border}`, fontSize: '13px'
            }}>
              <div style={{ color: item.checked ? '#22c55e' : '#ef4444' }}>
                {item.checked ? <CheckCircle2 size={16} /> : <X size={16} />}
              </div>
              <span style={{ flex: 1, color: theme.text }}>{item.item}</span>
              <span style={{ fontSize: '10px', color: theme.textMuted }}>{item.category}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
