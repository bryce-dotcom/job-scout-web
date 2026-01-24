import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Plus, X, DollarSign, User, ChevronRight } from 'lucide-react'

const defaultTheme = {
  primary: '#2563eb'
}

const stages = [
  { id: 'New Lead', label: 'New Lead', color: 'bg-blue-500' },
  { id: 'Quoted', label: 'Quoted', color: 'bg-yellow-500' },
  { id: 'Under Review', label: 'Under Review', color: 'bg-orange-500' },
  { id: 'Approved', label: 'Approved', color: 'bg-green-500' },
  { id: 'Lost', label: 'Lost', color: 'bg-red-500' }
]

export default function SalesPipeline() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const salesPipeline = useStore((state) => state.salesPipeline)
  const leads = useStore((state) => state.leads)
  const customers = useStore((state) => state.customers)
  const employees = useStore((state) => state.employees)
  const fetchSalesPipeline = useStore((state) => state.fetchSalesPipeline)

  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [formData, setFormData] = useState({
    lead_id: '',
    customer_id: '',
    salesperson_id: '',
    stage: 'New Lead',
    quote_amount: '',
    quote_status: '',
    contract_required: false,
    contract_signed: false,
    notes: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const theme = defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchSalesPipeline()
  }, [companyId, navigate, fetchSalesPipeline])

  const getItemsByStage = (stageId) => {
    return salesPipeline.filter(item => item.stage === stageId)
  }

  const moveToStage = async (item, newStage) => {
    await supabase
      .from('sales_pipeline')
      .update({ stage: newStage, updated_at: new Date().toISOString() })
      .eq('id', item.id)

    await fetchSalesPipeline()
  }

  const openAddModal = () => {
    setEditingItem(null)
    setFormData({
      lead_id: '',
      customer_id: '',
      salesperson_id: '',
      stage: 'New Lead',
      quote_amount: '',
      quote_status: '',
      contract_required: false,
      contract_signed: false,
      notes: ''
    })
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (item) => {
    setEditingItem(item)
    setFormData({
      lead_id: item.lead_id || '',
      customer_id: item.customer_id || '',
      salesperson_id: item.salesperson_id || '',
      stage: item.stage || 'New Lead',
      quote_amount: item.quote_amount || '',
      quote_status: item.quote_status || '',
      contract_required: item.contract_required || false,
      contract_signed: item.contract_signed || false,
      notes: item.notes || ''
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingItem(null)
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
      company_id: companyId,
      lead_id: formData.lead_id || null,
      customer_id: formData.customer_id || null,
      salesperson_id: formData.salesperson_id || null,
      stage: formData.stage,
      quote_amount: formData.quote_amount || null,
      quote_status: formData.quote_status || null,
      contract_required: formData.contract_required,
      contract_signed: formData.contract_signed,
      notes: formData.notes,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingItem) {
      result = await supabase
        .from('sales_pipeline')
        .update(payload)
        .eq('id', editingItem.id)
    } else {
      result = await supabase
        .from('sales_pipeline')
        .insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchSalesPipeline()
    closeModal()
    setLoading(false)
  }

  const handleDelete = async () => {
    if (!editingItem || !confirm('Delete this pipeline item?')) return

    await supabase.from('sales_pipeline').delete().eq('id', editingItem.id)
    await fetchSalesPipeline()
    closeModal()
  }

  const formatCurrency = (amount) => {
    if (!amount) return ''
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const totalByStage = (stageId) => {
    return getItemsByStage(stageId).reduce((sum, item) => sum + (parseFloat(item.quote_amount) || 0), 0)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sales Pipeline</h1>
        <button
          onClick={openAddModal}
          style={{ backgroundColor: theme.primary }}
          className="flex items-center gap-2 px-4 py-2 text-white rounded-md hover:opacity-90"
        >
          <Plus size={20} />
          Add Deal
        </button>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <div key={stage.id} className="flex-shrink-0 w-72">
            {/* Column Header */}
            <div className={`${stage.color} text-white px-3 py-2 rounded-t-lg`}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{stage.label}</span>
                <span className="text-sm bg-white/20 px-2 py-0.5 rounded">
                  {getItemsByStage(stage.id).length}
                </span>
              </div>
              {totalByStage(stage.id) > 0 && (
                <p className="text-sm opacity-90 mt-1">
                  {formatCurrency(totalByStage(stage.id))}
                </p>
              )}
            </div>

            {/* Column Content */}
            <div className="bg-gray-100 p-2 rounded-b-lg min-h-[400px] space-y-2">
              {getItemsByStage(stage.id).map((item) => (
                <div
                  key={item.id}
                  onClick={() => openEditModal(item)}
                  className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                >
                  <h4 className="font-medium text-gray-900 mb-1">
                    {item.lead?.customer_name || item.customer?.name || 'Unnamed'}
                  </h4>

                  {item.quote_amount && (
                    <div className="flex items-center gap-1 text-green-600 text-sm mb-2">
                      <DollarSign size={14} />
                      <span>{formatCurrency(item.quote_amount)}</span>
                    </div>
                  )}

                  {item.salesperson && (
                    <div className="flex items-center gap-1 text-gray-500 text-xs">
                      <User size={12} />
                      <span>{item.salesperson.name}</span>
                    </div>
                  )}

                  {/* Stage navigation */}
                  <div className="flex gap-1 mt-3 pt-2 border-t">
                    {stages.map((s, idx) => {
                      const currentIdx = stages.findIndex(st => st.id === item.stage)
                      const isNext = idx === currentIdx + 1
                      const isPrev = idx === currentIdx - 1

                      if (!isNext && !isPrev) return null

                      return (
                        <button
                          key={s.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            moveToStage(item, s.id)
                          }}
                          className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${
                            isNext
                              ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {isPrev && <ChevronRight size={12} className="rotate-180" />}
                          {s.label}
                          {isNext && <ChevronRight size={12} />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {getItemsByStage(stage.id).length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No deals
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">
                {editingItem ? 'Edit Deal' : 'Add Deal'}
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

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
                    <select
                      name="stage"
                      value={formData.stage}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {stages.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
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
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quote Amount</label>
                    <input
                      type="number"
                      name="quote_amount"
                      value={formData.quote_amount}
                      onChange={handleChange}
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quote Status</label>
                    <select
                      name="quote_status"
                      value={formData.quote_status}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Select --</option>
                      <option value="Draft">Draft</option>
                      <option value="Sent">Sent</option>
                      <option value="Viewed">Viewed</option>
                      <option value="Accepted">Accepted</option>
                      <option value="Declined">Declined</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-6">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="contract_required"
                      checked={formData.contract_required}
                      onChange={handleChange}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Contract Required</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="contract_signed"
                      checked={formData.contract_signed}
                      onChange={handleChange}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Contract Signed</span>
                  </label>
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
                {editingItem && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md"
                  >
                    Delete
                  </button>
                )}
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
                  {loading ? 'Saving...' : (editingItem ? 'Update' : 'Add Deal')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
