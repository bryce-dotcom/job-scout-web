import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { ArrowLeft, Plus, X, DollarSign, CheckCircle, Send, Lock, Pencil, Download, FileText, Trash2 } from 'lucide-react'
import { jsPDF } from 'jspdf'

// Light theme fallback
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

const statusColors = {
  'Pending': { bg: 'rgba(194,139,56,0.12)', text: '#c28b38' },
  'Paid': { bg: 'rgba(74,124,89,0.12)', text: '#4a7c59' },
  'Overdue': { bg: 'rgba(139,90,90,0.12)', text: '#8b5a5a' },
  'Cancelled': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' }
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const company = useStore((state) => state.company)
  const fetchInvoices = useStore((state) => state.fetchInvoices)

  const [invoice, setInvoice] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentData, setPaymentData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    method: 'Cash',
    status: 'Completed',
    notes: ''
  })

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    amount: '',
    discount_applied: '',
    job_description: '',
    notes: ''
  })

  // PDF state
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfHistory, setPdfHistory] = useState([])

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchInvoiceData()
  }, [companyId, id, navigate])

  const fetchInvoiceData = async () => {
    setLoading(true)

    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('*, customer:customers(id, name, email, phone, address), job:jobs(id, job_id, job_title)')
      .eq('id', id)
      .single()

    if (invoiceData) {
      setInvoice(invoiceData)

      // Fetch payments for this invoice
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', id)
        .order('date', { ascending: false })

      setPayments(paymentsData || [])

      // Fetch PDF history from file_attachments
      const invoicePrefix = `invoices/${companyId}/${invoiceData.invoice_id || id}`
      const { data: pdfDocs } = await supabase
        .from('file_attachments')
        .select('*')
        .eq('company_id', companyId)
        .like('file_path', `${invoicePrefix}%`)
        .order('created_at', { ascending: false })

      setPdfHistory(pdfDocs || [])
    }

    setLoading(false)
  }

  const addPayment = async () => {
    if (!paymentData.amount) return

    setSaving(true)

    await supabase.from('payments').insert([{
      company_id: companyId,
      invoice_id: parseInt(id),
      amount: parseFloat(paymentData.amount),
      date: paymentData.date,
      method: paymentData.method,
      status: paymentData.status,
      notes: paymentData.notes || null
    }])

    // Check if invoice is fully paid
    const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) + parseFloat(paymentData.amount)
    if (totalPaid >= parseFloat(invoice.amount)) {
      await supabase.from('invoices').update({
        payment_status: 'Paid',
        updated_at: new Date().toISOString()
      }).eq('id', id)
    }

    await fetchInvoiceData()
    await fetchInvoices()
    setPaymentData({
      amount: '',
      date: new Date().toISOString().split('T')[0],
      method: 'Cash',
      status: 'Completed',
      notes: ''
    })
    setShowPaymentModal(false)
    setSaving(false)
  }

  const markAsPaid = async () => {
    setSaving(true)
    await supabase.from('invoices').update({
      payment_status: 'Paid',
      updated_at: new Date().toISOString()
    }).eq('id', id)
    await fetchInvoiceData()
    await fetchInvoices()
    setSaving(false)
  }

  // Edit mode handlers
  const startEditing = () => {
    setEditForm({
      amount: invoice.amount || '',
      discount_applied: invoice.discount_applied || '',
      job_description: invoice.job_description || '',
      notes: invoice.notes || ''
    })
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditForm({ amount: '', discount_applied: '', job_description: '', notes: '' })
  }

  const saveEdits = async () => {
    setSaving(true)
    const { error } = await supabase.from('invoices').update({
      amount: parseFloat(editForm.amount) || 0,
      discount_applied: parseFloat(editForm.discount_applied) || 0,
      job_description: editForm.job_description || null,
      notes: editForm.notes || null,
      updated_at: new Date().toISOString()
    }).eq('id', id)

    const { toast } = await import('../lib/toast')
    if (error) {
      toast.error('Failed to save: ' + error.message)
    } else {
      toast.success('Invoice updated')
      setIsEditing(false)
      await fetchInvoiceData()
      await fetchInvoices()
    }
    setSaving(false)
  }

  const handleLockInvoice = async () => {
    if (!confirm('Once locked, this invoice cannot be edited. Are you sure?')) return

    setSaving(true)
    const { error } = await supabase.from('invoices').update({
      is_locked: true,
      updated_at: new Date().toISOString()
    }).eq('id', id)

    const { toast } = await import('../lib/toast')
    if (error) {
      toast.error('Failed to lock invoice: ' + error.message)
    } else {
      toast.success('Invoice locked')
      await fetchInvoiceData()
    }
    setSaving(false)
  }

  const handleDeleteInvoice = async () => {
    if (!confirm('Are you sure you want to delete this invoice? This cannot be undone.')) return

    setSaving(true)
    const { toast } = await import('../lib/toast')

    // Delete associated payments first
    await supabase.from('payments').delete().eq('invoice_id', parseInt(id))

    // Delete file attachments linked to this invoice's PDFs
    if (pdfHistory.length > 0) {
      const paths = pdfHistory.map(d => d.file_path)
      await supabase.from('file_attachments').delete().in('file_path', paths)
    }

    const { error } = await supabase.from('invoices').delete().eq('id', id)

    if (error) {
      toast.error('Failed to delete invoice: ' + error.message)
      setSaving(false)
    } else {
      toast.success('Invoice deleted')
      await fetchInvoices()
      navigate('/invoices')
    }
  }

  // PDF generation
  const generateInvoicePDF = () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 20

    // Company header
    const companyName = company?.name || 'Company'
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text(companyName, 20, y)
    y += 10

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    if (company?.address) { doc.text(company.address, 20, y); y += 5 }
    if (company?.phone) { doc.text(company.phone, 20, y); y += 5 }
    if (company?.email) { doc.text(company.email, 20, y); y += 5 }
    y += 5

    // Invoice title
    doc.setTextColor(0)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('INVOICE', pageWidth - 20, 20, { align: 'right' })
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Invoice #: ${invoice.invoice_id || ''}`, pageWidth - 20, 30, { align: 'right' })
    doc.text(`Date: ${formatDate(invoice.created_at)}`, pageWidth - 20, 36, { align: 'right' })
    if (invoice.due_date) {
      doc.text(`Due Date: ${formatDate(invoice.due_date)}`, pageWidth - 20, 42, { align: 'right' })
    }

    // Divider line
    doc.setDrawColor(200)
    doc.line(20, y, pageWidth - 20, y)
    y += 10

    // Bill To
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Bill To:', 20, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    if (invoice.customer?.name) { doc.text(invoice.customer.name, 20, y); y += 5 }
    if (invoice.customer?.address) { doc.text(invoice.customer.address, 20, y); y += 5 }
    if (invoice.customer?.email) { doc.text(invoice.customer.email, 20, y); y += 5 }
    if (invoice.customer?.phone) { doc.text(invoice.customer.phone, 20, y); y += 5 }
    y += 10

    // Description / line items
    if (invoice.job_description) {
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('Description', 20, y)
      doc.text('Amount', pageWidth - 20, y, { align: 'right' })
      y += 2
      doc.setDrawColor(200)
      doc.line(20, y, pageWidth - 20, y)
      y += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)

      // Wrap long descriptions
      const lines = doc.splitTextToSize(invoice.job_description, pageWidth - 80)
      doc.text(lines, 20, y)
      doc.text(formatCurrency(invoice.amount), pageWidth - 20, y, { align: 'right' })
      y += lines.length * 5 + 5

      doc.setDrawColor(200)
      doc.line(20, y, pageWidth - 20, y)
      y += 8
    }

    // Totals section
    const totalsX = pageWidth - 80
    doc.setFontSize(10)

    doc.setFont('helvetica', 'normal')
    doc.text('Subtotal:', totalsX, y)
    doc.text(formatCurrency(invoice.amount), pageWidth - 20, y, { align: 'right' })
    y += 6

    if (parseFloat(invoice.discount_applied) > 0) {
      doc.text('Discount:', totalsX, y)
      doc.setTextColor(200, 0, 0)
      doc.text(`-${formatCurrency(invoice.discount_applied)}`, pageWidth - 20, y, { align: 'right' })
      doc.setTextColor(0)
      y += 6
    }

    const totalPaidAmt = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
    if (totalPaidAmt > 0) {
      doc.text('Paid:', totalsX, y)
      doc.text(formatCurrency(totalPaidAmt), pageWidth - 20, y, { align: 'right' })
      y += 6
    }

    y += 2
    doc.setDrawColor(0)
    doc.line(totalsX, y, pageWidth - 20, y)
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    const balDue = (parseFloat(invoice.amount) || 0) - (parseFloat(invoice.discount_applied) || 0) - totalPaidAmt
    doc.text('Balance Due:', totalsX, y)
    doc.text(formatCurrency(Math.max(0, balDue)), pageWidth - 20, y, { align: 'right' })
    y += 15

    // Notes
    if (invoice.notes) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Notes:', 20, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      const noteLines = doc.splitTextToSize(invoice.notes, pageWidth - 40)
      doc.text(noteLines, 20, y)
      y += noteLines.length * 5 + 10
    }

    // Footer
    doc.setFontSize(9)
    doc.setTextColor(150)
    doc.text('Thank you for your business!', pageWidth / 2, 280, { align: 'center' })

    return doc
  }

  const handleGenerateAndUploadPDF = async () => {
    setGeneratingPdf(true)
    const { toast } = await import('../lib/toast')

    try {
      const doc = generateInvoicePDF()
      const pdfBlob = doc.output('blob')

      const timestamp = Date.now()
      const filePath = `invoices/${companyId}/${invoice.invoice_id || id}_${timestamp}.pdf`

      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(filePath, pdfBlob, { contentType: 'application/pdf' })

      if (uploadError) {
        toast.error('Failed to upload PDF: ' + uploadError.message)
        setGeneratingPdf(false)
        return
      }

      // Update pdf_url to always point to the latest PDF
      await supabase.from('invoices').update({
        pdf_url: filePath,
        updated_at: new Date().toISOString()
      }).eq('id', id)

      // Save as a file_attachment on the job so it shows in Documents
      const snapshotDate = new Date().toLocaleDateString()
      if (invoice.job?.id) {
        await supabase.from('file_attachments').insert({
          company_id: companyId,
          job_id: invoice.job.id,
          lead_id: null,
          file_name: `${invoice.invoice_id || 'Invoice'} - ${snapshotDate}.pdf`,
          file_path: filePath,
          file_type: 'application/pdf',
          file_size: pdfBlob.size,
          storage_bucket: 'project-documents'
        })
      }

      toast.success('PDF snapshot generated and saved')
      await fetchInvoiceData()
    } catch (err) {
      toast.error('Error generating PDF')
    }

    setGeneratingPdf(false)
  }

  const handleDownloadPDF = async () => {
    if (!invoice.pdf_url) return
    const { toast } = await import('../lib/toast')

    const { data, error } = await supabase.storage
      .from('project-documents')
      .createSignedUrl(invoice.pdf_url, 300)

    if (error || !data?.signedUrl) {
      toast.error('Failed to get download link')
      return
    }

    window.open(data.signedUrl, '_blank')
  }

  const handleSendInvoice = async () => {
    if (!invoice.pdf_url) {
      await handleGenerateAndUploadPDF()
    }
    // Re-read invoice to get fresh pdf_url
    const { data: freshInvoice } = await supabase
      .from('invoices')
      .select('pdf_url')
      .eq('id', id)
      .single()

    if (freshInvoice?.pdf_url) {
      const { data } = await supabase.storage
        .from('project-documents')
        .createSignedUrl(freshInvoice.pdf_url, 300)
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank')
      }
    }
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

  // Styles
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

  const actionBtnStyle = (bg, color) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: bg,
    color: color,
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    width: '100%'
  })

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: theme.textMuted }}>Loading invoice...</p>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: '#dc2626', marginBottom: '16px' }}>Invoice not found</p>
        <button onClick={() => navigate('/invoices')} style={{ color: theme.accent, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
          Back to Invoices
        </button>
      </div>
    )
  }

  const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  const balanceDue = (parseFloat(invoice.amount) || 0) - totalPaid
  const statusStyle = statusColors[invoice.payment_status] || statusColors['Pending']

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button
          onClick={() => navigate('/invoices')}
          style={{
            padding: '10px',
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            cursor: 'pointer',
            color: theme.textSecondary
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '13px', color: theme.accent, fontWeight: '600' }}>
            {invoice.invoice_id}
            {invoice.is_locked && (
              <span style={{ marginLeft: '8px', fontSize: '11px', color: theme.textMuted }}>
                <Lock size={12} style={{ verticalAlign: 'middle', marginRight: '2px' }} />
                Locked
              </span>
            )}
          </p>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
            {invoice.customer?.name || 'Invoice'}
          </h1>
        </div>
        <span style={{
          padding: '6px 14px',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: '500',
          backgroundColor: statusStyle.bg,
          color: statusStyle.text
        }}>
          {invoice.payment_status}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '24px' }}>
        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Customer Info */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
              Bill To
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Customer</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.customer?.name || '-'}</p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Email</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.customer?.email || '-'}</p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Phone</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.customer?.phone || '-'}</p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Address</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.customer?.address || '-'}</p>
              </div>
            </div>
          </div>

          {/* Job Info */}
          {invoice.job && (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '20px'
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
                Job Details
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Job ID</p>
                  <button
                    onClick={() => navigate(`/jobs/${invoice.job.id}`)}
                    style={{ fontSize: '14px', fontWeight: '500', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {invoice.job.job_id}
                  </button>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Job Title</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.job.job_title || '-'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
              Description
            </h3>
            {isEditing ? (
              <textarea
                value={editForm.job_description}
                onChange={(e) => setEditForm(prev => ({ ...prev, job_description: e.target.value }))}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Invoice description..."
              />
            ) : (
              <p style={{ fontSize: '14px', color: theme.textSecondary }}>
                {invoice.job_description || <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>No description</span>}
              </p>
            )}
          </div>

          {/* Notes */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
              Notes
            </h3>
            {isEditing ? (
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Invoice notes..."
              />
            ) : (
              <p style={{ fontSize: '14px', color: theme.textSecondary }}>
                {invoice.notes || <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>No notes</span>}
              </p>
            )}
          </div>

          {/* Edit Save/Cancel buttons */}
          {isEditing && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={cancelEditing}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveEdits}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  backgroundColor: theme.accent,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}

          {/* Payments */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>Payments</h3>
              <button
                onClick={() => setShowPaymentModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  backgroundColor: theme.accent,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} />
                Add Payment
              </button>
            </div>

            {payments.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: theme.textMuted }}>
                No payments recorded yet.
              </div>
            ) : (
              <div>
                {payments.map((payment) => (
                  <div key={payment.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 20px',
                    borderBottom: `1px solid ${theme.border}`
                  }}>
                    <div>
                      <p style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>
                        {formatCurrency(payment.amount)}
                      </p>
                      <p style={{ fontSize: '12px', color: theme.textMuted }}>
                        {formatDate(payment.date)} - {payment.method}
                      </p>
                    </div>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '500',
                      backgroundColor: payment.status === 'Completed' ? 'rgba(74,124,89,0.12)' : 'rgba(194,139,56,0.12)',
                      color: payment.status === 'Completed' ? '#4a7c59' : '#c28b38'
                    }}>
                      {payment.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Totals */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
              Invoice Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                <span style={{ color: theme.textSecondary }}>Invoice Total</span>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.amount}
                    onChange={(e) => setEditForm(prev => ({ ...prev, amount: e.target.value }))}
                    style={{ ...inputStyle, width: '140px', textAlign: 'right' }}
                  />
                ) : (
                  <span style={{ fontWeight: '500', color: theme.text }}>{formatCurrency(invoice.amount)}</span>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                <span style={{ color: theme.textSecondary }}>Discount</span>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.discount_applied}
                    onChange={(e) => setEditForm(prev => ({ ...prev, discount_applied: e.target.value }))}
                    style={{ ...inputStyle, width: '140px', textAlign: 'right' }}
                  />
                ) : (
                  invoice.discount_applied > 0 ? (
                    <span style={{ color: '#dc2626' }}>-{formatCurrency(invoice.discount_applied)}</span>
                  ) : (
                    <span style={{ color: theme.textMuted }}>$0.00</span>
                  )
                )}
              </div>

              {invoice.credit_card_fee > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: theme.textSecondary }}>CC Fee</span>
                  <span style={{ color: theme.textMuted }}>{formatCurrency(invoice.credit_card_fee)}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: theme.textSecondary }}>Total Paid</span>
                <span style={{ fontWeight: '500', color: '#4a7c59' }}>{formatCurrency(totalPaid)}</span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '12px',
                borderTop: `1px solid ${theme.border}`
              }}>
                <span style={{ fontWeight: '600', color: theme.text }}>Balance Due</span>
                <span style={{ fontSize: '20px', fontWeight: '600', color: balanceDue > 0 ? '#c28b38' : '#4a7c59' }}>
                  {formatCurrency(balanceDue)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
              Actions
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {invoice.payment_status !== 'Paid' && (
                <>
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    style={actionBtnStyle(theme.accent, '#ffffff')}
                  >
                    <DollarSign size={18} />
                    Record Payment
                  </button>
                  <button
                    onClick={markAsPaid}
                    disabled={saving}
                    style={actionBtnStyle('#4a7c59', '#ffffff')}
                  >
                    <CheckCircle size={18} />
                    Mark as Paid
                  </button>
                </>
              )}

              {/* Edit button — only if not locked and not currently editing */}
              {!invoice.is_locked && !isEditing && (
                <button onClick={startEditing} style={actionBtnStyle(theme.accentBg, theme.accent)}>
                  <Pencil size={18} />
                  Edit Invoice
                </button>
              )}

              {/* Lock / Finalize button — only if not locked */}
              {!invoice.is_locked && (
                <button
                  onClick={handleLockInvoice}
                  disabled={saving}
                  style={actionBtnStyle('rgba(194,139,56,0.12)', '#c28b38')}
                >
                  <Lock size={18} />
                  Lock / Finalize
                </button>
              )}

              {/* PDF generation */}
              <button
                onClick={handleGenerateAndUploadPDF}
                disabled={generatingPdf}
                style={actionBtnStyle('rgba(59,130,246,0.12)', '#3b82f6')}
              >
                <FileText size={18} />
                {generatingPdf ? 'Generating...' : 'Generate PDF Snapshot'}
              </button>

              {/* Download PDF — only if pdf_url exists */}
              {invoice.pdf_url && (
                <button onClick={handleDownloadPDF} style={actionBtnStyle('rgba(34,197,94,0.12)', '#22c55e')}>
                  <Download size={18} />
                  Download PDF
                </button>
              )}

              {/* Send Invoice */}
              <button
                onClick={handleSendInvoice}
                disabled={generatingPdf}
                style={actionBtnStyle(theme.accentBg, theme.accent)}
              >
                <Send size={18} />
                Send Invoice
              </button>

              {/* Delete Invoice */}
              <div style={{ borderTop: `1px solid ${theme.border}`, margin: '6px 0' }} />
              <button
                onClick={handleDeleteInvoice}
                disabled={saving}
                style={actionBtnStyle('rgba(220,38,38,0.10)', '#dc2626')}
              >
                <Trash2 size={18} />
                Delete Invoice
              </button>
            </div>
          </div>

          {/* PDF History */}
          {pdfHistory.length > 0 && (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${theme.border}`
              }}>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>
                  PDF History ({pdfHistory.length})
                </h3>
              </div>
              <div>
                {pdfHistory.map((doc) => (
                  <div key={doc.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 20px',
                    borderBottom: `1px solid ${theme.border}`
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: '500', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.file_name}
                      </p>
                      <p style={{ fontSize: '11px', color: theme.textMuted }}>
                        {new Date(doc.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        const { data } = await supabase.storage
                          .from('project-documents')
                          .createSignedUrl(doc.file_path, 300)
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '6px 10px',
                        backgroundColor: 'rgba(34,197,94,0.12)',
                        color: '#22c55e',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                    >
                      <Download size={14} />
                      View
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Payment Modal */}
      {showPaymentModal && (
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
            maxWidth: '400px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                Record Payment
              </h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Amount</label>
                  <input
                    type="number"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData(prev => ({ ...prev, amount: e.target.value }))}
                    step="0.01"
                    placeholder={formatCurrency(balanceDue)}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Date</label>
                    <input
                      type="date"
                      value={paymentData.date}
                      onChange={(e) => setPaymentData(prev => ({ ...prev, date: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Method</label>
                    <select
                      value={paymentData.method}
                      onChange={(e) => setPaymentData(prev => ({ ...prev, method: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="Cash">Cash</option>
                      <option value="Check">Check</option>
                      <option value="Credit Card">Credit Card</option>
                      <option value="ACH">ACH</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    value={paymentData.notes}
                    onChange={(e) => setPaymentData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  onClick={() => setShowPaymentModal(false)}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: 'transparent',
                    color: theme.text,
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={addPayment}
                  disabled={saving || !paymentData.amount}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: theme.accent,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: (saving || !paymentData.amount) ? 'not-allowed' : 'pointer',
                    opacity: (saving || !paymentData.amount) ? 0.6 : 1
                  }}
                >
                  {saving ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
