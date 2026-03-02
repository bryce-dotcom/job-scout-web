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
  AlertCircle,
  Map,
  Loader,
  HelpCircle
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

// Human-readable labels for known PDF form fields (IRS W-9, etc.)
// Keys match against the end of the raw field name for flexible matching
const W9_FIELD_LABELS = {
  'f1_01[0]': 'Name (as shown on tax return)',
  'f1_02[0]': 'Business Name / Disregarded Entity',
  'c1_1[0]': 'Individual / Sole Proprietor',
  'c1_1[1]': 'C Corporation',
  'c1_1[2]': 'S Corporation',
  'c1_1[3]': 'Partnership',
  'c1_1[4]': 'Trust / Estate',
  'c1_1[5]': 'LLC (check box)',
  'f1_03[0]': 'LLC Tax Classification',
  'c1_1[6]': 'Other (check box)',
  'f1_04[0]': 'Other Classification Description',
  'c1_2[0]': 'Exempt from FATCA',
  'f1_05[0]': 'Exempt Payee Code',
  'f1_06[0]': 'FATCA Exemption Code',
  'f1_07[0]': 'Address (street, apt/suite)',
  'f1_08[0]': 'City, State, ZIP',
  'f1_09[0]': 'Account Number(s)',
  'f1_10[0]': "Requester's Name & Address",
  'f1_11[0]': 'SSN — First 3 Digits',
  'f1_12[0]': 'SSN — Middle 2 Digits',
  'f1_13[0]': 'SSN — Last 4 Digits',
  'f1_14[0]': 'EIN — First 2 Digits',
  'f1_15[0]': 'EIN — Last 7 Digits',
}

// Auto-mapping for W-9 fields → data paths
const W9_AUTO_MAP = {
  'f1_01[0]': 'w9.name',
  'f1_02[0]': 'w9.business_name',
  'f1_03[0]': 'w9.llc_class',
  'f1_04[0]': 'w9.other_class',
  'f1_05[0]': 'w9.exempt_payee',
  'f1_06[0]': 'w9.exempt_fatca',
  'f1_07[0]': 'w9.address',
  'f1_08[0]': 'w9.city_state_zip',
  'f1_09[0]': 'w9.account_numbers',
  'f1_10[0]': 'w9.requester_name',
  'f1_11[0]': 'w9.ssn_1',
  'f1_12[0]': 'w9.ssn_2',
  'f1_13[0]': 'w9.ssn_3',
  'f1_14[0]': 'w9.ein_1',
  'f1_15[0]': 'w9.ein_2',
  'c1_1[0]': 'w9.tax_class',  // Individual checkbox
}

