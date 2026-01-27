import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { EXPENSE_CATEGORIES } from '../lib/schema'
import { Plus, Pencil, Trash2, X, Receipt, Search, Calendar, DollarSign } from 'lucide-react'

const defaultTheme = {
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

const emptyExpense = {
  expense_date: new Date().toISOString().split('T')[0],
  category: '',
  description: '',
  amount: '',
  employee_id: '',
  job_id: '',
  vendor: '',
  receipt_url: '',
  reimbursable: true,
  reimbursed: false,
  notes: ''
}

export default function Expenses() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const expenses = useStore((state) => state.expenses)
  const employees = useStore((state) => state.employees)
  const jobs = useStore((state) => state.jobs)
  const fetchExpenses = useStore((state) => state.fetchExpenses)

  const [showModal, setShowModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [formData, setFormData] = useState(emptyExpense)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchExpenses()
  }, [companyId, navigate, fetchExpenses])

  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = searchTerm === '' ||
      expense.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.vendor?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || expense.category === categoryFilter
    const matchesDateStart = !dateRange.start || expense.expense_date >= dateRange.start
    const matchesDateEnd = !dateRange.end || expense.expense_date <= dateRange.end
    return matchesSearch && matchesCategory && matchesDateStart && matchesDateEnd
  })

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)

  const openAddModal = () => {
    setEditingExpense(null)
    setFormData(emptyExpense)
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (expense) => {
    setEditingExpense(expense)
    setFormData({
      expense_date: expense.expense_date || '',
      category: expense.category || '',
      description: expense.description || '',
      amount: expense.amount || '',
      employee_id: expense.employee_id || '',
      job_id: expense.job_id || '',
      vendor: expense.vendor || '',
      receipt_url: expense.receipt_url || '',
      reimbursable: expense.reimbursable ?? true,
      reimbursed: expense.reimbursed ?? false,
      notes: expense.notes || ''
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingExpense(null)
    setFormData(emptyExpense)
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
      expense_date: formData.expense_date,
      category: formData.category,
      description: formData.description,
      amount: parseFloat(formData.amount) || 0,
      employee_id: formData.employee_id || null,
      job_id: formData.job_id || null,
      vendor: formData.vendor || null,
      receipt_url: formData.receipt_url || null,
      reimbursable: formData.reimbursable,
      reimbursed: formData.reimbursed,
      notes: formData.notes || null,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingExpense) {
      result = await supabase
        .from('expenses')
        .update(payload)
        .eq('id', editingExpense.id)
    } else {
      result = await supabase
        .from('expenses')
        .insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchExpenses()
    closeModal()
    setLoading(false)
  }

  const handleDelete = async (expense) => {
    if (!confirm(`Delete this expense?`)) return
    await supabase.from('expenses').delete().eq('id', expense.id)
    await fetchExpenses()
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: theme.text,
    backgroundColor: theme.bgCard,
    outline: 'none'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: '6px'
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
          Expenses
        </h1>
        <button
          onClick={openAddModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            backgroundColor: theme.accent,
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          <Plus size={18} />
          Add Expense
        </button>
      </div>

      {/* Summary Card */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: theme.accentBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <DollarSign size={24} style={{ color: theme.accent }} />
            </div>
            <div>
              <p style={{ fontSize: '13px', color: theme.textMuted }}>Total Expenses</p>
              <p style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
                {formatCurrency(totalExpenses)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={18} style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: theme.textMuted
          }} />
          <input
            type="text"
            placeholder="Search expenses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, paddingLeft: '40px' }}
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ ...inputStyle, width: 'auto', minWidth: '150px' }}
        >
          <option value="all">All Categories</option>
          {EXPENSE_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <input
          type="date"
          value={dateRange.start}
          onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
          style={{ ...inputStyle, width: 'auto' }}
          placeholder="Start Date"
        />
        <input
          type="date"
          value={dateRange.end}
          onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
          style={{ ...inputStyle, width: 'auto' }}
          placeholder="End Date"
        />
      </div>

      {/* Table */}
      {filteredExpenses.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <Receipt size={48} style={{ color: theme.textMuted, marginBottom: '16px', opacity: 0.5 }} />
          <p style={{ color: theme.textSecondary, fontSize: '15px' }}>
            No expenses found. Add your first expense.
          </p>
        </div>
      ) : (
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          overflow: 'hidden'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '100px 1fr 120px 120px 100px 80px',
            gap: '16px',
            padding: '14px 20px',
            backgroundColor: theme.accentBg,
            borderBottom: `1px solid ${theme.border}`,
            fontSize: '12px',
            fontWeight: '600',
            color: theme.textMuted,
            textTransform: 'uppercase'
          }}>
            <div>Date</div>
            <div>Description</div>
            <div>Category</div>
            <div style={{ textAlign: 'right' }}>Amount</div>
            <div>Employee</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {filteredExpenses.map((expense) => (
            <div
              key={expense.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '100px 1fr 120px 120px 100px 80px',
                gap: '16px',
                padding: '16px 20px',
                borderBottom: `1px solid ${theme.border}`,
                alignItems: 'center'
              }}
            >
              <div style={{ fontSize: '14px', color: theme.textSecondary }}>
                {formatDate(expense.expense_date)}
              </div>
              <div>
                <p style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>
                  {expense.description || 'No description'}
                </p>
                {expense.vendor && (
                  <p style={{ fontSize: '12px', color: theme.textMuted }}>{expense.vendor}</p>
                )}
              </div>
              <div>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  backgroundColor: theme.accentBg,
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: theme.accent
                }}>
                  {expense.category}
                </span>
              </div>
              <div style={{ textAlign: 'right', fontWeight: '600', color: theme.text }}>
                {formatCurrency(expense.amount)}
              </div>
              <div style={{ fontSize: '13px', color: theme.textSecondary }}>
                {expense.employee?.name || '-'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                <button
                  onClick={() => openEditModal(expense)}
                  style={{
                    padding: '8px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: theme.textMuted
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(expense)}
                  style={{
                    padding: '8px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: theme.textMuted
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 50
        }}>
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            width: '100%',
            maxWidth: '550px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                {editingExpense ? 'Edit Expense' : 'Add Expense'}
              </h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
              {error && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  color: '#dc2626',
                  fontSize: '14px'
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Date *</label>
                    <input type="date" name="expense_date" value={formData.expense_date} onChange={handleChange} required style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Amount *</label>
                    <input type="number" name="amount" value={formData.amount} onChange={handleChange} step="0.01" required style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Category *</label>
                  <select name="category" value={formData.category} onChange={handleChange} required style={inputStyle}>
                    <option value="">Select category</option>
                    {EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <input type="text" name="description" value={formData.description} onChange={handleChange} style={inputStyle} />
                </div>

                <div>
                  <label style={labelStyle}>Vendor</label>
                  <input type="text" name="vendor" value={formData.vendor} onChange={handleChange} style={inputStyle} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Employee</label>
                    <select name="employee_id" value={formData.employee_id} onChange={handleChange} style={inputStyle}>
                      <option value="">Select employee</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Job</label>
                    <select name="job_id" value={formData.job_id} onChange={handleChange} style={inputStyle}>
                      <option value="">Select job</option>
                      {jobs.map(job => (
                        <option key={job.id} value={job.id}>{job.job_id} - {job.job_title}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea name="notes" value={formData.notes} onChange={handleChange} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                <div style={{ display: 'flex', gap: '24px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" name="reimbursable" checked={formData.reimbursable} onChange={handleChange} style={{ width: '16px', height: '16px', accentColor: theme.accent }} />
                    <span style={{ fontSize: '14px', color: theme.text }}>Reimbursable</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" name="reimbursed" checked={formData.reimbursed} onChange={handleChange} style={{ width: '16px', height: '16px', accentColor: theme.accent }} />
                    <span style={{ fontSize: '14px', color: theme.text }}>Reimbursed</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={closeModal} style={{
                  flex: 1, padding: '10px 16px', border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent', color: theme.text, borderRadius: '8px', fontSize: '14px', cursor: 'pointer'
                }}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} style={{
                  flex: 1, padding: '10px 16px', backgroundColor: theme.accent, color: '#ffffff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
                  cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1
                }}>
                  {loading ? 'Saving...' : (editingExpense ? 'Update' : 'Add Expense')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
