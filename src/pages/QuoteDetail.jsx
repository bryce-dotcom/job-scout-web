import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { ArrowLeft, Plus, Trash2, Send, CheckCircle, XCircle, Briefcase } from 'lucide-react'

const defaultTheme = {
  primary: '#2563eb'
}

const statusColors = {
  'Draft': 'bg-gray-100 text-gray-700',
  'Sent': 'bg-blue-100 text-blue-700',
  'Approved': 'bg-green-100 text-green-700',
  'Rejected': 'bg-red-100 text-red-700'
}

export default function QuoteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const products = useStore((state) => state.products)
  const fetchQuotes = useStore((state) => state.fetchQuotes)

  const [quote, setQuote] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddLine, setShowAddLine] = useState(false)
  const [newLine, setNewLine] = useState({ item_id: '', quantity: 1 })

  const theme = defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchQuoteData()
  }, [companyId, id, navigate])

  const fetchQuoteData = async () => {
    setLoading(true)

    const { data: quoteData } = await supabase
      .from('quotes')
      .select('*, lead:leads(id, customer_name, phone, email, address), customer:customers(id, name, email, phone, address), salesperson:employees(id, name)')
      .eq('id', id)
      .single()

    if (quoteData) {
      setQuote(quoteData)

      const { data: lines } = await supabase
        .from('quote_lines')
        .select('*, item:products_services(id, name, description)')
        .eq('quote_id', id)
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

    await supabase.from('quote_lines').insert([{
      company_id: companyId,
      quote_id: parseInt(id),
      item_id: product.id,
      quantity: newLine.quantity,
      unit_price: product.unit_price,
      line_total: lineTotal
    }])

    await updateQuoteTotal()
    await fetchQuoteData()

    setNewLine({ item_id: '', quantity: 1 })
    setShowAddLine(false)
    setSaving(false)
  }

  const removeLineItem = async (lineId) => {
    setSaving(true)
    await supabase.from('quote_lines').delete().eq('id', lineId)
    await updateQuoteTotal()
    await fetchQuoteData()
    setSaving(false)
  }

  const updateQuoteTotal = async () => {
    const { data: lines } = await supabase
      .from('quote_lines')
      .select('line_total')
      .eq('quote_id', id)

    const total = (lines || []).reduce((sum, line) => sum + (parseFloat(line.line_total) || 0), 0)

    await supabase.from('quotes').update({
      quote_amount: total,
      updated_at: new Date().toISOString()
    }).eq('id', id)
  }

  const updateQuoteField = async (field, value) => {
    setSaving(true)
    await supabase.from('quotes').update({
      [field]: value,
      updated_at: new Date().toISOString()
    }).eq('id', id)
    await fetchQuoteData()
    setSaving(false)
  }

  const sendQuote = async () => {
    await updateQuoteField('status', 'Sent')
    await supabase.from('quotes').update({
      sent_date: new Date().toISOString()
    }).eq('id', id)
    await fetchQuoteData()
    await fetchQuotes()
  }

  const approveQuote = async () => {
    await updateQuoteField('status', 'Approved')
    await fetchQuotes()
  }

  const rejectQuote = async () => {
    await updateQuoteField('status', 'Rejected')
    await fetchQuotes()
  }

  const convertToJob = async () => {
    if (!confirm('Convert this quote to a job?')) return
    // For now, just mark as approved - Jobs module will be built next
    await approveQuote()
    alert('Quote approved! Jobs module coming soon.')
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-600">Loading quote...</p>
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="p-6">
        <p className="text-red-600">Quote not found</p>
        <button onClick={() => navigate('/quotes')} className="mt-4 text-blue-600 hover:underline">
          Back to Quotes
        </button>
      </div>
    )
  }

  const subtotal = lineItems.reduce((sum, line) => sum + (parseFloat(line.line_total) || 0), 0)
  const discount = parseFloat(quote.discount) || 0
  const incentive = parseFloat(quote.utility_incentive) || 0
  const total = subtotal - discount
  const outOfPocket = total - incentive

  const customerInfo = quote.customer || quote.lead

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/quotes')}
          className="p-2 hover:bg-gray-100 rounded-md"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            Quote {quote.quote_id || `#${quote.id}`}
          </h1>
          <p className="text-gray-600">
            {customerInfo?.name || customerInfo?.customer_name || 'No customer'}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[quote.status]}`}>
          {quote.status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Info */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-3">Customer Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Name</p>
                <p className="font-medium">{customerInfo?.name || customerInfo?.customer_name || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">Email</p>
                <p className="font-medium">{customerInfo?.email || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">Phone</p>
                <p className="font-medium">{customerInfo?.phone || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">Address</p>
                <p className="font-medium">{customerInfo?.address || '-'}</p>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-white rounded-lg shadow">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-medium text-gray-900">Line Items</h3>
              <button
                onClick={() => setShowAddLine(true)}
                style={{ backgroundColor: theme.primary }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-white rounded-md hover:opacity-90"
              >
                <Plus size={16} />
                Add Item
              </button>
            </div>

            {lineItems.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No line items yet. Add products or services to this quote.
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
                        {line.item?.description && (
                          <p className="text-sm text-gray-500 truncate max-w-xs">{line.item.description}</p>
                        )}
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
                </tbody>
              </table>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-3">Notes</h3>
            <textarea
              value={quote.notes || ''}
              onChange={(e) => updateQuoteField('notes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Add notes..."
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Totals */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-4">Quote Summary</h3>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>

              <div className="flex justify-between text-sm items-center">
                <span className="text-gray-600">Discount</span>
                <input
                  type="number"
                  value={quote.discount || ''}
                  onChange={(e) => updateQuoteField('discount', e.target.value || 0)}
                  className="w-24 px-2 py-1 text-right border border-gray-300 rounded"
                  step="0.01"
                />
              </div>

              <div className="flex justify-between text-sm items-center">
                <span className="text-gray-600">Utility Incentive</span>
                <input
                  type="number"
                  value={quote.utility_incentive || ''}
                  onChange={(e) => updateQuoteField('utility_incentive', e.target.value || 0)}
                  className="w-24 px-2 py-1 text-right border border-gray-300 rounded"
                  step="0.01"
                />
              </div>

              <div className="border-t pt-3 flex justify-between font-medium">
                <span>Total</span>
                <span className="text-lg">{formatCurrency(total)}</span>
              </div>

              {incentive > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Out of Pocket</span>
                  <span className="font-medium">{formatCurrency(outOfPocket)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-4">Actions</h3>

            <div className="space-y-2">
              {quote.status === 'Draft' && (
                <button
                  onClick={sendQuote}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send size={18} />
                  Send Quote
                </button>
              )}

              {quote.status === 'Sent' && (
                <>
                  <button
                    onClick={approveQuote}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle size={18} />
                    Mark Approved
                  </button>
                  <button
                    onClick={rejectQuote}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    <XCircle size={18} />
                    Mark Rejected
                  </button>
                </>
              )}

              {quote.status === 'Approved' && (
                <button
                  onClick={convertToJob}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                >
                  <Briefcase size={18} />
                  Convert to Job
                </button>
              )}
            </div>
          </div>

          {/* Contract */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium text-gray-900 mb-3">Contract</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={quote.contract_required || false}
                  onChange={(e) => updateQuoteField('contract_required', e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Contract Required</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={quote.contract_signed || false}
                  onChange={(e) => updateQuoteField('contract_signed', e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700">Contract Signed</span>
              </label>
            </div>
          </div>
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
