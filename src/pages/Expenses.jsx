import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { EXPENSE_CATEGORIES } from '../lib/schema'
import { isAdmin as checkAdmin } from '../lib/accessControl'
import { Plus, Pencil, Trash2, X, Receipt, Search, DollarSign, Upload, Download, Image, ExternalLink, Camera } from 'lucide-react'
import ImportExportModal, { exportToCSV } from '../components/ImportExportModal'
import { expensesFields } from '../lib/importExportFields'

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
  category: '',
  tax_category: '',
  form_1065_category: '',
  account: '',
  business: '',
  client: '',
  merchant: '',
  source: '',
  description: '',
  receipt: '',
  date: new Date().toISOString().split('T')[0],
  amount: '',
  expense_id: '',
  status: 'Pending',
  notes: ''
}

// Resolve signed URL for receipt images in private bucket
const useReceiptUrl = (expense) => {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let cancelled = false
    // Determine storage path: use receipt_storage_path, or extract from receipt_url
    let storagePath = expense?.receipt_storage_path
    if (!storagePath && expense?.receipt_url) {
      const match = expense.receipt_url.match(/\/storage\/v1\/object\/public\/project-documents\/(.+)/)
      if (match) storagePath = decodeURIComponent(match[1])
    }
    if (storagePath) {
      supabase.storage.from('project-documents')
        .createSignedUrl(storagePath, 3600)
        .then(({ data }) => { if (!cancelled && data?.signedUrl) setUrl(data.signedUrl) })
    } else {
      setUrl(null)
    }
    return () => { cancelled = true }
  }, [expense?.id, expense?.receipt_storage_path, expense?.receipt_url])
  return url
}

