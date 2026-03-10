import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import {
  Settings as SettingsIcon,
  Building2,
  Layers,
  Target,
  Wrench,
  CheckSquare,
  Users,
  Link2,
  Plus,
  X,
  Save,
  ExternalLink,
  Code,
  Database,
  Trash2,
  AlertTriangle,
  FileStack,
  Upload,
  Edit3,
  Image,
  Shield,
  FileCheck,
  Download,
  ChevronDown,
  ChevronRight,
  Wallet,
  CreditCard,
  Landmark,
  CheckCircle,
  Circle,
  HelpCircle,
  Calendar,
  MessageSquare,
  BookOpen,
  RefreshCw,
  Unlink,
  Phone,
  Send,
  Zap
} from 'lucide-react'
import { seedSampleData, clearAllData } from '../lib/seedData'
import { toast } from '../lib/toast'

// Auto-format phone number as (XXX) XXX-XXXX while typing
function formatPhoneInput(value) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length === 0) return ''
  if (digits.length <= 3) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  bgCardHover: '#eef2eb',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
}

const baseTabs = [
  { id: 'company', label: 'Company Profile', icon: Building2 },
  { id: 'business_units', label: 'Business Units', icon: Layers },
  { id: 'lead_sources', label: 'Lead Sources', icon: Target },
  { id: 'service_types', label: 'Service Types', icon: Wrench },
  { id: 'statuses', label: 'Job Statuses', icon: CheckSquare },
  { id: 'estimate_defaults', label: 'Estimate Defaults', icon: FileStack },
  { id: 'my_money', label: 'My Money', icon: Wallet },
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'integrations', label: 'Integrations', icon: Link2 }
]

const jobStatuses = ['Scheduled', 'In Progress', 'Completed', 'Cancelled', 'On Hold']

