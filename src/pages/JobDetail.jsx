import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { ArrowLeft, Plus, Trash2, MapPin, Clock, FileText, ExternalLink } from 'lucide-react'

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

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const products = useStore((state) => state.products)
  const fetchJobs = useStore((state) => state.fetchJobs)

  const [job, setJob] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddLine, setShowAddLine] = useState(false)
  const [newLine, setNewLine] = useState({ item_id: '', quantity: 1 })
  const [editMode, setEditMode] = useState(false)
  const [formData, setFormData] = useState({})

  const theme = defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchJobData()
  }, [companyId, id, navigate])

  const fetchJobData = async () => {
    setLoading(true)

    const { data: jobData } = await supabase
      .from('jobs')
      .select('*, customer:customers(id, name, email, phone, address), salesperson:employees(id, name), quote:quotes(id, quote_id)')
      .eq('id', id)
      .single()

    if (jobData) {
      setJob(jobData)
      setFormData(jobData)

      const { data: lines } = await supabase
        .from('job_lines')
        .select('*, item:products_services(id, name, description)')
        .eq('job_id', id)
        .order('id')

      setLineItems(lines || [])
    }

    setLoading(false)
  }

  const addLineItem = async () => {
    if (!newLine.item_id) return

    const product = products.find(p => p.id === parseInt(newLine.item_id))
    if (!product) return

    setSaving(true)

    const lineTotal = (product.unit_price || 0) * newLine.quantity

    await supabase.from('job_lines').insert([{
      company_id: companyId,
      job_id: parseInt(id),
      item_id: product.id,
      quantity: newLine.quantity,
      unit_price: product.unit_price,
      line_total: lineTotal
    }])

    await fetchJobData()
    setNewLine({ item_id: '', quantity: 1 })
    setShowAddLine(false)
    setSaving(false)
  }

  const removeLineItem = async (lineId) => {
    setSaving(true)
    await supabase.from('job_lines').delete().eq('id', lineId)
    await fetchJobData()
    setSaving(false)
  }

  const copyFromQuote = async () => {
    if (!job.quote_id) return
    if (!confirm('Copy line items from the linked quote?')) return

    setSaving(true)

    const { data: quoteLines } = await supabase
      .from('quote_lines')
      .select('*')
      .eq('quote_id', job.quote_id)

    if (quoteLines && quoteLines.length > 0) {
      const jobLines = quoteLines.map(ql => ({
        company_id: companyId,
        job_id: parseInt(id),
        item_id: ql.item_id,
        quantity: ql.quantity,
        unit_price: ql.unit_price,
        line_total: ql.line_total
      }))

      await supabase.from('job_lines').insert(jobLines)
      await fetchJobData()
    }

    setSaving(false)
  }

  const updateJobStatus = async (newStatus) => {
    setSaving(true)
    await supabase.from('jobs').update({
      status: newStatus,
      updated_at: new Date().toISOString()
    }).eq('id', id)
    await fetchJobData()
    await fetchJobs()
    setSaving(false)
  }

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('jobs').update({
      job_title: formData.job_title,
      job_address: formData.job_address,
      start_date: formData.start_date,
      end_date: formData.end_date,
      assigned_team: formData.assigned_team,
      allotted_time_hours: formData.allotted_time_hours,
      details: formData.details,
      notes: formData.notes,
      updated_at: new Date().toISOString()
    }).eq('id', id)
    await fetchJobData()
    await fetchJobs()
    setEditMode(false)
    setSaving(false)
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const getMapUrl = (address) => {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-600">Loading job...</p>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="p-6">
        <p className="text-red-600">Job not found</p>
        <button onClick={() => navigate('/jobs')} className="mt-4 text-blue-600 hover:underline">
          Back to Jobs
        </button>
      </div>
    )
  }

  const total = lineItems.reduce((sum, line) => sum + (parseFloat(line.line_total) || 0), 0)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/jobs')}
          className="p-2 hover:bg-gray-100 rounded-md"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <p className="text-sm text-gray-500">{job.job_id}</p>
          <h1 className="text-2xl font-bold text-gray-900">
            {job.job_title || job.customer?.name || 'Untitled Job'}
          </h1>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[job.status]}`}>
          {job.status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer & Address */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900">Job Details</h3>
              <button
                onClick={() => setEditMode(!editMode)}
                className="text-sm text-blue-600 hover:underline"
              >
                {editMode ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {editMode ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                  <input
                    type="text"
                    value={formData.job_title || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, job_title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={formData.job_address || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, job_address: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                      type="datetime-local"
                      value={formData.start_date ? new Date(formData.start_date).toISOString().slice(0, 16) : ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Team</label>
                    <input
                      type="text"
                      value={formData.assigned_team || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, assigned_team: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Details</label>
                  <textarea
                    value={formData.details || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, details: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{ backgroundColor: theme.primary }}
                  className="px-4 py-2 text-white rounded-md hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Customer</p>
                  <p className="font-medium">{job.customer?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Phone</p>
                  <p className="font-medium">{job.customer?.phone || '-'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-gray-500">Address</p>
                  {job.job_address ? (
                    <a
                      href={getMapUrl(job.job_address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <MapPin size={14} />
                      {job.job_address}
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    <p className="font-medium">-</p>
                  )}
                </div>
                <div>
                  <p className="text-gray-500">Start Date</p>
                  <p className="font-medium">{formatDate(job.start_date)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Assigned Team</p>
                  <p className="font-medium">{job.assigned_team || '-'}</p>
                </div>
                {job.details && (
                  <div className="col-span-2">
                    <p className="text-gray-500">Details</p>
                    <p className="font-medium">{job.details}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Line Items */}
          <div className="bg-white rounded-lg shadow">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-medium text-gray-900">Job Lines</h3>
              <div className="flex gap-2">
                {job.quote_id && lineItems.length === 0 && (
                  <button
                    onClick={copyFromQuote}
                    disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                  >
                    <FileText size={16} />
                    Copy from Quote
                  </button>
                )}
                <button
                  onClick={() => setShowAddLine(true)}
                  style={{ backgroundColor: theme.primary }}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-white rounded-md hover:opacity-90"
                >
                  <Plus size={16} />
                  Add Item
                </button>
              </div>
            </div>

            {lineItems.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No line items yet.
              </div>
            ) : (
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {lineItems.map((line) => (
                    <tr key={line.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{line.item?.name || 'Unknown'}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{line.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(line.unit_price)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(line.line_total)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => removeLineItem(line.id)}
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50">
                    <td colSpan={3} className="px-4 py-3 text-right font-medium">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-lg">{formatCurrency(total)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-3">Notes</h3>
            <textarea
              value={job.notes || ''}
              onChange={(e) => {
                supabase.from('jobs').update({ notes: e.target.value, updated_at: new Date().toISOString() }).eq('id', id)
                setJob(prev => ({ ...prev, notes: e.target.value }))
              }}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Add notes..."
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status & Actions */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-4">Actions</h3>

            <div className="space-y-2">
              {job.status === 'Scheduled' && (
                <button
                  onClick={() => updateJobStatus('In Progress')}
                  disabled={saving}
                  className="w-full px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
                >
                  Start Job
                </button>
              )}

              {job.status === 'In Progress' && (
                <button
                  onClick={() => updateJobStatus('Completed')}
                  disabled={saving}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  Mark Completed
                </button>
              )}

              {job.status === 'Completed' && job.invoice_status === 'Not Invoiced' && (
                <button
                  onClick={() => alert('Invoice generation coming soon!')}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  Generate Invoice
                </button>
              )}

              {job.status !== 'Cancelled' && job.status !== 'Completed' && (
                <button
                  onClick={() => updateJobStatus('On Hold')}
                  disabled={saving}
                  className="w-full px-4 py-2 border border-yellow-500 text-yellow-700 rounded-md hover:bg-yellow-50"
                >
                  Put On Hold
                </button>
              )}
            </div>
          </div>

          {/* Time Tracking */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-3">Time Tracking</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Allotted</span>
                <span className="font-medium">{job.allotted_time_hours || 0} hrs</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tracked</span>
                <span className="font-medium">{job.time_tracked || 0} hrs</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{
                    width: `${Math.min(100, ((job.time_tracked || 0) / (job.allotted_time_hours || 1)) * 100)}%`
                  }}
                />
              </div>
            </div>
          </div>

          {/* Invoice Status */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-3">Invoice</h3>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Status</span>
              <span className={`px-2 py-1 text-xs rounded-full ${
                job.invoice_status === 'Invoiced' ? 'bg-green-100 text-green-700' :
                job.invoice_status === 'Paid' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {job.invoice_status}
              </span>
            </div>
          </div>

          {/* Linked Quote */}
          {job.quote && (
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-medium text-gray-900 mb-3">Linked Quote</h3>
              <button
                onClick={() => navigate(`/quotes/${job.quote_id}`)}
                className="text-blue-600 hover:underline text-sm"
              >
                {job.quote.quote_id || `Quote #${job.quote_id}`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add Line Item Modal */}
      {showAddLine && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Add Line Item</h2>
              <button onClick={() => setShowAddLine(false)} className="text-gray-500 hover:text-gray-700">
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product/Service</label>
                <select
                  value={newLine.item_id}
                  onChange={(e) => setNewLine(prev => ({ ...prev, item_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Select --</option>
                  {products.filter(p => p.active).map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name} - {formatCurrency(product.unit_price)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input
                  type="number"
                  value={newLine.quantity}
                  onChange={(e) => setNewLine(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowAddLine(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={addLineItem}
                  disabled={saving || !newLine.item_id}
                  style={{ backgroundColor: theme.primary }}
                  className="flex-1 px-4 py-2 text-white rounded-md hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Adding...' : 'Add Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
