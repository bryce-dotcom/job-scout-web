import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Plus, Search, FileText } from 'lucide-react'

const defaultTheme = {
  primary: '#2563eb'
}

const statusColors = {
  'Draft': 'bg-gray-100 text-gray-700',
  'Sent': 'bg-blue-100 text-blue-700',
  'Approved': 'bg-green-100 text-green-700',
  'Rejected': 'bg-red-100 text-red-700',
  'Expired': 'bg-yellow-100 text-yellow-700'
}

export default function Quotes() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const quotes = useStore((state) => state.quotes)
  const leads = useStore((state) => state.leads)
  const customers = useStore((state) => state.customers)
  const employees = useStore((state) => state.employees)
  const fetchQuotes = useStore((state) => state.fetchQuotes)

  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    lead_id: '',
    customer_id: '',
    salesperson_id: '',
    service_type: '',
    notes: ''
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
    fetchQuotes()
  }, [companyId, navigate, fetchQuotes])

  const filteredQuotes = quotes.filter(quote => {
    const customerName = quote.customer?.name || quote.lead?.customer_name || ''
    const matchesSearch = searchTerm === '' ||
      customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.quote_id?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || quote.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleCreateQuote = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const quoteNumber = `Q-${Date.now().toString(36).toUpperCase()}`

    const { data, error: insertError } = await supabase
      .from('quotes')
      .insert([{
        company_id: companyId,
        quote_id: quoteNumber,
        lead_id: formData.lead_id || null,
        customer_id: formData.customer_id || null,
        salesperson_id: formData.salesperson_id || null,
        service_type: formData.service_type || null,
        notes: formData.notes || null,
        status: 'Draft',
        quote_amount: 0
      }])
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    setShowModal(false)
    setFormData({ lead_id: '', customer_id: '', salesperson_id: '', service_type: '', notes: '' })
    await fetchQuotes()
    navigate(`/quotes/${data.id}`)
    setLoading(false)
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quotes</h1>
        <button
          onClick={() => setShowModal(true)}
          style={{ backgroundColor: theme.primary }}
          className="flex items-center gap-2 px-4 py-2 text-white rounded-md hover:opacity-90"
        >
          <Plus size={20} />
          New Quote
        </button>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search quotes..."
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
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      {filteredQuotes.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <FileText size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">
            {searchTerm || statusFilter !== 'all'
              ? 'No quotes match your search.'
              : 'No quotes yet. Create your first quote.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quote #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Salesperson</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredQuotes.map((quote) => (
                <tr
                  key={quote.id}
                  onClick={() => navigate(`/quotes/${quote.id}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 text-sm font-medium text-blue-600">
                    {quote.quote_id || `#${quote.id}`}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">
                      {quote.customer?.name || quote.lead?.customer_name || '-'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                    {formatCurrency(quote.quote_amount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full ${statusColors[quote.status] || 'bg-gray-100 text-gray-600'}`}>
                      {quote.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(quote.sent_date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {quote.salesperson?.name || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Quote Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">New Quote</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateQuote} className="p-4">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lead</label>
                  <select
                    name="lead_id"
                    value={formData.lead_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select Lead --</option>
                    {leads.filter(l => l.status !== 'Not Qualified').map(lead => (
                      <option key={lead.id} value={lead.id}>{lead.customer_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Or Customer</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
                  <input
                    type="text"
                    name="service_type"
                    value={formData.service_type}
                    onChange={handleChange}
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
                  {loading ? 'Creating...' : 'Create Quote'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
