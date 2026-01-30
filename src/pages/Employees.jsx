import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  Plus, Pencil, X, User, Phone, Mail, ChevronDown, ChevronUp,
  DollarSign, Clock, Calendar, Briefcase, Settings
} from 'lucide-react'

// Role colors (OG DiX style)
const roleColors = {
  'Admin': '#D4AF37',
  'Owner': '#D4AF37',
  'CEO': '#D4AF37',
  'Manager': '#D4AF37',
  'Sales': '#22c55e',
  'Setter': '#3b82f6',
  'Field Tech': '#a855f7',
  'Installer': '#a855f7',
  'Tech': '#a855f7',
  'Office': '#f97316'
}

const getRoleColor = (role) => roleColors[role] || '#6b7280'

const PAY_TYPES = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'salary', label: 'Salary' },
  { value: 'commission', label: 'Commission Only' },
  { value: 'hybrid', label: 'Salary + Commission' }
]

const ROLES = ['Field Tech', 'Installer', 'Sales', 'Setter', 'Office', 'Manager', 'Admin', 'Owner']
const USER_ROLES = ['User', 'Admin', 'Owner']

const emptyEmployee = {
  name: '',
  email: '',
  phone: '',
  role: 'Field Tech',
  user_role: 'User',
  business_unit: '',
  employee_id: '',
  active: true,
  pay_type: 'hourly',
  hourly_rate: 0,
  annual_salary: 0,
  commission_goods_rate: 0,
  commission_goods_type: 'percent',
  commission_services_rate: 0,
  commission_services_type: 'percent',
  commission_software_rate: 0,
  commission_software_type: 'percent',
  commission_leads_rate: 0,
  commission_leads_type: 'flat',
  commission_setter_rate: 25,
  commission_setter_type: 'flat',
  pto_days_per_year: 10,
  pto_accrued: 0,
  pto_used: 0
}

