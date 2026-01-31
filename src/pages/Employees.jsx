import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  Plus, Pencil, X, User, Phone, Mail, Eye,
  DollarSign, Clock, Calendar, Briefcase, Lock,
  Camera, FileText, Upload
} from 'lucide-react'

// Role colors (OG DiX style)
const roleColors = {
  'Admin': '#D4AF37',
  'Owner': '#D4AF37',
  'CEO': '#D4AF37',
  'Manager': '#f59e0b',
  'Sales': '#22c55e',
  'Salesperson': '#22c55e',
  'Setter': '#3b82f6',
  'Lead Setter': '#3b82f6',
  'Field Tech': '#a855f7',
  'Installer': '#a855f7',
  'Tech': '#a855f7',
  'Technician': '#a855f7',
  'Office': '#f97316',
  'Finance': '#06b6d4'
}

const getRoleColor = (role) => roleColors[role] || '#6b7280'

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
  headshot_url: '',
  tax_classification: 'W2', // W2 or 1099
  // Multi-select pay types
  is_hourly: false,
  is_salary: false,
  is_commission: false,
  hourly_rate: 0,
  annual_salary: 0,
  // Commission rates
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
  // PTO
  pto_days_per_year: 10,
  pto_accrued: 0,
  pto_used: 0
}

