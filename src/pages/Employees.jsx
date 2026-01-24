import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { Plus, Pencil, Trash2, X, User, Phone, Mail } from 'lucide-react'

const emptyEmployee = {
  name: '',
  email: '',
  phone: '',
  role: 'Field Tech',
  user_role: 'User',
  business_unit: '',
  employee_id: '',
  active: true
}

export default function Employees() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const employees = useStore((state) => state.employees)
  const fetchEmployees = useStore((state) => state.fetchEmployees)

  // Theme with fallback
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

  const [showModal, setShowModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [formData, setFormData] = useState(emptyEmployee)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showInactive, setShowInactive] = useState(false)
  const [allEmployees, setAllEmployees] = useState([])

  // Guard clause - redirect if no company
  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchEmployees()
    fetchAllEmployees()
  }, [companyId, navigate, fetchEmployees])

  const fetchAllEmployees = async () => {
    if (!companyId) return
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    setAllEmployees(data || [])
  }

  const displayedEmployees = showInactive
    ? allEmployees
    : allEmployees.filter(e => e.active)

  const openAddModal = () => {
    setEditingEmployee(null)
    setFormData(emptyEmployee)
    setError(null)
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
      active: employee.active
    })
    setError(null)
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
    await fetchAllEmployees()
    closeModal()
    setLoading(false)
  }

  const handleDelete = async (employee) => {
    if (!confirm(`Are you sure you want to deactivate ${employee.name}?`)) return

    // Soft delete - set active = false
    const { error } = await supabase
      .from('employees')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', employee.id)

    if (!error) {
      await fetchEmployees()
      await fetchAllEmployees()
    }
  }

  const toggleActive = async (employee) => {
    await supabase
      .from('employees')
      .update({ active: !employee.active, updated_at: new Date().toISOString() })
      .eq('id', employee.id)

    await fetchEmployees()
    await fetchAllEmployees()
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
    fontSize: '14px',
    fontWeight: '500',
    color: theme.text
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px'
      }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: '700',
          color: theme.text
        }}>
          Employees
        </h1>
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

      {displayedEmployees.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <User size={48} style={{ color: theme.textMuted, marginBottom: '16px' }} />
          <p style={{ color: theme.textSecondary }}>
            No employees yet. Add your first employee to get started.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px'
        }}>
          {displayedEmployees.map((employee) => (
            <div
              key={employee.id}
              style={{
                backgroundColor: theme.bgCard,
                borderRadius: '12px',
                border: `1px solid ${theme.border}`,
                padding: '20px',
                opacity: employee.active ? 1 : 0.6
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    backgroundColor: theme.bg,
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${theme.border}`
                  }}>
                    {employee.headshot_url ? (
                      <img
                        src={employee.headshot_url}
                        alt=""
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '10px',
                          objectFit: 'cover'
                        }}
                      />
                    ) : (
                      <User size={24} style={{ color: theme.textMuted }} />
                    )}
                  </div>
                  <div>
                    <h3 style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: theme.text,
                      marginBottom: '4px'
                    }}>
                      {employee.name}
                    </h3>
                    <p style={{
                      fontSize: '14px',
                      color: theme.textSecondary,
                      marginBottom: '4px'
                    }}>
                      {employee.role}
                    </p>
                    {employee.user_role && (
                      <span style={{
                        display: 'inline-block',
                        fontSize: '12px',
                        padding: '2px 8px',
                        backgroundColor: theme.accentBg,
                        color: theme.accent,
                        borderRadius: '4px'
                      }}>
                        {employee.user_role}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => openEditModal(employee)}
                    style={{
                      padding: '8px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: theme.textMuted,
                      cursor: 'pointer',
                      borderRadius: '6px'
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(employee)}
                    style={{
                      padding: '8px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: theme.textMuted,
                      cursor: 'pointer',
                      borderRadius: '6px'
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {employee.email && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    color: theme.textSecondary
                  }}>
                    <Mail size={14} />
                    <span>{employee.email}</span>
                  </div>
                )}
                {employee.phone && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    color: theme.textSecondary
                  }}>
                    <Phone size={14} />
                    <span>{employee.phone}</span>
                  </div>
                )}
              </div>

              <div style={{
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: `1px solid ${theme.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{
                  fontSize: '12px',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  backgroundColor: employee.active ? 'rgba(34,197,94,0.1)' : theme.bg,
                  color: employee.active ? '#16a34a' : theme.textMuted
                }}>
                  {employee.active ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => toggleActive(employee)}
                  style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {employee.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
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
              backgroundColor: 'rgba(0,0,0,0.3)',
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
            maxWidth: '480px',
            maxHeight: '90vh',
            overflow: 'auto',
            zIndex: 51
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: theme.text
              }}>
                {editingEmployee ? 'Edit Employee' : 'Add Employee'}
              </h2>
              <button
                onClick={closeModal}
                style={{
                  padding: '4px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: theme.textMuted,
                  cursor: 'pointer'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Role</label>
                    <select
                      name="role"
                      value={formData.role}
                      onChange={handleChange}
                      style={inputStyle}
                    >
                      <option value="Field Tech">Field Tech</option>
                      <option value="Installer">Installer</option>
                      <option value="Sales">Sales</option>
                      <option value="Office">Office</option>
                      <option value="Manager">Manager</option>
                      <option value="Owner">Owner</option>
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
                      <option value="User">User</option>
                      <option value="Admin">Admin</option>
                      <option value="Owner">Owner</option>
                    </select>
                  </div>
                </div>

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

                {editingEmployee && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <input
                      type="checkbox"
                      name="active"
                      id="active"
                      checked={formData.active}
                      onChange={handleChange}
                      style={{ accentColor: theme.accent }}
                    />
                    <label
                      htmlFor="active"
                      style={{ fontSize: '14px', color: theme.text }}
                    >
                      Active
                    </label>
                  </div>
                )}
              </div>

              <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: '24px'
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
