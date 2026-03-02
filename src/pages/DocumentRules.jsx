import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { extractFormFields } from '../lib/pdfFormFiller'
import {
  FileText,
  Upload,
  Trash2,
  Settings,
  CheckCircle,
  Clock,
  Package,
  Layers,
  X,
  Check,
  Info,
  AlertCircle
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  bgCardHover: '#eef2eb',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentHover: '#4a5239',
  accentBg: 'rgba(90,99,73,0.12)'
}

const CATEGORY_COLORS = {
  CONTRACT: { bg: '#dcfce7', text: '#166534' },
  APPLICATION: { bg: '#dbeafe', text: '#1e40af' },
  TAX: { bg: '#f3e8ff', text: '#6b21a8' },
  PERMIT: { bg: '#ffedd5', text: '#9a3412' },
  PROPOSAL: { bg: '#e0e7ff', text: '#3730a3' },
  CUSTOM: { bg: '#fef9c3', text: '#854d0e' }
}

export default function DocumentRules() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const serviceTypes = useStore((state) => state.serviceTypes)
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const fileInputRef = useRef(null)

  const [activeTab, setActiveTab] = useState('library')
  const [templates, setTemplates] = useState([])
  const [packageItems, setPackageItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [filter, setFilter] = useState('all')

  // Doc package edit modal
  const [editingPackage, setEditingPackage] = useState(null)
  const [packageSelections, setPackageSelections] = useState({})

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    loadData()
  }, [companyId])

  const loadData = async () => {
    setLoading(true)
    const [templatesRes, utilityFormsRes, packagesRes] = await Promise.all([
      supabase
        .from('document_templates')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
      supabase
        .from('utility_forms')
        .select('*')
        .eq('status', 'published'),
      supabase
        .from('doc_package_items')
        .select('*')
        .eq('company_id', companyId)
        .order('sort_order', { ascending: true })
    ])

    // Normalize utility_forms into the same shape as document_templates
    const utilityTemplates = (utilityFormsRes.data || []).map(uf => {
      const mapping = uf.field_mapping || {}
      const fieldCount = Object.keys(mapping).length
      const mappedCount = Object.values(mapping).filter(v => v).length
      return {
        id: `uf_${uf.id}`,
        _source: 'utility_forms',
        _sourceId: uf.id,
        company_id: uf.company_id,
        form_name: uf.form_name,
        form_code: uf.form_type || '',
        category: (uf.form_type || 'APPLICATION').toUpperCase(),
        file_path: uf.form_file || '',
        file_name: uf.form_name,
        file_size: null,
        field_count: fieldCount,
        field_mapping: mapping,
        status: mappedCount >= fieldCount && fieldCount > 0 ? 'Ready' : (fieldCount === 0 ? 'Ready' : 'Pending'),
        is_custom: false,
        created_at: uf.created_at,
        updated_at: uf.updated_at
      }
    })

    const allTemplates = [...(templatesRes.data || []), ...utilityTemplates]
    setTemplates(allTemplates)
    if (packagesRes.data) setPackageItems(packagesRes.data)
    setLoading(false)
  }

  // --- Stats ---
  const totalForms = templates.length
  const readyForms = templates.filter(t => t.status === 'Ready').length
  const customForms = templates.filter(t => t.is_custom).length
  const packageCount = [...new Set(packageItems.map(p => p.service_type))].length

  // --- Filtering ---
  const filteredTemplates = templates.filter(t => {
    if (filter === 'ready') return t.status === 'Ready'
    if (filter === 'pending') return t.status === 'Pending'
    if (filter === 'custom') return t.is_custom
    return true
  })

  // --- Upload handler ---
  const handleUploadCustomForm = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are accepted')
      return
    }

    setUploading(true)
    try {
      const arrayBuffer = await file.arrayBuffer()

      let fields = []
      try {
        fields = await extractFormFields(arrayBuffer)
      } catch {
        // Not a fillable PDF — that's okay, field_count = 0
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `templates/${companyId}/${Date.now()}_${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(filePath, arrayBuffer, { contentType: 'application/pdf' })

      if (uploadError) {
        toast.error('Upload failed: ' + uploadError.message)
        setUploading(false)
        return
      }

      const fieldCount = fields.length
      const status = fieldCount === 0 ? 'Ready' : 'Pending'
      const formName = file.name.replace(/\.pdf$/i, '')

      const { error: insertError } = await supabase
        .from('document_templates')
        .insert({
          company_id: companyId,
          form_name: formName,
          form_code: '',
          category: 'CUSTOM',
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          field_count: fieldCount,
          field_mapping: {},
          status,
          is_custom: true
        })

      if (insertError) {
        toast.error('Save failed: ' + insertError.message)
      } else {
        toast.success(`Uploaded "${formName}" with ${fieldCount} form fields`)
        await loadData()
      }
    } catch (err) {
      toast.error('Upload error: ' + err.message)
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // --- Delete handler ---
  const handleDeleteTemplate = async (template) => {
    if (template._source === 'utility_forms') {
      toast.info('Utility forms are managed in the Data Console')
      return
    }
    if (!confirm(`Delete "${template.form_name}"? This will also remove it from any doc packages.`)) return

    try {
      // Delete storage file
      await supabase.storage.from('project-documents').remove([template.file_path])
      // Delete package items referencing this template
      await supabase
        .from('doc_package_items')
        .delete()
        .eq('template_id', template.id)
      // Delete template row
      const { error } = await supabase
        .from('document_templates')
        .delete()
        .eq('id', template.id)

      if (error) {
        toast.error('Delete failed: ' + error.message)
      } else {
        toast.success(`Deleted "${template.form_name}"`)
        await loadData()
      }
    } catch (err) {
      toast.error('Delete error: ' + err.message)
    }
  }

  // --- Doc Package handlers ---
  const openEditPackage = (serviceType) => {
    const currentIds = packageItems
      .filter(p => p.service_type === serviceType)
      .map(p => p.template_id)
    const selections = {}
    templates.forEach(t => {
      selections[t.id] = currentIds.includes(t.id)
    })
    setPackageSelections(selections)
    setEditingPackage(serviceType)
  }

  const savePackage = async () => {
    if (!editingPackage) return
    try {
      // Delete existing items for this service type
      await supabase
        .from('doc_package_items')
        .delete()
        .eq('company_id', companyId)
        .eq('service_type', editingPackage)

      // Insert new selections
      const selectedIds = Object.entries(packageSelections)
        .filter(([, checked]) => checked)
        .map(([id], idx) => ({
          company_id: companyId,
          service_type: editingPackage,
          template_id: Number(id),
          sort_order: idx
        }))

      if (selectedIds.length > 0) {
        const { error } = await supabase
          .from('doc_package_items')
          .insert(selectedIds)
        if (error) {
          toast.error('Save failed: ' + error.message)
          return
        }
      }

      toast.success(`Updated package for "${editingPackage}"`)
      setEditingPackage(null)
      await loadData()
    } catch (err) {
      toast.error('Save error: ' + err.message)
    }
  }

  // --- Computed status display ---
  const getStatusDisplay = (template) => {
    if (template.status === 'Ready') return { label: 'Ready', color: '#16a34a', bg: '#dcfce7' }
    if (template.field_count === 0) return { label: 'Ready', color: '#16a34a', bg: '#dcfce7' }
    const mapping = template.field_mapping || {}
    const mappedCount = Object.keys(mapping).filter(k => mapping[k]).length
    if (mappedCount === 0) return { label: 'Pending', color: '#6b7280', bg: '#f3f4f6' }
    const pct = Math.round((mappedCount / template.field_count) * 100)
    if (pct >= 100) return { label: 'Ready', color: '#16a34a', bg: '#dcfce7' }
    return { label: `${pct}% mapped`, color: '#ea580c', bg: '#ffedd5' }
  }

  // --- Helpers for packages ---
  const getPackageTemplates = (serviceType) => {
    const ids = packageItems.filter(p => p.service_type === serviceType).map(p => p.template_id)
    return templates.filter(t => ids.includes(t.id))
  }

  const tabs = [
    { id: 'library', label: 'Form Library' },
    { id: 'packages', label: 'Doc Packages' }
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }} className="page-padding">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }} className="page-header">
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Document Rules
          </h1>
          <p style={{ fontSize: '14px', color: theme.textMuted, marginTop: '4px' }}>
            {totalForms} template{totalForms !== 1 ? 's' : ''} &middot; {readyForms} ready &middot; {packageCount} package{packageCount !== 1 ? 's' : ''} configured
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {activeTab === 'library' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleUploadCustomForm}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  backgroundColor: theme.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  opacity: uploading ? 0.6 : 1
                }}
              >
                <Upload size={16} />
                {uploading ? 'Uploading...' : '+ Upload Custom Form'}
              </button>
            </>
          )}
          <button
            onClick={() => navigate('/settings')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              backgroundColor: 'transparent',
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              color: theme.textMuted,
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            <Settings size={16} />
            Settings
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{
        display: 'flex',
        gap: '0',
        borderBottom: `2px solid ${theme.border}`,
        marginBottom: '24px'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: activeTab === tab.id ? '600' : '400',
              color: activeTab === tab.id ? theme.accent : theme.textMuted,
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? `2px solid ${theme.accent}` : '2px solid transparent',
              marginBottom: '-2px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>Loading...</div>
      ) : activeTab === 'library' ? (
        <>
          {/* Stats Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
            marginBottom: '24px'
          }} className="stat-grid">
            {[
              { icon: FileText, label: 'Total Forms', value: totalForms, color: '#3b82f6' },
              { icon: CheckCircle, label: 'Ready to Use', value: readyForms, color: '#16a34a' },
              { icon: Layers, label: 'Custom Forms', value: customForms, color: '#f59e0b' },
              { icon: Package, label: 'Packages', value: packageCount, color: '#8b5cf6' }
            ].map(stat => (
              <div key={stat.label} style={{
                backgroundColor: theme.bgCard,
                borderRadius: '10px',
                padding: '16px',
                border: `1px solid ${theme.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: stat.color + '15',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <stat.icon size={20} style={{ color: stat.color }} />
                </div>
                <div>
                  <div style={{ fontSize: '22px', fontWeight: '700', color: theme.text }}>{stat.value}</div>
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>{stat.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Filter Chips */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'ready', label: 'Ready' },
              { id: 'pending', label: 'Pending' },
              { id: 'custom', label: 'Custom' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: filter === f.id ? '600' : '400',
                  color: filter === f.id ? '#fff' : theme.textSecondary,
                  backgroundColor: filter === f.id ? theme.accent : theme.bgCard,
                  border: `1px solid ${filter === f.id ? theme.accent : theme.border}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Templates Table */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '10px',
            border: `1px solid ${theme.border}`,
            overflow: 'hidden'
          }}>
            {/* Table Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 120px 80px 100px 50px',
              gap: '12px',
              padding: '12px 16px',
              backgroundColor: theme.bg,
              borderBottom: `1px solid ${theme.border}`,
              fontSize: '11px',
              fontWeight: '600',
              color: theme.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              <span>Form Name</span>
              <span>Category</span>
              <span>Fields</span>
              <span>Status</span>
              <span></span>
            </div>

            {filteredTemplates.length === 0 ? (
              <div style={{
                padding: '48px',
                textAlign: 'center',
                color: theme.textMuted
              }}>
                <FileText size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <p style={{ margin: 0, fontSize: '14px' }}>
                  {filter !== 'all' ? 'No templates match this filter' : 'No form templates yet. Upload a PDF to get started.'}
                </p>
              </div>
            ) : (
              filteredTemplates.map(template => {
                const status = getStatusDisplay(template)
                const catColor = CATEGORY_COLORS[template.category] || CATEGORY_COLORS.CUSTOM
                return (
                  <div
                    key={template.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 120px 80px 100px 50px',
                      gap: '12px',
                      padding: '12px 16px',
                      borderBottom: `1px solid ${theme.border}`,
                      alignItems: 'center',
                      fontSize: '14px',
                      transition: 'background-color 0.1s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = theme.bgCardHover}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div>
                      <div style={{ fontWeight: '500', color: theme.text }}>{template.form_name}</div>
                      {template.form_code && (
                        <span style={{ fontSize: '11px', color: theme.textMuted }}>{template.form_code}</span>
                      )}
                    </div>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '600',
                      backgroundColor: catColor.bg,
                      color: catColor.text,
                      textAlign: 'center'
                    }}>
                      {template.category}
                    </span>
                    <span style={{ color: theme.textSecondary, fontSize: '13px' }}>
                      {template.field_count}
                    </span>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '600',
                      backgroundColor: status.bg,
                      color: status.color,
                      textAlign: 'center'
                    }}>
                      {status.label}
                    </span>
                    <button
                      onClick={() => handleDeleteTemplate(template)}
                      title="Delete template"
                      style={{
                        padding: '6px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: theme.textMuted,
                        cursor: 'pointer',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = theme.textMuted}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </>
      ) : (
        /* Doc Packages Tab */
        <>
          {/* Info Banner */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            backgroundColor: '#dbeafe',
            borderRadius: '8px',
            marginBottom: '24px',
            fontSize: '13px',
            color: '#1e40af'
          }}>
            <Info size={18} />
            Configure which documents are required for each service type.
          </div>

          {(!serviceTypes || serviceTypes.length === 0) ? (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '10px',
              border: `1px solid ${theme.border}`,
              padding: '48px',
              textAlign: 'center'
            }}>
              <AlertCircle size={32} style={{ color: theme.textMuted, opacity: 0.4, marginBottom: '8px' }} />
              <p style={{ color: theme.textMuted, margin: '0 0 12px', fontSize: '14px' }}>
                No service types configured yet.
              </p>
              <button
                onClick={() => navigate('/settings')}
                style={{
                  padding: '8px 16px',
                  backgroundColor: theme.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Go to Settings
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px'
            }} className="responsive-grid-2">
              {serviceTypes.map(st => {
                const pkgTemplates = getPackageTemplates(st)
                return (
                  <div key={st} style={{
                    backgroundColor: theme.bgCard,
                    borderRadius: '10px',
                    border: `1px solid ${theme.border}`,
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      padding: '14px 16px',
                      borderBottom: `1px solid ${theme.border}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '600', fontSize: '15px', color: theme.text }}>{st}</span>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: theme.accentBg,
                          color: theme.accent
                        }}>
                          {pkgTemplates.length} doc{pkgTemplates.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div style={{ padding: '12px 16px', minHeight: '60px' }}>
                      {pkgTemplates.length === 0 ? (
                        <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>No documents assigned</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {pkgTemplates.map(t => (
                            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textSecondary }}>
                              <Check size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
                              <span>{t.form_name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '12px 16px', borderTop: `1px solid ${theme.border}` }}>
                      <button
                        onClick={() => openEditPackage(st)}
                        disabled={templates.length === 0}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: 'transparent',
                          border: `1px solid ${theme.border}`,
                          borderRadius: '6px',
                          color: templates.length === 0 ? theme.textMuted : theme.accent,
                          fontSize: '13px',
                          fontWeight: '500',
                          cursor: templates.length === 0 ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Edit Package
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Edit Package Modal */}
      {editingPackage && (
        <>
          <div
            onClick={() => setEditingPackage(null)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 100
            }}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            width: '90%',
            maxWidth: '500px',
            maxHeight: '80vh',
            overflow: 'hidden',
            zIndex: 101,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
          }} className="modal-content">
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
                  Edit Package: {editingPackage}
                </h3>
                <p style={{ fontSize: '12px', color: theme.textMuted, margin: '2px 0 0' }}>
                  Select templates to include
                </p>
              </div>
              <button
                onClick={() => setEditingPackage(null)}
                style={{
                  padding: '6px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: theme.textMuted,
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Template Checklist */}
            <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(80vh - 140px)' }}>
              {templates.length === 0 ? (
                <p style={{ color: theme.textMuted, textAlign: 'center', padding: '24px', fontSize: '14px' }}>
                  No templates available. Upload a form first.
                </p>
              ) : (
                templates.map(t => {
                  const catColor = CATEGORY_COLORS[t.category] || CATEGORY_COLORS.CUSTOM
                  return (
                    <label
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'background-color 0.1s ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = theme.bgCardHover}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <input
                        type="checkbox"
                        checked={!!packageSelections[t.id]}
                        onChange={(e) => setPackageSelections(prev => ({ ...prev, [t.id]: e.target.checked }))}
                        style={{ width: '16px', height: '16px', accentColor: theme.accent }}
                      />
                      <span style={{ flex: 1, fontSize: '14px', color: theme.text }}>{t.form_name}</span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '10px',
                        fontWeight: '600',
                        backgroundColor: catColor.bg,
                        color: catColor.text
                      }}>
                        {t.category}
                      </span>
                    </label>
                  )
                })
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: `1px solid ${theme.border}`,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px'
            }}>
              <button
                onClick={() => setEditingPackage(null)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  color: theme.textMuted,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={savePackage}
                style={{
                  padding: '8px 16px',
                  backgroundColor: theme.accent,
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