export default function Employees() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const fetchEmployees = useStore((state) => state.fetchEmployees)

  const themeContext = useTheme()
  const theme = themeContext?.theme || {
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

  const [employees, setEmployees] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [formData, setFormData] = useState(emptyEmployee)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showInactive, setShowInactive] = useState(false)
  const [expandedCard, setExpandedCard] = useState(null)
  const [activeTab, setActiveTab] = useState('pay') // pay, commission, pto

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    loadEmployees()
  }, [companyId, navigate])

  const loadEmployees = async () => {
    if (!companyId) return
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    setEmployees(data || [])
  }

  const displayedEmployees = showInactive
    ? employees
    : employees.filter(e => e.active)

  const openAddModal = () => {
    setEditingEmployee(null)
    setFormData(emptyEmployee)
    setError(null)
    setActiveTab('pay')
    setShowModal(true)
  }

  const openEditModal = (employee) => {
    setEditingEmployee(employee)
    setFormData({
      name: employee.name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      role: employee.role || 'Field Tech',
      user_role: employee.user_role || 'User',
      business_unit: employee.business_unit || '',
      employee_id: employee.employee_id || '',
      active: employee.active !== false,
      pay_type: employee.pay_type || 'hourly',
      hourly_rate: employee.hourly_rate || 0,
      annual_salary: employee.annual_salary || 0,
      commission_goods_rate: employee.commission_goods_rate || 0,
      commission_goods_type: employee.commission_goods_type || 'percent',
      commission_services_rate: employee.commission_services_rate || 0,
      commission_services_type: employee.commission_services_type || 'percent',
      commission_software_rate: employee.commission_software_rate || 0,
      commission_software_type: employee.commission_software_type || 'percent',
      commission_leads_rate: employee.commission_leads_rate || 0,
      commission_leads_type: employee.commission_leads_type || 'flat',
      commission_setter_rate: employee.commission_setter_rate || 25,
      commission_setter_type: employee.commission_setter_type || 'flat',
      pto_days_per_year: employee.pto_days_per_year || 10,
      pto_accrued: employee.pto_accrued || 0,
      pto_used: employee.pto_used || 0
    })
    setError(null)
    setActiveTab('pay')
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingEmployee(null)
    setFormData(emptyEmployee)
    setError(null)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      ...formData,
      company_id: companyId,
      hourly_rate: parseFloat(formData.hourly_rate) || 0,
      annual_salary: parseFloat(formData.annual_salary) || 0,
      commission_goods_rate: parseFloat(formData.commission_goods_rate) || 0,
      commission_services_rate: parseFloat(formData.commission_services_rate) || 0,
      commission_software_rate: parseFloat(formData.commission_software_rate) || 0,
      commission_leads_rate: parseFloat(formData.commission_leads_rate) || 0,
      commission_setter_rate: parseFloat(formData.commission_setter_rate) || 0,
      pto_days_per_year: parseFloat(formData.pto_days_per_year) || 0,
      pto_accrued: parseFloat(formData.pto_accrued) || 0,
      pto_used: parseFloat(formData.pto_used) || 0,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingEmployee) {
      result = await supabase
        .from('employees')
        .update(payload)
        .eq('id', editingEmployee.id)
    } else {
      result = await supabase
        .from('employees')
        .insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchEmployees()
    await loadEmployees()
    closeModal()
    setLoading(false)
  }

  const toggleActive = async (employee) => {
    await supabase
      .from('employees')
      .update({ active: !employee.active, updated_at: new Date().toISOString() })
      .eq('id', employee.id)

    await fetchEmployees()
    await loadEmployees()
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    color: theme.text,
    fontSize: '14px',
    outline: 'none'
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary
  }

  // Commission rate input component
  const RateInput = ({ label, rateName, typeName }) => (
    <div style={{ marginBottom: '12px' }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="number"
          step="0.01"
          min="0"
          name={rateName}
          value={formData[rateName]}
          onChange={handleChange}
          style={{ ...inputStyle, flex: 1 }}
        />
        <div style={{ display: 'flex', border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, [typeName]: 'flat' }))}
            style={{
              padding: '8px 12px',
              backgroundColor: formData[typeName] === 'flat' ? theme.accent : 'transparent',
              color: formData[typeName] === 'flat' ? '#fff' : theme.textMuted,
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            $
          </button>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, [typeName]: 'percent' }))}
            style={{
              padding: '8px 12px',
              backgroundColor: formData[typeName] === 'percent' ? theme.accent : 'transparent',
              color: formData[typeName] === 'percent' ? '#fff' : theme.textMuted,
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            %
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>Team</h1>
          <p style={{ fontSize: '14px', color: theme.textMuted, marginTop: '4px' }}>
            {displayedEmployees.length} {displayedEmployees.length === 1 ? 'employee' : 'employees'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            color: theme.textSecondary,
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              style={{ accentColor: theme.accent }}
            />
            Show inactive
          </label>
          <button
            onClick={openAddModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              backgroundColor: theme.accent,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            <Plus size={20} />
            Add Employee
          </button>
        </div>
      </div>

      {/* Employee Grid */}
      {displayedEmployees.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px',
          backgroundColor: theme.bgCard,
          borderRadius: '16px',
          border: `1px solid ${theme.border}`
        }}>
          <User size={48} style={{ color: theme.textMuted, marginBottom: '16px' }} />
          <p style={{ color: theme.textSecondary }}>
            No employees yet. Add your first team member.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px'
        }}>
          {displayedEmployees.map((employee) => {
            const roleColor = getRoleColor(employee.role)
            const isExpanded = expandedCard === employee.id

            return (
              <div
                key={employee.id}
                style={{
                  backgroundColor: theme.bgCard,
                  borderRadius: '16px',
                  border: `1px solid ${theme.border}`,
                  padding: '24px',
                  opacity: employee.active ? 1 : 0.6,
                  transition: 'all 0.2s'
                }}
              >
                {/* Card Header - Centered */}
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  {/* Avatar */}
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '16px',
                    backgroundColor: `${roleColor}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                    fontSize: '24px',
                    fontWeight: '600',
                    color: roleColor
                  }}>
                    {employee.headshot_url ? (
                      <img
                        src={employee.headshot_url}
                        alt=""
                        style={{ width: '64px', height: '64px', borderRadius: '16px', objectFit: 'cover' }}
                      />
                    ) : (
                      employee.name?.charAt(0)?.toUpperCase() || '?'
                    )}
                  </div>

                  {/* Name */}
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: theme.text,
                    marginBottom: '4px'
                  }}>
                    {employee.name}
                  </h3>

                  {/* Role */}
                  <p style={{
                    fontSize: '14px',
                    color: roleColor,
                    fontWeight: '500',
                    marginBottom: '8px'
                  }}>
                    {employee.role}
                  </p>

                  {/* Status Badge */}
                  <span style={{
                    display: 'inline-block',
                    fontSize: '11px',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    backgroundColor: employee.active ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)',
                    color: employee.active ? '#16a34a' : '#6b7280'
                  }}>
                    {employee.active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Contact Info */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  paddingTop: '16px',
                  borderTop: `1px solid ${theme.border}`
                }}>
                  {employee.email && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      color: theme.textSecondary
                    }}>
                      <Mail size={14} style={{ color: theme.textMuted }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{employee.email}</span>
                    </div>
                  )}
                  {employee.phone && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      color: theme.textSecondary
                    }}>
                      <Phone size={14} style={{ color: theme.textMuted }} />
                      <span>{employee.phone}</span>
                    </div>
                  )}
                </div>

                {/* Pay Info Summary */}
                {employee.pay_type && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px',
                    backgroundColor: theme.bg,
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: theme.textSecondary
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <DollarSign size={12} />
                      <span>
                        {employee.pay_type === 'hourly' && `$${employee.hourly_rate || 0}/hr`}
                        {employee.pay_type === 'salary' && `$${(employee.annual_salary || 0).toLocaleString()}/yr`}
                        {employee.pay_type === 'commission' && 'Commission'}
                        {employee.pay_type === 'hybrid' && `$${(employee.annual_salary || 0).toLocaleString()}/yr + Commission`}
                      </span>
                    </div>
                    {employee.pto_days_per_year > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <Calendar size={12} />
                        <span>
                          PTO: {employee.pto_accrued || 0} / {employee.pto_days_per_year} days
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  marginTop: '16px'
                }}>
                  <button
                    onClick={() => openEditModal(employee)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '10px',
                      backgroundColor: theme.accentBg,
                      border: 'none',
                      borderRadius: '8px',
                      color: theme.accent,
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    <Settings size={14} />
                    Manage
                  </button>
                  <button
                    onClick={() => toggleActive(employee)}
                    style={{
                      padding: '10px 14px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${theme.border}`,
                      borderRadius: '8px',
                      color: theme.textMuted,
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    {employee.active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <>
          <div
            onClick={closeModal}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.4)',
              zIndex: 50
            }}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            border: `1px solid ${theme.border}`,
            width: '100%',
            maxWidth: '560px',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 51
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`,
              flexShrink: 0
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                {editingEmployee ? 'Edit Employee' : 'Add Employee'}
              </h2>
              <button
                onClick={closeModal}
                style={{
                  padding: '8px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: theme.textMuted,
                  cursor: 'pointer'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Tab Navigation */}
            <div style={{
              display: 'flex',
              borderBottom: `1px solid ${theme.border}`,
              padding: '0 20px',
              flexShrink: 0
            }}>
              {[
                { id: 'info', label: 'Info', icon: User },
                { id: 'pay', label: 'Pay', icon: DollarSign },
                { id: 'commission', label: 'Commission', icon: Briefcase },
                { id: 'pto', label: 'PTO', icon: Calendar }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '12px 16px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: activeTab === tab.id ? `2px solid ${theme.accent}` : '2px solid transparent',
                    color: activeTab === tab.id ? theme.accent : theme.textMuted,
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    marginBottom: '-1px'
                  }}
                >
                  <tab.icon size={14} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto' }}>
              <div style={{ padding: '20px' }}>
                {error && (
                  <div style={{
                    marginBottom: '16px',
                    padding: '12px',
                    backgroundColor: 'rgba(220,38,38,0.08)',
                    border: '1px solid rgba(220,38,38,0.2)',
                    borderRadius: '8px',
                    color: '#b91c1c',
                    fontSize: '14px'
                  }}>
                    {error}
                  </div>
                )}

                {/* Info Tab */}
                {activeTab === 'info' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <label style={labelStyle}>Name *</label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        style={inputStyle}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label style={labelStyle}>Email</label>
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Phone</label>
                        <input
                          type="tel"
                          name="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label style={labelStyle}>Role</label>
                        <select
                          name="role"
                          value={formData.role}
                          onChange={handleChange}
                          style={inputStyle}
                        >
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>User Role</label>
                        <select
                          name="user_role"
                          value={formData.user_role}
                          onChange={handleChange}
                          style={inputStyle}
                        >
                          {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label style={labelStyle}>Business Unit</label>
                        <input
                          type="text"
                          name="business_unit"
                          value={formData.business_unit}
                          onChange={handleChange}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Employee ID</label>
                        <input
                          type="text"
                          name="employee_id"
                          value={formData.employee_id}
                          onChange={handleChange}
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    {editingEmployee && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          name="active"
                          id="active"
                          checked={formData.active}
                          onChange={handleChange}
                          style={{ accentColor: theme.accent }}
                        />
                        <label htmlFor="active" style={{ fontSize: '14px', color: theme.text }}>
                          Active
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {/* Pay Tab */}
                {activeTab === 'pay' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <label style={labelStyle}>Pay Type</label>
                      <select
                        name="pay_type"
                        value={formData.pay_type}
                        onChange={handleChange}
                        style={inputStyle}
                      >
                        {PAY_TYPES.map(pt => (
                          <option key={pt.value} value={pt.value}>{pt.label}</option>
                        ))}
                      </select>
                    </div>

                    {formData.pay_type === 'hourly' && (
                      <div>
                        <label style={labelStyle}>Hourly Rate ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          name="hourly_rate"
                          value={formData.hourly_rate}
                          onChange={handleChange}
                          style={inputStyle}
                        />
                      </div>
                    )}

                    {(formData.pay_type === 'salary' || formData.pay_type === 'hybrid') && (
                      <div>
                        <label style={labelStyle}>Annual Salary ($)</label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          name="annual_salary"
                          value={formData.annual_salary}
                          onChange={handleChange}
                          style={inputStyle}
                        />
                      </div>
                    )}

                    {(formData.pay_type === 'commission' || formData.pay_type === 'hybrid') && (
                      <div style={{
                        padding: '16px',
                        backgroundColor: theme.bg,
                        borderRadius: '8px'
                      }}>
                        <p style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '8px' }}>
                          Commission rates are configured in the Commission tab.
                        </p>
                        <button
                          type="button"
                          onClick={() => setActiveTab('commission')}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: theme.accent,
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '13px',
                            cursor: 'pointer'
                          }}
                        >
                          Configure Commission
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Commission Tab */}
                {activeTab === 'commission' && (
                  <div>
                    <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '16px' }}>
                      Set commission rates for different categories. Use $ for flat amounts or % for percentage.
                    </p>

                    <RateInput
                      label="Goods (Products)"
                      rateName="commission_goods_rate"
                      typeName="commission_goods_type"
                    />

                    <RateInput
                      label="Services (Labor)"
                      rateName="commission_services_rate"
                      typeName="commission_services_type"
                    />

                    <RateInput
                      label="Software/Subscriptions"
                      rateName="commission_software_rate"
                      typeName="commission_software_type"
                    />

                    <div style={{
                      borderTop: `1px solid ${theme.border}`,
                      paddingTop: '16px',
                      marginTop: '8px'
                    }}>
                      <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px', fontWeight: '500' }}>
                        LEAD GENERATION
                      </p>

                      <RateInput
                        label="Lead Generation (per lead)"
                        rateName="commission_leads_rate"
                        typeName="commission_leads_type"
                      />

                      <RateInput
                        label="Lead Setter (per appointment)"
                        rateName="commission_setter_rate"
                        typeName="commission_setter_type"
                      />
                    </div>
                  </div>
                )}

                {/* PTO Tab */}
                {activeTab === 'pto' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <label style={labelStyle}>PTO Days Per Year</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        name="pto_days_per_year"
                        value={formData.pto_days_per_year}
                        onChange={handleChange}
                        style={inputStyle}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label style={labelStyle}>Accrued Days</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          name="pto_accrued"
                          value={formData.pto_accrued}
                          onChange={handleChange}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Used Days</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          name="pto_used"
                          value={formData.pto_used}
                          onChange={handleChange}
                          style={inputStyle}
                        />
                      </div>
                    </div>

                    <div style={{
                      padding: '16px',
                      backgroundColor: theme.accentBg,
                      borderRadius: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '14px', color: theme.textSecondary }}>Available PTO:</span>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: theme.accent }}>
                          {(parseFloat(formData.pto_accrued) - parseFloat(formData.pto_used)).toFixed(1)} days
                        </span>
                      </div>
                      <div style={{
                        height: '8px',
                        backgroundColor: theme.bg,
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.min(100, (parseFloat(formData.pto_accrued) / parseFloat(formData.pto_days_per_year || 1)) * 100)}%`,
                          backgroundColor: theme.accent,
                          borderRadius: '4px'
                        }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Form Actions */}
              <div style={{
                display: 'flex',
                gap: '12px',
                padding: '20px',
                borderTop: `1px solid ${theme.border}`,
                flexShrink: 0
              }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: 'transparent',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    color: theme.textSecondary,
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: theme.accent,
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1
                  }}
                >
                  {loading ? 'Saving...' : (editingEmployee ? 'Update' : 'Add Employee')}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