// ListEditor component - defined outside Settings to prevent re-creation on every render
function ListEditor({ type, items, title, onAdd, onRemove, theme }) {
  const [inputValue, setInputValue] = useState('')

  const handleAdd = () => {
    if (!inputValue.trim()) return
    onAdd(type, inputValue.trim())
    setInputValue('')
  }

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>{title}</h3>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Add new item..."
          onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.bg,
            color: theme.text,
            fontSize: '14px'
          }}
        />
        <button
          onClick={handleAdd}
          style={{
            padding: '10px 16px',
            backgroundColor: theme.accent,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Plus size={16} /> Add
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {items.map((item, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: theme.accentBg,
              borderRadius: '8px'
            }}
          >
            <span style={{ fontSize: '14px', color: theme.text }}>{item}</span>
            <button
              onClick={() => onRemove(type, index)}
              style={{
                padding: '2px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: theme.textMuted,
                display: 'flex'
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ padding: '20px', color: theme.textMuted, fontSize: '14px' }}>
            No items added yet
          </div>
        )}
      </div>
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const company = useStore((state) => state.company)
  const setCompany = useStore((state) => state.setCompany)
  const user = useStore((state) => state.user)
  const employees = useStore((state) => state.employees)
  const settings = useStore((state) => state.settings)
  const fetchSettings = useStore((state) => state.fetchSettings)
  const fetchAllData = useStore((state) => state.fetchAllData)
  const getSettingList = useStore((state) => state.getSettingList)

  const isAdmin = user?.user_role === 'Admin' || user?.user_role === 'Owner' || user?.user_role === 'Super Admin'
  const tabs = isAdmin
    ? [...baseTabs, { id: 'developer_tools', label: 'Developer Tools', icon: Code }]
    : baseTabs

  // Check URL for tab param (used by QuickBooks OAuth callback)
  const urlTab = new URLSearchParams(window.location.search).get('tab')
  const [activeTab, setActiveTab] = useState(urlTab && baseTabs.some(t => t.id === urlTab) ? urlTab : 'company')
  const [seeding, setSeeding] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState(null)
  const [companyForm, setCompanyForm] = useState({
    company_name: '',
    owner_email: '',
    phone: '',
    address: '',
    logo_url: '',
    // Business info
    ein: '',
    tax_exempt_number: '',
    license_number: '',
    insurance_policy_number: '',
    insurance_provider: '',
    insurance_expiration: '',
    workers_comp_policy: '',
    workers_comp_expiration: '',
    bonded: false,
    bond_amount: '',
    entity_type: '',
    state_of_incorporation: '',
    fiscal_year_end: '',
    duns_number: '',
    naics_code: '',
    // Document URLs
    insurance_cert_url: '',
    tax_exempt_cert_url: '',
    operating_agreement_url: '',
    w9_url: '',
    business_license_url: '',
    workers_comp_cert_url: '',
    bond_cert_url: '',
    google_place_id: ''
  })
  const [businessUnits, setBusinessUnits] = useState([])
  const [leadSources, setLeadSources] = useState([])
  const [serviceTypes, setServiceTypes] = useState([])
  const [saving, setSaving] = useState(false)

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchSettings()
  }, [companyId, navigate, fetchSettings])

  useEffect(() => {
    if (company) {
      setCompanyForm({
        company_name: company.company_name || '',
        owner_email: company.owner_email || '',
        phone: company.phone || '',
        address: company.address || '',
        logo_url: company.logo_url || '',
        ein: company.ein || '',
        tax_exempt_number: company.tax_exempt_number || '',
        license_number: company.license_number || '',
        insurance_policy_number: company.insurance_policy_number || '',
        insurance_provider: company.insurance_provider || '',
        insurance_expiration: company.insurance_expiration || '',
        workers_comp_policy: company.workers_comp_policy || '',
        workers_comp_expiration: company.workers_comp_expiration || '',
        bonded: company.bonded || false,
        bond_amount: company.bond_amount || '',
        entity_type: company.entity_type || '',
        state_of_incorporation: company.state_of_incorporation || '',
        fiscal_year_end: company.fiscal_year_end || '',
        duns_number: company.duns_number || '',
        naics_code: company.naics_code || '',
        insurance_cert_url: company.insurance_cert_url || '',
        tax_exempt_cert_url: company.tax_exempt_cert_url || '',
        operating_agreement_url: company.operating_agreement_url || '',
        w9_url: company.w9_url || '',
        business_license_url: company.business_license_url || '',
        workers_comp_cert_url: company.workers_comp_cert_url || '',
        bond_cert_url: company.bond_cert_url || '',
        google_place_id: company.google_place_id || ''
      })
    }
  }, [company])

  useEffect(() => {
    setBusinessUnits(getSettingList('business_units'))
    setLeadSources(getSettingList('lead_sources'))
    setServiceTypes(getSettingList('service_types'))
  }, [settings, getSettingList])

  const handleSaveCompany = async () => {
    setSaving(true)

    // Sanitize: convert empty strings to null for non-text columns
    const numericFields = ['bond_amount']
    const dateFields = ['insurance_expiration', 'workers_comp_expiration']
    const boolFields = ['bonded']

    const sanitized = { ...companyForm, updated_at: new Date().toISOString() }
    for (const key of Object.keys(sanitized)) {
      const val = sanitized[key]
      if (numericFields.includes(key)) {
        sanitized[key] = val === '' || val === null || val === undefined ? null : parseFloat(val)
      } else if (dateFields.includes(key)) {
        sanitized[key] = val || null
      } else if (boolFields.includes(key)) {
        // keep as-is
      } else if (typeof val === 'string' && val === '') {
        sanitized[key] = null
      }
    }

    const { data, error } = await supabase
      .from('companies')
      .update(sanitized)
      .eq('id', companyId)
      .select()

    if (error) {
      console.error('Save error:', error)
      toast.error('Error saving: ' + error.message)
    } else if (!data || data.length === 0) {
      toast.error('Save failed — no rows updated. Check permissions.')
    } else {
      setCompany({ ...company, ...data[0] })
      toast.success('Company profile saved!')
    }
    setSaving(false)
  }

  const saveSetting = async (key, value) => {
    const existing = settings.find(s => s.key === key)
    const valueStr = JSON.stringify(value)

    if (existing) {
      await supabase
        .from('settings')
        .update({ value: valueStr })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('settings')
        .insert({ company_id: companyId, key, value: valueStr })
    }
    fetchSettings()
  }

  const addItem = (type, value) => {
    if (!value) return

    let items, setter, key
    if (type === 'business_units') {
      items = businessUnits
      setter = setBusinessUnits
      key = 'business_units'
    } else if (type === 'lead_sources') {
      items = leadSources
      setter = setLeadSources
      key = 'lead_sources'
    } else if (type === 'service_types') {
      items = serviceTypes
      setter = setServiceTypes
      key = 'service_types'
    }

    const updated = [...items, value]
    setter(updated)
    saveSetting(key, updated)
  }

  const removeItem = (type, index) => {
    let items, setter, key
    if (type === 'business_units') {
      items = businessUnits
      setter = setBusinessUnits
      key = 'business_units'
    } else if (type === 'lead_sources') {
      items = leadSources
      setter = setLeadSources
      key = 'lead_sources'
    } else if (type === 'service_types') {
      items = serviceTypes
      setter = setServiceTypes
      key = 'service_types'
    }

    const updated = items.filter((_, i) => i !== index)
    setter(updated)
    saveSetting(key, updated)
  }

  // Client-side audit data backfill (no edge function needed)
  const runAuditBackfill = async (cid, dryRun) => {
    const results = { dry_run: dryRun, leads_synced: 0, estimates_created: 0, estimates_fixed: 0, lines_created: 0, details: [] }

    // Fix 1: Leads with quote_id but missing/zero quote_amount
    const { data: leadsWithQuote } = await supabase
      .from('leads')
      .select('id, customer_name, quote_id, quote_amount')
      .eq('company_id', cid)
      .not('quote_id', 'is', null)

    for (const lead of (leadsWithQuote || [])) {
      if (lead.quote_amount && parseFloat(lead.quote_amount) > 0) continue
      const { data: quote } = await supabase
        .from('quotes').select('id, quote_amount').eq('id', lead.quote_id).single()

      if (quote?.quote_amount && parseFloat(quote.quote_amount) > 0) {
        if (!dryRun) {
          await supabase.from('leads').update({ quote_amount: quote.quote_amount }).eq('id', lead.id)
        }
        results.leads_synced++
        results.details.push(`Lead "${lead.customer_name}": set quote_amount = $${quote.quote_amount}`)
      }
    }

    // Fix 2: Audits linked to leads — create missing estimates OR fix bad line items
    const { data: auditsWithLeads } = await supabase
      .from('lighting_audits')
      .select('*')
      .eq('company_id', cid)
      .not('lead_id', 'is', null)

    for (const audit of (auditsWithLeads || [])) {
      const { data: areas } = await supabase
        .from('audit_areas').select('*').eq('audit_id', audit.id)
      if (!areas || areas.length === 0) continue

      const quoteAmount = audit.est_project_cost || 0
      const { data: leadData } = await supabase
        .from('leads').select('customer_name').eq('id', audit.lead_id).single()
      const leadName = leadData?.customer_name || audit.lead_id

      // Calculate correct cost-per-watt from actual project cost
      const totalWattsReduced = areas.reduce((sum, a) =>
        sum + ((a.fixture_count || 1) * ((a.existing_wattage || 0) - (a.led_wattage || 0))), 0)
      const costPerWatt = totalWattsReduced > 0 ? quoteAmount / totalWattsReduced : 5

      const { data: existingQuotes } = await supabase
        .from('quotes').select('id, quote_amount').eq('audit_id', audit.id).limit(1)

      if (existingQuotes && existingQuotes.length > 0) {
        // Estimate exists — check if line items sum matches quote_amount
        const existingQuote = existingQuotes[0]
        const { data: existingLines } = await supabase
          .from('quote_lines').select('line_total').eq('quote_id', existingQuote.id)
        const linesSum = (existingLines || []).reduce((sum, l) => sum + (parseFloat(l.line_total) || 0), 0)

        // If line items sum is off by more than $1, fix them
        if (Math.abs(linesSum - quoteAmount) > 1) {
          if (!dryRun) {
            // Delete old lines and recreate with correct pricing
            await supabase.from('quote_lines').delete().eq('quote_id', existingQuote.id)
            for (const area of areas) {
              const qty = area.fixture_count || 1
              const unitPrice = ((area.existing_wattage || 0) - (area.led_wattage || 0)) * costPerWatt
              await supabase.from('quote_lines').insert({
                company_id: cid, quote_id: existingQuote.id,
                item_name: `${area.area_name} - LED Retrofit`,
                item_id: area.led_replacement_id || null,
                quantity: qty,
                price: Math.round(unitPrice * 100) / 100,
                line_total: Math.round(qty * unitPrice * 100) / 100
              })
              results.lines_created++
            }
            // Ensure quote_amount is correct
            await supabase.from('quotes').update({ quote_amount: quoteAmount }).eq('id', existingQuote.id)
            await supabase.from('leads').update({ quote_amount: quoteAmount }).eq('id', audit.lead_id)
          }
          results.estimates_fixed++
          results.details.push(`"${leadName}" → fixed line items ($${linesSum.toFixed(0)} → $${quoteAmount})`)
        }
        continue
      }

      // No estimate exists — create one
      if (!dryRun) {
        const { data: newQuote, error: qErr } = await supabase
          .from('quotes')
          .insert({
            company_id: cid, lead_id: audit.lead_id, audit_id: audit.id,
            audit_type: 'lighting', quote_amount: quoteAmount,
            utility_incentive: audit.estimated_rebate || 0, status: 'Draft'
          })
          .select().single()

        if (qErr) {
          results.details.push(`Audit ${audit.audit_id}: ERROR - ${qErr.message}`)
          continue
        }

        for (const area of areas) {
          const qty = area.fixture_count || 1
          const unitPrice = ((area.existing_wattage || 0) - (area.led_wattage || 0)) * costPerWatt
          await supabase.from('quote_lines').insert({
            company_id: cid, quote_id: newQuote.id,
            item_name: `${area.area_name} - LED Retrofit`,
            item_id: area.led_replacement_id || null,
            quantity: qty,
            price: Math.round(unitPrice * 100) / 100,
            line_total: Math.round(qty * unitPrice * 100) / 100
          })
          results.lines_created++
        }

        await supabase.from('leads').update({
          quote_id: newQuote.id, quote_amount: quoteAmount
        }).eq('id', audit.lead_id)
      }

      results.estimates_created++
      results.details.push(`"${leadName}" → estimate created ($${quoteAmount}, ${areas.length} line items)`)
    }

    return results
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'company':
        return <CompanyProfileTab
          companyForm={companyForm}
          setCompanyForm={setCompanyForm}
          companyId={companyId}
          isAdmin={isAdmin}
          saving={saving}
          handleSaveCompany={handleSaveCompany}
          theme={theme}
        />

      case 'business_units':
        return <BusinessUnitsEditor items={businessUnits} setItems={setBusinessUnits} saveSetting={saveSetting} companyId={companyId} theme={theme} />

      case 'lead_sources':
        return <ListEditor type="lead_sources" items={leadSources} title="Lead Sources" onAdd={addItem} onRemove={removeItem} theme={theme} />

      case 'service_types':
        return <ListEditor type="service_types" items={serviceTypes} title="Service Types" onAdd={addItem} onRemove={removeItem} theme={theme} />

      case 'statuses':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>Job Statuses</h3>
            <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '16px' }}>
              These are the standard job statuses used throughout the system.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {jobStatuses.map((status) => (
                <div
                  key={status}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: theme.accentBg,
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: theme.text,
                    fontWeight: '500'
                  }}
                >
                  {status}
                </div>
              ))}
            </div>
          </div>
        )

      case 'users':
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>User Management</h3>
              <button
                onClick={() => navigate('/employees')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  backgroundColor: theme.accentBg,
                  color: theme.accent,
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                <ExternalLink size={14} /> Manage Employees
              </button>
            </div>

            <div style={{
              backgroundColor: theme.bg,
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: theme.accentBg }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted }}>Name</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted }}>Email</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted }}>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => (
                    <tr key={emp.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: theme.text }}>{emp.name}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: theme.textSecondary }}>{emp.email}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          backgroundColor: emp.user_role === 'Owner' ? 'rgba(74,124,89,0.15)' : theme.accentBg,
                          color: emp.user_role === 'Owner' ? '#4a7c59' : theme.accent
                        }}>
                          {emp.user_role || 'User'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )

      case 'estimate_defaults':
        return <EstimateDefaultsTab theme={theme} settings={settings} saveSetting={saveSetting} />

      case 'my_money':
        return <PaymentSettingsTab theme={theme} settings={settings} saveSetting={saveSetting} />

      case 'integrations':
        return <IntegrationsTab theme={theme} settings={settings} saveSetting={saveSetting} companyId={companyId} user={user} employees={employees} setActiveTab={setActiveTab} />

      case 'developer_tools':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Developer Tools</h3>
            <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '24px' }}>
              Tools for testing and development. Use with caution in production.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '500px' }}>
              {/* Seed Sample Data */}
              <div style={{
                padding: '20px',
                backgroundColor: theme.bg,
                borderRadius: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <Database size={24} style={{ color: theme.accent, flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>
                      Seed Sample Data
                    </div>
                    <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>
                      Populate the database with sample customers, jobs, invoices, products, leads, and more for testing.
                    </div>
                    <button
                      onClick={async () => {
                        setSeeding(true)
                        const result = await seedSampleData(companyId)
                        if (result.success) {
                          toast.success(result.message)
                          fetchAllData()
                        } else {
                          toast.error(result.message)
                        }
                        setSeeding(false)
                      }}
                      disabled={seeding}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        backgroundColor: theme.accent,
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: seeding ? 'not-allowed' : 'pointer',
                        opacity: seeding ? 0.7 : 1
                      }}
                    >
                      <Database size={16} />
                      {seeding ? 'Seeding...' : 'Seed Sample Data'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Fix Audit → Estimate Data */}
              <div style={{
                padding: '20px',
                backgroundColor: theme.bg,
                borderRadius: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <Zap size={24} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>
                      Fix Audit Data
                    </div>
                    <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>
                      Finds audits that were linked to leads but never got an estimate created. Creates missing estimates with line items and syncs quote amounts so pipeline values display correctly.
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={async () => {
                          setBackfilling(true)
                          setBackfillResult(null)
                          try {
                            const result = await runAuditBackfill(companyId, true)
                            setBackfillResult(result)
                          } catch (err) {
                            setBackfillResult({ error: err.message })
                          }
                          setBackfilling(false)
                        }}
                        disabled={backfilling}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '10px 20px', backgroundColor: theme.bgCard,
                          border: `1px solid ${theme.border}`, borderRadius: '8px',
                          color: theme.text, fontSize: '14px', fontWeight: '500',
                          cursor: backfilling ? 'not-allowed' : 'pointer',
                          opacity: backfilling ? 0.7 : 1
                        }}
                      >
                        {backfilling ? 'Checking...' : 'Preview (Dry Run)'}
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm('This will create missing estimates and update lead amounts. Continue?')) return
                          setBackfilling(true)
                          setBackfillResult(null)
                          try {
                            const result = await runAuditBackfill(companyId, false)
                            setBackfillResult(result)
                            if (result.estimates_created > 0 || result.leads_synced > 0 || result.estimates_fixed > 0) {
                              toast.success(`Created ${result.estimates_created}, fixed ${result.estimates_fixed} estimates, updated ${result.leads_synced} leads`)
                            } else {
                              toast.success('No data to fix — everything looks good!')
                            }
                          } catch (err) {
                            setBackfillResult({ error: err.message })
                            toast.error('Error: ' + err.message)
                          }
                          setBackfilling(false)
                        }}
                        disabled={backfilling}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '10px 20px', backgroundColor: '#f59e0b',
                          color: '#fff', border: 'none', borderRadius: '8px',
                          fontSize: '14px', fontWeight: '500',
                          cursor: backfilling ? 'not-allowed' : 'pointer',
                          opacity: backfilling ? 0.7 : 1
                        }}
                      >
                        <Zap size={16} />
                        {backfilling ? 'Fixing...' : 'Run Fix'}
                      </button>
                    </div>
                    {backfillResult && (
                      <div style={{
                        marginTop: '12px', padding: '12px',
                        backgroundColor: backfillResult.error ? 'rgba(194,90,90,0.1)' : 'rgba(34,197,94,0.1)',
                        borderRadius: '8px', fontSize: '13px', color: theme.text
                      }}>
                        {backfillResult.error ? (
                          <span style={{ color: '#c25a5a' }}>Error: {backfillResult.error}</span>
                        ) : (
                          <>
                            <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                              {backfillResult.dry_run ? 'Preview Results:' : 'Completed:'}
                            </div>
                            <div>Leads with missing quote_amount: {backfillResult.leads_synced}</div>
                            <div>Estimates created from audits: {backfillResult.estimates_created}</div>
                            <div>Estimates with wrong line items fixed: {backfillResult.estimates_fixed || 0}</div>
                            <div>Quote lines created: {backfillResult.lines_created}</div>
                            {backfillResult.details?.length > 0 && (
                              <div style={{ marginTop: '8px', fontSize: '12px', color: theme.textMuted }}>
                                {backfillResult.details.map((d, i) => <div key={i}>{d}</div>)}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Clear All Data */}
              <div style={{
                padding: '20px',
                backgroundColor: 'rgba(194,90,90,0.08)',
                borderRadius: '12px',
                border: '1px solid rgba(194,90,90,0.2)'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <Trash2 size={24} style={{ color: '#c25a5a', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: '#c25a5a', marginBottom: '4px' }}>
                      Clear All Data
                    </div>
                    <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>
                      Delete all records for this company except your user account. This action cannot be undone.
                    </div>
                    {!showClearConfirm ? (
                      <button
                        onClick={() => setShowClearConfirm(true)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 20px',
                          backgroundColor: '#c25a5a',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={16} />
                        Clear All Data
                      </button>
                    ) : (
                      <div style={{
                        padding: '16px',
                        backgroundColor: 'rgba(194,90,90,0.1)',
                        borderRadius: '8px',
                        marginTop: '8px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                          <AlertTriangle size={18} style={{ color: '#c25a5a' }} />
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#c25a5a' }}>
                            Are you sure? This will delete everything.
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={async () => {
                              setClearing(true)
                              const result = await clearAllData(companyId, user?.id)
                              if (result.success) {
                                toast.success(result.message)
                                fetchAllData()
                              } else {
                                toast.error(result.message)
                              }
                              setClearing(false)
                              setShowClearConfirm(false)
                            }}
                            disabled={clearing}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#c25a5a',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '13px',
                              fontWeight: '500',
                              cursor: clearing ? 'not-allowed' : 'pointer',
                              opacity: clearing ? 0.7 : 1
                            }}
                          >
                            {clearing ? 'Clearing...' : 'Yes, Clear Everything'}
                          </button>
                          <button
                            onClick={() => setShowClearConfirm(false)}
                            disabled={clearing}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: 'transparent',
                              color: theme.textMuted,
                              border: `1px solid ${theme.border}`,
                              borderRadius: '6px',
                              fontSize: '13px',
                              fontWeight: '500',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <SettingsIcon size={28} style={{ color: theme.accent }} />
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>Settings</h1>
      </div>

      {/* Tabs and Content */}
      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Tab Navigation */}
        <div style={{
          width: '220px',
          flexShrink: 0,
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '8px',
          height: 'fit-content'
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '12px 14px',
                backgroundColor: activeTab === tab.id ? theme.accentBg : 'transparent',
                border: 'none',
                borderRadius: '8px',
                color: activeTab === tab.id ? theme.accent : theme.textMuted,
                fontSize: '14px',
                fontWeight: activeTab === tab.id ? '500' : '400',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div style={{
          flex: 1,
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '24px'
        }}>
          {renderContent()}
        </div>
      </div>
    </div>
  )
}

// Company Profile Tab with admin-only Business Information section
function CompanyProfileTab({ companyForm, setCompanyForm, companyId, isAdmin, saving, handleSaveCompany, theme }) {
  const [expandedSections, setExpandedSections] = useState({ basic: true, entity: false, insurance: false, docs: false })
  const [uploadingDoc, setUploadingDoc] = useState(null)

  const toggleSection = (key) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.bg,
    color: theme.text,
    fontSize: '14px'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: '6px'
  }

  const sectionHeaderStyle = (expanded) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '14px 16px',
    backgroundColor: expanded ? theme.accentBg : theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: expanded ? '10px 10px 0 0' : '10px',
    cursor: 'pointer',
    color: theme.text,
    fontSize: '14px',
    fontWeight: '600',
    textAlign: 'left',
    transition: 'all 0.15s ease'
  })

  const sectionBodyStyle = {
    padding: '20px',
    border: `1px solid ${theme.border}`,
    borderTop: 'none',
    borderRadius: '0 0 10px 10px',
    backgroundColor: theme.bgCard
  }

  const handleDocUpload = async (field, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingDoc(field)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${companyId}/docs/${field}_${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(fileName, file, { upsert: true })
      if (uploadError) {
        toast.error('Upload failed: ' + uploadError.message)
      } else {
        setCompanyForm(prev => ({ ...prev, [field]: fileName }))
        toast.success('Document uploaded!')
      }
    } catch (err) {
      toast.error('Upload failed: ' + err.message)
    }
    setUploadingDoc(null)
  }

  const handleDocDownload = async (path) => {
    try {
      const { data } = await supabase.storage
        .from('project-documents')
        .download(path)
      if (data) {
        const url = URL.createObjectURL(data)
        const a = document.createElement('a')
        a.href = url
        a.download = path.split('/').pop()
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      toast.error('Download failed: ' + err.message)
    }
  }

  const DocUploadField = ({ label, field, icon: Icon }) => {
    const value = companyForm[field]
    const isUploading = uploadingDoc === field
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        backgroundColor: theme.bg,
        borderRadius: '8px',
        border: `1px solid ${theme.border}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <Icon size={18} style={{ color: value ? '#4a7c59' : theme.textMuted, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text }}>{label}</div>
            {value && (
              <div style={{ fontSize: '11px', color: '#4a7c59', marginTop: '2px' }}>Uploaded</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {value && (
            <button
              onClick={() => handleDocDownload(value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                backgroundColor: 'transparent',
                border: `1px solid ${theme.border}`,
                borderRadius: '6px',
                cursor: 'pointer',
                color: theme.accent,
                fontSize: '12px'
              }}
            >
              <Download size={12} /> View
            </button>
          )}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 10px',
            backgroundColor: theme.accent,
            color: '#fff',
            borderRadius: '6px',
            cursor: isUploading ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            opacity: isUploading ? 0.6 : 1
          }}>
            <Upload size={12} />
            {isUploading ? '...' : value ? 'Replace' : 'Upload'}
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => handleDocUpload(field, e)} disabled={isUploading} style={{ display: 'none' }} />
          </label>
          {value && (
            <button
              onClick={() => setCompanyForm(prev => ({ ...prev, [field]: '' }))}
              style={{
                padding: '6px',
                backgroundColor: 'transparent',
                border: `1px solid ${theme.border}`,
                borderRadius: '6px',
                cursor: 'pointer',
                color: '#c25a5a',
                display: 'flex'
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Basic Info — always visible */}
      <button onClick={() => toggleSection('basic')} style={sectionHeaderStyle(expandedSections.basic)}>
        {expandedSections.basic ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <Building2 size={18} />
        General Information
      </button>
      {expandedSections.basic && (
        <div style={{ ...sectionBodyStyle, marginTop: '-16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '600px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Company Name</label>
              <input type="text" value={companyForm.company_name} onChange={(e) => setCompanyForm(prev => ({ ...prev, company_name: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Owner Email</label>
              <input type="email" value={companyForm.owner_email} onChange={(e) => setCompanyForm(prev => ({ ...prev, owner_email: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input type="tel" value={companyForm.phone} onChange={(e) => setCompanyForm(prev => ({ ...prev, phone: formatPhoneInput(e.target.value) }))} placeholder="(555) 123-4567" style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Address</label>
              <textarea value={companyForm.address} onChange={(e) => setCompanyForm(prev => ({ ...prev, address: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Logo URL</label>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input type="url" value={companyForm.logo_url} onChange={(e) => setCompanyForm(prev => ({ ...prev, logo_url: e.target.value }))} placeholder="https://..." style={{ ...inputStyle, flex: 1 }} />
                {companyForm.logo_url && (
                  <img src={companyForm.logo_url} alt="Logo" style={{ height: '36px', maxWidth: '100px', objectFit: 'contain', borderRadius: '4px', border: `1px solid ${theme.border}` }} />
                )}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Google Place ID</label>
              <input type="text" value={companyForm.google_place_id} onChange={(e) => setCompanyForm(prev => ({ ...prev, google_place_id: e.target.value }))} placeholder="ChIJ..." style={inputStyle} />
              <p style={{ fontSize: '11px', color: theme.textMuted, margin: '4px 0 0' }}>Used for the Google Review link in the customer portal. Find yours at Google Places API.</p>
            </div>
          </div>
        </div>
      )}

      {/* Admin-only sections */}
      {isAdmin && (
        <>
          {/* Entity & Tax Info */}
          <button onClick={() => toggleSection('entity')} style={sectionHeaderStyle(expandedSections.entity)}>
            {expandedSections.entity ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <Shield size={18} />
            Entity & Tax Information
            <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '500', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'rgba(194,90,90,0.1)', color: '#c25a5a' }}>Admin Only</span>
          </button>
          {expandedSections.entity && (
            <div style={{ ...sectionBodyStyle, marginTop: '-16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '600px' }}>
                <div>
                  <label style={labelStyle}>Entity Type</label>
                  <select value={companyForm.entity_type} onChange={(e) => setCompanyForm(prev => ({ ...prev, entity_type: e.target.value }))} style={inputStyle}>
                    <option value="">-- Select --</option>
                    <option value="Sole Proprietorship">Sole Proprietorship</option>
                    <option value="LLC">LLC</option>
                    <option value="S-Corp">S-Corp</option>
                    <option value="C-Corp">C-Corp</option>
                    <option value="Partnership">Partnership</option>
                    <option value="Non-Profit">Non-Profit</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>State of Incorporation</label>
                  <input type="text" value={companyForm.state_of_incorporation} onChange={(e) => setCompanyForm(prev => ({ ...prev, state_of_incorporation: e.target.value }))} placeholder="e.g. Delaware" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>EIN (Tax ID)</label>
                  <input type="text" value={companyForm.ein} onChange={(e) => setCompanyForm(prev => ({ ...prev, ein: e.target.value }))} placeholder="XX-XXXXXXX" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Tax Exempt Number</label>
                  <input type="text" value={companyForm.tax_exempt_number} onChange={(e) => setCompanyForm(prev => ({ ...prev, tax_exempt_number: e.target.value }))} placeholder="If applicable" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Business License #</label>
                  <input type="text" value={companyForm.license_number} onChange={(e) => setCompanyForm(prev => ({ ...prev, license_number: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Fiscal Year End</label>
                  <select value={companyForm.fiscal_year_end} onChange={(e) => setCompanyForm(prev => ({ ...prev, fiscal_year_end: e.target.value }))} style={inputStyle}>
                    <option value="">-- Select --</option>
                    {['January','February','March','April','May','June','July','August','September','October','November','December'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>DUNS Number</label>
                  <input type="text" value={companyForm.duns_number} onChange={(e) => setCompanyForm(prev => ({ ...prev, duns_number: e.target.value }))} placeholder="9-digit identifier" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>NAICS Code</label>
                  <input type="text" value={companyForm.naics_code} onChange={(e) => setCompanyForm(prev => ({ ...prev, naics_code: e.target.value }))} placeholder="e.g. 238210" style={inputStyle} />
                </div>
              </div>
            </div>
          )}

          {/* Insurance & Bonding */}
          <button onClick={() => toggleSection('insurance')} style={sectionHeaderStyle(expandedSections.insurance)}>
            {expandedSections.insurance ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <Shield size={18} />
            Insurance & Bonding
            <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '500', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'rgba(194,90,90,0.1)', color: '#c25a5a' }}>Admin Only</span>
          </button>
          {expandedSections.insurance && (
            <div style={{ ...sectionBodyStyle, marginTop: '-16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '600px' }}>
                <div>
                  <label style={labelStyle}>Insurance Provider</label>
                  <input type="text" value={companyForm.insurance_provider} onChange={(e) => setCompanyForm(prev => ({ ...prev, insurance_provider: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Policy Number</label>
                  <input type="text" value={companyForm.insurance_policy_number} onChange={(e) => setCompanyForm(prev => ({ ...prev, insurance_policy_number: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Insurance Expiration</label>
                  <input type="date" value={companyForm.insurance_expiration} onChange={(e) => setCompanyForm(prev => ({ ...prev, insurance_expiration: e.target.value || '' }))} style={inputStyle} />
                </div>
                <div />
                <div>
                  <label style={labelStyle}>Workers' Comp Policy</label>
                  <input type="text" value={companyForm.workers_comp_policy} onChange={(e) => setCompanyForm(prev => ({ ...prev, workers_comp_policy: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Workers' Comp Expiration</label>
                  <input type="date" value={companyForm.workers_comp_expiration} onChange={(e) => setCompanyForm(prev => ({ ...prev, workers_comp_expiration: e.target.value || '' }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 0, cursor: 'pointer' }}>
                    <input type="checkbox" checked={companyForm.bonded} onChange={(e) => setCompanyForm(prev => ({ ...prev, bonded: e.target.checked }))} style={{ width: '16px', height: '16px', accentColor: theme.accent }} />
                    Bonded
                  </label>
                </div>
                {companyForm.bonded && (
                  <div>
                    <label style={labelStyle}>Bond Amount</label>
                    <input type="number" value={companyForm.bond_amount} onChange={(e) => setCompanyForm(prev => ({ ...prev, bond_amount: e.target.value }))} placeholder="$" style={inputStyle} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Documents */}
          <button onClick={() => toggleSection('docs')} style={sectionHeaderStyle(expandedSections.docs)}>
            {expandedSections.docs ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <FileCheck size={18} />
            Business Documents
            <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '500', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'rgba(194,90,90,0.1)', color: '#c25a5a' }}>Admin Only</span>
          </button>
          {expandedSections.docs && (
            <div style={{ ...sectionBodyStyle, marginTop: '-16px' }}>
              <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '16px' }}>
                Upload important business documents. Files are stored securely and only visible to admins.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '600px' }}>
                <DocUploadField label="Certificate of Insurance (COI)" field="insurance_cert_url" icon={Shield} />
                <DocUploadField label="Workers' Comp Certificate" field="workers_comp_cert_url" icon={Shield} />
                <DocUploadField label="W-9 Form" field="w9_url" icon={FileCheck} />
                <DocUploadField label="Tax Exempt Certificate" field="tax_exempt_cert_url" icon={FileCheck} />
                <DocUploadField label="Business License" field="business_license_url" icon={FileCheck} />
                <DocUploadField label="Operating Agreement" field="operating_agreement_url" icon={FileCheck} />
                <DocUploadField label="Bond Certificate" field="bond_cert_url" icon={Shield} />
              </div>
            </div>
          )}
        </>
      )}

      {/* Save Button */}
      <button
        onClick={handleSaveCompany}
        disabled={saving}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '12px 24px',
          backgroundColor: theme.accent,
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500',
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.7 : 1,
          alignSelf: 'flex-start'
        }}
      >
        <Save size={18} /> {saving ? 'Saving...' : 'Save All Changes'}
      </button>
    </div>
  )
}

// Business Units Editor — rich objects with logo upload
function BusinessUnitsEditor({ items, setItems, saveSetting, companyId, theme }) {
  // Normalize legacy string items to objects
  const normalizedItems = items.map(item =>
    typeof item === 'string' ? { name: item } : item
  )

  const [showForm, setShowForm] = useState(false)
  const [editIndex, setEditIndex] = useState(null)
  const [form, setForm] = useState({ name: '', logo_url: '', address: '', phone: '', email: '' })
  const [uploading, setUploading] = useState(false)

  // Auto-save normalized items if any were strings
  useEffect(() => {
    if (items.length > 0 && items.some(item => typeof item === 'string')) {
      const converted = items.map(item => typeof item === 'string' ? { name: item } : item)
      setItems(converted)
      saveSetting('business_units', converted)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${companyId}/bu-${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(fileName, file, { upsert: true })

      if (uploadError) {
        const { error: publicError } = await supabase.storage
          .from('public')
          .upload(`company-logos/${fileName}`, file, { upsert: true })

        if (publicError) {
          toast.error('Failed to upload logo. Storage bucket may not be configured.')
          setUploading(false)
          return
        }

        const { data: { publicUrl } } = supabase.storage
          .from('public')
          .getPublicUrl(`company-logos/${fileName}`)
        setForm(prev => ({ ...prev, logo_url: publicUrl }))
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('company-logos')
          .getPublicUrl(fileName)
        setForm(prev => ({ ...prev, logo_url: publicUrl }))
      }
    } catch {
      toast.error('Failed to upload logo')
    }
    setUploading(false)
  }

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('Business unit name is required.')
      return
    }
    let updated
    if (editIndex !== null) {
      updated = normalizedItems.map((item, i) => i === editIndex ? { ...form } : item)
    } else {
      updated = [...normalizedItems, { ...form }]
    }
    setItems(updated)
    saveSetting('business_units', updated)
    setForm({ name: '', logo_url: '', address: '', phone: '', email: '' })
    setShowForm(false)
    setEditIndex(null)
  }

  const handleEdit = (index) => {
    setForm({ ...normalizedItems[index] })
    setEditIndex(index)
    setShowForm(true)
  }

  const handleRemove = (index) => {
    const updated = normalizedItems.filter((_, i) => i !== index)
    setItems(updated)
    saveSetting('business_units', updated)
  }

  const handleCancel = () => {
    setForm({ name: '', logo_url: '', address: '', phone: '', email: '' })
    setShowForm(false)
    setEditIndex(null)
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.bg,
    color: theme.text,
    fontSize: '14px'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: '6px'
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>Business Units</h3>
        {!showForm && (
          <button
            onClick={() => { setEditIndex(null); setForm({ name: '', logo_url: '', address: '', phone: '', email: '' }); setShowForm(true) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: theme.accent,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500'
            }}
          >
            <Plus size={16} /> Add Business Unit
          </button>
        )}
      </div>

      {/* BU Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: showForm ? '20px' : '0' }}>
        {normalizedItems.map((bu, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '16px',
              backgroundColor: theme.bg,
              borderRadius: '10px',
              border: `1px solid ${theme.border}`
            }}
          >
            {/* Logo thumbnail */}
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '8px',
              backgroundColor: theme.accentBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden'
            }}>
              {bu.logo_url ? (
                <img src={bu.logo_url} alt={bu.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <Image size={20} style={{ color: theme.textMuted }} />
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>{bu.name}</div>
              {(bu.phone || bu.email) && (
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                  {[bu.phone, bu.email].filter(Boolean).join(' | ')}
                </div>
              )}
              {bu.address && (
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '1px' }}>
                  {bu.address}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <button
                onClick={() => handleEdit(index)}
                style={{
                  padding: '6px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: theme.textMuted,
                  display: 'flex'
                }}
              >
                <Edit3 size={14} />
              </button>
              <button
                onClick={() => handleRemove(index)}
                style={{
                  padding: '6px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: '#c25a5a',
                  display: 'flex'
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {normalizedItems.length === 0 && !showForm && (
          <div style={{ padding: '20px', color: theme.textMuted, fontSize: '14px' }}>
            No business units added yet
          </div>
        )}
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div style={{
          padding: '20px',
          backgroundColor: theme.bg,
          borderRadius: '10px',
          border: `1px solid ${theme.border}`
        }}>
          <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
            {editIndex !== null ? 'Edit Business Unit' : 'New Business Unit'}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '500px' }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Commercial Division"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {form.logo_url ? (
                  <>
                    <img src={form.logo_url} alt="Logo" style={{ height: '40px', maxWidth: '120px', objectFit: 'contain', borderRadius: '4px' }} />
                    <label style={{ fontSize: '12px', color: theme.accent, cursor: 'pointer', textDecoration: 'underline' }}>
                      Change
                      <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                    </label>
                    <button
                      onClick={() => setForm(prev => ({ ...prev, logo_url: '' }))}
                      style={{ fontSize: '12px', color: '#c25a5a', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 14px',
                    backgroundColor: theme.bgCard,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    color: theme.textSecondary
                  }}>
                    <Upload size={14} />
                    {uploading ? 'Uploading...' : 'Upload Logo'}
                    <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploading} style={{ display: 'none' }} />
                  </label>
                )}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Address</label>
              <input
                type="text"
                value={form.address || ''}
                onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
                placeholder="123 Main St, City, ST 12345"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Phone</label>
                <input
                  type="tel"
                  value={form.phone || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, phone: formatPhoneInput(e.target.value) }))}
                  placeholder="(555) 123-4567"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={form.email || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="info@division.com"
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                onClick={handleSave}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 20px',
                  backgroundColor: theme.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                <Save size={16} /> {editIndex !== null ? 'Update' : 'Add'}
              </button>
              <button
                onClick={handleCancel}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  color: theme.textMuted,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Estimate Defaults Tab Component
function EstimateDefaultsTab({ theme, settings, saveSetting }) {
  const existing = settings.find(s => s.key === 'estimate_defaults')
  let defaults = {
    default_message: '',
    expiration_days: 30,
    show_logo: true,
    show_company_address: true,
    show_company_phone: true,
    show_company_email: true,
    show_customer_company: true,
    show_line_descriptions: true,
    show_line_images: false,
    show_technician: true,
    show_service_date: true,
    pdf_layout: 'email',
    footer_text: ''
  }
  if (existing) {
    try { defaults = { ...defaults, ...JSON.parse(existing.value) } } catch {}
  }

  const [form, setForm] = useState(defaults)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await saveSetting('estimate_defaults', form)
    setSaving(false)
    toast.success('Estimate defaults saved!')
  }

  const toggle = (key) => setForm(prev => ({ ...prev, [key]: !prev[key] }))

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.bg,
    color: theme.text,
    fontSize: '14px'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: '6px'
  }

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Estimate Defaults</h3>
      <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '24px' }}>
        Configure default settings for all new estimates. Individual estimates can override these.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px' }}>
        <div>
          <label style={labelStyle}>Default Estimate Message</label>
          <textarea
            value={form.default_message || ''}
            onChange={(e) => setForm(prev => ({ ...prev, default_message: e.target.value }))}
            rows={3}
            placeholder="Message displayed on estimates for customers..."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div>
          <label style={labelStyle}>Expiration Days</label>
          <input
            type="number"
            value={form.expiration_days || ''}
            onChange={(e) => setForm(prev => ({ ...prev, expiration_days: parseInt(e.target.value) || 0 }))}
            placeholder="30"
            style={{ ...inputStyle, maxWidth: '120px' }}
          />
          <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>Days until new estimates expire by default</p>
        </div>

        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px' }}>
          <p style={{ fontSize: '13px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>PDF Display Options</p>

          {[
            { key: 'show_logo', label: 'Show Company Logo' },
            { key: 'show_company_address', label: 'Show Company Address' },
            { key: 'show_company_phone', label: 'Show Company Phone' },
            { key: 'show_company_email', label: 'Show Company Email' },
            { key: 'show_customer_company', label: 'Show Customer Company Name' },
            { key: 'show_line_descriptions', label: 'Show Line Item Descriptions' },
            { key: 'show_line_images', label: 'Show Line Item Images' },
            { key: 'show_technician', label: 'Show Technician' },
            { key: 'show_service_date', label: 'Show Service Date' }
          ].map(item => (
            <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form[item.key] || false}
                onChange={() => toggle(item.key)}
                style={{ width: '16px', height: '16px', accentColor: theme.accent }}
              />
              <span style={{ fontSize: '14px', color: theme.text }}>{item.label}</span>
            </label>
          ))}
        </div>

        <div>
          <label style={labelStyle}>Default PDF Layout</label>
          <select
            value={form.pdf_layout || 'email'}
            onChange={(e) => setForm(prev => ({ ...prev, pdf_layout: e.target.value }))}
            style={inputStyle}
          >
            <option value="email">Email Optimized</option>
            <option value="envelope">Envelope Optimized (#9/#10 window)</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Footer Text</label>
          <textarea
            value={form.footer_text || ''}
            onChange={(e) => setForm(prev => ({ ...prev, footer_text: e.target.value }))}
            rows={2}
            placeholder="Text displayed at the bottom of estimate PDFs..."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 24px',
            backgroundColor: theme.accent,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
            alignSelf: 'flex-start'
          }}
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Defaults'}
        </button>
      </div>
    </div>
  )
}

// ---- Payment Settings ("My Money") Tab ----
function PaymentSettingsTab({ theme, settings, saveSetting }) {
  const existing = settings.find(s => s.key === 'payment_config')
  let defaults = {
    stripe_enabled: false,
    stripe_mode: 'test',
    stripe_publishable_key: '',
    stripe_secret_key: '',
    stripe_webhook_secret: '',
    paypal_enabled: false,
    paypal_mode: 'sandbox',
    paypal_client_id: '',
    paypal_secret: '',
    bank_enabled: false,
    bank_name: '',
    bank_routing: '',
    bank_account: '',
    bank_account_name: '',
    bank_instructions: '',
    // Financing / BNPL
    wisetack_enabled: false,
    wisetack_mode: 'sandbox',
    wisetack_api_key: '',
    wisetack_merchant_id: '',
    greensky_enabled: false,
    greensky_mode: 'sandbox',
    greensky_merchant_id: '',
    greensky_api_key: '',
    hearth_enabled: false,
    hearth_partner_id: '',
    hearth_api_key: '',
    service_finance_enabled: false,
    service_finance_dealer_id: '',
    service_finance_api_key: '',
    portal_base_url: ''
  }
  if (existing) {
    try { defaults = { ...defaults, ...JSON.parse(existing.value) } } catch {}
  }

  const [form, setForm] = useState(defaults)
  const [saving, setSaving] = useState(false)
  const [expandedSection, setExpandedSection] = useState(null)

  const existingReviewUrl = settings.find(s => s.key === 'google_review_url')
  const [googleReviewUrl, setGoogleReviewUrl] = useState(existingReviewUrl ? existingReviewUrl.value : '')

  const handleSave = async () => {
    setSaving(true)
    await saveSetting('payment_config', form)
    setSaving(false)
    toast.success('Payment settings saved!')
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.bg,
    color: theme.text,
    fontSize: '14px',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: '6px'
  }

  const toggleSection = (section) => {
    setExpandedSection(prev => prev === section ? null : section)
  }

  const StatusDot = ({ enabled }) => (
    <span style={{
      display: 'inline-block',
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      backgroundColor: enabled ? '#4a7c59' : theme.border,
      marginRight: '8px'
    }} />
  )

  const sectionCard = (id, icon, title, subtitle, enabled, children) => (
    <div style={{
      backgroundColor: theme.bgCard,
      borderRadius: '12px',
      border: `1px solid ${enabled ? 'rgba(74,124,89,0.3)' : theme.border}`,
      overflow: 'hidden'
    }}>
      <button
        onClick={() => toggleSection(id)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '18px 20px',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          backgroundColor: enabled ? 'rgba(74,124,89,0.12)' : theme.accentBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>{title}</span>
            {enabled && (
              <span style={{
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '10px',
                fontWeight: '600',
                backgroundColor: 'rgba(74,124,89,0.12)',
                color: '#4a7c59',
                textTransform: 'uppercase'
              }}>
                Active
              </span>
            )}
          </div>
          <p style={{ fontSize: '13px', color: theme.textMuted, margin: '2px 0 0' }}>{subtitle}</p>
        </div>
        {expandedSection === id ? <ChevronDown size={18} style={{ color: theme.textMuted }} /> : <ChevronRight size={18} style={{ color: theme.textMuted }} />}
      </button>
      {expandedSection === id && (
        <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${theme.border}` }}>
          <div style={{ paddingTop: '16px' }}>
            {children}
          </div>
        </div>
      )}
    </div>
  )

  const completedSteps = [
    form.stripe_enabled && form.stripe_secret_key,
    form.paypal_enabled && form.paypal_client_id,
    form.bank_enabled && form.bank_name,
    form.wisetack_enabled && form.wisetack_api_key,
    form.greensky_enabled && form.greensky_merchant_id,
    form.hearth_enabled && form.hearth_partner_id,
    form.service_finance_enabled && form.service_finance_dealer_id,
  ].filter(Boolean).length

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>My Money</h3>
      <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '20px' }}>
        Set up how you receive payments from customers through the portal.
      </p>

      {/* Progress overview */}
      <div style={{
        padding: '16px 20px',
        backgroundColor: theme.accentBg,
        borderRadius: '12px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: completedSteps > 0 ? 'rgba(74,124,89,0.15)' : theme.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Wallet size={22} style={{ color: completedSteps > 0 ? '#4a7c59' : theme.textMuted }} />
        </div>
        <div>
          <p style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '0 0 2px' }}>
            {completedSteps === 0 ? 'No payment methods configured' : `${completedSteps} payment method${completedSteps > 1 ? 's' : ''} active`}
          </p>
          <p style={{ fontSize: '12px', color: theme.textMuted, margin: 0 }}>
            {completedSteps === 0
              ? 'Set up at least one method below so customers can pay through the portal.'
              : 'Customers will see these options when they pay through the portal.'}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '600px' }}>

        {/* Portal Base URL */}
        <div style={{
          padding: '16px 20px',
          backgroundColor: theme.bg,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <label style={labelStyle}>Portal Base URL</label>
          <input
            type="url"
            value={form.portal_base_url}
            onChange={(e) => setForm(prev => ({ ...prev, portal_base_url: e.target.value }))}
            placeholder="https://app.jobscout.com"
            style={inputStyle}
          />
          <p style={{ fontSize: '11px', color: theme.textMuted, margin: '4px 0 0' }}>
            Your app's URL, used for building portal payment links. This is also set as PORTAL_BASE_URL in your edge function secrets.
          </p>
        </div>

        {/* ---- GOOGLE REVIEW URL ---- */}
        <div style={{
          padding: '16px',
          borderRadius: '10px',
          backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`,
          marginBottom: '12px'
        }}>
          <label style={labelStyle}>Google Review URL</label>
          <input
            type="url"
            value={googleReviewUrl}
            onChange={(e) => setGoogleReviewUrl(e.target.value)}
            placeholder="https://g.page/r/YOUR_ID/review"
            style={inputStyle}
          />
          <p style={{ fontSize: '11px', color: theme.textMuted, margin: '4px 0 0' }}>
            Your Google Business review link. Field Scout will show a "Get Review" button so techs can request reviews on-site.
          </p>
          <button
            onClick={async () => {
              await saveSetting('google_review_url', googleReviewUrl)
              toast.success('Google Review URL saved!')
            }}
            style={{ marginTop: '8px', padding: '8px 16px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
          >
            Save
          </button>
        </div>

        {/* ---- STRIPE ---- */}
        {sectionCard(
          'stripe',
          <CreditCard size={20} style={{ color: form.stripe_enabled ? '#4a7c59' : theme.accent }} />,
          'Stripe',
          'Credit & debit cards, Apple Pay, Google Pay',
          form.stripe_enabled && form.stripe_secret_key,
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={form.stripe_enabled}
                onChange={() => setForm(prev => ({ ...prev, stripe_enabled: !prev.stripe_enabled }))}
                style={{ width: '16px', height: '16px', accentColor: theme.accent }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Enable Stripe payments</span>
            </label>

            {form.stripe_enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Step indicators */}
                <div style={{
                  padding: '14px 16px',
                  backgroundColor: 'rgba(90,99,73,0.06)',
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`
                }}>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: theme.text, margin: '0 0 10px' }}>Setup Checklist</p>
                  {[
                    { done: !!form.stripe_secret_key, text: 'Add your Stripe Secret Key below' },
                    { done: !!form.stripe_webhook_secret, text: 'Add your Webhook Signing Secret below' },
                    { done: !!form.stripe_secret_key, text: 'Copy keys to Supabase Edge Function secrets' },
                    { done: false, text: 'Add webhook endpoint in Stripe Dashboard' },
                  ].map((step, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0' }}>
                      {step.done
                        ? <CheckCircle size={14} style={{ color: '#4a7c59', flexShrink: 0 }} />
                        : <Circle size={14} style={{ color: theme.border, flexShrink: 0 }} />
                      }
                      <span style={{ fontSize: '12px', color: step.done ? theme.text : theme.textMuted }}>{step.text}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <label style={labelStyle}>Mode</label>
                  <select
                    value={form.stripe_mode}
                    onChange={(e) => setForm(prev => ({ ...prev, stripe_mode: e.target.value }))}
                    style={{ ...inputStyle, maxWidth: '200px' }}
                  >
                    <option value="test">Test (Sandbox)</option>
                    <option value="live">Live</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>
                    Secret Key
                    <span style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '400', marginLeft: '6px' }}>
                      {form.stripe_mode === 'test' ? 'sk_test_...' : 'sk_live_...'}
                    </span>
                  </label>
                  <input
                    type="password"
                    value={form.stripe_secret_key}
                    onChange={(e) => setForm(prev => ({ ...prev, stripe_secret_key: e.target.value }))}
                    placeholder={form.stripe_mode === 'test' ? 'sk_test_...' : 'sk_live_...'}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Publishable Key (optional, for future embedded forms)</label>
                  <input
                    type="text"
                    value={form.stripe_publishable_key}
                    onChange={(e) => setForm(prev => ({ ...prev, stripe_publishable_key: e.target.value }))}
                    placeholder={form.stripe_mode === 'test' ? 'pk_test_...' : 'pk_live_...'}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Webhook Signing Secret</label>
                  <input
                    type="password"
                    value={form.stripe_webhook_secret}
                    onChange={(e) => setForm(prev => ({ ...prev, stripe_webhook_secret: e.target.value }))}
                    placeholder="whsec_..."
                    style={inputStyle}
                  />
                </div>

                <div style={{
                  padding: '12px 14px',
                  backgroundColor: 'rgba(59,130,246,0.06)',
                  borderRadius: '8px',
                  border: '1px solid rgba(59,130,246,0.15)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <HelpCircle size={14} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: '1.5' }}>
                      <p style={{ margin: '0 0 4px', fontWeight: '600' }}>Where to find these:</p>
                      <p style={{ margin: '0 0 2px' }}>1. Go to <strong>Stripe Dashboard</strong> &rarr; Developers &rarr; API Keys</p>
                      <p style={{ margin: '0 0 2px' }}>2. Copy your Secret Key and Publishable Key</p>
                      <p style={{ margin: '0 0 2px' }}>3. Go to Developers &rarr; Webhooks &rarr; Add Endpoint</p>
                      <p style={{ margin: '0 0 2px' }}>4. Set endpoint URL to your Supabase function URL + <code>/functions/v1/stripe-webhook</code></p>
                      <p style={{ margin: 0 }}>5. Copy the Signing Secret from the webhook details</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- PAYPAL ---- */}
        {sectionCard(
          'paypal',
          <Wallet size={20} style={{ color: form.paypal_enabled ? '#4a7c59' : theme.accent }} />,
          'PayPal',
          'PayPal balance, Venmo, Pay Later',
          form.paypal_enabled && form.paypal_client_id,
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={form.paypal_enabled}
                onChange={() => setForm(prev => ({ ...prev, paypal_enabled: !prev.paypal_enabled }))}
                style={{ width: '16px', height: '16px', accentColor: theme.accent }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Enable PayPal payments</span>
            </label>

            {form.paypal_enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{
                  padding: '14px 16px',
                  backgroundColor: 'rgba(90,99,73,0.06)',
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`
                }}>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: theme.text, margin: '0 0 10px' }}>Setup Checklist</p>
                  {[
                    { done: !!form.paypal_client_id, text: 'Add your PayPal Client ID below' },
                    { done: !!form.paypal_secret, text: 'Add your PayPal Secret below' },
                    { done: !!form.paypal_client_id, text: 'Copy keys to Supabase Edge Function secrets' },
                  ].map((step, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0' }}>
                      {step.done
                        ? <CheckCircle size={14} style={{ color: '#4a7c59', flexShrink: 0 }} />
                        : <Circle size={14} style={{ color: theme.border, flexShrink: 0 }} />
                      }
                      <span style={{ fontSize: '12px', color: step.done ? theme.text : theme.textMuted }}>{step.text}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <label style={labelStyle}>Mode</label>
                  <select
                    value={form.paypal_mode}
                    onChange={(e) => setForm(prev => ({ ...prev, paypal_mode: e.target.value }))}
                    style={{ ...inputStyle, maxWidth: '200px' }}
                  >
                    <option value="sandbox">Sandbox (Test)</option>
                    <option value="live">Live</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Client ID</label>
                  <input
                    type="text"
                    value={form.paypal_client_id}
                    onChange={(e) => setForm(prev => ({ ...prev, paypal_client_id: e.target.value }))}
                    placeholder={form.paypal_mode === 'sandbox' ? 'sb-...' : 'AY...'}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Secret</label>
                  <input
                    type="password"
                    value={form.paypal_secret}
                    onChange={(e) => setForm(prev => ({ ...prev, paypal_secret: e.target.value }))}
                    placeholder="EL..."
                    style={inputStyle}
                  />
                </div>

                <div style={{
                  padding: '12px 14px',
                  backgroundColor: 'rgba(59,130,246,0.06)',
                  borderRadius: '8px',
                  border: '1px solid rgba(59,130,246,0.15)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <HelpCircle size={14} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: '1.5' }}>
                      <p style={{ margin: '0 0 4px', fontWeight: '600' }}>Where to find these:</p>
                      <p style={{ margin: '0 0 2px' }}>1. Go to <strong>developer.paypal.com</strong> &rarr; Dashboard &rarr; Apps & Credentials</p>
                      <p style={{ margin: '0 0 2px' }}>2. Create a new app or select your existing one</p>
                      <p style={{ margin: 0 }}>3. Copy the Client ID and Secret from the app details</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- BANK / ACH ---- */}
        {sectionCard(
          'bank',
          <Landmark size={20} style={{ color: form.bank_enabled ? '#4a7c59' : theme.accent }} />,
          'Bank Transfer / ACH',
          'Direct bank deposits, wire transfers',
          form.bank_enabled && form.bank_name,
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={form.bank_enabled}
                onChange={() => setForm(prev => ({ ...prev, bank_enabled: !prev.bank_enabled }))}
                style={{ width: '16px', height: '16px', accentColor: theme.accent }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Enable bank transfer as a payment option</span>
            </label>

            {form.bank_enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p style={{ fontSize: '12px', color: theme.textMuted, margin: 0, lineHeight: '1.5' }}>
                  Bank details will be shown to customers as an alternative payment option on the portal.
                  No automatic payment processing — you'll manually confirm when funds arrive.
                </p>

                <div>
                  <label style={labelStyle}>Bank Name</label>
                  <input
                    type="text"
                    value={form.bank_name}
                    onChange={(e) => setForm(prev => ({ ...prev, bank_name: e.target.value }))}
                    placeholder="e.g. Chase, Wells Fargo"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Account Holder Name</label>
                  <input
                    type="text"
                    value={form.bank_account_name}
                    onChange={(e) => setForm(prev => ({ ...prev, bank_account_name: e.target.value }))}
                    placeholder="Your business name as it appears on the account"
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Routing Number</label>
                    <input
                      type="text"
                      value={form.bank_routing}
                      onChange={(e) => setForm(prev => ({ ...prev, bank_routing: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                      placeholder="9 digits"
                      maxLength={9}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Account Number</label>
                    <input
                      type="password"
                      value={form.bank_account}
                      onChange={(e) => setForm(prev => ({ ...prev, bank_account: e.target.value.replace(/\D/g, '') }))}
                      placeholder="Account number"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Additional Instructions (optional)</label>
                  <textarea
                    value={form.bank_instructions}
                    onChange={(e) => setForm(prev => ({ ...prev, bank_instructions: e.target.value }))}
                    rows={3}
                    placeholder="e.g. Please include your invoice number as the memo. Zelle payments also accepted at payments@yourcompany.com"
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- FINANCING HEADER ---- */}
        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px', marginTop: '4px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '0 0 4px' }}>Customer Financing (BNPL)</h4>
          <p style={{ fontSize: '12px', color: theme.textMuted, margin: '0 0 12px', lineHeight: '1.5' }}>
            Let customers finance larger jobs with monthly payments. You get paid upfront — the financing company handles collections.
          </p>
        </div>

        {/* ---- WISETACK ---- */}
        {sectionCard(
          'wisetack',
          <CreditCard size={20} style={{ color: form.wisetack_enabled ? '#4a7c59' : theme.accent }} />,
          'Wisetack',
          'Consumer financing for home services — #1 for contractors',
          form.wisetack_enabled && form.wisetack_api_key,
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={form.wisetack_enabled}
                onChange={() => setForm(prev => ({ ...prev, wisetack_enabled: !prev.wisetack_enabled }))}
                style={{ width: '16px', height: '16px', accentColor: theme.accent }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Enable Wisetack financing</span>
            </label>

            {form.wisetack_enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>Mode</label>
                  <select
                    value={form.wisetack_mode}
                    onChange={(e) => setForm(prev => ({ ...prev, wisetack_mode: e.target.value }))}
                    style={{ ...inputStyle, maxWidth: '200px' }}
                  >
                    <option value="sandbox">Sandbox (Test)</option>
                    <option value="live">Live</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Merchant ID</label>
                  <input
                    type="text"
                    value={form.wisetack_merchant_id}
                    onChange={(e) => setForm(prev => ({ ...prev, wisetack_merchant_id: e.target.value }))}
                    placeholder="Your Wisetack Merchant ID"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>API Key</label>
                  <input
                    type="password"
                    value={form.wisetack_api_key}
                    onChange={(e) => setForm(prev => ({ ...prev, wisetack_api_key: e.target.value }))}
                    placeholder="wt_..."
                    style={inputStyle}
                  />
                </div>
                <div style={{
                  padding: '12px 14px',
                  backgroundColor: 'rgba(59,130,246,0.06)',
                  borderRadius: '8px',
                  border: '1px solid rgba(59,130,246,0.15)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <HelpCircle size={14} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: '1.5' }}>
                      <p style={{ margin: '0 0 4px', fontWeight: '600' }}>How Wisetack works:</p>
                      <p style={{ margin: '0 0 2px' }}>1. Sign up at <strong>wisetack.com/partners</strong></p>
                      <p style={{ margin: '0 0 2px' }}>2. Get your Merchant ID and API Key from the partner dashboard</p>
                      <p style={{ margin: '0 0 2px' }}>3. Customers apply for financing on the portal (soft credit check)</p>
                      <p style={{ margin: 0 }}>4. If approved, you get paid upfront. Customer pays monthly.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- GREENSKY ---- */}
        {sectionCard(
          'greensky',
          <CreditCard size={20} style={{ color: form.greensky_enabled ? '#4a7c59' : theme.accent }} />,
          'GreenSky (Goldman Sachs)',
          'Home improvement loans — large job financing',
          form.greensky_enabled && form.greensky_merchant_id,
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={form.greensky_enabled}
                onChange={() => setForm(prev => ({ ...prev, greensky_enabled: !prev.greensky_enabled }))}
                style={{ width: '16px', height: '16px', accentColor: theme.accent }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Enable GreenSky financing</span>
            </label>

            {form.greensky_enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>Mode</label>
                  <select
                    value={form.greensky_mode}
                    onChange={(e) => setForm(prev => ({ ...prev, greensky_mode: e.target.value }))}
                    style={{ ...inputStyle, maxWidth: '200px' }}
                  >
                    <option value="sandbox">Sandbox (Test)</option>
                    <option value="live">Live</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Merchant ID</label>
                  <input
                    type="text"
                    value={form.greensky_merchant_id}
                    onChange={(e) => setForm(prev => ({ ...prev, greensky_merchant_id: e.target.value }))}
                    placeholder="Your GreenSky Merchant ID"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>API Key</label>
                  <input
                    type="password"
                    value={form.greensky_api_key}
                    onChange={(e) => setForm(prev => ({ ...prev, greensky_api_key: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div style={{
                  padding: '12px 14px',
                  backgroundColor: 'rgba(59,130,246,0.06)',
                  borderRadius: '8px',
                  border: '1px solid rgba(59,130,246,0.15)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <HelpCircle size={14} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: '1.5' }}>
                      <p style={{ margin: '0 0 4px', fontWeight: '600' }}>How GreenSky works:</p>
                      <p style={{ margin: '0 0 2px' }}>1. Apply at <strong>greensky.com/merchants</strong> (backed by Goldman Sachs)</p>
                      <p style={{ margin: '0 0 2px' }}>2. Offers loans from $1,000 - $100,000 for home improvement</p>
                      <p style={{ margin: 0 }}>3. Customer applies on the portal. You get paid when the job is done.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- HEARTH ---- */}
        {sectionCard(
          'hearth',
          <CreditCard size={20} style={{ color: form.hearth_enabled ? '#4a7c59' : theme.accent }} />,
          'Hearth',
          'Financing marketplace — multiple lenders, best rates for customers',
          form.hearth_enabled && form.hearth_partner_id,
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={form.hearth_enabled}
                onChange={() => setForm(prev => ({ ...prev, hearth_enabled: !prev.hearth_enabled }))}
                style={{ width: '16px', height: '16px', accentColor: theme.accent }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Enable Hearth financing</span>
            </label>

            {form.hearth_enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>Partner ID</label>
                  <input
                    type="text"
                    value={form.hearth_partner_id}
                    onChange={(e) => setForm(prev => ({ ...prev, hearth_partner_id: e.target.value }))}
                    placeholder="Your Hearth Partner ID"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>API Key</label>
                  <input
                    type="password"
                    value={form.hearth_api_key}
                    onChange={(e) => setForm(prev => ({ ...prev, hearth_api_key: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div style={{
                  padding: '12px 14px',
                  backgroundColor: 'rgba(59,130,246,0.06)',
                  borderRadius: '8px',
                  border: '1px solid rgba(59,130,246,0.15)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <HelpCircle size={14} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: '1.5' }}>
                      <p style={{ margin: '0 0 4px', fontWeight: '600' }}>How Hearth works:</p>
                      <p style={{ margin: '0 0 2px' }}>1. Sign up at <strong>gethearth.com/contractors</strong></p>
                      <p style={{ margin: '0 0 2px' }}>2. Hearth is a marketplace — shows customers offers from multiple lenders</p>
                      <p style={{ margin: 0 }}>3. Customers get pre-qualified with a soft credit pull. Higher approval rates.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---- SERVICE FINANCE ---- */}
        {sectionCard(
          'service_finance',
          <CreditCard size={20} style={{ color: form.service_finance_enabled ? '#4a7c59' : theme.accent }} />,
          'Service Finance',
          'HVAC & home services financing with promotional rates',
          form.service_finance_enabled && form.service_finance_dealer_id,
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={form.service_finance_enabled}
                onChange={() => setForm(prev => ({ ...prev, service_finance_enabled: !prev.service_finance_enabled }))}
                style={{ width: '16px', height: '16px', accentColor: theme.accent }}
              />
              <span style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Enable Service Finance</span>
            </label>

            {form.service_finance_enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>Dealer ID</label>
                  <input
                    type="text"
                    value={form.service_finance_dealer_id}
                    onChange={(e) => setForm(prev => ({ ...prev, service_finance_dealer_id: e.target.value }))}
                    placeholder="Your Service Finance Dealer ID"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>API Key</label>
                  <input
                    type="password"
                    value={form.service_finance_api_key}
                    onChange={(e) => setForm(prev => ({ ...prev, service_finance_api_key: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div style={{
                  padding: '12px 14px',
                  backgroundColor: 'rgba(59,130,246,0.06)',
                  borderRadius: '8px',
                  border: '1px solid rgba(59,130,246,0.15)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <HelpCircle size={14} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: '1.5' }}>
                      <p style={{ margin: '0 0 4px', fontWeight: '600' }}>How Service Finance works:</p>
                      <p style={{ margin: '0 0 2px' }}>1. Apply at <strong>svcfin.com</strong></p>
                      <p style={{ margin: '0 0 2px' }}>2. Popular with HVAC, plumbing, and electrical contractors</p>
                      <p style={{ margin: 0 }}>3. Offers 0% promotional rates and same-as-cash options.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 24px',
            backgroundColor: theme.accent,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
            alignSelf: 'flex-start',
            marginTop: '4px'
          }}
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Payment Settings'}
        </button>
      </div>
    </div>
  )
}

// ─── Integrations Tab ───
function IntegrationsTab({ theme, settings, saveSetting, companyId, user, employees, setActiveTab }) {
  // ─── Google Calendar state ───
  const [gcalConnected, setGcalConnected] = useState(false)
  const [gcalLoading, setGcalLoading] = useState(true)
  const [connectedEmployees, setConnectedEmployees] = useState([])

  // ─── QuickBooks state ───
  const qbSetting = settings.find(s => s.key === 'quickbooks_config')
  const qbDefaults = {
    client_id: '', client_secret: '', environment: 'sandbox',
    connected: false, realm_id: null, connected_at: null,
    last_invoice_sync: null, last_customer_sync: null
  }
  let qbInitial = qbDefaults
  if (qbSetting) {
    try { qbInitial = { ...qbDefaults, ...JSON.parse(qbSetting.value) } } catch {}
  }
  const [qbForm, setQbForm] = useState(qbInitial)
  const [qbSaving, setQbSaving] = useState(false)
  const [qbConnecting, setQbConnecting] = useState(false)
  const [qbSyncing, setQbSyncing] = useState(null) // 'invoices' | 'customers' | null
  const [qbExpanded, setQbExpanded] = useState(false)

  // ─── Twilio state ───
  const twSetting = settings.find(s => s.key === 'twilio_config')
  const twDefaults = {
    account_sid: '', auth_token: '', from_number: '', enabled: false
  }
  let twInitial = twDefaults
  if (twSetting) {
    try { twInitial = { ...twDefaults, ...JSON.parse(twSetting.value) } } catch {}
  }
  const [twForm, setTwForm] = useState(twInitial)
  const [twSaving, setTwSaving] = useState(false)
  const [twTesting, setTwTesting] = useState(false)
  const [twTestPhone, setTwTestPhone] = useState('')
  const [twExpanded, setTwExpanded] = useState(false)

  // ─── Check Google Calendar connections ───
  useEffect(() => {
    if (!user?.id || !companyId) return
    const check = async () => {
      setGcalLoading(true)
      // Current user
      const { data: myToken } = await supabase
        .from('google_calendar_tokens')
        .select('*')
        .eq('employee_id', user.id)
        .single()
      setGcalConnected(!!myToken && myToken.status === 'active')

      // All employees with connections
      const { data: allTokens } = await supabase
        .from('google_calendar_tokens')
        .select('employee_id, status, connected_at')
        .eq('company_id', companyId)
        .eq('status', 'active')

      if (allTokens) {
        const connected = allTokens.map(t => {
          const emp = employees.find(e => e.id === t.employee_id)
          return emp ? { ...emp, connected_at: t.connected_at } : null
        }).filter(Boolean)
        setConnectedEmployees(connected)
      }
      setGcalLoading(false)
    }
    check()
  }, [user?.id, companyId, employees])

  // ─── Check for QuickBooks OAuth callback ───
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const qbCode = params.get('code')
    const qbRealmId = params.get('realmId')
    const qbState = params.get('state')
    if (qbCode && qbRealmId) {
      handleQBCallback(qbCode, qbRealmId, qbState)
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const handleQBCallback = async (code, realmId, state) => {
    setQbConnecting(true)
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-oauth', {
        body: {
          action: 'exchange_code',
          company_id: companyId,
          code,
          realm_id: realmId,
          state,
          redirect_uri: `${window.location.origin}/settings?tab=integrations`,
        }
      })
      if (error || data?.error) {
        toast.error(data?.error || 'Failed to connect QuickBooks')
      } else {
        toast.success(`Connected to QuickBooks${data.company_name ? ` (${data.company_name})` : ''}!`)
        setQbForm(prev => ({ ...prev, connected: true, realm_id: realmId, connected_at: new Date().toISOString() }))
      }
    } catch (e) {
      toast.error('QuickBooks connection failed: ' + e.message)
    }
    setQbConnecting(false)
  }

  // ─── Google Calendar handlers ───
  const handleConnectGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback?gcal_connect=true',
        scopes: 'https://www.googleapis.com/auth/calendar.events.readonly'
      }
    })
  }

  const handleDisconnectGoogle = async () => {
    await supabase.functions.invoke('google-calendar-token', {
      body: { action: 'disconnect', employee_id: user.id }
    })
    setGcalConnected(false)
    setConnectedEmployees(prev => prev.filter(e => e.id !== user.id))
    toast.success('Google Calendar disconnected')
  }

  // ─── QuickBooks handlers ───
  const handleSaveQB = async () => {
    setQbSaving(true)
    await saveSetting('quickbooks_config', qbForm)
    setQbSaving(false)
    toast.success('QuickBooks settings saved!')
  }

  const handleConnectQB = async () => {
    if (!qbForm.client_id || !qbForm.client_secret) {
      toast.error('Enter your Client ID and Client Secret first')
      return
    }
    // Save first
    await saveSetting('quickbooks_config', qbForm)

    setQbConnecting(true)
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-oauth', {
        body: {
          action: 'get_auth_url',
          company_id: companyId,
          redirect_uri: `${window.location.origin}/settings?tab=integrations`,
        }
      })
      if (error || data?.error) {
        toast.error(data?.error || 'Failed to get auth URL')
      } else if (data?.auth_url) {
        window.location.href = data.auth_url
        return
      }
    } catch (e) {
      toast.error('QuickBooks connection failed: ' + e.message)
    }
    setQbConnecting(false)
  }

  const handleDisconnectQB = async () => {
    try {
      await supabase.functions.invoke('quickbooks-oauth', {
        body: { action: 'disconnect', company_id: companyId }
      })
      setQbForm(prev => ({ ...prev, connected: false, realm_id: null, connected_at: null }))
      toast.success('QuickBooks disconnected')
    } catch (e) {
      toast.error('Failed to disconnect: ' + e.message)
    }
  }

  const handleQBSync = async (type) => {
    setQbSyncing(type)
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-oauth', {
        body: { action: `sync_${type}`, company_id: companyId }
      })
      if (error || data?.error) {
        toast.error(data?.error || `Failed to sync ${type}`)
      } else {
        toast.success(`Synced ${data.synced} ${type}${data.errors > 0 ? ` (${data.errors} errors)` : ''}`)
        if (type === 'invoices') setQbForm(prev => ({ ...prev, last_invoice_sync: new Date().toISOString() }))
        if (type === 'customers') setQbForm(prev => ({ ...prev, last_customer_sync: new Date().toISOString() }))
      }
    } catch (e) {
      toast.error(`Sync failed: ${e.message}`)
    }
    setQbSyncing(null)
  }

  // ─── Twilio handlers ───
  const handleSaveTwilio = async () => {
    setTwSaving(true)
    await saveSetting('twilio_config', twForm)
    setTwSaving(false)
    toast.success('Twilio SMS settings saved!')
  }

  const handleTestSMS = async () => {
    if (!twTestPhone) {
      toast.error('Enter a phone number to test')
      return
    }
    setTwTesting(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: {
          company_id: companyId,
          to: twTestPhone,
          message: 'This is a test SMS from JobScout. Your Twilio integration is working!'
        }
      })
      if (error || data?.error) {
        toast.error(data?.error || 'Failed to send test SMS')
      } else {
        toast.success('Test SMS sent successfully!')
      }
    } catch (e) {
      toast.error('Test failed: ' + e.message)
    }
    setTwTesting(false)
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.bg,
    color: theme.text,
    fontSize: '14px',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: '6px'
  }

  const statusBadge = (connected) => ({
    padding: '3px 10px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: '600',
    backgroundColor: connected ? 'rgba(74,124,89,0.12)' : 'rgba(194,90,90,0.1)',
    color: connected ? '#4a7c59' : '#c25a5a',
    textTransform: 'uppercase'
  })

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '20px' }}>Integrations</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '650px' }}>

        {/* ──── Payments pointer ──── */}
        <div style={{
          padding: '18px 20px',
          backgroundColor: theme.bg,
          borderRadius: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>
              Stripe, PayPal & Bank Payments
            </div>
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              Configure payment methods in the <strong>My Money</strong> tab
            </div>
          </div>
          <button
            onClick={() => setActiveTab('my_money')}
            style={{
              padding: '8px 16px',
              backgroundColor: theme.accent,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            Go to My Money
          </button>
        </div>

        {/* ──── GOOGLE CALENDAR ──── */}
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${gcalConnected ? 'rgba(74,124,89,0.3)' : theme.border}`,
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: gcalConnected ? 'rgba(74,124,89,0.12)' : theme.accentBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Calendar size={20} style={{ color: gcalConnected ? '#4a7c59' : theme.accent }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>Google Calendar</span>
                <span style={statusBadge(gcalConnected)}>
                  {gcalLoading ? '...' : gcalConnected ? 'Connected' : 'Not Connected'}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: theme.textMuted, margin: '2px 0 0' }}>
                Sync appointments and jobs with Google Calendar
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              {gcalConnected ? (
                <button
                  onClick={handleDisconnectGoogle}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 14px',
                    backgroundColor: 'transparent',
                    border: `1px solid rgba(194,90,90,0.3)`,
                    borderRadius: '8px',
                    color: '#c25a5a',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  <Unlink size={14} /> Disconnect
                </button>
              ) : (
                <button
                  onClick={handleConnectGoogle}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 14px',
                    backgroundColor: theme.accent,
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  <Calendar size={14} /> Connect
                </button>
              )}
            </div>
          </div>

          {/* Connected employees */}
          {connectedEmployees.length > 0 && (
            <div style={{ padding: '0 20px 16px', borderTop: `1px solid ${theme.border}` }}>
              <p style={{ fontSize: '12px', fontWeight: '600', color: theme.textSecondary, margin: '12px 0 8px' }}>
                Connected team members ({connectedEmployees.length})
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {connectedEmployees.map(emp => (
                  <div key={emp.id} style={{
                    padding: '6px 12px',
                    backgroundColor: 'rgba(74,124,89,0.08)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: theme.text,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <div style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      backgroundColor: '#4a7c59'
                    }} />
                    {emp.name || emp.email}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '11px', color: theme.textMuted, margin: '8px 0 0' }}>
                Each team member connects their own Google account. Calendar events appear on the Appointments page.
              </p>
            </div>
          )}
        </div>

        {/* ──── QUICKBOOKS ──── */}
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${qbForm.connected ? 'rgba(74,124,89,0.3)' : theme.border}`,
          overflow: 'hidden'
        }}>
          {/* Header */}
          <button
            onClick={() => setQbExpanded(!qbExpanded)}
            style={{
              width: '100%',
              padding: '18px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: qbForm.connected ? 'rgba(74,124,89,0.12)' : theme.accentBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <BookOpen size={20} style={{ color: qbForm.connected ? '#4a7c59' : theme.accent }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>QuickBooks Online</span>
                <span style={statusBadge(qbForm.connected)}>
                  {qbConnecting ? 'Connecting...' : qbForm.connected ? 'Connected' : 'Not Connected'}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: theme.textMuted, margin: '2px 0 0' }}>
                Sync invoices, customers, and payments with QuickBooks
              </p>
            </div>
            {qbExpanded ? <ChevronDown size={18} style={{ color: theme.textMuted }} /> : <ChevronRight size={18} style={{ color: theme.textMuted }} />}
          </button>

          {qbExpanded && (
            <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${theme.border}` }}>
              <div style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Setup instructions */}
                <div style={{
                  padding: '12px 14px',
                  backgroundColor: 'rgba(59,130,246,0.06)',
                  borderRadius: '8px',
                  border: '1px solid rgba(59,130,246,0.15)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <HelpCircle size={14} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: '1.5' }}>
                      <p style={{ margin: '0 0 4px', fontWeight: '600' }}>How to connect QuickBooks:</p>
                      <p style={{ margin: '0 0 2px' }}>1. Go to <strong>developer.intuit.com</strong> and create an app</p>
                      <p style={{ margin: '0 0 2px' }}>2. Copy your Client ID and Client Secret below</p>
                      <p style={{ margin: '0 0 2px' }}>3. Set your app's Redirect URI to: <code style={{ backgroundColor: theme.bg, padding: '1px 4px', borderRadius: '3px', fontSize: '11px' }}>{window.location.origin}/settings?tab=integrations</code></p>
                      <p style={{ margin: 0 }}>4. Click "Connect to QuickBooks" to authorize</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Environment</label>
                  <select
                    value={qbForm.environment}
                    onChange={(e) => setQbForm(prev => ({ ...prev, environment: e.target.value }))}
                    style={{ ...inputStyle, maxWidth: '200px' }}
                  >
                    <option value="sandbox">Sandbox (Test)</option>
                    <option value="production">Production</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Client ID</label>
                  <input
                    type="text"
                    value={qbForm.client_id}
                    onChange={(e) => setQbForm(prev => ({ ...prev, client_id: e.target.value }))}
                    placeholder="Your QuickBooks app Client ID"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Client Secret</label>
                  <input
                    type="password"
                    value={qbForm.client_secret}
                    onChange={(e) => setQbForm(prev => ({ ...prev, client_secret: e.target.value }))}
                    placeholder="Your QuickBooks app Client Secret"
                    style={inputStyle}
                  />
                </div>

                {/* Save & Connect buttons */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleSaveQB}
                    disabled={qbSaving}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '8px 16px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${theme.border}`,
                      borderRadius: '8px',
                      color: theme.text,
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: qbSaving ? 'not-allowed' : 'pointer',
                      opacity: qbSaving ? 0.6 : 1
                    }}
                  >
                    <Save size={14} />
                    {qbSaving ? 'Saving...' : 'Save Credentials'}
                  </button>

                  {!qbForm.connected ? (
                    <button
                      onClick={handleConnectQB}
                      disabled={qbConnecting || !qbForm.client_id || !qbForm.client_secret}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 16px',
                        backgroundColor: '#2ca01c',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: (qbConnecting || !qbForm.client_id || !qbForm.client_secret) ? 'not-allowed' : 'pointer',
                        opacity: (qbConnecting || !qbForm.client_id || !qbForm.client_secret) ? 0.6 : 1
                      }}
                    >
                      <BookOpen size={14} />
                      {qbConnecting ? 'Connecting...' : 'Connect to QuickBooks'}
                    </button>
                  ) : (
                    <button
                      onClick={handleDisconnectQB}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 14px',
                        backgroundColor: 'transparent',
                        border: `1px solid rgba(194,90,90,0.3)`,
                        borderRadius: '8px',
                        color: '#c25a5a',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      <Unlink size={14} /> Disconnect
                    </button>
                  )}
                </div>

                {/* Sync section (only when connected) */}
                {qbForm.connected && (
                  <div style={{
                    padding: '16px',
                    backgroundColor: 'rgba(74,124,89,0.06)',
                    borderRadius: '10px',
                    border: `1px solid rgba(74,124,89,0.15)`
                  }}>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: theme.text, margin: '0 0 12px' }}>Data Sync</p>

                    {qbForm.realm_id && (
                      <p style={{ fontSize: '12px', color: theme.textMuted, margin: '0 0 12px' }}>
                        Company ID: <code style={{ backgroundColor: theme.bg, padding: '1px 4px', borderRadius: '3px' }}>{qbForm.realm_id}</code>
                        {qbForm.connected_at && <span> &middot; Connected {new Date(qbForm.connected_at).toLocaleDateString()}</span>}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleQBSync('customers')}
                        disabled={!!qbSyncing}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '8px 14px',
                          backgroundColor: theme.accent,
                          border: 'none',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: qbSyncing ? 'not-allowed' : 'pointer',
                          opacity: qbSyncing ? 0.6 : 1
                        }}
                      >
                        <RefreshCw size={12} style={qbSyncing === 'customers' ? { animation: 'spin 1s linear infinite' } : {}} />
                        {qbSyncing === 'customers' ? 'Syncing...' : 'Sync Customers'}
                      </button>
                      <button
                        onClick={() => handleQBSync('invoices')}
                        disabled={!!qbSyncing}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '8px 14px',
                          backgroundColor: theme.accent,
                          border: 'none',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: qbSyncing ? 'not-allowed' : 'pointer',
                          opacity: qbSyncing ? 0.6 : 1
                        }}
                      >
                        <RefreshCw size={12} style={qbSyncing === 'invoices' ? { animation: 'spin 1s linear infinite' } : {}} />
                        {qbSyncing === 'invoices' ? 'Syncing...' : 'Sync Invoices'}
                      </button>
                    </div>

                    {(qbForm.last_customer_sync || qbForm.last_invoice_sync) && (
                      <div style={{ marginTop: '10px', fontSize: '11px', color: theme.textMuted }}>
                        {qbForm.last_customer_sync && <div>Last customer sync: {new Date(qbForm.last_customer_sync).toLocaleString()}</div>}
                        {qbForm.last_invoice_sync && <div>Last invoice sync: {new Date(qbForm.last_invoice_sync).toLocaleString()}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ──── TWILIO SMS ──── */}
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${twForm.enabled && twForm.account_sid ? 'rgba(74,124,89,0.3)' : theme.border}`,
          overflow: 'hidden'
        }}>
          {/* Header */}
          <button
            onClick={() => setTwExpanded(!twExpanded)}
            style={{
              width: '100%',
              padding: '18px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: twForm.enabled && twForm.account_sid ? 'rgba(74,124,89,0.12)' : theme.accentBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <MessageSquare size={20} style={{ color: twForm.enabled && twForm.account_sid ? '#4a7c59' : theme.accent }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>Twilio SMS</span>
                <span style={statusBadge(twForm.enabled && twForm.account_sid)}>
                  {twForm.enabled && twForm.account_sid ? 'Active' : 'Not Configured'}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: theme.textMuted, margin: '2px 0 0' }}>
                Send SMS notifications to customers and team members
              </p>
            </div>
            {twExpanded ? <ChevronDown size={18} style={{ color: theme.textMuted }} /> : <ChevronRight size={18} style={{ color: theme.textMuted }} />}
          </button>

          {twExpanded && (
            <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${theme.border}` }}>
              <div style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Enable toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={twForm.enabled}
                    onChange={() => setTwForm(prev => ({ ...prev, enabled: !prev.enabled }))}
                    style={{ width: '16px', height: '16px', accentColor: theme.accent }}
                  />
                  <span style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Enable Twilio SMS</span>
                </label>

                {twForm.enabled && (
                  <>
                    {/* Setup instructions */}
                    <div style={{
                      padding: '12px 14px',
                      backgroundColor: 'rgba(59,130,246,0.06)',
                      borderRadius: '8px',
                      border: '1px solid rgba(59,130,246,0.15)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <HelpCircle size={14} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
                        <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: '1.5' }}>
                          <p style={{ margin: '0 0 4px', fontWeight: '600' }}>How to set up Twilio:</p>
                          <p style={{ margin: '0 0 2px' }}>1. Create an account at <strong>twilio.com</strong></p>
                          <p style={{ margin: '0 0 2px' }}>2. Get your Account SID and Auth Token from the dashboard</p>
                          <p style={{ margin: '0 0 2px' }}>3. Buy a phone number (or use the trial number)</p>
                          <p style={{ margin: 0 }}>4. Enter your credentials below and test with the "Send Test" button</p>
                        </div>
                      </div>
                    </div>

                    {/* Setup checklist */}
                    <div style={{
                      padding: '14px 16px',
                      backgroundColor: 'rgba(90,99,73,0.06)',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`
                    }}>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: theme.text, margin: '0 0 10px' }}>Setup Checklist</p>
                      {[
                        { done: !!twForm.account_sid, text: 'Add your Twilio Account SID' },
                        { done: !!twForm.auth_token, text: 'Add your Twilio Auth Token' },
                        { done: !!twForm.from_number, text: 'Add your Twilio phone number' },
                      ].map((step, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0' }}>
                          {step.done
                            ? <CheckCircle size={14} style={{ color: '#4a7c59', flexShrink: 0 }} />
                            : <Circle size={14} style={{ color: theme.border, flexShrink: 0 }} />
                          }
                          <span style={{ fontSize: '12px', color: step.done ? theme.text : theme.textMuted }}>{step.text}</span>
                        </div>
                      ))}
                    </div>

                    <div>
                      <label style={labelStyle}>Account SID</label>
                      <input
                        type="text"
                        value={twForm.account_sid}
                        onChange={(e) => setTwForm(prev => ({ ...prev, account_sid: e.target.value }))}
                        placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Auth Token</label>
                      <input
                        type="password"
                        value={twForm.auth_token}
                        onChange={(e) => setTwForm(prev => ({ ...prev, auth_token: e.target.value }))}
                        placeholder="Your Twilio Auth Token"
                        style={inputStyle}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>From Phone Number</label>
                      <input
                        type="tel"
                        value={twForm.from_number}
                        onChange={(e) => setTwForm(prev => ({ ...prev, from_number: e.target.value }))}
                        placeholder="+1XXXXXXXXXX"
                        style={inputStyle}
                      />
                      <p style={{ fontSize: '11px', color: theme.textMuted, margin: '4px 0 0' }}>
                        Your Twilio phone number in E.164 format (e.g. +15551234567)
                      </p>
                    </div>

                    {/* Save button */}
                    <button
                      onClick={handleSaveTwilio}
                      disabled={twSaving}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '10px 20px',
                        backgroundColor: theme.accent,
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: twSaving ? 'not-allowed' : 'pointer',
                        opacity: twSaving ? 0.6 : 1,
                        alignSelf: 'flex-start'
                      }}
                    >
                      <Save size={14} />
                      {twSaving ? 'Saving...' : 'Save SMS Settings'}
                    </button>

                    {/* Test SMS section */}
                    {twForm.account_sid && twForm.auth_token && twForm.from_number && (
                      <div style={{
                        padding: '16px',
                        backgroundColor: 'rgba(74,124,89,0.06)',
                        borderRadius: '10px',
                        border: `1px solid rgba(74,124,89,0.15)`
                      }}>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: theme.text, margin: '0 0 10px' }}>Send Test SMS</p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="tel"
                            value={twTestPhone}
                            onChange={(e) => setTwTestPhone(e.target.value)}
                            placeholder="(555) 123-4567"
                            style={{ ...inputStyle, flex: 1 }}
                          />
                          <button
                            onClick={handleTestSMS}
                            disabled={twTesting || !twTestPhone}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '6px',
                              padding: '8px 16px',
                              backgroundColor: theme.accent,
                              border: 'none',
                              borderRadius: '8px',
                              color: '#fff',
                              fontSize: '13px',
                              fontWeight: '500',
                              cursor: (twTesting || !twTestPhone) ? 'not-allowed' : 'pointer',
                              opacity: (twTesting || !twTestPhone) ? 0.6 : 1,
                              whiteSpace: 'nowrap',
                              flexShrink: 0
                            }}
                          >
                            <Send size={14} />
                            {twTesting ? 'Sending...' : 'Send Test'}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
