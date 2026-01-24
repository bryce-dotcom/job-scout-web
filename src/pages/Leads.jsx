import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Plus, Pencil, Trash2, X, Phone, Mail, Calendar, UserPlus, Search } from 'lucide-react'

const defaultTheme = {
  primary: '#2563eb',
  primaryHover: '#1d4ed8'
}

const emptyLead = {
  customer_name: '',
  business_name: '',
  email: '',
  phone: '',
  address: '',
  service_type: '',
  lead_source: '',
  status: 'New',
  salesperson_id: '',
  notes: '',
  appointment_time: ''
}

const statusColors = {
  'New': 'bg-blue-100 text-blue-700',
  'Qualified': 'bg-green-100 text-green-700',
  'Appointment Scheduled': 'bg-orange-100 text-orange-700',
  'Not Qualified': 'bg-red-100 text-red-700',
  'Waiting': 'bg-gray-100 text-gray-600',
  'Converted': 'bg-purple-100 text-purple-700'
}

const leadSources = [
  'Website', 'Referral', 'Google Ads', 'Facebook', 'Instagram',
  'Home Advisor', 'Angi', 'Thumbtack', 'Door Knock', 'Cold Call', 'Other'
]

export default function Leads() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const leads = useStore((state) => state.leads)
  const employees = useStore((state) => state.employees)
  const fetchLeads = useStore((state) => state.fetchLeads)
  const fetchCustomers = useStore((state) => state.fetchCustomers)

  const [showModal, setShowModal] = useState(false)
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
  const [editingLead, setEditingLead] = useState(null)
  const [selectedLead, setSelectedLead] = useState(null)
  const [formData, setFormData] = useState(emptyLead)
  const [appointmentData, setAppointmentData] = useState({ title: '', start_time: '', end_time: '', location: '', description: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const theme = defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchLeads()
  }, [companyId, navigate, fetchLeads])

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = searchTerm === '' ||
      lead.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone?.includes(searchTerm)

    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const openAddModal = () => {
    setEditingLead(null)
    setFormData(emptyLead)
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (lead) => {
    setEditingLead(lead)
    setFormData({
      customer_name: lead.customer_name || '',
      business_name: lead.business_name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      address: lead.address || '',
      service_type: lead.service_type || '',
      lead_source: lead.lead_source || '',
      status: lead.status || 'New',
      salesperson_id: lead.salesperson_id || '',
      notes: lead.notes || '',
      appointment_time: lead.appointment_time ? new Date(lead.appointment_time).toISOString().slice(0, 16) : ''
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingLead(null)
    setFormData(emptyLead)
    setError(null)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      ...formData,
      company_id: companyId,
      salesperson_id: formData.salesperson_id || null,
      appointment_time: formData.appointment_time || null,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingLead) {
      result = await supabase
        .from('leads')
        .update(payload)
        .eq('id', editingLead.id)
    } else {
      result = await supabase
        .from('leads')
        .insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchLeads()
    closeModal()
    setLoading(false)
  }

  const handleDelete = async (lead) => {
    if (!confirm(`Are you sure you want to delete ${lead.customer_name}?`)) return

    await supabase.from('leads').delete().eq('id', lead.id)
    await fetchLeads()
  }

  const openAppointmentModal = (lead) => {
    setSelectedLead(lead)
    setAppointmentData({
      title: `Appointment with ${lead.customer_name}`,
      start_time: '',
      end_time: '',
      location: lead.address || '',
      description: ''
    })
    setShowAppointmentModal(true)
  }

  const handleScheduleAppointment = async (e) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.from('appointments').insert([{
      company_id: companyId,
      lead_id: selectedLead.id,
      ...appointmentData
    }])

    if (!error) {
      await supabase.from('leads').update({
        status: 'Appointment Scheduled',
        appointment_time: appointmentData.start_time,
        updated_at: new Date().toISOString()
      }).eq('id', selectedLead.id)

      await fetchLeads()
    }

    setShowAppointmentModal(false)
    setSelectedLead(null)
    setLoading(false)
  }

  const convertToCustomer = async (lead) => {
    if (!confirm(`Convert ${lead.customer_name} to a customer?`)) return

    const { data: newCustomer, error } = await supabase.from('customers').insert([{
      company_id: companyId,
      name: lead.customer_name,
      business_name: lead.business_name,
      email: lead.email,
      phone: lead.phone,
      address: lead.address,
      salesperson_id: lead.salesperson_id,
      status: 'Active',
      notes: `Converted from lead. Original notes: ${lead.notes || 'None'}`
    }]).select().single()

    if (!error && newCustomer) {
      await supabase.from('leads').update({
        status: 'Converted',
        updated_at: new Date().toISOString()
      }).eq('id', lead.id)

      // Create pipeline entry
      await supabase.from('sales_pipeline').insert([{
        company_id: companyId,
        lead_id: lead.id,
        customer_id: newCustomer.id,
        salesperson_id: lead.salesperson_id,
        stage: 'New Lead'
      }])

      await fetchLeads()
      await fetchCustomers()
    }
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        <button
          onClick={openAddModal}
          style={{ backgroundColor: theme.primary }}
          className="flex items-center gap-2 px-4 py-2 text-white rounded-md hover:opacity-90"
        >
          <Plus size={20} />
          Add Lead
        </button>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search leads..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Status</option>
          <option value="New">New</option>
          <option value="Qualified">Qualified</option>
          <option value="Appointment Scheduled">Appointment Scheduled</option>
          <option value="Waiting">Waiting</option>
          <option value="Not Qualified">Not Qualified</option>
          <option value="Converted">Converted</option>
        </select>
      </div>

      {filteredLeads.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <UserPlus size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">
            {searchTerm || statusFilter !== 'all'
              ? 'No leads match your search.'
              : 'No leads yet. Add your first lead to get started.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLeads.map((lead) => (
            <div key={lead.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{lead.customer_name}</h3>
                  {lead.business_name && (
                    <p className="text-sm text-gray-500">{lead.business_name}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEditModal(lead)}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(lead)}
                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 text-sm mb-3">
                {lead.phone && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone size={14} />
                    <span>{lead.phone}</span>
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail size={14} />
                    <span className="truncate">{lead.email}</span>
                  </div>
                )}
                {lead.lead_source && (
                  <p className="text-gray-500 text-xs">Source: {lead.lead_source}</p>
                )}
              </div>

              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs px-2 py-1 rounded-full ${statusColors[lead.status] || 'bg-gray-100 text-gray-600'}`}>
                  {lead.status}
                </span>
                {lead.salesperson && (
                  <span className="text-xs text-gray-500">{lead.salesperson.name}</span>
                )}
              </div>

              {/* Quick Actions */}
              {lead.status !== 'Converted' && lead.status !== 'Not Qualified' && (
                <div className="flex gap-2 pt-3 border-t">
                  <button
                    onClick={() => openAppointmentModal(lead)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-orange-50 text-orange-700 rounded hover:bg-orange-100"
                  >
                    <Calendar size={14} />
                    Schedule
                  </button>
                  <button
                    onClick={() => convertToCustomer(lead)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100"
                  >
                    <UserPlus size={14} />
                    Convert
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lead Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">
                {editingLead ? 'Edit Lead' : 'Add Lead'}
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      name="customer_name"
                      value={formData.customer_name}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Business</label>
                    <input
                      type="text"
                      name="business_name"
                      value={formData.business_name}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
                    <input
                      type="text"
                      name="service_type"
                      value={formData.service_type}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lead Source</label>
                    <select
                      name="lead_source"
                      value={formData.lead_source}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Select --</option>
                      {leadSources.map(src => (
                        <option key={src} value={src}>{src}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="New">New</option>
                      <option value="Qualified">Qualified</option>
                      <option value="Appointment Scheduled">Appointment Scheduled</option>
                      <option value="Waiting">Waiting</option>
                      <option value="Not Qualified">Not Qualified</option>
                      <option value="Converted">Converted</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Salesperson</label>
                    <select
                      name="salesperson_id"
                      value={formData.salesperson_id}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Select --</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
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
                  {loading ? 'Saving...' : (editingLead ? 'Update' : 'Add Lead')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Appointment Modal */}
      {showAppointmentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Schedule Appointment</h2>
              <button onClick={() => setShowAppointmentModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleScheduleAppointment} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={appointmentData.title}
                  onChange={(e) => setAppointmentData(prev => ({ ...prev, title: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                  <input
                    type="datetime-local"
                    value={appointmentData.start_time}
                    onChange={(e) => setAppointmentData(prev => ({ ...prev, start_time: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                  <input
                    type="datetime-local"
                    value={appointmentData.end_time}
                    onChange={(e) => setAppointmentData(prev => ({ ...prev, end_time: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  value={appointmentData.location}
                  onChange={(e) => setAppointmentData(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAppointmentModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
                >
                  {loading ? 'Scheduling...' : 'Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
