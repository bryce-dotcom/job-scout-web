import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Plus, Search, Briefcase, MapPin, Calendar, Play, CheckCircle } from 'lucide-react'

const defaultTheme = {
  primary: '#2563eb'
}

const statusColors = {
  'Scheduled': 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-orange-100 text-orange-700',
  'Completed': 'bg-green-100 text-green-700',
  'Cancelled': 'bg-red-100 text-red-700',
  'On Hold': 'bg-yellow-100 text-yellow-700'
}

export default function Jobs() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const jobs = useStore((state) => state.jobs)
  const customers = useStore((state) => state.customers)
  const employees = useStore((state) => state.employees)
  const fetchJobs = useStore((state) => state.fetchJobs)

  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    job_title: '',
    customer_id: '',
    job_address: '',
    salesperson_id: '',
    start_date: '',
    assigned_team: '',
    details: ''
  })
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
    fetchJobs()
  }, [companyId, navigate, fetchJobs])

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = searchTerm === '' ||
      job.job_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.job_address?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || job.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    // Auto-fill address from customer
    if (name === 'customer_id' && value) {
      const customer = customers.find(c => c.id === parseInt(value))
      if (customer?.address) {
        setFormData(prev => ({ ...prev, job_address: customer.address }))
      }
    }
  }

  const handleCreateJob = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const jobNumber = `J-${Date.now().toString(36).toUpperCase()}`

    const { data, error: insertError } = await supabase
      .from('jobs')
      .insert([{
        company_id: companyId,
        job_id: jobNumber,
        job_title: formData.job_title,
        customer_id: formData.customer_id || null,
        job_address: formData.job_address || null,
        salesperson_id: formData.salesperson_id || null,
        start_date: formData.start_date || null,
        assigned_team: formData.assigned_team || null,
        details: formData.details || null,
        status: 'Scheduled'
      }])
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    setShowModal(false)
    setFormData({ job_title: '', customer_id: '', job_address: '', salesperson_id: '', start_date: '', assigned_team: '', details: '' })
    await fetchJobs()
    navigate(`/jobs/${data.id}`)
    setLoading(false)
  }

  const updateJobStatus = async (jobId, newStatus) => {
    await supabase.from('jobs').update({
      status: newStatus,
      updated_at: new Date().toISOString()
    }).eq('id', jobId)
    await fetchJobs()
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/jobs/calendar')}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            <Calendar size={20} />
            Calendar
          </button>
          <button
            onClick={() => setShowModal(true)}
            style={{ backgroundColor: theme.primary }}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-md hover:opacity-90"
          >
            <Plus size={20} />
            New Job
          </button>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search jobs..."
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
          <option value="Scheduled">Scheduled</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
          <option value="On Hold">On Hold</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Briefcase size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">
            {searchTerm || statusFilter !== 'all'
              ? 'No jobs match your search.'
              : 'No jobs yet. Create your first job.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/jobs/${job.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">{job.job_id}</p>
                  <h3 className="font-semibold text-gray-900">
                    {job.job_title || job.customer?.name || 'Untitled Job'}
                  </h3>
                  {job.customer && (
                    <p className="text-sm text-gray-600">{job.customer.name}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${statusColors[job.status] || 'bg-gray-100 text-gray-600'}`}>
                  {job.status}
                </span>
              </div>

              {job.job_address && (
                <div className="flex items-start gap-2 text-sm text-gray-600 mb-2">
                  <MapPin size={14} className="mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{job.job_address}</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                <Calendar size={14} />
                <span>{formatDate(job.start_date)}</span>
              </div>

              {/* Quick Actions */}
              {job.status !== 'Completed' && job.status !== 'Cancelled' && (
                <div className="flex gap-2 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                  {job.status === 'Scheduled' && (
                    <button
                      onClick={() => updateJobStatus(job.id, 'In Progress')}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-orange-50 text-orange-700 rounded hover:bg-orange-100"
                    >
                      <Play size={14} />
                      Start Job
                    </button>
                  )}
                  {job.status === 'In Progress' && (
                    <button
                      onClick={() => updateJobStatus(job.id, 'Completed')}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100"
                    >
                      <CheckCircle size={14} />
                      Complete
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Job Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">New Job</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateJob} className="p-4">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                  <input
                    type="text"
                    name="job_title"
                    value={formData.job_title}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., HVAC Installation"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                  <select
                    name="customer_id"
                    value={formData.customer_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select Customer --</option>
                    {customers.map(cust => (
                      <option key={cust.id} value={cust.id}>{cust.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Job Address</label>
                  <input
                    type="text"
                    name="job_address"
                    value={formData.job_address}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                      type="datetime-local"
                      name="start_date"
                      value={formData.start_date}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Team</label>
                    <input
                      type="text"
                      name="assigned_team"
                      value={formData.assigned_team}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Details</label>
                  <textarea
                    name="details"
                    value={formData.details}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
                  {loading ? 'Creating...' : 'Create Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
