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
  AlertTriangle
} from 'lucide-react'
import { seedSampleData, clearAllData } from '../lib/seedData'
import { toast } from '../lib/toast'

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
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'integrations', label: 'Integrations', icon: Link2 }
]

const jobStatuses = ['Scheduled', 'In Progress', 'Completed', 'Cancelled', 'On Hold']

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

  const isAdmin = user?.user_role === 'Admin' || user?.user_role === 'Owner'
  const tabs = isAdmin
    ? [...baseTabs, { id: 'developer_tools', label: 'Developer Tools', icon: Code }]
    : baseTabs

  const [activeTab, setActiveTab] = useState('company')
  const [seeding, setSeeding] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [companyForm, setCompanyForm] = useState({
    company_name: '',
    owner_email: '',
    phone: '',
    address: '',
    logo_url: ''
  })
  const [businessUnits, setBusinessUnits] = useState([])
  const [leadSources, setLeadSources] = useState([])
  const [serviceTypes, setServiceTypes] = useState([])
  const [newItem, setNewItem] = useState('')
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
        logo_url: company.logo_url || ''
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
    const { data, error } = await supabase
      .from('companies')
      .update(companyForm)
      .eq('id', companyId)
      .select()
      .single()

    if (!error && data) {
      setCompany(data)
      toast.success('Company profile saved!')
    } else {
      toast.error('Error saving: ' + error?.message)
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

  const addItem = (type) => {
    if (!newItem.trim()) return

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

    const updated = [...items, newItem.trim()]
    setter(updated)
    saveSetting(key, updated)
    setNewItem('')
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

  const ListEditor = ({ type, items, title }) => (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>{title}</h3>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Add new item..."
          onKeyPress={(e) => e.key === 'Enter' && addItem(type)}
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
          onClick={() => addItem(type)}
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
              onClick={() => removeItem(type, index)}
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

  const renderContent = () => {
    switch (activeTab) {
      case 'company':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '20px' }}>Company Profile</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>
                  Company Name
                </label>
                <input
                  type="text"
                  value={companyForm.company_name}
                  onChange={(e) => setCompanyForm({ ...companyForm, company_name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>
                  Owner Email
                </label>
                <input
                  type="email"
                  value={companyForm.owner_email}
                  onChange={(e) => setCompanyForm({ ...companyForm, owner_email: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>
                  Phone
                </label>
                <input
                  type="tel"
                  value={companyForm.phone}
                  onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>
                  Address
                </label>
                <textarea
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>
                  Logo URL
                </label>
                <input
                  type="url"
                  value={companyForm.logo_url}
                  onChange={(e) => setCompanyForm({ ...companyForm, logo_url: e.target.value })}
                  placeholder="https://..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px'
                  }}
                />
              </div>

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
                  cursor: 'pointer',
                  opacity: saving ? 0.7 : 1,
                  marginTop: '8px'
                }}
              >
                <Save size={18} /> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )

      case 'business_units':
        return <ListEditor type="business_units" items={businessUnits} title="Business Units" />

      case 'lead_sources':
        return <ListEditor type="lead_sources" items={leadSources} title="Lead Sources" />

      case 'service_types':
        return <ListEditor type="service_types" items={serviceTypes} title="Service Types" />

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

      case 'integrations':
        return (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '20px' }}>Integrations</h3>

            <div style={{ display: 'grid', gap: '16px' }}>
              {[
                { name: 'Google Calendar', desc: 'Sync appointments and jobs with Google Calendar', status: 'coming_soon' },
                { name: 'QuickBooks', desc: 'Sync invoices and payments with QuickBooks Online', status: 'coming_soon' },
                { name: 'Twilio SMS', desc: 'Send SMS notifications to customers and team', status: 'coming_soon' },
                { name: 'Stripe', desc: 'Accept online payments from customers', status: 'coming_soon' }
              ].map((integration) => (
                <div
                  key={integration.name}
                  style={{
                    padding: '20px',
                    backgroundColor: theme.bg,
                    borderRadius: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>
                      {integration.name}
                    </div>
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>
                      {integration.desc}
                    </div>
                  </div>
                  <span style={{
                    padding: '6px 12px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '600',
                    backgroundColor: 'rgba(90,155,213,0.15)',
                    color: '#5a9bd5',
                    textTransform: 'uppercase'
                  }}>
                    Coming Soon
                  </span>
                </div>
              ))}
            </div>
          </div>
        )

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
    <div style={{ padding: '24px' }}>
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
