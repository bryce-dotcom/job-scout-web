import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Plus, Pencil, Trash2, X, User, Phone, Mail } from 'lucide-react'

const defaultTheme = {
  primary: '#2563eb',
  primaryHover: '#1d4ed8'
}

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

  const [showModal, setShowModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [formData, setFormData] = useState(emptyEmployee)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showInactive, setShowInactive] = useState(false)
  const [allEmployees, setAllEmployees] = useState([])

  const theme = defaultTheme

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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show inactive
          </label>
          <button
            onClick={openAddModal}
            style={{ backgroundColor: theme.primary }}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-md hover:opacity-90"
          >
            <Plus size={20} />
            Add Employee
          </button>
        </div>
      </div>

      {displayedEmployees.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <User size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">No employees yet. Add your first employee to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedEmployees.map((employee) => (
            <div
              key={employee.id}
              className={`bg-white rounded-lg shadow p-4 ${!employee.active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                    {employee.headshot_url ? (
                      <img src={employee.headshot_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <User size={24} className="text-gray-500" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{employee.name}</h3>
                    <p className="text-sm text-gray-500">{employee.role}</p>
                    {employee.user_role && (
                      <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                        {employee.user_role}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEditModal(employee)}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(employee)}
                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                {employee.email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail size={14} />
                    <span>{employee.email}</span>
                  </div>
                )}
                {employee.phone && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone size={14} />
                    <span>{employee.phone}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t flex items-center justify-between">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  employee.active
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {employee.active ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => toggleActive(employee)}
                  className="text-xs text-gray-500 hover:text-gray-700"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingEmployee ? 'Edit Employee' : 'Add Employee'}
              </h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Role
                    </label>
                    <select
                      name="role"
                      value={formData.role}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      User Role
                    </label>
                    <select
                      name="user_role"
                      value={formData.user_role}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="User">User</option>
                      <option value="Admin">Admin</option>
                      <option value="Owner">Owner</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Unit
                  </label>
                  <input
                    type="text"
                    name="business_unit"
                    value={formData.business_unit}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Employee ID
                  </label>
                  <input
                    type="text"
                    name="employee_id"
                    value={formData.employee_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {editingEmployee && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="active"
                      id="active"
                      checked={formData.active}
                      onChange={handleChange}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor="active" className="text-sm text-gray-700">
                      Active
                    </label>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ backgroundColor: theme.primary }}
                  className="flex-1 px-4 py-2 text-white rounded-md hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : (editingEmployee ? 'Update' : 'Add Employee')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
