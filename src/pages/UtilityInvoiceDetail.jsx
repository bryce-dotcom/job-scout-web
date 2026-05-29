import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import useSmartBack from '../lib/useSmartBack'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { ArrowLeft, CheckCircle, Pencil, Trash2, Download, Send, FileText, RotateCcw } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'
import { invoiceStatusColors as statusColors } from '../lib/statusColors'
import { jsPDF } from 'jspdf'
import { toast } from '../lib/toast'

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

export default function UtilityInvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const goBack = useSmartBack('/invoices?type=utility')
  const isMobile = useIsMobile()
  const companyId = useStore((state) => state.companyId)
  const company = useStore((state) => state.company)
  const fetchUtilityInvoices = useStore((state) => state.fetchUtilityInvoices)

  const [invoice, setInvoice] = useState(null)
  const [jobLines, setJobLines] = useState([])
  // When this utility invoice is linked to a customer invoice (the new
  // Phase-5 flow), we load that invoice's locked-at-creation line items
  // here. They carry the in_utility_scope flag so the PDF renderer can
  // split rows into "in-scope" vs "customer add-ons (not in utility
  // scope)" without recomputing anything.
  const [invoiceLines, setInvoiceLines] = useState([])
  const [linkedInvoice, setLinkedInvoice] = useState(null)
  const [jobData, setJobData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    amount: '',
    utility_name: '',
    customer_name: '',
    notes: '',
    project_cost: '',
    incentive_amount: '',
    net_cost: '',
    parts_total_override: '',
    labor_total_override: ''
  })

  // Record Payment modal — captures the real paid_at date so commission
  // timing isn't keyed off the click date.
  const [showRecordPayment, setShowRecordPayment] = useState(false)
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [paymentNote, setPaymentNote] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchInvoiceData()
  }, [companyId, id, navigate])

  // One canonical invoice document — customer + utility see the same PDF.
  // When this utility AR row is linked to a customer invoice, route to it
  // so the team only maintains a single template. The utility_invoices row
  // continues to track utility-side AR (amount, payment_status, paid_at)
  // in the background, but the visible page IS the customer invoice.
  // Legacy utility invoices without a linked invoice_id keep the old view.
  useEffect(() => {
    if (invoice && invoice.invoice_id) {
      navigate(`/invoices/${invoice.invoice_id}`, { replace: true })
    }
  }, [invoice, navigate])

  const fetchInvoiceData = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('utility_invoices')
      .select('*')
      .eq('id', id)
      .single()

    if (data) {
      setInvoice(data)

      // Fetch linked job and its line items for product/labor breakdown
      if (data.job_id) {
        const { data: jd } = await supabase
          .from('jobs')
          .select('*, customer:customers!customer_id(id, name, email, phone, address, business_name)')
          .eq('id', data.job_id)
          .single()
        if (jd) setJobData(jd)

        const { data: lines } = await supabase
          .from('job_lines')
          .select('*, item:products_services(id, name, description, unit_price, cost, in_utility_scope)')
          .eq('job_id', data.job_id)
          .order('id')
        setJobLines(lines || [])
      }

      // When this utility invoice is linked to a customer invoice
      // (Phase-5 flow), pull the customer's locked invoice + its lines.
      // Those become the source of truth — line items have the
      // in_utility_scope flag set at insert time so the PDF can split
      // them into in-scope vs add-on without recomputing.
      if (data.invoice_id) {
        const [{ data: inv }, { data: ilines }] = await Promise.all([
          supabase.from('invoices').select('id, invoice_id, amount, discount_applied, created_at, job_description').eq('id', data.invoice_id).single(),
          // Pull item.type for the Parts/Labor split in summary mode
          supabase.from('invoice_lines').select('*, item:products_services(id, name, type)').eq('invoice_id', data.invoice_id).order('sort_order').order('line_number'),
        ])
        setLinkedInvoice(inv || null)
        setInvoiceLines(ilines || [])
      } else {
        setLinkedInvoice(null)
        setInvoiceLines([])
      }
    }
    setLoading(false)
  }

  const openRecordPayment = () => {
    // Default the date to invoice.paid_at if it exists (re-edit case),
    // otherwise today.
    if (invoice.paid_at) {
      setPaymentDate(invoice.paid_at.slice(0, 10))
    } else {
      setPaymentDate(new Date().toISOString().slice(0, 10))
    }
    setPaymentNote('')
    // Default the amount to whatever was last recorded on the invoice
    // (incentive_amount preferred, falls back to amount). User can edit
    // it down (or up) if the utility paid short or over.
    const expected = invoice.incentive_amount ?? invoice.amount ?? ''
    setPaymentAmount(expected === '' || expected === null ? '' : String(expected))
    setShowRecordPayment(true)
  }

  const recordPayment = async () => {
    if (!paymentDate) {
      toast.error('Pick a payment date')
      return
    }
    setSaving(true)
    // Store the date at noon UTC so it doesn't drift to the day before in
    // negative timezones when displayed back.
    const isoPaidAt = `${paymentDate}T12:00:00.000Z`
    // Parse the actual amount paid. If left blank, fall back to the
    // existing invoice amount so behavior matches the old read-only flow.
    const expected = parseFloat(invoice.incentive_amount ?? invoice.amount) || 0
    const paidNum = paymentAmount === '' ? expected : parseFloat(paymentAmount)
    if (isNaN(paidNum) || paidNum < 0) {
      toast.error('Enter a valid amount')
      setSaving(false)
      return
    }
    const shortBy = Math.round((expected - paidNum) * 100) / 100
    let amountNote = ''
    if (shortBy > 0.005) {
      amountNote = ` — short ${formatCurrency(shortBy)} (expected ${formatCurrency(expected)}, received ${formatCurrency(paidNum)})`
    } else if (shortBy < -0.005) {
      amountNote = ` — over ${formatCurrency(-shortBy)} (expected ${formatCurrency(expected)}, received ${formatCurrency(paidNum)})`
    }
    const stamped = `Paid ${paymentDate}${paymentNote ? ' — ' + paymentNote : ''}${amountNote}`
    const newNotes = invoice.notes ? `${invoice.notes}\n\n${stamped}` : stamped
    const updatePayload = {
      payment_status: 'Paid',
      paid_at: isoPaidAt,
      notes: newNotes,
      updated_at: new Date().toISOString()
    }
    // If the actual paid amount differs from what was on the invoice,
    // overwrite incentive_amount / amount so the books reflect reality.
    if (Math.abs(shortBy) > 0.005) {
      updatePayload.incentive_amount = paidNum
      updatePayload.amount = paidNum
      const pcNum = parseFloat(invoice.project_cost) || 0
      if (pcNum > 0) updatePayload.net_cost = Math.round((pcNum - paidNum) * 100) / 100
    }
    const { error } = await supabase.from('utility_invoices').update(updatePayload).eq('id', id)
    if (error) {
      toast.error('Failed to record payment: ' + error.message)
      setSaving(false)
      return
    }
    await fetchInvoiceData()
    await fetchUtilityInvoices()
    setShowRecordPayment(false)
    setSaving(false)
    toast.success('Payment recorded')
  }

  // Reopen a paid utility invoice so a payment can be re-applied or corrected.
  // Clears paid_at and flips status back to Open. Notes are kept (audit trail).
  const unmarkPaid = async () => {
    if (!confirm('Reopen this utility invoice? The status will go back to Open and the paid date will be cleared so you can record the actual payment fresh.')) return
    setSaving(true)
    const { error } = await supabase.from('utility_invoices').update({
      payment_status: 'Open',
      paid_at: null,
      updated_at: new Date().toISOString()
    }).eq('id', id)
    if (error) {
      toast.error('Failed to reopen: ' + error.message)
    } else {
      await fetchInvoiceData()
      await fetchUtilityInvoices()
      toast.success('Reopened')
    }
    setSaving(false)
  }

  // Allow correcting the paid_at after the fact without re-recording.
  const updatePaidAt = async (newDate) => {
    if (!newDate) return
    setSaving(true)
    const isoPaidAt = `${newDate}T12:00:00.000Z`
    const { error } = await supabase.from('utility_invoices').update({
      paid_at: isoPaidAt,
      updated_at: new Date().toISOString()
    }).eq('id', id)
    if (error) {
      toast.error('Failed to update paid date: ' + error.message)
    } else {
      await fetchInvoiceData()
      await fetchUtilityInvoices()
      toast.success('Paid date updated')
    }
    setSaving(false)
  }

  const startEditing = () => {
    const pc = parseFloat(invoice.project_cost) || parseFloat(invoice.amount) || 0
    const matP = parseFloat(invoice.material_pct) || 70
    const labP = parseFloat(invoice.labor_pct) || 30
    setEditForm({
      // Display number — shown to the utility on the PDF header. Falls
      // back to the customer invoice's number on legacy rows.
      linked_invoice_number: invoice.linked_invoice_number || linkedInvoice?.invoice_id || '',
      amount: invoice.amount || '',
      utility_name: invoice.utility_name || '',
      customer_name: invoice.customer_name || '',
      notes: invoice.notes || '',
      project_cost: invoice.project_cost || '',
      incentive_amount: invoice.incentive_amount || '',
      net_cost: invoice.net_cost || '',
      material_pct: matP,
      labor_pct: labP,
      material_amount: Math.round(pc * matP / 100 * 100) / 100 || '',
      labor_amount: Math.round(pc * labP / 100 * 100) / 100 || '',
      parts_total_override: invoice.parts_total_override ?? '',
      labor_total_override: invoice.labor_total_override ?? '',
    })
    setIsEditing(true)
  }

  // Auto-recalc helpers — keeps all numbers in sync when one changes.
  // Rules:
  //   project_cost = material_amount + labor_amount
  //   net_cost = project_cost - incentive_amount
  //   amount = incentive_amount (always synced for payment tracking)
  //   material_amount = project_cost * material_pct / 100
  //   labor_amount = project_cost * labor_pct / 100
  const recalcFromProjectCost = (form, newPC) => {
    const pc = parseFloat(newPC) || 0
    const inc = parseFloat(form.incentive_amount) || 0
    const matP = parseFloat(form.material_pct) || 70
    const labP = parseFloat(form.labor_pct) || 30
    return {
      ...form,
      project_cost: newPC,
      material_amount: Math.round(pc * matP / 100 * 100) / 100,
      labor_amount: Math.round(pc * labP / 100 * 100) / 100,
      net_cost: Math.round((pc - inc) * 100) / 100,
    }
  }

  const recalcFromIncentive = (form, newInc) => {
    const pc = parseFloat(form.project_cost) || 0
    const inc = parseFloat(newInc) || 0
    return {
      ...form,
      incentive_amount: newInc,
      amount: newInc,
      net_cost: Math.round((pc - inc) * 100) / 100,
    }
  }

  const recalcFromNetCost = (form, newNet) => {
    const pc = parseFloat(form.project_cost) || 0
    const net = parseFloat(newNet) || 0
    const newInc = Math.round((pc - net) * 100) / 100
    return {
      ...form,
      net_cost: newNet,
      incentive_amount: newInc,
      amount: newInc,
    }
  }

  const recalcFromPct = (form, field, newVal) => {
    const pc = parseFloat(form.project_cost) || 0
    const updated = { ...form, [field]: newVal }
    const matP = parseFloat(field === 'material_pct' ? newVal : form.material_pct) || 0
    const labP = parseFloat(field === 'labor_pct' ? newVal : form.labor_pct) || 0
    updated.material_amount = Math.round(pc * matP / 100 * 100) / 100
    updated.labor_amount = Math.round(pc * labP / 100 * 100) / 100
    return updated
  }

  const recalcFromMaterialAmount = (form, newMat) => {
    const lab = parseFloat(form.labor_amount) || 0
    const mat = parseFloat(newMat) || 0
    const newPC = Math.round((mat + lab) * 100) / 100
    const inc = parseFloat(form.incentive_amount) || 0
    const matP = newPC > 0 ? Math.round(mat / newPC * 100 * 10) / 10 : form.material_pct
    return {
      ...form,
      material_amount: newMat,
      material_pct: matP,
      project_cost: newPC,
      net_cost: Math.round((newPC - inc) * 100) / 100,
    }
  }

  const recalcFromLaborAmount = (form, newLab) => {
    const mat = parseFloat(form.material_amount) || 0
    const lab = parseFloat(newLab) || 0
    const newPC = Math.round((mat + lab) * 100) / 100
    const inc = parseFloat(form.incentive_amount) || 0
    const labP = newPC > 0 ? Math.round(lab / newPC * 100 * 10) / 10 : form.labor_pct
    return {
      ...form,
      labor_amount: newLab,
      labor_pct: labP,
      project_cost: newPC,
      net_cost: Math.round((newPC - inc) * 100) / 100,
    }
  }

  const cancelEditing = () => {
    setIsEditing(false)
  }

  const saveEdits = async () => {
    setSaving(true)
    // amount always equals incentive_amount — it's what drives payment
    // tracking ("how much the utility owes us").
    const incAmt = parseFloat(editForm.incentive_amount) || 0
    const pc = parseFloat(editForm.project_cost) || 0
    const nc = parseFloat(editForm.net_cost) || 0
    // Parts/Labor manual override — both must be filled to take effect.
    const partsOv = editForm.parts_total_override === '' || editForm.parts_total_override == null
      ? null : parseFloat(editForm.parts_total_override)
    const laborOv = editForm.labor_total_override === '' || editForm.labor_total_override == null
      ? null : parseFloat(editForm.labor_total_override)
    const { data: updated, error } = await supabase.from('utility_invoices').update({
      amount: incAmt,
      utility_name: editForm.utility_name || null,
      customer_name: editForm.customer_name || null,
      notes: editForm.notes || null,
      project_cost: pc,
      incentive_amount: incAmt,
      net_cost: nc,
      material_pct: parseFloat(editForm.material_pct) || 70,
      labor_pct: parseFloat(editForm.labor_pct) || 30,
      parts_total_override: partsOv,
      labor_total_override: laborOv,
      // Allow HR to override the displayed invoice number on the
      // utility-copy PDF (e.g. add a -U suffix the utility wants, or
      // match a specific number scheme the program requires).
      linked_invoice_number: (editForm.linked_invoice_number || '').trim() || null,
      updated_at: new Date().toISOString()
    }).eq('id', id).select().single()

    if (error || !updated) {
      toast.error('Failed to save: ' + (error?.message || 'No rows updated'))
    } else {
      setInvoice(updated)
      toast.success('Utility incentive updated')
      setIsEditing(false)
      fetchUtilityInvoices()
    }
    setSaving(false)
  }

  const handleDeleteInvoice = async () => {
    if (!confirm('Are you sure you want to delete this utility incentive? This cannot be undone.')) return

    setSaving(true)
    const { toast } = await import('../lib/toast')
    const { error } = await supabase.from('utility_invoices').delete().eq('id', id)

    if (error) {
      toast.error('Failed to delete bill: ' + error.message)
      setSaving(false)
    } else {
      toast.success('Utility incentive deleted')
      await fetchUtilityInvoices()
      navigate('/invoices?type=utility')
    }
  }

  // Computed totals — just Material and Labor, no line item detail.
  // Uses the per-invoice split percentages stored on the row (editable
  // by the PM). Falls back to 70/30 for invoices created before the
  // migration or when the columns are null.
  const projectCost = parseFloat(invoice?.project_cost) || parseFloat(invoice?.amount) || 0
  const rawProductTotal = jobLines.reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0)
  const rawLaborTotal = jobLines.reduce((sum, l) => sum + (parseFloat(l.labor_cost) || 0), 0)
  const hasLaborData = rawLaborTotal > 0
  const matPct = (parseFloat(isEditing ? editForm.material_pct : invoice?.material_pct) || 70) / 100
  const labPct = (parseFloat(isEditing ? editForm.labor_pct : invoice?.labor_pct) || 30) / 100
  const totalBase = rawProductTotal > 0 ? rawProductTotal + rawLaborTotal : projectCost
  const materialTotal = hasLaborData ? rawProductTotal : Math.round(totalBase * matPct * 100) / 100
  const laborTotal = hasLaborData ? rawLaborTotal : Math.round(totalBase * labPct * 100) / 100

  const generateUtilityPDF = () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    const rightEdge = pageWidth - margin
    const contentWidth = pageWidth - margin * 2
    let y = 20

    // ---- Header ----
    const displayCompanyName = invoice.business_unit || jobData?.business_unit || company?.company_name || company?.name || 'Company'
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text(displayCompanyName, margin, y)
    y += 8

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    if (company?.address) {
      const compAddrLines = doc.splitTextToSize(company.address, contentWidth * 0.5)
      for (const line of compAddrLines) { doc.text(line, margin, y); y += 5 }
    }
    if (company?.phone) { doc.text(company.phone, margin, y); y += 5 }
    if (company?.owner_email || company?.email) { doc.text(company.owner_email || company.email, margin, y); y += 5 }
    y += 5

    // Title — INVOICE big, "Utility Copy of INV-XXXX" subtitle. The
    // utility sees the same number the customer received so their
    // records reconcile to ours. The "-U" only exists in our system
    // for filtering.
    const displayInvoiceNumber = invoice.linked_invoice_number || linkedInvoice?.invoice_id || `UTL-${invoice.id}`
    doc.setTextColor(90, 99, 73)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('INVOICE', rightEdge, 20, { align: 'right' })
    doc.setTextColor(80)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    let iy = 30
    doc.text(`Invoice #: ${displayInvoiceNumber}`, rightEdge, iy, { align: 'right' }); iy += 5
    if (invoice.linked_invoice_number) {
      doc.setFontSize(8); doc.setTextColor(140)
      doc.text('(Utility copy — matches customer invoice)', rightEdge, iy, { align: 'right' }); iy += 4
      doc.setFontSize(10); doc.setTextColor(80)
    }
    doc.text(`Date: ${formatDate(invoice.created_at)}`, rightEdge, iy, { align: 'right' })

    doc.setDrawColor(214, 205, 184)
    doc.line(margin, y, rightEdge, y)
    y += 10

    // ---- Customer info ----
    doc.setTextColor(0)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Customer:', margin, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    const custPrimary = invoice.customer_name || jobData?.customer?.business_name || jobData?.customer?.name || '-'
    const custContact = jobData?.customer?.business_name && jobData?.customer?.name ? jobData.customer?.name : null
    doc.setFontSize(11)
    doc.text(custPrimary, margin, y); y += 6
    doc.setFontSize(10)
    if (custContact) { doc.text(`Attn: ${custContact}`, margin, y); y += 5 }
    if (jobData?.customer?.address) {
      const addrLines = doc.splitTextToSize(jobData.customer?.address, contentWidth * 0.6)
      for (const line of addrLines) { doc.text(line, margin, y); y += 5 }
    }
    if (!jobData?.customer?.address && jobData?.job_address) {
      const addrLines = doc.splitTextToSize(jobData.job_address, contentWidth * 0.6)
      for (const line of addrLines) { doc.text(line, margin, y); y += 5 }
    }
    if (jobData?.customer?.phone) { y += 1; doc.text(jobData.customer?.phone, margin, y); y += 5 }
    if (jobData?.customer?.email) { doc.text(jobData.customer?.email, margin, y); y += 5 }
    y += 8

    // ---- Line items (Phase-5: split into in-scope + customer add-ons) ----
    // Source of truth: invoice_lines from the linked customer invoice
    // when present (carries the locked in_utility_scope flag). Falls
    // back to job_lines for legacy utility invoices that pre-date the
    // linkage. For very old invoices with neither, falls back to the
    // material/labor split.
    const allLines = invoiceLines.length > 0 ? invoiceLines : jobLines
    const useLineItems = allLines.length > 0
    let inScopeLines = []
    let addOnLines   = []
    if (useLineItems) {
      // For job_lines fall back to the product's catalog flag if the line
      // itself doesn't have in_utility_scope set yet (transition period).
      for (const l of allLines) {
        const lineScope = l.in_utility_scope ?? l.item?.in_utility_scope ?? true
        if (lineScope === false) addOnLines.push(l)
        else                     inScopeLines.push(l)
      }
    }

    const drawLineRow = (label, qty, amount) => {
      const lineHeight = 6
      // Wrap long labels
      const labelLines = doc.splitTextToSize(label, contentWidth * 0.55)
      const rowHeight = Math.max(lineHeight, labelLines.length * 5 + 1)
      for (let i = 0; i < labelLines.length; i++) {
        doc.text(labelLines[i], margin + 2, y + (i * 5))
      }
      if (qty != null) doc.text(String(qty), margin + contentWidth * 0.65, y, { align: 'right' })
      doc.text(formatCurrency(amount), rightEdge - 2, y, { align: 'right' })
      y += rowHeight + 1
    }

    // Summary mode: collapse both sections into Parts + Labor totals.
    // Same in-scope vs add-on math still drives the footer totals; the
    // body just doesn't show per-line detail.
    if (useLineItems && invoice.summary_format) {
      // Compute Parts vs Labor with the 3-tier hierarchy (highest first):
      //   1) Manual override on invoice.parts_total_override + labor_total_override (both set)
      //   2) Sum of per-line labor_cost (real split — labor_cost = labor, rest = parts)
      //   3) Fallback type heuristic for legacy invoices without labor_cost data
      let partsTotal = 0
      let laborTotal = 0
      const hasOverride = invoice.parts_total_override != null && invoice.labor_total_override != null
      const hasLaborCostData = allLines.some(l => (parseFloat(l.labor_cost) || 0) > 0)

      if (hasOverride) {
        partsTotal = parseFloat(invoice.parts_total_override) || 0
        laborTotal = parseFloat(invoice.labor_total_override) || 0
      } else if (hasLaborCostData) {
        for (const l of allLines) {
          const total = parseFloat(l.line_total ?? l.total) || 0
          const labor = parseFloat(l.labor_cost) || 0
          const type = (l.item?.type || '').toLowerCase()
          if (type === 'service' || type === 'labor') {
            laborTotal += total
          } else {
            laborTotal += labor
            partsTotal += Math.max(0, total - labor)
          }
        }
      } else {
        for (const l of allLines) {
          const total = parseFloat(l.line_total ?? l.total) || 0
          const type = (l.item?.type || '').toLowerCase()
          if (type === 'service' || type === 'labor') laborTotal += total
          else partsTotal += total
        }
      }

      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
      doc.text('Cost Breakdown', margin, y); y += 7

      doc.setFillColor(247, 245, 239)
      doc.rect(margin, y - 4, contentWidth, 7, 'F')
      doc.setFontSize(9); doc.setTextColor(80)
      doc.text('Description', margin + 2, y)
      doc.text('Amount', rightEdge - 2, y, { align: 'right' })
      y += 8

      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(0)
      doc.text('Parts', margin + 2, y)
      doc.text(formatCurrency(partsTotal), rightEdge - 2, y, { align: 'right' })
      y += 7
      doc.text('Labor', margin + 2, y)
      doc.text(formatCurrency(laborTotal), rightEdge - 2, y, { align: 'right' })
      y += 4
      doc.setDrawColor(214, 205, 184); doc.line(margin, y, rightEdge, y); y += 10
    } else if (useLineItems) {
      // SECTION 1: In-utility-scope items
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0)
      doc.text('In-utility-scope items (eligible for incentive)', margin, y)
      y += 7

      // Table header
      doc.setFillColor(247, 245, 239)
      doc.rect(margin, y - 4, contentWidth, 7, 'F')
      doc.setFontSize(9)
      doc.setTextColor(80)
      doc.text('Description', margin + 2, y)
      doc.text('Qty', margin + contentWidth * 0.65, y, { align: 'right' })
      doc.text('Amount', rightEdge - 2, y, { align: 'right' })
      y += 8

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(0)
      let inScopeSubtotal = 0
      if (inScopeLines.length === 0) {
        doc.setTextColor(140)
        doc.text('(no in-scope line items)', margin + 2, y); y += 7
        doc.setTextColor(0)
      }
      for (const l of inScopeLines) {
        const label = l.description || l.item?.name || l.item_name || 'Item'
        const qty   = l.quantity || 1
        const amt   = parseFloat(l.line_total ?? l.total) || 0
        drawLineRow(label, qty, amt); inScopeSubtotal += amt
      }
      doc.setDrawColor(214, 205, 184)
      doc.line(margin, y, rightEdge, y); y += 4
      doc.setFont('helvetica', 'bold')
      doc.text('In-scope subtotal:', margin + contentWidth * 0.55, y, { align: 'right' })
      doc.text(formatCurrency(inScopeSubtotal), rightEdge - 2, y, { align: 'right' })
      y += 10

      // SECTION 2: Customer add-ons
      if (addOnLines.length > 0) {
        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0)
        doc.text('Customer add-ons (NOT part of utility scope)', margin, y)
        y += 7
        doc.setFontSize(9)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(140)
        doc.text('These items are paid in full by the customer and are not eligible for utility incentive.', margin, y); y += 7
        doc.setFont('helvetica', 'normal')

        doc.setFillColor(252, 240, 230)
        doc.rect(margin, y - 4, contentWidth, 7, 'F')
        doc.setFontSize(9)
        doc.setTextColor(80)
        doc.text('Description', margin + 2, y)
        doc.text('Qty', margin + contentWidth * 0.65, y, { align: 'right' })
        doc.text('Amount', rightEdge - 2, y, { align: 'right' })
        y += 8

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(0)
        let addOnSubtotal = 0
        for (const l of addOnLines) {
          const label = l.description || l.item?.name || l.item_name || 'Item'
          const qty   = l.quantity || 1
          const amt   = parseFloat(l.line_total ?? l.total) || 0
          drawLineRow(label, qty, amt); addOnSubtotal += amt
        }
        doc.setDrawColor(214, 205, 184)
        doc.line(margin, y, rightEdge, y); y += 4
        doc.setFont('helvetica', 'bold')
        doc.text('Customer add-ons subtotal:', margin + contentWidth * 0.55, y, { align: 'right' })
        doc.text(formatCurrency(addOnSubtotal), rightEdge - 2, y, { align: 'right' })
        y += 10
      }
    } else {
      // Legacy fallback: no line items at all → original material/labor split
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
      doc.text('Cost Breakdown', margin, y); y += 8
      doc.setFillColor(247, 245, 239)
      doc.rect(margin, y - 4, contentWidth, 7, 'F')
      doc.setFontSize(9); doc.setTextColor(80)
      doc.text('Description', margin + 2, y); doc.text('Amount', rightEdge - 2, y, { align: 'right' })
      y += 8
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0); doc.setFontSize(10)
      doc.text('Material', margin + 2, y); doc.text(formatCurrency(materialTotal), rightEdge - 2, y, { align: 'right' }); y += 7
      doc.text('Labor', margin + 2, y); doc.text(formatCurrency(laborTotal), rightEdge - 2, y, { align: 'right' }); y += 4
      doc.setDrawColor(214, 205, 184); doc.line(margin, y, rightEdge, y); y += 10
    }

    // ---- Financial summary (footer) ----
    // Reconciliation lines for the utility's auditor. The "in-scope
    // subtotal" line above sums to what we claimed for incentive; the
    // utility incentive applied here equals what they owe us. Customer
    // add-ons (when present) are a separate line that doesn't touch
    // the incentive math.
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0)

    const summaryX = margin + 80
    const valX = rightEdge

    doc.setFont('helvetica', 'bold')
    doc.text('Total Project Cost:', summaryX, y)
    doc.text(formatCurrency(invoice.project_cost || invoice.amount || (materialTotal + laborTotal)), valX, y, { align: 'right' }); y += 6

    doc.setFont('helvetica', 'normal'); doc.setTextColor(100)
    doc.text('Customer Portion:', summaryX, y)
    doc.text(formatCurrency(invoice.net_cost), valX, y, { align: 'right' }); y += 8

    doc.setDrawColor(214, 205, 184); doc.line(summaryX, y - 2, rightEdge, y - 2)

    doc.setTextColor(212, 148, 10); doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text('Utility Incentive:', summaryX, y + 5)
    doc.text(formatCurrency(invoice.incentive_amount || invoice.amount), valX, y + 5, { align: 'right' })
    y += 18

    // Notes
    if (invoice.notes) {
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100)
      doc.text('Notes:', margin, y); y += 5
      const noteLines = doc.splitTextToSize(invoice.notes, contentWidth)
      for (const line of noteLines) { doc.text(line, margin, y); y += 5 }
    }

    return doc
  }

  const handleDownloadPDF = () => {
    setGeneratingPdf(true)
    try {
      const doc = generateUtilityPDF()
      doc.save(`Invoice-${invoice.id}-${invoice.customer_name || 'customer'}.pdf`)
      toast.success('PDF downloaded')
    } catch (err) {
      toast.error('Failed to generate PDF: ' + err.message)
    }
    setGeneratingPdf(false)
  }

  const handlePreviewPDF = () => {
    try {
      const doc = generateUtilityPDF()
      const blob = doc.output('blob')
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) {
      toast.error('Failed to preview PDF: ' + err.message)
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
        <p style={{ color: theme.textMuted }}>Loading customer invoice...</p>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: '#dc2626', marginBottom: '16px' }}>Customer invoice not found</p>
        <button onClick={() => navigate('/invoices?type=utility')} style={{ color: theme.accent, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
          Back to Utility Incentives
        </button>
      </div>
    )
  }

  const statusStyle = statusColors[invoice.payment_status] || statusColors['Pending']

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button
          onClick={goBack}
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
          <p style={{ fontSize: '13px', color: theme.accent, fontWeight: '600', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>UTILITY COPY ·</span>
            {isEditing ? (
              <input
                type="text"
                value={editForm.linked_invoice_number}
                onChange={(e) => setEditForm(prev => ({ ...prev, linked_invoice_number: e.target.value }))}
                placeholder="INV-XXXX"
                style={{
                  padding: '4px 8px',
                  fontSize: 13, fontWeight: 600,
                  color: theme.accent, backgroundColor: theme.bgCard,
                  border: `1px solid ${theme.border}`, borderRadius: 6,
                  outline: 'none', width: 180,
                }}
              />
            ) : (
              <span>{invoice.linked_invoice_number || linkedInvoice?.invoice_id || `UTL-${invoice.id}`}{invoice.linked_invoice_number ? '-U' : ''}</span>
            )}
          </p>
          {invoice.linked_invoice_number && (
            <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
              Mirrors customer invoice {invoice.linked_invoice_number}
            </p>
          )}
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text }}>
            {invoice.customer_name || 'Customer Invoice'}
          </h1>
          <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
            Utility incentive applied as a deduction
          </p>
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

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 360px', gap: isMobile ? '16px' : '24px' }}>
        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Utility Info */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
              Utility Info
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Utility Name</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm.utility_name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, utility_name: e.target.value }))}
                    style={inputStyle}
                    placeholder="Utility name"
                  />
                ) : (
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.utility_name || '-'}</p>
                )}
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Customer Name</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm.customer_name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, customer_name: e.target.value }))}
                    style={inputStyle}
                    placeholder="Customer name"
                  />
                ) : (
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.customer_name || '-'}</p>
                )}
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Date Created</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{formatDate(invoice.created_at)}</p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Last Updated</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{formatDate(invoice.updated_at)}</p>
              </div>
            </div>
          </div>

          {/* Job Link */}
          {invoice.job_id && (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '20px'
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
                Linked Job
              </h3>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Job ID</p>
                <button
                  onClick={() => navigate(`/jobs/${invoice.job_id}`)}
                  style={{ fontSize: '14px', fontWeight: '500', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {invoice.job_id}
                </button>
              </div>
            </div>
          )}

          {/* Cost Breakdown — Material & Labor */}
          {(materialTotal > 0 || laborTotal > 0) && (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '20px'
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
                Cost Breakdown
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                  <span style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Material</span>
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.material_amount}
                      onChange={(e) => setEditForm(prev => recalcFromMaterialAmount(prev, e.target.value))}
                      style={{ ...inputStyle, width: '140px', textAlign: 'right', fontWeight: '600' }}
                    />
                  ) : (
                    <span style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>{formatCurrency(materialTotal)}</span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                  <span style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Labor</span>
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.labor_amount}
                      onChange={(e) => setEditForm(prev => recalcFromLaborAmount(prev, e.target.value))}
                      style={{ ...inputStyle, width: '140px', textAlign: 'right', fontWeight: '600' }}
                    />
                  ) : (
                    <span style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>{formatCurrency(laborTotal)}</span>
                  )}
                </div>
                {isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>Split:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={editForm.material_pct}
                        onChange={(e) => setEditForm(prev => recalcFromPct(prev, 'material_pct', e.target.value))}
                        style={{
                          width: '60px', padding: '6px 8px',
                          border: `1px solid ${theme.border}`, borderRadius: '6px',
                          fontSize: '13px', backgroundColor: theme.bg, color: theme.text,
                          textAlign: 'center',
                        }}
                      />
                      <span style={{ fontSize: '12px', color: theme.textMuted }}>%</span>
                    </div>
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>/</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={editForm.labor_pct}
                        onChange={(e) => setEditForm(prev => recalcFromPct(prev, 'labor_pct', e.target.value))}
                        style={{
                          width: '60px', padding: '6px 8px',
                          border: `1px solid ${theme.border}`, borderRadius: '6px',
                          fontSize: '13px', backgroundColor: theme.bg, color: theme.text,
                          textAlign: 'center',
                        }}
                      />
                      <span style={{ fontSize: '12px', color: theme.textMuted }}>%</span>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: '11px', color: theme.textMuted, fontStyle: 'italic', margin: 0 }}>
                    {invoice?.material_pct ?? 70}% material / {invoice?.labor_pct ?? 30}% labor
                  </p>
                )}

                {/* Manual Parts/Labor override — only for Summary-format PDFs.
                    Both fields must be filled to take effect; blank = auto-
                    compute from per-line labor_cost data. */}
                {isEditing && invoice.summary_format && (
                  <div style={{
                    marginTop: 4,
                    padding: '12px',
                    backgroundColor: theme.bg,
                    border: `1px dashed ${theme.border}`,
                    borderRadius: '8px',
                    display: 'flex', flexDirection: 'column', gap: '8px',
                  }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Parts / Labor Override (Summary PDF)
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                      <span style={{ color: theme.textSecondary }}>Parts Total</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.parts_total_override}
                        onChange={(e) => setEditForm(prev => ({ ...prev, parts_total_override: e.target.value }))}
                        placeholder="auto"
                        style={{ ...inputStyle, width: '140px', textAlign: 'right' }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                      <span style={{ color: theme.textSecondary }}>Labor Total</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.labor_total_override}
                        onChange={(e) => setEditForm(prev => ({ ...prev, labor_total_override: e.target.value }))}
                        placeholder="auto"
                        style={{ ...inputStyle, width: '140px', textAlign: 'right' }}
                      />
                    </div>
                    <p style={{ fontSize: '11px', color: theme.textMuted, margin: 0 }}>
                      Both blank = auto-compute from line items. Set both to force the PDF totals.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

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
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Financial Summary */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
              Financial Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Full project context — the utility sees these numbers
                  but they're informational, not what's owed. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                <span style={{ color: theme.textSecondary }}>Project Cost</span>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.project_cost}
                    onChange={(e) => setEditForm(prev => recalcFromProjectCost(prev, e.target.value))}
                    style={{ ...inputStyle, width: '140px', textAlign: 'right' }}
                  />
                ) : (
                  <span style={{ fontWeight: '500', color: theme.text }}>{formatCurrency(invoice.project_cost || invoice.amount)}</span>
                )}
              </div>

              {(materialTotal > 0 || laborTotal > 0 || isEditing) && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', alignItems: 'center', paddingLeft: '12px' }}>
                    <span style={{ color: theme.textMuted }}>Material ({isEditing ? editForm.material_pct : (invoice?.material_pct ?? 70)}%)</span>
                    <span style={{ color: theme.textSecondary }}>{formatCurrency(isEditing ? editForm.material_amount : materialTotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', alignItems: 'center', paddingLeft: '12px' }}>
                    <span style={{ color: theme.textMuted }}>Labor ({isEditing ? editForm.labor_pct : (invoice?.labor_pct ?? 30)}%)</span>
                    <span style={{ color: theme.textSecondary }}>{formatCurrency(isEditing ? editForm.labor_amount : laborTotal)}</span>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', alignItems: 'center' }}>
                <span style={{ color: theme.textMuted }}>Customer Portion</span>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.net_cost}
                    onChange={(e) => setEditForm(prev => recalcFromNetCost(prev, e.target.value))}
                    style={{ ...inputStyle, width: '140px', textAlign: 'right', fontSize: '13px' }}
                  />
                ) : (
                  <span style={{ color: theme.textSecondary }}>{formatCurrency(invoice.net_cost)}</span>
                )}
              </div>

              <div style={{ height: '1px', backgroundColor: theme.border }} />

              {/* This is what the utility owes — the primary number */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '14px',
                backgroundColor: 'rgba(212,148,10,0.08)',
                borderRadius: '10px',
                border: '1px solid rgba(212,148,10,0.3)',
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: '700', color: '#a88527', fontSize: '14px' }}>Utility Owes</span>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.incentive_amount}
                    onChange={(e) => setEditForm(prev => recalcFromIncentive(prev, e.target.value))}
                    style={{ ...inputStyle, width: '140px', textAlign: 'right', fontWeight: '700', fontSize: '18px' }}
                  />
                ) : (
                  <span style={{ fontSize: '22px', fontWeight: '700', color: '#a88527' }}>
                    {formatCurrency(invoice.incentive_amount || invoice.amount)}
                  </span>
                )}
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ color: theme.textSecondary, fontSize: '14px' }}>Payment Status</span>
                <span style={{
                  padding: '2px 10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '500',
                  backgroundColor: statusStyle.bg,
                  color: statusStyle.text
                }}>
                  {invoice.payment_status}
                </span>
              </div>

              {invoice.payment_status === 'Paid' && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ color: theme.textSecondary, fontSize: '14px' }}>Paid Date</span>
                  <input
                    type="date"
                    value={invoice.paid_at ? invoice.paid_at.slice(0, 10) : ''}
                    onChange={(e) => updatePaidAt(e.target.value)}
                    disabled={saving}
                    style={{
                      padding: '4px 8px',
                      border: `1px solid ${theme.border}`,
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: theme.text,
                      backgroundColor: theme.bgCard,
                    }}
                  />
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
              <button
                onClick={handlePreviewPDF}
                style={actionBtnStyle(theme.accentBg, theme.accent)}
              >
                <FileText size={18} />
                Preview PDF
              </button>

              <button
                onClick={handleDownloadPDF}
                disabled={generatingPdf}
                style={actionBtnStyle(theme.accentBg, theme.accent)}
              >
                <Download size={18} />
                {generatingPdf ? 'Generating...' : 'Download PDF'}
              </button>

              {/* Format toggle — Itemized (two-section line list) vs
                  Summary (just Parts + Labor totals). Same pattern as
                  the customer invoice. */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 0,
                padding: 3,
                backgroundColor: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                alignSelf: 'stretch',
              }}>
                {['itemized', 'summary'].map(mode => {
                  const isActive = (mode === 'summary') === !!invoice.summary_format
                  return (
                    <button
                      key={mode}
                      onClick={async () => {
                        if (isActive) return
                        const nextValue = mode === 'summary'
                        const { error } = await supabase
                          .from('utility_invoices')
                          .update({ summary_format: nextValue, updated_at: new Date().toISOString() })
                          .eq('id', invoice.id)
                        if (error) { toast.error('Could not save format: ' + error.message); return }
                        setInvoice(prev => ({ ...prev, summary_format: nextValue }))
                        toast.success(`Utility invoice: ${mode === 'summary' ? 'Parts & Labor summary' : 'Itemized'}`)
                      }}
                      title={mode === 'summary' ? 'Show one Parts + one Labor total instead of every line' : 'Show every line item with in-scope / customer-add-on split'}
                      style={{
                        flex: 1,
                        padding: '6px 12px', minHeight: 32,
                        backgroundColor: isActive ? '#fff' : 'transparent',
                        color: isActive ? theme.text : theme.textMuted,
                        border: 'none', borderRadius: 6,
                        fontSize: 12, fontWeight: 600,
                        cursor: isActive ? 'default' : 'pointer',
                        boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                      }}
                    >
                      {mode === 'summary' ? 'Summary' : 'Itemized'}
                    </button>
                  )
                })}
              </div>

              <div style={{ borderTop: `1px solid ${theme.border}`, margin: '2px 0' }} />

              {invoice.payment_status !== 'Paid' ? (
                <button
                  onClick={openRecordPayment}
                  disabled={saving}
                  style={actionBtnStyle('#4a7c59', '#ffffff')}
                >
                  <CheckCircle size={18} />
                  Record Payment
                </button>
              ) : (
                <>
                  <button
                    onClick={openRecordPayment}
                    disabled={saving}
                    style={actionBtnStyle(theme.accentBg, theme.accent)}
                    title="Re-record payment with a corrected date"
                  >
                    <Pencil size={18} />
                    Edit Payment
                  </button>
                  <button
                    onClick={unmarkPaid}
                    disabled={saving}
                    style={actionBtnStyle('rgba(234,179,8,0.12)', '#a16207')}
                    title="Reopen so you can record the payment fresh"
                  >
                    <RotateCcw size={18} />
                    Unmark Paid
                  </button>
                </>
              )}

              {!isEditing && (
                <button onClick={startEditing} style={actionBtnStyle(theme.accentBg, theme.accent)}>
                  <Pencil size={18} />
                  Edit Rebate
                </button>
              )}

              <div style={{ borderTop: `1px solid ${theme.border}`, margin: '6px 0' }} />
              <button
                onClick={handleDeleteInvoice}
                disabled={saving}
                style={actionBtnStyle('rgba(220,38,38,0.10)', '#dc2626')}
              >
                <Trash2 size={18} />
                Delete Rebate
              </button>
            </div>
          </div>
        </div>
      </div>

      {showRecordPayment && (
        <div
          onClick={() => !saving && setShowRecordPayment(false)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '24px',
              width: '100%',
              maxWidth: '420px',
            }}
          >
            <h3 style={{ fontSize: '17px', fontWeight: '700', color: theme.text, marginBottom: '4px' }}>
              {invoice.payment_status === 'Paid' ? 'Edit Payment' : 'Record Utility Payment'}
            </h3>
            <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '20px' }}>
              When did the utility actually pay out? This date drives commission timing.
            </p>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Paid Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Amount Received</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder={formatCurrency(invoice.incentive_amount || invoice.amount)}
                style={inputStyle}
              />
              <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                Expected {formatCurrency(invoice.incentive_amount || invoice.amount)}. Edit if the utility paid short or over — the rebate will be updated to match and the variance noted in the audit log.
              </p>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Note (optional)</label>
              <input
                type="text"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Check #, ACH ref, etc."
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowRecordPayment(false)}
                disabled={saving}
                style={{
                  flex: 1, padding: '12px',
                  border: `1px solid ${theme.border}`, backgroundColor: 'transparent',
                  color: theme.text, borderRadius: '8px', fontSize: '14px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={recordPayment}
                disabled={saving}
                style={{
                  flex: 1, padding: '12px',
                  backgroundColor: '#4a7c59', color: '#ffffff',
                  border: 'none', borderRadius: '8px', fontSize: '14px',
                  fontWeight: '600',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Save Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