export default function Employees() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const currentUser = useStore((state) => state.user)
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
  const [viewingEmployee, setViewingEmployee] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState(emptyEmployee)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showInactive, setShowInactive] = useState(false)

  // Check if current user is admin
  const isAdmin = currentUser?.user_role === 'Admin' || currentUser?.user_role === 'Owner' ||
    currentUser?.role === 'Admin' || currentUser?.role === 'Owner'

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

  // Check if user can edit this employee
  const canEdit = (employee) => {
    if (isAdmin) return true
    // User can only edit their own record
    return currentUser?.email === employee?.email || currentUser?.id === employee?.id
  }

  // Check if user can view sensitive info (pay, commission, PTO)
  const canViewSensitiveInfo = (employee) => {
    if (isAdmin) return true
    return currentUser?.email === employee?.email || currentUser?.id === employee?.id
  }

  const openAddModal = () => {
    setViewingEmployee(null)
    setFormData(emptyEmployee)
    setIsEditing(true)
    setError(null)
    setShowModal(true)
  }

  const openViewModal = (employee) => {
    setViewingEmployee(employee)
    setFormData({
      name: employee.name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      role: employee.role || 'Field Tech',
      user_role: employee.user_role || 'User',
      business_unit: employee.business_unit || '',
      employee_id: employee.employee_id || '',
      active: employee.active !== false,
      headshot_url: employee.headshot_url || '',
      tax_classification: employee.tax_classification || 'W2',
      // Parse pay types from pay_type field or individual flags
      is_hourly: employee.is_hourly || employee.pay_type === 'hourly' || employee.pay_type === 'hybrid',
      is_salary: employee.is_salary || employee.pay_type === 'salary' || employee.pay_type === 'hybrid',
      is_commission: employee.is_commission || employee.pay_type === 'commission' || employee.pay_type === 'hybrid',
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
    setIsEditing(false)
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setViewingEmployee(null)
    setIsEditing(false)
    setFormData(emptyEmployee)
    setError(null)
  }

  const [uploading, setUploading] = useState(false)

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${companyId}/${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('employee-photos')
        .upload(fileName, file)

      if (uploadError) {
        // If bucket doesn't exist, try public bucket
        const { error: publicError } = await supabase.storage
          .from('public')
          .upload(`employee-photos/${fileName}`, file)

        if (publicError) {
          console.error('Upload error:', publicError)
          setError('Failed to upload image')
          setUploading(false)
          return
        }

        const { data: { publicUrl } } = supabase.storage
          .from('public')
          .getPublicUrl(`employee-photos/${fileName}`)

        setFormData(prev => ({ ...prev, headshot_url: publicUrl }))
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('employee-photos')
          .getPublicUrl(fileName)

        setFormData(prev => ({ ...prev, headshot_url: publicUrl }))
      }
    } catch (err) {
      console.error('Image upload failed:', err)
      setError('Failed to upload image')
    }
    setUploading(false)
  }

  const togglePayType = (payType) => {
    if (!isEditing) return
    setFormData(prev => ({ ...prev, [payType]: !prev[payType] }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isEditing) return

    setLoading(true)
    setError(null)

    // Build pay_type string for backwards compatibility
    let payType = 'hourly'
    if (formData.is_salary && formData.is_commission) payType = 'hybrid'
    else if (formData.is_salary) payType = 'salary'
    else if (formData.is_commission) payType = 'commission'
    else if (formData.is_hourly) payType = 'hourly'

    const payload = {
      company_id: companyId,
      name: formData.name,
      email: formData.email || null,
      phone: formData.phone || null,
      role: formData.role,
      user_role: formData.user_role,
      business_unit: formData.business_unit || null,
      employee_id: formData.employee_id || null,
      active: formData.active,
      headshot_url: formData.headshot_url || null,
      tax_classification: formData.tax_classification || 'W2',
      pay_type: payType,
      is_hourly: formData.is_hourly,
      is_salary: formData.is_salary,
      is_commission: formData.is_commission,
      hourly_rate: parseFloat(formData.hourly_rate) || 0,
      annual_salary: parseFloat(formData.annual_salary) || 0,
      commission_goods_rate: parseFloat(formData.commission_goods_rate) || 0,
      commission_goods_type: formData.commission_goods_type,
      commission_services_rate: parseFloat(formData.commission_services_rate) || 0,
      commission_services_type: formData.commission_services_type,
      commission_software_rate: parseFloat(formData.commission_software_rate) || 0,
      commission_software_type: formData.commission_software_type,
      commission_leads_rate: parseFloat(formData.commission_leads_rate) || 0,
      commission_leads_type: formData.commission_leads_type,
      commission_setter_rate: parseFloat(formData.commission_setter_rate) || 0,
      commission_setter_type: formData.commission_setter_type,
      pto_days_per_year: parseFloat(formData.pto_days_per_year) || 0,
      pto_accrued: parseFloat(formData.pto_accrued) || 0,
      pto_used: parseFloat(formData.pto_used) || 0,
      updated_at: new Date().toISOString()
    }

    let result
    if (viewingEmployee) {
      result = await supabase
        .from('employees')
        .update(payload)
        .eq('id', viewingEmployee.id)
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
    if (!canEdit(employee)) return

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

  const inputStyleDisabled = {
    ...inputStyle,
    backgroundColor: theme.bgCard,
    color: theme.textMuted,
    cursor: 'not-allowed'
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary
  }

  const sectionHeaderStyle = {
    fontSize: '12px',
    fontWeight: '600',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '12px',
    marginTop: '20px',
    paddingBottom: '8px',
    borderBottom: `1px solid ${theme.border}`
  }

  // Commission rate input component
  const RateInput = ({ label, rateName, typeName, disabled }) => (
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
          disabled={disabled}
          style={{ ...(disabled ? inputStyleDisabled : inputStyle), flex: 1 }}
        />
        <div style={{ display: 'flex', border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => !disabled && setFormData(prev => ({ ...prev, [typeName]: 'flat' }))}
            disabled={disabled}
            style={{
              padding: '8px 12px',
              backgroundColor: formData[typeName] === 'flat' ? theme.accent : 'transparent',
              color: formData[typeName] === 'flat' ? '#fff' : theme.textMuted,
              border: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              opacity: disabled ? 0.6 : 1
            }}
          >
            $
          </button>
          <button
            type="button"
            onClick={() => !disabled && setFormData(prev => ({ ...prev, [typeName]: 'percent' }))}
            disabled={disabled}
            style={{
              padding: '8px 12px',
              backgroundColor: formData[typeName] === 'percent' ? theme.accent : 'transparent',
              color: formData[typeName] === 'percent' ? '#fff' : theme.textMuted,
              border: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              opacity: disabled ? 0.6 : 1
            }}
          >
            %
          </button>
        </div>
      </div>
    </div>
  )

  // Pay type toggle button
  const PayTypeToggle = ({ label, field, icon: Icon, disabled }) => {
    const isActive = formData[field]
    return (
      <button
        type="button"
        onClick={() => togglePayType(field)}
        disabled={disabled}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          padding: '16px 12px',
          backgroundColor: isActive ? theme.accentBg : theme.bg,
          border: `2px solid ${isActive ? theme.accent : theme.border}`,
          borderRadius: '12px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
          opacity: disabled ? 0.7 : 1
        }}
      >
        <Icon size={24} style={{ color: isActive ? theme.accent : theme.textMuted }} />
        <span style={{
          fontSize: '13px',
          fontWeight: isActive ? '600' : '400',
          color: isActive ? theme.accent : theme.textSecondary
        }}>
          {label}
        </span>
        {isActive && (
          <span style={{
            fontSize: '10px',
            padding: '2px 8px',
            backgroundColor: theme.accent,
            color: '#fff',
            borderRadius: '10px'
          }}>
            Active
          </span>
        )}
      </button>
    )
  }

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
          {isAdmin && (
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
          )}
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
            No employees yet. {isAdmin && 'Add your first team member.'}
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
            const userCanView = canViewSensitiveInfo(employee)
            const userCanEdit = canEdit(employee)

            return (
              <div
                key={employee.id}
                onClick={() => openViewModal(employee)}
                style={{
                  backgroundColor: theme.bgCard,
                  borderRadius: '16px',
                  border: `1px solid ${theme.border}`,
                  padding: '24px',
                  opacity: employee.active ? 1 : 0.6,
                  cursor: 'pointer',
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

                  {/* Status & Tax Classification Badges */}
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '11px',
                      padding: '3px 10px',
                      borderRadius: '20px',
                      backgroundColor: employee.active ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)',
                      color: employee.active ? '#16a34a' : '#6b7280'
                    }}>
                      {employee.active ? 'Active' : 'Inactive'}
                    </span>
                    {employee.tax_classification && (
                      <span style={{
                        fontSize: '11px',
                        padding: '3px 10px',
                        borderRadius: '20px',
                        backgroundColor: employee.tax_classification === 'W2' ? 'rgba(59,130,246,0.1)' : 'rgba(249,115,22,0.1)',
                        color: employee.tax_classification === 'W2' ? '#3b82f6' : '#f97316'
                      }}>
                        {employee.tax_classification}
                      </span>
                    )}
                  </div>
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

                {/* Pay Info Summary - Only show if can view */}
                {userCanView && (employee.is_hourly || employee.is_salary || employee.is_commission || employee.pay_type) && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px',
                    backgroundColor: theme.bg,
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: theme.textSecondary
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <DollarSign size={12} />
                      {(employee.is_hourly || employee.pay_type === 'hourly') && (
                        <span style={{ padding: '2px 6px', backgroundColor: '#22c55e20', color: '#22c55e', borderRadius: '4px', fontSize: '11px' }}>
                          ${employee.hourly_rate}/hr
                        </span>
                      )}
                      {(employee.is_salary || employee.pay_type === 'salary' || employee.pay_type === 'hybrid') && (
                        <span style={{ padding: '2px 6px', backgroundColor: '#3b82f620', color: '#3b82f6', borderRadius: '4px', fontSize: '11px' }}>
                          ${(employee.annual_salary || 0).toLocaleString()}/yr
                        </span>
                      )}
                      {(employee.is_commission || employee.pay_type === 'commission' || employee.pay_type === 'hybrid') && (
                        <span style={{ padding: '2px 6px', backgroundColor: '#f9731620', color: '#f97316', borderRadius: '4px', fontSize: '11px' }}>
                          Commission
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Locked indicator if can't view sensitive info */}
                {!userCanView && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px',
                    backgroundColor: theme.bg,
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <Lock size={12} />
                    <span>Details restricted</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Employee Detail Modal */}
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
            maxWidth: '640px',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {viewingEmployee && (
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    backgroundColor: `${getRoleColor(formData.role)}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    fontWeight: '600',
                    color: getRoleColor(formData.role)
                  }}>
                    {formData.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                    {viewingEmployee ? formData.name : 'Add Employee'}
                  </h2>
                  {viewingEmployee && (
                    <p style={{ fontSize: '13px', color: getRoleColor(formData.role), fontWeight: '500' }}>
                      {formData.role}
                    </p>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {viewingEmployee && canEdit(viewingEmployee) && !isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      backgroundColor: theme.accentBg,
                      border: 'none',
                      borderRadius: '8px',
                      color: theme.accent,
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                )}
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
            </div>

            {/* Form Content */}
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

                {/* ===== PHOTO & TAX CLASSIFICATION ===== */}
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '24px',
                  marginBottom: '24px',
                  paddingBottom: '24px',
                  borderBottom: `1px solid ${theme.border}`
                }}>
                  {/* Photo Upload */}
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      width: '100px',
                      height: '100px',
                      borderRadius: '16px',
                      backgroundColor: formData.headshot_url ? 'transparent' : `${getRoleColor(formData.role)}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 8px',
                      fontSize: '36px',
                      fontWeight: '600',
                      color: getRoleColor(formData.role),
                      overflow: 'hidden',
                      border: `2px solid ${theme.border}`,
                      position: 'relative'
                    }}>
                      {formData.headshot_url ? (
                        <img
                          src={formData.headshot_url}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        formData.name?.charAt(0)?.toUpperCase() || <User size={36} />
                      )}
                      {uploading && (
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundColor: 'rgba(0,0,0,0.5)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: '12px'
                        }}>
                          Uploading...
                        </div>
                      )}
                    </div>
                    {isEditing && (
                      <label style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        backgroundColor: theme.accentBg,
                        borderRadius: '6px',
                        color: theme.accent,
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}>
                        <Camera size={14} />
                        {formData.headshot_url ? 'Change' : 'Upload'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          style={{ display: 'none' }}
                        />
                      </label>
                    )}
                  </div>

                  {/* Name, Status & Tax Classification */}
                  <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={labelStyle}>Name *</label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        disabled={!isEditing}
                        style={isEditing ? inputStyle : inputStyleDisabled}
                      />
                    </div>

                    {/* W2 / 1099 Toggle */}
                    <div>
                      <label style={labelStyle}>Tax Classification</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => isEditing && setFormData(prev => ({ ...prev, tax_classification: 'W2' }))}
                          disabled={!isEditing}
                          style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '10px 16px',
                            backgroundColor: formData.tax_classification === 'W2' ? '#3b82f620' : theme.bg,
                            border: `2px solid ${formData.tax_classification === 'W2' ? '#3b82f6' : theme.border}`,
                            borderRadius: '8px',
                            color: formData.tax_classification === 'W2' ? '#3b82f6' : theme.textMuted,
                            fontSize: '14px',
                            fontWeight: formData.tax_classification === 'W2' ? '600' : '400',
                            cursor: isEditing ? 'pointer' : 'not-allowed',
                            opacity: isEditing ? 1 : 0.7
                          }}
                        >
                          <FileText size={16} />
                          W-2 Employee
                        </button>
                        <button
                          type="button"
                          onClick={() => isEditing && setFormData(prev => ({ ...prev, tax_classification: '1099' }))}
                          disabled={!isEditing}
                          style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '10px 16px',
                            backgroundColor: formData.tax_classification === '1099' ? '#f9731620' : theme.bg,
                            border: `2px solid ${formData.tax_classification === '1099' ? '#f97316' : theme.border}`,
                            borderRadius: '8px',
                            color: formData.tax_classification === '1099' ? '#f97316' : theme.textMuted,
                            fontSize: '14px',
                            fontWeight: formData.tax_classification === '1099' ? '600' : '400',
                            cursor: isEditing ? 'pointer' : 'not-allowed',
                            opacity: isEditing ? 1 : 0.7
                          }}
                        >
                          <FileText size={16} />
                          1099 Contractor
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ===== BASIC INFO SECTION ===== */}
                <div style={sectionHeaderStyle}>Contact & Role</div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      disabled={!isEditing}
                      style={isEditing ? inputStyle : inputStyleDisabled}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      disabled={!isEditing}
                      style={isEditing ? inputStyle : inputStyleDisabled}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>Role</label>
                    <select
                      name="role"
                      value={formData.role}
                      onChange={handleChange}
                      disabled={!isEditing}
                      style={isEditing ? inputStyle : inputStyleDisabled}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  {isAdmin && (
                    <div>
                      <label style={labelStyle}>User Role (Permissions)</label>
                      <select
                        name="user_role"
                        value={formData.user_role}
                        onChange={handleChange}
                        disabled={!isEditing}
                        style={isEditing ? inputStyle : inputStyleDisabled}
                      >
                        {USER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* ===== PAY SECTION ===== */}
                {canViewSensitiveInfo(viewingEmployee) && (
                  <>
                    <div style={sectionHeaderStyle}>Compensation</div>

                    <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>
                      Select all that apply. Employee can have multiple pay types.
                    </p>

                    {/* Pay Type Toggles */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                      <PayTypeToggle label="Hourly" field="is_hourly" icon={Clock} disabled={!isEditing} />
                      <PayTypeToggle label="Salary" field="is_salary" icon={Briefcase} disabled={!isEditing} />
                      <PayTypeToggle label="Commission" field="is_commission" icon={DollarSign} disabled={!isEditing} />
                    </div>

                    {/* Conditional Rate Inputs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                      {formData.is_hourly && (
                        <div>
                          <label style={labelStyle}>Hourly Rate</label>
                          <div style={{ position: 'relative' }}>
                            <span style={{
                              position: 'absolute',
                              left: '12px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              color: theme.textMuted
                            }}>$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              name="hourly_rate"
                              value={formData.hourly_rate}
                              onChange={handleChange}
                              disabled={!isEditing}
                              style={{
                                ...(isEditing ? inputStyle : inputStyleDisabled),
                                paddingLeft: '28px'
                              }}
                            />
                            <span style={{
                              position: 'absolute',
                              right: '12px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              color: theme.textMuted,
                              fontSize: '13px'
                            }}>/hr</span>
                          </div>
                        </div>
                      )}

                      {formData.is_salary && (
                        <div>
                          <label style={labelStyle}>Annual Salary</label>
                          <div style={{ position: 'relative' }}>
                            <span style={{
                              position: 'absolute',
                              left: '12px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              color: theme.textMuted
                            }}>$</span>
                            <input
                              type="number"
                              step="1"
                              min="0"
                              name="annual_salary"
                              value={formData.annual_salary}
                              onChange={handleChange}
                              disabled={!isEditing}
                              style={{
                                ...(isEditing ? inputStyle : inputStyleDisabled),
                                paddingLeft: '28px'
                              }}
                            />
                            <span style={{
                              position: 'absolute',
                              right: '12px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              color: theme.textMuted,
                              fontSize: '13px'
                            }}>/yr</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Commission Rates - Only show if commission is enabled */}
                    {formData.is_commission && (
                      <>
                        <div style={{ ...sectionHeaderStyle, marginTop: '24px' }}>Commission Rates</div>
                        <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '16px' }}>
                          Use $ for flat amounts or % for percentage of sale.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          <RateInput
                            label="Goods (Products)"
                            rateName="commission_goods_rate"
                            typeName="commission_goods_type"
                            disabled={!isEditing}
                          />
                          <RateInput
                            label="Services (Labor)"
                            rateName="commission_services_rate"
                            typeName="commission_services_type"
                            disabled={!isEditing}
                          />
                          <RateInput
                            label="Software/Subscriptions"
                            rateName="commission_software_rate"
                            typeName="commission_software_type"
                            disabled={!isEditing}
                          />
                        </div>

                        <p style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginTop: '16px', marginBottom: '12px' }}>
                          LEAD GENERATION
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          <RateInput
                            label="Per Lead Generated"
                            rateName="commission_leads_rate"
                            typeName="commission_leads_type"
                            disabled={!isEditing}
                          />
                          <RateInput
                            label="Per Appointment Set"
                            rateName="commission_setter_rate"
                            typeName="commission_setter_type"
                            disabled={!isEditing}
                          />
                        </div>
                      </>
                    )}

                    {/* ===== PTO SECTION ===== */}
                    <div style={sectionHeaderStyle}>Paid Time Off</div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                      <div>
                        <label style={labelStyle}>Days Per Year</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          name="pto_days_per_year"
                          value={formData.pto_days_per_year}
                          onChange={handleChange}
                          disabled={!isEditing}
                          style={isEditing ? inputStyle : inputStyleDisabled}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Accrued</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          name="pto_accrued"
                          value={formData.pto_accrued}
                          onChange={handleChange}
                          disabled={!isEditing}
                          style={isEditing ? inputStyle : inputStyleDisabled}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Used</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          name="pto_used"
                          value={formData.pto_used}
                          onChange={handleChange}
                          disabled={!isEditing}
                          style={isEditing ? inputStyle : inputStyleDisabled}
                        />
                      </div>
                    </div>

                    {/* PTO Progress Bar */}
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
                  </>
                )}

                {/* Restricted info message */}
                {viewingEmployee && !canViewSensitiveInfo(viewingEmployee) && (
                  <div style={{
                    marginTop: '20px',
                    padding: '24px',
                    backgroundColor: theme.bg,
                    borderRadius: '12px',
                    textAlign: 'center'
                  }}>
                    <Lock size={32} style={{ color: theme.textMuted, marginBottom: '12px' }} />
                    <p style={{ color: theme.textSecondary, fontSize: '14px' }}>
                      Compensation and PTO details are only visible to admins and the employee themselves.
                    </p>
                  </div>
                )}

                {/* Active checkbox for editing */}
                {isEditing && viewingEmployee && (
                  <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      name="active"
                      id="active"
                      checked={formData.active}
                      onChange={handleChange}
                      style={{ accentColor: theme.accent }}
                    />
                    <label htmlFor="active" style={{ fontSize: '14px', color: theme.text }}>
                      Active Employee
                    </label>
                  </div>
                )}
              </div>

              {/* Form Actions */}
              {isEditing && (
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '20px',
                  borderTop: `1px solid ${theme.border}`,
                  flexShrink: 0
                }}>
                  <button
                    type="button"
                    onClick={viewingEmployee ? () => setIsEditing(false) : closeModal}
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
                    {loading ? 'Saving...' : (viewingEmployee ? 'Save Changes' : 'Add Employee')}
                  </button>
                </div>
              )}
            </form>
          </div>
        </>
      )}
    </div>
  )
}
