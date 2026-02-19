import { useState } from 'react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { Plus, Sparkles, Pencil, Trash2, X, FileText, Save } from 'lucide-react'

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

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'quote_reminder', label: 'Quote Reminder' },
  { value: 'seasonal', label: 'Seasonal' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'win_back', label: 'Win Back' },
  { value: 'custom', label: 'Custom' },
]

const categoryColors = {
  follow_up: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' },
  quote_reminder: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
  seasonal: { bg: 'rgba(34,197,94,0.15)', text: '#16a34a' },
  newsletter: { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6' },
  win_back: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
  custom: { bg: 'rgba(107,114,128,0.15)', text: '#6b7280' },
}

const MERGE_FIELDS = ['{{first_name}}', '{{company_name}}', '{{email}}']

const emptyForm = {
  name: '',
  subject: '',
  category: 'custom',
  html_content: '',
  text_content: '',
}

export default function ConradTemplates() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const companyId = useStore(s => s.companyId)
  const emailTemplates = useStore(s => s.emailTemplates)
  const createEmailTemplate = useStore(s => s.createEmailTemplate)
  const updateEmailTemplate = useStore(s => s.updateEmailTemplate)
  const deleteEmailTemplate = useStore(s => s.deleteEmailTemplate)

  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showEditModal, setShowEditModal] = useState(false)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  // AI generate state
  const [generateType, setGenerateType] = useState('follow_up')
  const [generateTone, setGenerateTone] = useState('professional')
  const [generateContext, setGenerateContext] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedResult, setGeneratedResult] = useState(null)

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

  const filteredTemplates = categoryFilter === 'all'
    ? emailTemplates
    : emailTemplates.filter(t => t.category === categoryFilter)

  const openNewTemplate = () => {
    setEditingTemplate(null)
    setFormData(emptyForm)
    setShowEditModal(true)
  }

  const openEditTemplate = (template) => {
    setEditingTemplate(template)
    setFormData({
      name: template.name || '',
      subject: template.subject || '',
      category: template.category || 'custom',
      html_content: template.html_content || '',
      text_content: template.text_content || '',
    })
    setShowEditModal(true)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const insertMergeField = (field) => {
    setFormData(prev => ({
      ...prev,
      html_content: prev.html_content + field
    }))
  }

  const handleSaveTemplate = async () => {
    setSaving(true)
    try {
      if (editingTemplate) {
        await updateEmailTemplate(editingTemplate.id, formData)
      } else {
        await createEmailTemplate(formData)
      }
      setShowEditModal(false)
      setFormData(emptyForm)
      setEditingTemplate(null)
    } catch (e) {
      console.error('Save template error:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTemplate = async (template) => {
    if (!confirm(`Delete template "${template.name}"?`)) return
    await deleteEmailTemplate(template.id)
  }

  const openGenerateModal = () => {
    setGenerateType('follow_up')
    setGenerateTone('professional')
    setGenerateContext('')
    setGeneratedResult(null)
    setShowGenerateModal(true)
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cc-generate-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            company_id: companyId,
            type: generateType,
            tone: generateTone,
            context: generateContext,
          })
        }
      )
      const data = await response.json()
      if (data.html_content || data.subject) {
        setGeneratedResult(data)
      }
    } catch (e) {
      console.error('Generate error:', e)
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveGenerated = async () => {
    if (!generatedResult) return
    setSaving(true)
    try {
      await createEmailTemplate({
        name: generatedResult.name || `AI Generated - ${generateType}`,
        subject: generatedResult.subject || '',
        category: generateType,
        html_content: generatedResult.html_content || '',
        text_content: generatedResult.text_content || '',
        ai_generated: true,
      })
      setShowGenerateModal(false)
      setGeneratedResult(null)
    } catch (e) {
      console.error('Save generated template error:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>Email Templates</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={openGenerateModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              background: 'transparent',
              color: theme.accent,
              borderRadius: '8px',
              border: `1px solid ${theme.accent}`,
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '13px'
            }}
          >
            <Sparkles size={16} />
            Generate with AI
          </button>
          <button
            onClick={openNewTemplate}
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
            New Template
          </button>
        </div>
      </div>

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => setCategoryFilter(cat.value)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              border: categoryFilter === cat.value ? 'none' : `1px solid ${theme.border}`,
              background: categoryFilter === cat.value ? theme.accent : 'transparent',
              color: categoryFilter === cat.value ? '#fff' : theme.textSecondary,
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div style={{
          background: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '48px',
          textAlign: 'center'
        }}>
          <FileText size={40} style={{ color: theme.textMuted, marginBottom: '12px' }} />
          <p style={{ color: theme.textSecondary }}>No templates yet. Create one or generate with AI.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {filteredTemplates.map(t => {
            const cc = categoryColors[t.category] || categoryColors.custom
            return (
              <div
                key={t.id}
                onClick={() => openEditTemplate(t)}
                style={{
                  background: theme.bgCard,
                  borderRadius: '12px',
                  border: `1px solid ${theme.border}`,
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, margin: 0 }}>{t.name}</h3>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '600',
                    backgroundColor: cc.bg,
                    color: cc.text,
                    whiteSpace: 'nowrap'
                  }}>
                    {(t.category || 'custom').replace('_', ' ')}
                  </span>
                </div>
                {t.subject && (
                  <p style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.subject}
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: theme.textMuted }}>
                    {t.created_at ? new Date(t.created_at).toLocaleDateString() : ''}
                  </span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditTemplate(t) }}
                      style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t) }}
                      style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit / New Template Modal */}
      {showEditModal && (
        <>
          <div onClick={() => setShowEditModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 }} />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            border: `1px solid ${theme.border}`,
            width: '100%',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflow: 'auto',
            zIndex: 51,
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>
                {editingTemplate ? 'Edit Template' : 'New Template'}
              </h2>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input name="name" value={formData.name} onChange={handleChange} style={inputStyle} placeholder="Template name" />
              </div>

              <div>
                <label style={labelStyle}>Subject</label>
                <input name="subject" value={formData.subject} onChange={handleChange} style={inputStyle} placeholder="Email subject line" />
              </div>

              <div>
                <label style={labelStyle}>Category</label>
                <select name="category" value={formData.category} onChange={handleChange} style={inputStyle}>
                  {CATEGORIES.filter(c => c.value !== 'all').map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>HTML Content</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {MERGE_FIELDS.map(field => (
                      <button
                        key={field}
                        onClick={() => insertMergeField(field)}
                        style={{
                          padding: '2px 8px',
                          fontSize: '11px',
                          background: theme.accentBg,
                          color: theme.accent,
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: '500'
                        }}
                      >
                        {field}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  name="html_content"
                  value={formData.html_content}
                  onChange={handleChange}
                  style={{ ...inputStyle, minHeight: '160px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px' }}
                  placeholder="<html>...</html>"
                />
              </div>

              <div>
                <label style={labelStyle}>Plain Text Content</label>
                <textarea
                  name="text_content"
                  value={formData.text_content}
                  onChange={handleChange}
                  style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
                  placeholder="Plain text version of the email..."
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                {editingTemplate && (
                  <button
                    onClick={() => handleDeleteTemplate(editingTemplate)}
                    style={{
                      padding: '10px 16px',
                      background: 'transparent',
                      color: '#ef4444',
                      borderRadius: '8px',
                      border: '1px solid #ef4444',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginRight: 'auto'
                    }}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                )}
                <button
                  onClick={handleSaveTemplate}
                  disabled={!formData.name || saving}
                  style={{
                    padding: '10px 16px',
                    background: theme.accent,
                    color: '#fff',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: (!formData.name || saving) ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: (!formData.name || saving) ? 0.5 : 1
                  }}
                >
                  <Save size={14} />
                  {saving ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Generate with AI Modal */}
      {showGenerateModal && (
        <>
          <div onClick={() => setShowGenerateModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 }} />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            border: `1px solid ${theme.border}`,
            width: '100%',
            maxWidth: '520px',
            maxHeight: '90vh',
            overflow: 'auto',
            zIndex: 51,
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>Generate Email with AI</h2>
              <button onClick={() => setShowGenerateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Email Type</label>
                <select value={generateType} onChange={(e) => setGenerateType(e.target.value)} style={inputStyle}>
                  <option value="follow_up">Follow Up</option>
                  <option value="quote_reminder">Quote Reminder</option>
                  <option value="seasonal">Seasonal</option>
                  <option value="newsletter">Newsletter</option>
                  <option value="win_back">Win Back</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Tone</label>
                <select value={generateTone} onChange={(e) => setGenerateTone(e.target.value)} style={inputStyle}>
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Context</label>
                <textarea
                  value={generateContext}
                  onChange={(e) => setGenerateContext(e.target.value)}
                  style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
                  placeholder="Describe what you want the email to say..."
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  padding: '10px 16px',
                  background: theme.accent,
                  color: '#fff',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: generating ? 'wait' : 'pointer',
                  fontWeight: '600',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: generating ? 0.7 : 1
                }}
              >
                <Sparkles size={16} />
                {generating ? 'Generating...' : 'Generate'}
              </button>

              {generatedResult && (
                <>
                  <div style={{
                    background: theme.bg,
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    padding: '16px'
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>
                      Subject: {generatedResult.subject}
                    </div>
                    <div
                      style={{ fontSize: '13px', color: theme.textSecondary, maxHeight: '200px', overflow: 'auto' }}
                      dangerouslySetInnerHTML={{ __html: generatedResult.html_content }}
                    />
                  </div>

                  <button
                    onClick={handleSaveGenerated}
                    disabled={saving}
                    style={{
                      padding: '10px 16px',
                      background: theme.accent,
                      color: '#fff',
                      borderRadius: '8px',
                      border: 'none',
                      cursor: saving ? 'wait' : 'pointer',
                      fontWeight: '600',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      opacity: saving ? 0.7 : 1
                    }}
                  >
                    <Save size={14} />
                    {saving ? 'Saving...' : 'Save as Template'}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