// Wrapper to render a receipt thumbnail with signed URL
const ReceiptCell = ({ expense, theme, onPreview }) => {
  const url = useReceiptUrl(expense)
  if (!url) return (
    <div style={{ width: '40px', height: '40px', borderRadius: '6px', border: `1px dashed ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
      <Receipt size={14} color={theme.textMuted} />
    </div>
  )
  return (
    <button
      onClick={() => onPreview(url)}
      style={{ width: '40px', height: '40px', borderRadius: '6px', border: `1px solid ${theme.border}`, padding: 0, cursor: 'pointer', overflow: 'hidden', backgroundColor: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <img src={url} alt="Receipt" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none' }} />
    </button>
  )
}

// Preview button for receipt in edit modal
const EditReceiptPreview = ({ expense, fallbackUrl, theme, onPreview }) => {
  const signedUrl = useReceiptUrl(expense)
  const url = signedUrl || fallbackUrl
  if (!url) return null
  return (
    <button
      type="button"
      onClick={() => onPreview(url)}
      style={{ width: '64px', height: '64px', borderRadius: '8px', border: `1px solid ${theme.border}`, padding: 0, cursor: 'pointer', overflow: 'hidden', backgroundColor: theme.bg, flexShrink: 0 }}
    >
      <img src={url} alt="Receipt" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </button>
  )
}

export default function Expenses() {
  const navigate = useNavigate()
  const user = useStore((state) => state.user)
  const companyId = useStore((state) => state.companyId)
  const expenses = useStore((state) => state.expenses)
  const fetchExpenses = useStore((state) => state.fetchExpenses)

  const [showModal, setShowModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [formData, setFormData] = useState(emptyExpense)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showImportExport, setShowImportExport] = useState(false)
  const [previewImage, setPreviewImage] = useState(null)
  const [receiptUploading, setReceiptUploading] = useState(false)
  const receiptInputRef = useRef(null)

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchExpenses()
  }, [companyId, navigate, fetchExpenses])

  const filteredExpenses = expenses.filter(expense => {
    const matchesCategory = categoryFilter === 'all' || expense.category === categoryFilter
    if (!matchesCategory) return false
    if (!searchTerm) return true
    const s = searchTerm.toLowerCase()
    return (
      expense.description?.toLowerCase().includes(s) ||
      expense.merchant?.toLowerCase().includes(s) ||
      expense.vendor?.toLowerCase().includes(s) ||
      expense.client?.toLowerCase().includes(s) ||
      expense.business?.toLowerCase().includes(s) ||
      expense.account?.toLowerCase().includes(s) ||
      expense.source?.toLowerCase().includes(s) ||
      expense.category?.toLowerCase().includes(s) ||
      expense.expense_id?.toLowerCase().includes(s) ||
      expense.lead?.customer_name?.toLowerCase().includes(s) ||
      expense.job?.job_title?.toLowerCase().includes(s)
    )
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
      category: expense.category || '',
      tax_category: expense.tax_category || '',
      form_1065_category: expense.form_1065_category || '',
      account: expense.account || '',
      business: expense.business || '',
      client: expense.client || '',
      merchant: expense.merchant || '',
      source: expense.source || '',
      description: expense.description || '',
      receipt: expense.receipt || '',
      date: expense.date || '',
      amount: expense.amount || '',
      expense_id: expense.expense_id || '',
      status: expense.status || 'Pending',
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
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleReceiptUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setReceiptUploading(true)

    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `expenses/receipts/${timestamp}_${safeName}`

    const { error: uploadErr } = await supabase.storage
      .from('project-documents')
      .upload(storagePath, file, { contentType: file.type })

    if (uploadErr) {
      setError('Receipt upload failed: ' + uploadErr.message)
      setReceiptUploading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('project-documents').getPublicUrl(storagePath)

    if (editingExpense) {
      await supabase.from('expenses').update({
        receipt_url: urlData.publicUrl,
        receipt_storage_path: storagePath
      }).eq('id', editingExpense.id)
      setEditingExpense({ ...editingExpense, receipt_url: urlData.publicUrl, receipt_storage_path: storagePath })
    } else {
      setFormData(prev => ({ ...prev, _receipt_url: urlData.publicUrl, _receipt_storage_path: storagePath }))
    }

    setReceiptUploading(false)
    if (receiptInputRef.current) receiptInputRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      company_id: companyId,
      category: formData.category || null,
      tax_category: formData.tax_category || null,
      form_1065_category: formData.form_1065_category || null,
      account: formData.account || null,
      business: formData.business || null,
      client: formData.client || null,
      merchant: formData.merchant || null,
      source: formData.source || null,
      description: formData.description || null,
      receipt: formData.receipt || null,
      date: formData.date || null,
      amount: parseFloat(formData.amount) || 0,
      expense_id: formData.expense_id || null,
      status: formData.status || 'Pending',
      notes: formData.notes || null,
      updated_at: new Date().toISOString()
    }

    // Include receipt upload data for new expenses
    if (!editingExpense && formData._receipt_url) {
      payload.receipt_url = formData._receipt_url
      payload.receipt_storage_path = formData._receipt_storage_path
    }

    let result
    if (editingExpense) {
      result = await supabase.from('expenses').update(payload).eq('id', editingExpense.id)
    } else {
      result = await supabase.from('expenses').insert([payload])
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
    if (!confirm('Delete this expense?')) return
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

  const getLinkedEntity = (expense) => {
    if (expense.job) return { label: expense.job.job_title || `Job #${expense.job.job_id || expense.job.id}`, path: `/jobs/${expense.job_id}`, color: '#3b82f6' }
    if (expense.quote) return { label: `Estimate ${expense.quote.quote_id || '#' + expense.quote_id}`, path: `/quotes/${expense.quote_id}`, color: '#a855f7' }
    if (expense.lead) return { label: expense.lead.customer_name || `Lead #${expense.lead_id}`, path: `/leads/${expense.lead_id}`, color: '#22c55e' }
    if (expense.job_id) return { label: `Job #${expense.job_id}`, path: `/jobs/${expense.job_id}`, color: '#3b82f6' }
    if (expense.quote_id) return { label: `Estimate #${expense.quote_id}`, path: `/quotes/${expense.quote_id}`, color: '#a855f7' }
    if (expense.lead_id) return { label: `Lead #${expense.lead_id}`, path: `/leads/${expense.lead_id}`, color: '#22c55e' }
    return null
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

  if (!user) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '14px', color: '#7d8a7f' }}>Loading...</div>
      </div>
    )
  }

  if (!checkAdmin(user)) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '16px', fontWeight: '600', color: '#2c3530', marginBottom: '8px' }}>Access Restricted</div>
        <div style={{ fontSize: '14px', color: '#7d8a7f' }}>You don't have permission to view this page. Contact your admin for access.</div>
      </div>
    )
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px',
        flexWrap: 'wrap',
        flexDirection: isMobile ? 'column' : 'row'
      }}>
        <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text }}>
          Expenses
        </h1>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowImportExport(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Upload size={18} /> Import
          </button>
          <button onClick={() => exportToCSV(filteredExpenses, expensesFields, 'expenses_export')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Download size={18} /> Export
          </button>
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
      </div>

      {/* Summary Card */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
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
            No expenses found. Add your first expense or import from a file.
          </p>
        </div>
      ) : (
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr style={{ backgroundColor: theme.accentBg, borderBottom: `1px solid ${theme.border}` }}>
                {['Receipt', 'Date', 'Description', 'Category', 'Merchant', 'Linked To', 'Source', 'Status', 'Amount', ''].map((col, i) => (
                  <th key={i} style={{
                    padding: '12px 10px',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: theme.textMuted,
                    textTransform: 'uppercase',
                    textAlign: col === 'Amount' ? 'right' : 'left',
                    whiteSpace: 'nowrap'
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((expense) => {
                const linked = getLinkedEntity(expense)
                return (
                  <tr key={expense.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {/* Receipt thumbnail */}
                    <td style={{ padding: '8px 10px', width: '56px' }}>
                      {(expense.receipt_storage_path || expense.receipt_url) ? (
                        <ReceiptCell expense={expense} theme={theme} onPreview={setPreviewImage} />
                      ) : (
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '6px',
                          border: `1px dashed ${theme.border}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: theme.bg
                        }}>
                          <Receipt size={14} color={theme.border} />
                        </div>
                      )}
                    </td>
                    {/* Date */}
                    <td style={{ padding: '10px', fontSize: '13px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
                      {formatDate(expense.date)}
                    </td>
                    {/* Description */}
                    <td style={{ padding: '10px', fontSize: '13px', color: theme.text, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {expense.description || '-'}
                    </td>
                    {/* Category */}
                    <td style={{ padding: '10px', fontSize: '13px' }}>
                      {expense.category ? (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          backgroundColor: theme.accentBg,
                          borderRadius: '6px',
                          fontSize: '12px',
                          color: theme.accent,
                          whiteSpace: 'nowrap'
                        }}>
                          {expense.category}
                        </span>
                      ) : '-'}
                    </td>
                    {/* Merchant */}
                    <td style={{ padding: '10px', fontSize: '13px', color: theme.textSecondary }}>
                      {expense.merchant || expense.vendor || '-'}
                    </td>
                    {/* Linked entity */}
                    <td style={{ padding: '10px', fontSize: '13px' }}>
                      {linked ? (
                        <button
                          onClick={() => navigate(linked.path)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            backgroundColor: linked.color + '15',
                            color: linked.color,
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {linked.label}
                          <ExternalLink size={10} />
                        </button>
                      ) : (
                        <span style={{ color: theme.textMuted }}>-</span>
                      )}
                    </td>
                    {/* Source */}
                    <td style={{ padding: '10px', fontSize: '13px', color: theme.textSecondary }}>
                      {expense.source || '-'}
                    </td>
                    {/* Status */}
                    <td style={{ padding: '10px', fontSize: '13px' }}>
                      {expense.status ? (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          backgroundColor: expense.status === 'Approved' ? '#22c55e15' : expense.status === 'Denied' ? '#ef444415' : expense.status === 'Paid' ? '#3b82f615' : theme.accentBg,
                          color: expense.status === 'Approved' ? '#22c55e' : expense.status === 'Denied' ? '#ef4444' : expense.status === 'Paid' ? '#3b82f6' : theme.accent,
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '500',
                          whiteSpace: 'nowrap'
                        }}>
                          {expense.status}
                        </span>
                      ) : '-'}
                    </td>
                    {/* Amount */}
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: '600', color: theme.text, whiteSpace: 'nowrap' }}>
                      {formatCurrency(expense.amount)}
                    </td>
                    {/* Actions */}
                    <td style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => openEditModal(expense)}
                        style={{ padding: '6px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: theme.textMuted }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(expense)}
                        style={{ padding: '6px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: theme.textMuted }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Receipt Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 60,
            cursor: 'pointer'
          }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <button
              onClick={() => setPreviewImage(null)}
              style={{
                position: 'absolute',
                top: '-12px',
                right: '-12px',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#fff',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
              }}
            >
              <X size={16} color="#333" />
            </button>
            <img
              src={previewImage}
              alt="Receipt"
              style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: '8px', objectFit: 'contain' }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
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
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '700px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column'
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

            <form onSubmit={handleSubmit} style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
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
                {/* Receipt Upload */}
                <div>
                  <label style={labelStyle}>Receipt Photo</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {(editingExpense?.receipt_storage_path || editingExpense?.receipt_url || formData._receipt_url) ? (
                      <EditReceiptPreview expense={editingExpense} fallbackUrl={formData._receipt_url} theme={theme} onPreview={setPreviewImage} />
                    ) : (
                      <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '8px',
                        border: `2px dashed ${theme.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: theme.bg,
                        flexShrink: 0
                      }}>
                        <Camera size={20} color={theme.textMuted} />
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <input
                        ref={receiptInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleReceiptUpload}
                        style={{ display: 'none' }}
                      />
                      <button
                        type="button"
                        onClick={() => receiptInputRef.current?.click()}
                        disabled={receiptUploading}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 14px',
                          backgroundColor: theme.accentBg,
                          color: theme.accent,
                          border: `1px solid ${theme.border}`,
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: '500',
                          cursor: receiptUploading ? 'not-allowed' : 'pointer',
                          opacity: receiptUploading ? 0.6 : 1
                        }}
                      >
                        <Upload size={14} />
                        {receiptUploading ? 'Uploading...' : (editingExpense?.receipt_url || formData._receipt_url) ? 'Replace Photo' : 'Upload Receipt'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Row 1: Category, Tax Category, 1065 Category */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Category</label>
                    <select name="category" value={formData.category} onChange={handleChange} style={inputStyle}>
                      <option value="">Select category</option>
                      {EXPENSE_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Tax Category</label>
                    <input type="text" name="tax_category" value={formData.tax_category} onChange={handleChange} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Form 1065 Category</label>
                    <input type="text" name="form_1065_category" value={formData.form_1065_category} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                {/* Row 2: Account, Business */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Account</label>
                    <input type="text" name="account" value={formData.account} onChange={handleChange} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Business</label>
                    <input type="text" name="business" value={formData.business} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                {/* Row 3: Client, Merchant */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Client</label>
                    <input type="text" name="client" value={formData.client} onChange={handleChange} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Merchant</label>
                    <input type="text" name="merchant" value={formData.merchant} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                {/* Row 4: Source, Description */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Source</label>
                    <input type="text" name="source" value={formData.source} onChange={handleChange} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Description</label>
                    <input type="text" name="description" value={formData.description} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                {/* Row 5: Receipt text, Date, Amount */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Receipt Ref</label>
                    <input type="text" name="receipt" value={formData.receipt} onChange={handleChange} style={inputStyle} placeholder="Receipt number" />
                  </div>
                  <div>
                    <label style={labelStyle}>Date *</label>
                    <input type="date" name="date" value={formData.date} onChange={handleChange} required style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Amount *</label>
                    <input type="number" name="amount" value={formData.amount} onChange={handleChange} step="0.01" required style={inputStyle} />
                  </div>
                </div>

                {/* Row 6: Expense ID, Status */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Expense ID</label>
                    <input type="text" name="expense_id" value={formData.expense_id} onChange={handleChange} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select name="status" value={formData.status} onChange={handleChange} style={inputStyle}>
                      <option value="Pending">Pending</option>
                      <option value="Approved">Approved</option>
                      <option value="Denied">Denied</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea name="notes" value={formData.notes} onChange={handleChange} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
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
      {showImportExport && (
        <ImportExportModal
          tableName="expenses"
          entityName="Expenses"
          fields={expensesFields}
          companyId={companyId}
          requiredField="amount"
          defaultValues={{ company_id: companyId, status: 'Pending' }}
          onImportComplete={() => fetchExpenses()}
          onClose={() => setShowImportExport(false)}
        />
      )}
    </div>
  )
}