// Get a human-readable label for a raw PDF field name
function getFieldLabel(rawName) {
  // Check W-9 known labels by matching the end of the name
  for (const [suffix, label] of Object.entries(W9_FIELD_LABELS)) {
    if (rawName.endsWith(suffix)) return label
  }
  // General prettifier: strip common prefixes, brackets, and clean up
  let clean = rawName
    .replace(/^topmostSubform\[\d+\]\./, '')
    .replace(/Page\d+\[\d+\]\./, '')
    .replace(/\[\d+\]$/g, '')
    .replace(/_ReadOrder/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')   // camelCase → spaced
    .replace(/[_.-]+/g, ' ')                 // underscores/dots → spaces
    .trim()
  return clean || rawName
}

// Detect if a set of fields looks like a W-9 form
function isLikelyW9(fields) {
  const names = fields.map(f => f.name).join(' ')
  return names.includes('f1_01') && names.includes('f1_07') && names.includes('f1_11')
}

// Data path options for field mapping — maps PDF form fields to record data
const DATA_PATHS = [
  { value: '', label: '-- None --' },
  // Customer / Participant
  { value: 'customer.name', label: 'Customer / Business Name' },
  { value: 'customer.email', label: 'Customer Email' },
  { value: 'customer.phone', label: 'Customer Phone' },
  { value: 'customer.address', label: 'Customer Street Address' },
  { value: 'customer.city', label: 'Customer City' },
  { value: 'customer.state', label: 'Customer State' },
  { value: 'customer.zip', label: 'Customer Zip' },
  { value: 'customer.contact_name', label: 'Contact Name' },
  { value: 'customer.business_type', label: 'Business / Building Type' },
  { value: 'customer.participant_is', label: 'Participant Is (Owner/Tenant)' },
  { value: 'customer.rate_schedule', label: 'Rate Schedule' },
  { value: 'customer.account_number', label: 'Account Number' },
  // Audit / Project
  { value: 'audit.address', label: 'Project Address' },
  { value: 'audit.city', label: 'Project City' },
  { value: 'audit.state', label: 'Project State' },
  { value: 'audit.zip', label: 'Project Zip' },
  { value: 'audit.operating_hours', label: 'Operating Hours/Day' },
  { value: 'audit.days_per_year', label: 'Operating Days/Year' },
  { value: 'audit.energy_rate', label: 'Energy Rate ($/kWh)' },
  { value: 'audit.estimated_rebate', label: 'Estimated Rebate' },
  { value: 'audit.project_cost', label: 'Total Project Cost' },
  { value: 'audit.total_fixtures', label: 'Total Fixtures' },
  { value: 'audit.total_existing_watts', label: 'Total Existing Watts' },
  { value: 'audit.total_proposed_watts', label: 'Total Proposed Watts' },
  { value: 'audit.annual_savings_kwh', label: 'Annual kWh Savings' },
  { value: 'audit.annual_savings_dollars', label: 'Annual $ Savings' },
  { value: 'audit.material_cost', label: 'Material Cost' },
  { value: 'audit.labor_cost', label: 'Labor Cost' },
  { value: 'audit.other_cost', label: 'Other Cost' },
  // Provider
  { value: 'provider.provider_name', label: 'Utility Name' },
  { value: 'provider.contact_phone', label: 'Utility Phone' },
  // Salesperson / Rep
  { value: 'salesperson.name', label: 'Salesperson Name' },
  { value: 'salesperson.phone', label: 'Salesperson Phone' },
  { value: 'salesperson.email', label: 'Salesperson Email' },
  // Vendor / Contractor
  { value: 'vendor.name', label: 'Vendor / Contractor Name' },
  { value: 'vendor.address', label: 'Vendor Address' },
  { value: 'vendor.contact', label: 'Vendor Contact Name' },
  { value: 'vendor.phone', label: 'Vendor Phone' },
  // Payee
  { value: 'payee.name', label: 'Payee Name' },
  { value: 'payee.address', label: 'Payee Address' },
  { value: 'payee.city', label: 'Payee City' },
  { value: 'payee.state', label: 'Payee State' },
  { value: 'payee.zip', label: 'Payee Zip' },
  // W-9 Fields
  { value: 'w9.name', label: 'W-9 Name (Line 1)' },
  { value: 'w9.business_name', label: 'W-9 Business Name (Line 2)' },
  { value: 'w9.tax_class', label: 'W-9 Tax Classification' },
  { value: 'w9.llc_class', label: 'W-9 LLC Classification' },
  { value: 'w9.other_class', label: 'W-9 Other Classification' },
  { value: 'w9.exempt_payee', label: 'W-9 Exempt Payee Code' },
  { value: 'w9.exempt_fatca', label: 'W-9 FATCA Exemption Code' },
  { value: 'w9.address', label: 'W-9 Address' },
  { value: 'w9.city_state_zip', label: 'W-9 City, State, ZIP' },
  { value: 'w9.account_numbers', label: 'W-9 Account Numbers' },
  { value: 'w9.requester_name', label: 'W-9 Requester Name' },
  { value: 'w9.ssn', label: 'W-9 SSN' },
  { value: 'w9.ssn_1', label: 'W-9 SSN Part 1 (3 digits)' },
  { value: 'w9.ssn_2', label: 'W-9 SSN Part 2 (2 digits)' },
  { value: 'w9.ssn_3', label: 'W-9 SSN Part 3 (4 digits)' },
  { value: 'w9.ein', label: 'W-9 EIN' },
  { value: 'w9.ein_1', label: 'W-9 EIN Part 1 (2 digits)' },
  { value: 'w9.ein_2', label: 'W-9 EIN Part 2 (7 digits)' },
  { value: 'w9.signature_date', label: 'W-9 Signature Date' },
  // Quote
  { value: 'quote.quote_amount', label: 'Quote Amount' },
  { value: 'quote.utility_incentive', label: 'Incentive Amount' },
  { value: 'quote.discount', label: 'Discount' },
  // Aggregations
  { value: 'audit_areas.fixture_count.sum', label: 'Sum: Fixture Count' },
  { value: 'audit_areas.area_watts_reduced.sum', label: 'Sum: Watts Reduced' },
  { value: 'lines.quantity.sum', label: 'Sum: Line Quantities' },
  { value: 'lines.line_total.sum', label: 'Sum: Line Totals' },
  { value: 'lines.exist_watts.sum', label: 'Sum: Existing Watts' },
  { value: 'lines.new_watts.sum', label: 'Sum: New Watts' },
  { value: 'lines.watts_reduced.sum', label: 'Sum: Watts Reduced' },
  { value: 'lines.incentive.sum', label: 'Sum: Incentives' },
  // Line Items (indexed rows 1-20)
  ...Array.from({ length: 20 }, (_, i) => [
    { value: `lines.${i}.item_name`, label: `Row ${i + 1}: Name/Location` },
    { value: `lines.${i}.quantity`, label: `Row ${i + 1}: Qty` },
    { value: `lines.${i}.exist_watts`, label: `Row ${i + 1}: Existing Watts` },
    { value: `lines.${i}.new_watts`, label: `Row ${i + 1}: New Watts` },
    { value: `lines.${i}.watts_reduced`, label: `Row ${i + 1}: Watts Reduced` },
    { value: `lines.${i}.incentive`, label: `Row ${i + 1}: Incentive` },
  ]).flat(),
  // Computed
  { value: 'today', label: "Today's Date" },
]

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
  const [saving, setSaving] = useState(false)

  // Doc package edit modal
  const [editingPackage, setEditingPackage] = useState(null)
  const [packageSelections, setPackageSelections] = useState({})

  // Field mapping modal state
  const [mappingTemplate, setMappingTemplate] = useState(null)
  const [mappingFields, setMappingFields] = useState([])
  const [fieldMapping, setFieldMapping] = useState({})
  const [mappingLoading, setMappingLoading] = useState(false)

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

  // --- Field Mapping handlers ---
  const handleMapFields = async (template) => {
    if (template._source === 'utility_forms') {
      toast.info('Utility form mappings are managed in the Data Console')
      return
    }

    setMappingTemplate(template)
    setMappingFields([])
    setFieldMapping(template.field_mapping || {})
    setMappingLoading(true)

    try {
      // Fetch the PDF from storage using a signed URL (bucket is not public)
      const { data: signedData, error: signedError } = await supabase.storage
        .from('project-documents')
        .createSignedUrl(template.file_path, 300)

      if (signedError || !signedData?.signedUrl) {
        toast.error('Could not get PDF URL: ' + (signedError?.message || 'unknown error'))
        setMappingLoading(false)
        return
      }

      const res = await fetch(signedData.signedUrl)
      if (!res.ok) {
        toast.error('Could not fetch PDF file')
        setMappingLoading(false)
        return
      }

      const pdfBytes = new Uint8Array(await res.arrayBuffer())
      const fields = await extractFormFields(pdfBytes)
      setMappingFields(fields)

      // Merge existing mappings with any new fields
      const existing = template.field_mapping || {}
      const hasExisting = Object.values(existing).some(v => v)
      const merged = {}
      for (const f of fields) {
        merged[f.name] = existing[f.name] || ''
      }

      // Auto-suggest W-9 mappings if no existing mappings and looks like a W-9
      if (!hasExisting && isLikelyW9(fields)) {
        for (const f of fields) {
          if (!merged[f.name]) {
            for (const [suffix, path] of Object.entries(W9_AUTO_MAP)) {
              if (f.name.endsWith(suffix)) {
                merged[f.name] = path
                break
              }
            }
          }
        }
        toast.info('W-9 detected — fields have been auto-mapped. Review and save.')
      }

      setFieldMapping(merged)
    } catch (err) {
      toast.error('Error reading PDF fields: ' + err.message)
    }
    setMappingLoading(false)
  }

  const handleSaveMapping = async () => {
    if (!mappingTemplate) return
    setSaving(true)
    try {
      // Filter out empty mappings
      const cleaned = {}
      for (const [field, path] of Object.entries(fieldMapping)) {
        if (path) cleaned[field] = path
      }

      const mappedCount = Object.keys(cleaned).length
      const totalFields = mappingFields.length
      const newStatus = totalFields === 0 ? 'Ready' : (mappedCount >= totalFields ? 'Ready' : 'Pending')

      const { error } = await supabase
        .from('document_templates')
        .update({
          field_mapping: Object.keys(cleaned).length > 0 ? cleaned : {},
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', mappingTemplate.id)

      if (error) {
        toast.error('Save failed: ' + error.message)
      } else {
        toast.success(`Saved ${mappedCount} field mapping${mappedCount !== 1 ? 's' : ''}`)
        setMappingTemplate(null)
        await loadData()
      }
    } catch (err) {
      toast.error('Save error: ' + err.message)
    }
    setSaving(false)
  }

  // --- Doc Package handlers ---
  // Build a composite key for matching package items to templates
  const getTemplateKey = (t) => t._source === 'utility_forms' ? `uf_${t._sourceId}` : `dt_${t.id}`
  const getPackageKey = (p) => p.source_table === 'utility_forms' ? `uf_${p.template_id}` : `dt_${p.template_id}`

  const openEditPackage = (serviceType) => {
    const currentKeys = packageItems
      .filter(p => p.service_type === serviceType)
      .map(p => getPackageKey(p))
    const selections = {}
    templates.forEach(t => {
      const key = getTemplateKey(t)
      selections[key] = currentKeys.includes(key)
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
        .map(([key], idx) => {
          const isUtility = key.startsWith('uf_')
          const rawId = Number(key.split('_')[1])
          return {
            company_id: companyId,
            service_type: editingPackage,
            template_id: rawId,
            source_table: isUtility ? 'utility_forms' : 'document_templates',
            sort_order: idx
          }
        })

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
    const keys = packageItems.filter(p => p.service_type === serviceType).map(p => getPackageKey(p))
    return templates.filter(t => keys.includes(getTemplateKey(t)))
  }

  const tabs = [
    { id: 'library', label: 'Form Library' },
    { id: 'packages', label: 'Doc Packages' }
  ]

  const mappedFieldCount = Object.values(fieldMapping).filter(Boolean).length

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
          {/* How It Works Banner */}
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            padding: '16px 20px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <HelpCircle size={16} style={{ color: theme.accent }} />
              <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>How It Works</span>
            </div>
            <div style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: '1.6' }}>
              <strong>1. Upload</strong> a fillable PDF form (contracts, applications, tax forms, etc.)
              &nbsp;&rarr;&nbsp;<strong>2. Map Fields</strong> to connect each PDF field to your lead/job data (customer name, address, etc.)
              &nbsp;&rarr;&nbsp;<strong>3. Use</strong> the form from any lead or job to auto-fill it with that record's data.
              <br />
              Forms with all fields mapped show as <span style={{ color: '#16a34a', fontWeight: '600' }}>Ready</span>.
              Click the <Map size={12} style={{ verticalAlign: 'middle', margin: '0 2px' }} /> button on any custom form to open the field mapper.
            </div>
          </div>

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
              gridTemplateColumns: '1fr 120px 80px 100px 80px',
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
              <span>Actions</span>
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
                const isCustom = !template._source
                return (
                  <div
                    key={template.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 120px 80px 100px 80px',
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
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {isCustom && template.field_count > 0 && (
                        <button
                          onClick={() => handleMapFields(template)}
                          title="Map form fields to data"
                          style={{
                            padding: '6px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: Object.keys(template.field_mapping || {}).some(k => template.field_mapping[k]) ? '#16a34a' : theme.accent,
                            cursor: 'pointer',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Map size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteTemplate(template)}
                        title={template._source === 'utility_forms' ? 'Managed in Data Console' : 'Delete template'}
                        style={{
                          padding: '6px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: theme.textMuted,
                          cursor: 'pointer',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: template._source === 'utility_forms' ? 0.3 : 1
                        }}
                        onMouseEnter={e => { if (!template._source) e.currentTarget.style.color = '#ef4444' }}
                        onMouseLeave={e => e.currentTarget.style.color = theme.textMuted}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
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
            Configure which documents are required for each service type. When a job is created with a service type, its doc package will be suggested automatically.
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
                        checked={!!packageSelections[getTemplateKey(t)]}
                        onChange={(e) => setPackageSelections(prev => ({ ...prev, [getTemplateKey(t)]: e.target.checked }))}
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

      {/* Field Mapping Modal */}
      {mappingTemplate && (
        <>
          <div
            onClick={() => setMappingTemplate(null)}
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
            maxWidth: '700px',
            maxHeight: '85vh',
            overflow: 'hidden',
            zIndex: 101,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
          }} className="modal-content">
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
                    Map Fields &mdash; {mappingTemplate.form_name}
                  </h3>
                  <p style={{ fontSize: '12px', color: theme.textMuted, margin: '2px 0 0' }}>
                    {mappingFields.length} field{mappingFields.length !== 1 ? 's' : ''} found &middot; {mappedFieldCount} mapped
                  </p>
                </div>
                <button
                  onClick={() => setMappingTemplate(null)}
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

              {/* Instructions */}
              <div style={{
                marginTop: '12px',
                padding: '10px 12px',
                backgroundColor: '#fffbeb',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#92400e',
                lineHeight: '1.5'
              }}>
                <strong>How to map:</strong> Each row is a fillable field found in your PDF. Use the dropdown to connect it to a data source.
                When someone generates this form from a lead or job, the mapped fields will be auto-filled with that record's data
                (e.g. customer name, address, project details). Leave a field as "-- None --" to skip it.
              </div>
            </div>

            {/* Field Mapping Table */}
            <div style={{ overflowY: 'auto', maxHeight: 'calc(85vh - 220px)' }}>
              {mappingLoading ? (
                <div style={{ padding: '48px', textAlign: 'center', color: theme.textMuted }}>
                  <Loader size={20} style={{ marginBottom: '8px', animation: 'spin 1s linear infinite' }} />
                  <div>Extracting form fields...</div>
                </div>
              ) : mappingFields.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
                  No fillable fields found in this PDF.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: theme.bg, position: 'sticky', top: 0, zIndex: 1 }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', color: theme.textMuted, fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${theme.border}` }}>
                        PDF Field
                      </th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', color: theme.textMuted, fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${theme.border}`, width: '45%' }}>
                        Maps To
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappingFields.map((field, i) => (
                      <tr key={field.name} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : theme.bg }}>
                        <td style={{ padding: '8px 16px', borderBottom: `1px solid ${theme.border}`, verticalAlign: 'top' }}>
                          <div style={{ fontWeight: '500', color: theme.text }}>{getFieldLabel(field.name)}</div>
                          <div style={{ color: theme.textMuted, fontSize: '10px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{field.name}</div>
                          <div style={{ color: theme.textMuted, fontSize: '11px' }}>
                            {field.type}{field.value ? ` \u2022 "${field.value}"` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '8px 16px', borderBottom: `1px solid ${theme.border}` }}>
                          <select
                            value={fieldMapping[field.name] || ''}
                            onChange={(e) => setFieldMapping(prev => ({ ...prev, [field.name]: e.target.value }))}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              backgroundColor: theme.bg,
                              border: `1px solid ${fieldMapping[field.name] ? '#16a34a' : theme.border}`,
                              borderRadius: '6px',
                              color: theme.text,
                              fontSize: '12px'
                            }}
                          >
                            {DATA_PATHS.map(dp => (
                              <option key={dp.value} value={dp.value}>
                                {dp.label}{dp.value ? ` (${dp.value})` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: `1px solid ${theme.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '12px', color: theme.textMuted }}>
                {mappedFieldCount} of {mappingFields.length} fields mapped
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setMappingTemplate(null)}
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
                  onClick={handleSaveMapping}
                  disabled={saving}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: theme.accent,
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1
                  }}
                >
                  {saving ? 'Saving...' : 'Save Mapping'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Spinner animation for loader */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
