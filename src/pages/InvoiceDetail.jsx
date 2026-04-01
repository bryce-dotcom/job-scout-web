import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { ArrowLeft, Plus, X, DollarSign, CheckCircle, Send, Lock, Pencil, Download, FileText, Trash2, Mail, Link2, RotateCcw, AlertTriangle, CreditCard, ExternalLink } from 'lucide-react'
import DealBreadcrumb from '../components/DealBreadcrumb'
import { invoiceStatusColors as statusColors } from '../lib/statusColors'
import { toast } from '../lib/toast'
import { jsPDF } from 'jspdf'
import { useIsMobile } from '../hooks/useIsMobile'

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

export default function InvoiceDetail() {
  const isMobile = useIsMobile()
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const company = useStore((state) => state.company)
  const fetchInvoices = useStore((state) => state.fetchInvoices)
  const settings = useStore((state) => state.settings)
  const getSettingValue = useStore((state) => state.getSettingValue)
  const fetchSettings = useStore((state) => state.fetchSettings)

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
  const [latestPdfSignedUrl, setLatestPdfSignedUrl] = useState(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null)
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState(null)

  // Send modal state
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendEmail, setSendEmail] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)

  // Charge saved card state
  const [savedCards, setSavedCards] = useState([])
  const [showChargeModal, setShowChargeModal] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState(null)
  const [charging, setCharging] = useState(false)

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Invoice settings helpers
  const getInvoiceSetting = (key, defaultVal) => {
    const raw = getSettingValue(key)
    if (raw === null || raw === undefined) return defaultVal
    try { return JSON.parse(raw) } catch { return raw }
  }
  const ccFeeEnabled = getInvoiceSetting('invoice_cc_fee_enabled', true) && getInvoiceSetting('invoice_accept_credit_card', false)
  const ccFeePercent = getInvoiceSetting('invoice_cc_fee_percent', 1.9)
  const showPreferredNote = getInvoiceSetting('invoice_show_preferred_payment_note', true)
  const preferredPaymentNote = (getInvoiceSetting('invoice_preferred_payment_note', 'We accept ACH transfers, checks, and cash at no additional fee. Credit card payments include a {cc_fee_percent}% processing fee.') || '').replace('{cc_fee_percent}', ccFeePercent)

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchInvoiceData()
    fetchSettings()
  }, [companyId, id, navigate])

  const fetchInvoiceData = async () => {
    setLoading(true)

    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('*, customer:customers(id, name, email, phone, address), job:jobs(id, job_id, job_title, lead_id, quote_id)')
      .eq('id', id)
      .single()

    if (invoiceData) {
      setInvoice(invoiceData)
      setSendEmail(invoiceData.sent_to_email || invoiceData.customer?.email || '')

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

      // Get signed URL for latest PDF to show inline
      if (invoiceData.pdf_url) {
        const { data: signedData } = await supabase.storage
          .from('project-documents')
          .createSignedUrl(invoiceData.pdf_url, 3600)
        if (signedData?.signedUrl) setLatestPdfSignedUrl(signedData.signedUrl)
      } else {
        setLatestPdfSignedUrl(null)
      }

      // Fetch saved cards for this customer
      if (invoiceData.customer_id) {
        const { data: cards } = await supabase
          .from('customer_payment_methods')
          .select('id, brand, last_four, exp_month, exp_year, is_default')
          .eq('company_id', companyId)
          .eq('customer_id', invoiceData.customer_id)
          .eq('status', 'active')
          .order('is_default', { ascending: false })
        setSavedCards(cards || [])
        if (cards?.length > 0) {
          setSelectedCardId(cards.find(c => c.is_default)?.id || cards[0].id)
        }
      }
    }

    setLoading(false)
  }

  const chargeSavedCard = async () => {
    if (!selectedCardId) return
    setCharging(true)
    try {
      await supabase.auth.refreshSession()
      const res = await supabase.functions.invoke('charge-saved-card', {
        body: {
          company_id: companyId,
          invoice_id: parseInt(id),
          payment_method_id: selectedCardId
        }
      })
      if (res.data?.success) {
        toast.success(`Payment of $${res.data.amount_charged.toFixed(2)} processed successfully`)
        setShowChargeModal(false)
        await fetchInvoiceData()
        await fetchInvoices()
      } else {
        toast.error(res.data?.error || 'Payment failed')
      }
    } catch (err) {
      toast.error(err.message || 'Payment failed')
    }
    setCharging(false)
  }

  const addPayment = async () => {
    if (!paymentData.amount) return

    setSaving(true)

    const paymentAmount = parseFloat(paymentData.amount)

    // If paying by CC and fee is enabled, update the invoice credit_card_fee
    let ccFeeAmount = 0
    if (paymentData.method === 'Credit Card' && ccFeeEnabled) {
      ccFeeAmount = Math.round(paymentAmount * (ccFeePercent / 100) * 100) / 100
      await supabase.from('invoices').update({
        credit_card_fee: (parseFloat(invoice.credit_card_fee) || 0) + ccFeeAmount,
        updated_at: new Date().toISOString()
      }).eq('id', id)
    }

    await supabase.from('payments').insert([{
      company_id: companyId,
      invoice_id: parseInt(id),
      customer_id: invoice.customer_id || null,
      job_id: invoice.job_id || null,
      amount: paymentAmount,
      date: paymentData.date,
      method: paymentData.method,
      status: paymentData.status,
      notes: paymentData.notes || (ccFeeAmount > 0 ? `Includes $${ccFeeAmount.toFixed(2)} CC processing fee` : null)
    }])

    // Update payment status based on total paid vs invoice amount + CC fees
    const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) + paymentAmount
    const invoiceAmount = (parseFloat(invoice.amount) || 0) + (parseFloat(invoice.credit_card_fee) || 0) + ccFeeAmount
    if (totalPaid >= invoiceAmount) {
      await supabase.from('invoices').update({
        payment_status: 'Paid',
        updated_at: new Date().toISOString()
      }).eq('id', id)
    } else if (totalPaid > 0) {
      await supabase.from('invoices').update({
        payment_status: 'Partially Paid',
        updated_at: new Date().toISOString()
      }).eq('id', id)
    }

    await fetchInvoiceData()
    await fetchInvoices()

    // Send receipt email if customer has email
    try {
      let receiptEmail = invoice.sent_to_email || ''
      if (!receiptEmail && invoice.customer_id) {
        const { data: cust } = await supabase.from('customers').select('email,name').eq('id', invoice.customer_id).single()
        receiptEmail = cust?.email || ''
      }
      if (receiptEmail) {
        const storeSettings = useStore.getState().settings
        const buSetting = storeSettings.find(s => s.key === 'business_units')
        let buObj = null
        if (buSetting?.value && invoice.business_unit) {
          try { buObj = JSON.parse(buSetting.value).find(u => u.name === invoice.business_unit) } catch {}
        }
        let rLogoUrl = buObj?.logo_url || ''
        if (!rLogoUrl) {
          const logoSetting = storeSettings.find(s => s.key === 'company_logo_url')
          rLogoUrl = logoSetting?.value || company?.logo_url || ''
        }

        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
        const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
        fetch(`${SUPABASE_URL}/functions/v1/send-receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY },
          body: JSON.stringify({
            recipient_email: receiptEmail,
            customer_name: invoice.customer?.name || '',
            invoice_number: invoice.invoice_id || `INV-${invoice.id}`,
            payment_amount: paymentAmount,
            payment_method: paymentData.method,
            payment_date: paymentData.date,
            balance_remaining: Math.max(0, (parseFloat(invoice.amount) || 0) - totalPaid),
            invoice_total: invoice.amount,
            total_paid: totalPaid,
            company_name: company?.company_name || '',
            business_unit_name: buObj?.name || invoice.business_unit || '',
            business_unit_phone: buObj?.phone || company?.phone || '',
            business_unit_email: buObj?.email || company?.owner_email || '',
            business_unit_address: buObj?.address || company?.address || '',
            logo_url: rLogoUrl,
            portal_url: invoice.portal_token ? `https://jobscout.appsannex.com/portal/${invoice.portal_token}` : null
          })
        }).catch(() => {}) // Fire and forget — don't block payment on receipt
      }
    } catch { /* receipt is non-critical */ }

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

  const rescindPayment = async (payment) => {
    if (!confirm(`Rescind ${formatCurrency(payment.amount)} payment from ${formatDate(payment.date)}? This will delete the payment record and update the invoice balance.`)) return

    setSaving(true)
    await supabase.from('payments').delete().eq('id', payment.id)

    // If this was a CC payment, subtract its CC fee from the invoice
    if (payment.method === 'Credit Card' && ccFeeEnabled) {
      const feePortion = Math.round(parseFloat(payment.amount) * (ccFeePercent / 100) * 100) / 100
      const currentFee = parseFloat(invoice.credit_card_fee) || 0
      const newFee = Math.max(0, currentFee - feePortion)
      await supabase.from('invoices').update({
        credit_card_fee: newFee,
        updated_at: new Date().toISOString()
      }).eq('id', id)
    }

    // Recalculate remaining total
    const remainingPaid = payments
      .filter(p => p.id !== payment.id)
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
    const invoiceAmount = parseFloat(invoice.amount) || 0

    let newStatus = 'Pending'
    if (remainingPaid >= invoiceAmount) newStatus = 'Paid'
    else if (remainingPaid > 0) newStatus = 'Partially Paid'

    await supabase.from('invoices').update({
      payment_status: newStatus,
      updated_at: new Date().toISOString()
    }).eq('id', id)

    toast.success('Payment rescinded')
    await fetchInvoiceData()
    await fetchInvoices()
    setSaving(false)
  }

  // Edit mode handlers
  const startEditing = () => {
    setEditForm({
      amount: invoice.amount || '',
      discount_applied: invoice.discount_applied || '',
      credit_card_fee: invoice.credit_card_fee || '',
      job_description: invoice.job_description || '',
      notes: invoice.notes || ''
    })
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditForm({ amount: '', discount_applied: '', credit_card_fee: '', job_description: '', notes: '' })
  }

  const saveEdits = async () => {
    setSaving(true)
    const { error } = await supabase.from('invoices').update({
      amount: parseFloat(editForm.amount) || 0,
      discount_applied: parseFloat(editForm.discount_applied) || 0,
      credit_card_fee: parseFloat(editForm.credit_card_fee) || 0,
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
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 20
    const rightEdge = pageWidth - margin
    const contentWidth = pageWidth - margin * 2
    const lineHeight = 5
    const bottomMargin = 30 // reserve space for footer
    let y = 20

    // Helper: check if we need a new page, add one if so
    const checkPage = (needed = 20) => {
      if (y + needed > pageHeight - bottomMargin) {
        doc.addPage()
        y = 20
      }
    }

    // Helper: draw wrapped text and advance y properly
    const drawWrappedText = (text, x, maxWidth, opts = {}) => {
      const fontSize = opts.fontSize || 10
      const font = opts.font || 'normal'
      doc.setFontSize(fontSize)
      doc.setFont('helvetica', font)
      if (opts.color) doc.setTextColor(...(Array.isArray(opts.color) ? opts.color : [opts.color]))
      const lines = doc.splitTextToSize(text, maxWidth)
      const lh = fontSize * 0.45 // line height proportional to font size
      for (let i = 0; i < lines.length; i++) {
        checkPage(lh + 2)
        doc.text(lines[i], x, y)
        y += lh
      }
      return lines.length
    }

    // ── Resolve business unit branding ──
    let buInfo = null
    if (invoice.business_unit) {
      const buSetting = settings?.find(s => s.key === 'business_units')
      if (buSetting?.value) {
        try {
          const units = JSON.parse(buSetting.value)
          buInfo = units.find(u => u.name === invoice.business_unit)
        } catch { /* ignore */ }
      }
    }
    const headerName = buInfo?.name || invoice.business_unit || company?.name || 'Company'
    const headerAddress = buInfo?.address || company?.address
    const headerPhone = buInfo?.phone || company?.phone
    const headerEmail = buInfo?.email || company?.owner_email || company?.email

    // ── Company header ──
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text(headerName, margin, y)
    y += 8

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    if (headerAddress) { doc.text(headerAddress, margin, y); y += 5 }
    if (headerPhone) { doc.text(headerPhone, margin, y); y += 5 }
    if (headerEmail) { doc.text(headerEmail, margin, y); y += 5 }
    y += 5

    // ── Invoice title (right side, absolute position) ──
    doc.setTextColor(90, 99, 73) // accent color
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('INVOICE', rightEdge, 20, { align: 'right' })
    doc.setTextColor(80)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    let iy = 30
    doc.text(`Invoice #: ${invoice.invoice_id || ''}`, rightEdge, iy, { align: 'right' }); iy += 5
    doc.text(`Date: ${formatDate(invoice.created_at)}`, rightEdge, iy, { align: 'right' }); iy += 5
    if (invoice.due_date) {
      doc.text(`Due Date: ${formatDate(invoice.due_date)}`, rightEdge, iy, { align: 'right' })
    }

    // ── Divider ──
    doc.setDrawColor(214, 205, 184)
    doc.line(margin, y, rightEdge, y)
    y += 10

    // ── Bill To ──
    doc.setTextColor(0)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Bill To:', margin, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    if (invoice.customer?.name) { doc.text(invoice.customer.name, margin, y); y += 5 }
    if (invoice.customer?.address) {
      // Wrap long addresses
      const addrLines = doc.splitTextToSize(invoice.customer.address, contentWidth / 2)
      for (const line of addrLines) { doc.text(line, margin, y); y += 5 }
    }
    if (invoice.customer?.email) { doc.text(invoice.customer.email, margin, y); y += 5 }
    if (invoice.customer?.phone) { doc.text(invoice.customer.phone, margin, y); y += 5 }
    y += 8

    // ── Description table ──
    if (invoice.job_description) {
      checkPage(30)

      // Table header
      doc.setFillColor(90, 99, 73)
      doc.rect(margin, y - 4, contentWidth, 8, 'F')
      doc.setTextColor(255)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Description', margin + 4, y)
      doc.text('Amount', rightEdge - 4, y, { align: 'right' })
      y += 8

      // Table row with proper wrapping
      doc.setTextColor(0)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      const descMaxWidth = contentWidth - 50 // leave room for amount column
      const descLines = doc.splitTextToSize(invoice.job_description, descMaxWidth)
      const rowStartY = y

      // Draw description lines with page break support
      for (let i = 0; i < descLines.length; i++) {
        checkPage(lineHeight + 2)
        doc.text(descLines[i], margin + 4, y)
        if (i === 0) {
          // Amount on first line only
          doc.text(formatCurrency(invoice.amount), rightEdge - 4, y, { align: 'right' })
        }
        y += lineHeight
      }
      y += 3

      // Bottom border
      doc.setDrawColor(214, 205, 184)
      doc.line(margin, y, rightEdge, y)
      y += 8
    }

    // ── Totals section ──
    checkPage(50)
    const totalsX = rightEdge - 70
    doc.setFontSize(10)

    const drawTotalLine = (label, amount, opts = {}) => {
      checkPage(8)
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
      doc.setFontSize(opts.fontSize || 10)
      if (opts.color) doc.setTextColor(...opts.color)
      else doc.setTextColor(0)
      doc.text(label, totalsX, y)
      doc.text(amount, rightEdge, y, { align: 'right' })
      y += 6
    }

    drawTotalLine('Subtotal:', formatCurrency(invoice.amount))

    if (parseFloat(invoice.discount_applied) > 0) {
      drawTotalLine('Discount:', `-${formatCurrency(invoice.discount_applied)}`, { color: [200, 0, 0] })
    }

    if (parseFloat(invoice.credit_card_fee) > 0) {
      drawTotalLine('CC Processing Fee:', formatCurrency(invoice.credit_card_fee))
    }

    const totalPaidAmt = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
    if (totalPaidAmt > 0) {
      drawTotalLine('Paid:', formatCurrency(totalPaidAmt), { color: [0, 128, 0] })
    }

    y += 2
    doc.setDrawColor(90, 99, 73)
    doc.setLineWidth(0.5)
    doc.line(totalsX, y, rightEdge, y)
    doc.setLineWidth(0.2)
    y += 7

    const balDue = (parseFloat(invoice.amount) || 0) - (parseFloat(invoice.discount_applied) || 0) + (parseFloat(invoice.credit_card_fee) || 0) - totalPaidAmt
    drawTotalLine('Balance Due:', formatCurrency(Math.max(0, balDue)), { bold: true, fontSize: 13 })
    y += 10

    // ── Payment preference note ──
    if (showPreferredNote && preferredPaymentNote) {
      checkPage(20)
      doc.setTextColor(100)
      drawWrappedText(preferredPaymentNote, margin, contentWidth, { fontSize: 9, font: 'italic', color: [100] })
      doc.setTextColor(0)
      y += 6
    }

    // ── Notes ──
    if (invoice.notes) {
      checkPage(20)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0)
      doc.text('Notes:', margin, y)
      y += 6
      drawWrappedText(invoice.notes, margin, contentWidth, { fontSize: 10, font: 'normal', color: [60] })
      y += 6
    }

    // ── Footer on every page ──
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(9)
      doc.setTextColor(150)
      doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 15, { align: 'center' })
      if (pageCount > 1) {
        doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' })
      }
    }

    return doc
  }

  // Preview PDF before saving
  const handlePreviewPDF = () => {
    const doc = generateInvoicePDF()
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    setPdfPreviewBlob(blob)
    setPdfPreviewUrl(url)
  }

  const handleDiscardPreview = () => {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    setPdfPreviewUrl(null)
    setPdfPreviewBlob(null)
  }

  const handleSavePreviewPDF = async () => {
    if (!pdfPreviewBlob) return
    setGeneratingPdf(true)

    try {
      const timestamp = Date.now()
      const filePath = `invoices/${companyId}/${invoice.invoice_id || id}_${timestamp}.pdf`

      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(filePath, pdfPreviewBlob, { contentType: 'application/pdf' })

      if (uploadError) {
        toast.error('Failed to upload PDF: ' + uploadError.message)
        setGeneratingPdf(false)
        return
      }

      await supabase.from('invoices').update({
        pdf_url: filePath,
        updated_at: new Date().toISOString()
      }).eq('id', id)

      const snapshotDate = new Date().toLocaleDateString()
      await supabase.from('file_attachments').insert({
        company_id: companyId,
        job_id: invoice.job?.id || null,
        lead_id: null,
        file_name: `${invoice.invoice_id || 'Invoice'} - ${snapshotDate}.pdf`,
        file_path: filePath,
        file_type: 'application/pdf',
        file_size: pdfPreviewBlob.size,
        storage_bucket: 'project-documents'
      })

      toast.success('PDF saved to documents')
      handleDiscardPreview()
      await fetchInvoiceData()
    } catch (err) {
      toast.error('Error saving PDF')
    }

    setGeneratingPdf(false)
  }

  // Direct generate + upload (used by send flow when no PDF exists)
  const handleDirectGenerateAndUploadPDF = async () => {
    const doc = generateInvoicePDF()
    const pdfBlob = doc.output('blob')
    const timestamp = Date.now()
    const filePath = `invoices/${companyId}/${invoice.invoice_id || id}_${timestamp}.pdf`

    const { error: uploadError } = await supabase.storage
      .from('project-documents')
      .upload(filePath, pdfBlob, { contentType: 'application/pdf' })

    if (uploadError) {
      toast.error('Failed to upload PDF: ' + uploadError.message)
      return
    }

    await supabase.from('invoices').update({
      pdf_url: filePath,
      updated_at: new Date().toISOString()
    }).eq('id', id)

    const snapshotDate = new Date().toLocaleDateString()
    await supabase.from('file_attachments').insert({
      company_id: companyId,
      job_id: invoice.job?.id || null,
      lead_id: null,
      file_name: `${invoice.invoice_id || 'Invoice'} - ${snapshotDate}.pdf`,
      file_path: filePath,
      file_type: 'application/pdf',
      file_size: pdfBlob.size,
      storage_bucket: 'project-documents'
    })
  }

  // Button handler — opens preview
  const handleGenerateAndUploadPDF = () => {
    handlePreviewPDF()
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
    if (!sendEmail) {
      toast.error('Please enter a recipient email.')
      return
    }
    setSendingEmail(true)
    try {
      // Auto-generate PDF if none exists
      if (!invoice.pdf_url) {
        await handleDirectGenerateAndUploadPDF()
      }
      // Re-read invoice to get fresh pdf_url
      const { data: freshInvoice } = await supabase
        .from('invoices')
        .select('pdf_url')
        .eq('id', id)
        .single()

      // Create portal token
      const { data: portalToken } = await supabase
        .from('customer_portal_tokens')
        .insert({
          document_type: 'invoice',
          document_id: invoice.id,
          company_id: companyId,
          customer_id: invoice.customer_id || null,
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
        })
        .select('token')
        .single()

      const siteUrl = 'https://jobscout.appsannex.com'
      const portalUrl = portalToken?.token
        ? `${siteUrl}/portal/${portalToken.token}`
        : null

      // Get business unit info
      const settings = useStore.getState().settings
      const buSetting = settings.find(s => s.key === 'business_units')
      let buObject = null
      if (buSetting?.value && invoice.business_unit) {
        try {
          const units = JSON.parse(buSetting.value)
          buObject = units.find(u => u.name === invoice.business_unit)
        } catch { /* ignore */ }
      }

      // Resolve logo URL
      let logoUrl = buObject?.logo_url || ''
      if (!logoUrl) {
        const logoSetting = settings.find(s => s.key === 'company_logo_url')
        logoUrl = logoSetting?.value || company?.logo_url || ''
      }

      // Determine available payment methods for the email
      const paymentConfig = settings.find(s => s.key === 'payment_config')
      const payMethods = []
      if (paymentConfig?.value) {
        try {
          const pc = JSON.parse(paymentConfig.value)
          if (pc.stripe_enabled) payMethods.push('Credit Card')
          if (pc.bank_transfer_enabled) payMethods.push('ACH / Bank Transfer')
          if (pc.paypal_enabled) payMethods.push('PayPal')
        } catch { /* ignore */ }
      }

      // Get customer name
      let customerName = ''
      if (invoice.customer_id) {
        const { data: cust } = await supabase.from('customers').select('name').eq('id', invoice.customer_id).single()
        customerName = cust?.name || ''
      }

      // Call send-invoice edge function via direct fetch (avoids JWT expiry issues)
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY
        },
        body: JSON.stringify({
          company_id: companyId,
          invoice_id: invoice.id,
          recipient_email: sendEmail,
          pdf_storage_path: freshInvoice?.pdf_url || invoice.pdf_url,
          company_name: company?.company_name || '',
          invoice_number: invoice.invoice_id || `INV-${invoice.id}`,
          amount: invoice.amount,
          discount: invoice.discount_applied || 0,
          job_description: invoice.job_description || '',
          customer_name: customerName,
          portal_url: portalUrl,
          logo_url: logoUrl,
          payment_methods: payMethods,
          business_unit_name: buObject?.name || invoice.business_unit || '',
          business_unit_phone: buObject?.phone || company?.phone || '',
          business_unit_email: buObject?.email || company?.owner_email || '',
          business_unit_address: buObject?.address || company?.address || ''
        })
      })

      const sendData = await sendRes.json()
      if (!sendData.success) throw new Error(sendData.error || 'Failed to send invoice')

      // Update invoice
      await supabase.from('invoices').update({
        payment_status: invoice.payment_status === 'Draft' ? 'Sent' : invoice.payment_status,
        last_sent_at: new Date().toISOString(),
        sent_to_email: sendEmail,
        portal_token: portalToken?.token || null,
        updated_at: new Date().toISOString()
      }).eq('id', id)

      toast.success('Invoice sent successfully!')
      setShowSendModal(false)
      await fetchInvoiceData()
      await fetchInvoices()
    } catch (err) {
      toast.error('Failed to send: ' + err.message)
    }
    setSendingEmail(false)
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
  const ccFeeOnInvoice = parseFloat(invoice.credit_card_fee) || 0
  const balanceDue = (parseFloat(invoice.amount) || 0) + ccFeeOnInvoice - totalPaid
  const statusStyle = statusColors[invoice.payment_status] || statusColors['Pending']

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
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
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text }}>
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

      {/* Deal Chain */}
      <DealBreadcrumb
        current="invoice"
        invoiceId={parseInt(id)}
        leadId={invoice.job?.lead_id}
        quoteId={invoice.job?.quote_id}
        customerId={invoice.customer_id}
        jobId={invoice.job_id}
      />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 360px', gap: '24px' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Customer</p>
                {invoice.customer?.id ? (
                  <button onClick={() => navigate(`/customers/${invoice.customer.id}`)} style={{ fontSize: '14px', fontWeight: '500', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                    {invoice.customer.name}
                  </button>
                ) : (
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.customer?.name || '-'}</p>
                )}
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
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                      <button
                        onClick={() => rescindPayment(payment)}
                        disabled={saving}
                        title="Rescind payment"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '4px',
                          cursor: saving ? 'not-allowed' : 'pointer',
                          color: theme.textMuted,
                          opacity: saving ? 0.4 : 0.6,
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <RotateCcw size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PDF Snapshot Viewer */}
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
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>
                PDF Snapshot {pdfHistory.length > 0 ? `(${pdfHistory.length})` : ''}
              </h3>
              <button
                onClick={handleGenerateAndUploadPDF}
                disabled={generatingPdf}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  backgroundColor: 'rgba(59,130,246,0.12)',
                  color: '#3b82f6',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: generatingPdf ? 'not-allowed' : 'pointer',
                  opacity: generatingPdf ? 0.6 : 1
                }}
              >
                <FileText size={16} />
                {generatingPdf ? 'Saving...' : 'Preview PDF'}
              </button>
            </div>

            {latestPdfSignedUrl ? (
              <div>
                <iframe
                  src={latestPdfSignedUrl}
                  title="Invoice PDF"
                  style={{
                    width: '100%',
                    height: '600px',
                    border: 'none'
                  }}
                />
                {pdfHistory.length > 1 && (
                  <div style={{ padding: '12px 20px', borderTop: `1px solid ${theme.border}` }}>
                    <p style={{ fontSize: '12px', fontWeight: '600', color: theme.textSecondary, marginBottom: '8px' }}>
                      Previous Snapshots
                    </p>
                    {pdfHistory.slice(1).map((doc) => (
                      <div key={doc.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: `1px solid ${theme.border}`
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: '12px', fontWeight: '500', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                            padding: '4px 8px',
                            backgroundColor: 'rgba(34,197,94,0.12)',
                            color: '#22c55e',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            flexShrink: 0
                          }}
                        >
                          <Download size={12} />
                          View
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <FileText size={40} style={{ color: theme.textMuted, opacity: 0.4, marginBottom: '12px' }} />
                <p style={{ fontSize: '14px', color: theme.textSecondary, marginBottom: '4px' }}>No PDF snapshot yet</p>
                <p style={{ fontSize: '12px', color: theme.textMuted }}>Generate a snapshot to capture the current invoice state with payment balances</p>
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

              {(invoice.credit_card_fee > 0 || isEditing) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}>
                  <span style={{ color: theme.textSecondary }}>CC Fee</span>
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.credit_card_fee ?? invoice.credit_card_fee ?? ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, credit_card_fee: e.target.value }))}
                      style={{ ...inputStyle, width: '120px', textAlign: 'right' }}
                    />
                  ) : (
                    <span style={{ color: theme.textMuted }}>{formatCurrency(invoice.credit_card_fee)}</span>
                  )}
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

              {/* Payment preference note */}
              {showPreferredNote && preferredPaymentNote && balanceDue > 0 && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  backgroundColor: 'rgba(74,124,89,0.08)',
                  border: '1px solid rgba(74,124,89,0.25)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#4a7c59',
                  lineHeight: '1.5'
                }}>
                  {preferredPaymentNote}
                </div>
              )}

              {/* Outstanding balance alert for partial payments */}
              {balanceDue > 0 && totalPaid > 0 && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  backgroundColor: 'rgba(59,130,246,0.08)',
                  border: '1px solid rgba(59,130,246,0.25)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}>
                  <AlertTriangle size={16} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '1px' }} />
                  <div style={{ fontSize: '12px', color: '#3b82f6', lineHeight: '1.4' }}>
                    <span style={{ fontWeight: '600' }}>Partially paid</span> — {formatCurrency(totalPaid)} received, {formatCurrency(balanceDue)} still outstanding. Generate a PDF snapshot to capture the current balance state.
                  </div>
                </div>
              )}
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
                  {savedCards.length > 0 && (
                    <button
                      onClick={() => setShowChargeModal(true)}
                      style={actionBtnStyle('#3b82f6', '#ffffff')}
                    >
                      <CreditCard size={18} />
                      Charge Saved Card
                    </button>
                  )}
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

              {/* Send Invoice */}
              <button
                onClick={() => setShowSendModal(true)}
                disabled={generatingPdf}
                style={actionBtnStyle(theme.accent, '#ffffff')}
              >
                <Mail size={18} />
                Send Invoice
              </button>

              {/* Payment Portal — open portal to take payment over the phone */}
              {invoice.payment_status !== 'Paid' && (
                <button
                  onClick={async () => {
                    let portalTk = invoice.portal_token
                    if (!portalTk) {
                      const { data: newToken } = await supabase
                        .from('customer_portal_tokens')
                        .insert({
                          document_type: 'invoice',
                          document_id: invoice.id,
                          company_id: companyId,
                          customer_id: invoice.customer_id || null,
                          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
                        })
                        .select('token')
                        .single()
                      if (newToken?.token) {
                        portalTk = newToken.token
                        await supabase.from('invoices').update({ portal_token: portalTk }).eq('id', invoice.id)
                      }
                    }
                    if (portalTk) {
                      window.open(`https://jobscout.appsannex.com/portal/${portalTk}`, '_blank')
                    }
                  }}
                  style={actionBtnStyle('#3b82f6', '#ffffff')}
                >
                  <ExternalLink size={18} />
                  Payment Portal
                </button>
              )}

              {/* Portal Link — copy link to share */}
              {invoice.portal_token && (
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: theme.accentBg,
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Link2 size={14} style={{ color: theme.textSecondary, flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', color: theme.textSecondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Portal link available
                  </span>
                  <button
                    onClick={() => {
                      const url = `https://jobscout.appsannex.com/portal/${invoice.portal_token}`
                      navigator.clipboard.writeText(url)
                      toast.success('Portal link copied!')
                    }}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: theme.accent,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Copy Link
                  </button>
                </div>
              )}

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
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '400px'
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

            <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
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
                      <option value="ACH">ACH / Bank Transfer</option>
                      <option value="Venmo">Venmo</option>
                      <option value="Zelle">Zelle</option>
                      <option value="PayPal">PayPal</option>
                      <option value="Financing">Financing</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* CC fee notice */}
                {paymentData.method === 'Credit Card' && ccFeeEnabled && paymentData.amount && (
                  <div style={{
                    padding: '10px 12px',
                    backgroundColor: 'rgba(234,179,8,0.08)',
                    border: '1px solid rgba(234,179,8,0.25)',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: '#92700c'
                  }}>
                    <span style={{ fontWeight: '600' }}>{ccFeePercent}% CC fee:</span>{' '}
                    {formatCurrency(Math.round(parseFloat(paymentData.amount) * (ccFeePercent / 100) * 100) / 100)} will be added to the invoice
                  </div>
                )}
                {paymentData.method !== 'Credit Card' && (
                  <div style={{
                    padding: '10px 12px',
                    backgroundColor: 'rgba(74,124,89,0.08)',
                    border: '1px solid rgba(74,124,89,0.25)',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: '#4a7c59'
                  }}>
                    No processing fee for {paymentData.method} payments
                  </div>
                )}

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

      {/* Charge Saved Card Modal */}
      {showChargeModal && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px', zIndex: 50
        }}>
          <div style={{
            backgroundColor: theme.bgCard, borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)', width: '100%', maxWidth: isMobile ? 'calc(100vw - 32px)' : '420px'
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '20px', borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                Charge Saved Card
              </h2>
              <button onClick={() => setShowChargeModal(false)} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>
                Select a card to charge for the remaining balance.
              </div>

              <div style={{
                padding: '12px 16px', backgroundColor: theme.bg, borderRadius: '10px',
                border: `1px solid ${theme.border}`, fontSize: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.text }}>
                  <span>Balance Due</span>
                  <span style={{ fontWeight: '700', color: theme.accent }}>
                    ${((parseFloat(invoice?.amount) || 0) - payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)).toFixed(2)}
                  </span>
                </div>
                {ccFeeEnabled && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.textMuted, fontSize: '12px', marginTop: '4px' }}>
                    <span>CC processing fee ({ccFeePercent}%)</span>
                    <span>
                      +${(((parseFloat(invoice?.amount) || 0) - payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)) * ccFeePercent / 100).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {savedCards.map(card => (
                  <label key={card.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '12px 14px', backgroundColor: selectedCardId === card.id ? theme.accentBg : theme.bg,
                    borderRadius: '10px', border: `1px solid ${selectedCardId === card.id ? theme.accent + '60' : theme.border}`,
                    cursor: 'pointer', minHeight: '44px'
                  }}>
                    <input
                      type="radio"
                      name="chargeCard"
                      checked={selectedCardId === card.id}
                      onChange={() => setSelectedCardId(card.id)}
                      style={{ accentColor: theme.accent }}
                    />
                    <CreditCard size={16} style={{ color: theme.accent }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: theme.text }}>
                        {(card.brand || 'Card').charAt(0).toUpperCase() + (card.brand || 'card').slice(1)} **** {card.last_four}
                      </span>
                      {card.is_default && (
                        <span style={{
                          marginLeft: '6px', padding: '1px 5px', backgroundColor: theme.accentBg,
                          color: theme.accent, borderRadius: '4px', fontSize: '9px', fontWeight: '600'
                        }}>DEFAULT</span>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: theme.textMuted }}>{card.exp_month}/{card.exp_year}</span>
                  </label>
                ))}
              </div>

              <button
                onClick={chargeSavedCard}
                disabled={charging || !selectedCardId}
                style={{
                  padding: '14px', backgroundColor: '#3b82f6', color: '#fff',
                  border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600',
                  cursor: (charging || !selectedCardId) ? 'not-allowed' : 'pointer',
                  opacity: (charging || !selectedCardId) ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  minHeight: '44px'
                }}
              >
                <CreditCard size={16} />
                {charging ? 'Processing...' : 'Charge Card'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Invoice Modal */}
      {showSendModal && (
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
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '450px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                Send Invoice
              </h2>
              <button onClick={() => setShowSendModal(false)} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh', overflowY: 'auto' }}>
              <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>
                Send this invoice via email. A PDF will be attached and a payment portal link will be included.
              </p>
              <div>
                <label style={labelStyle}>Recipient Email</label>
                <input
                  type="email"
                  value={sendEmail}
                  onChange={(e) => setSendEmail(e.target.value)}
                  placeholder="customer@email.com"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowSendModal(false)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: theme.bg,
                    color: theme.textSecondary,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendInvoice}
                  disabled={sendingEmail || !sendEmail}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: theme.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: sendingEmail || !sendEmail ? 'not-allowed' : 'pointer',
                    opacity: sendingEmail || !sendEmail ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <Mail size={16} />
                  {sendingEmail ? 'Sending...' : 'Send Email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* PDF Preview Modal */}
      {pdfPreviewUrl && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            width: '100%',
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '900px',
            height: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: isMobile ? 'stretch' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between',
              flexShrink: 0,
              gap: isMobile ? '8px' : undefined,
              flexWrap: 'wrap'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
                PDF Preview
              </h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleDiscardPreview}
                  style={{
                    padding: '10px 16px', minHeight: '44px',
                    backgroundColor: 'transparent',
                    color: theme.textSecondary,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <X size={16} /> Discard
                </button>
                <button
                  onClick={handleSavePreviewPDF}
                  disabled={generatingPdf}
                  style={{
                    padding: '10px 16px', minHeight: '44px',
                    backgroundColor: theme.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: generatingPdf ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: generatingPdf ? 0.6 : 1
                  }}
                >
                  <Download size={16} /> {generatingPdf ? 'Saving...' : 'Save to Documents'}
                </button>
              </div>
            </div>

            {/* PDF iframe */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <iframe
                src={pdfPreviewUrl}
                title="PDF Preview"
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
