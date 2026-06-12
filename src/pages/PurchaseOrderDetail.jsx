import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useSmartBack from '../lib/useSmartBack'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { toast } from '../lib/toast'
import { ArrowLeft, Save, Plus, Trash2, Send, Package, FileText, X, Briefcase, Download, Mail } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'
import { PO_STATUS_LABELS, computePoTotals, formatCurrency } from '../lib/poUtils'
import { generatePoPdf } from '../lib/poPdf'
import { receiveShipment, autoDistribute, recomputeJobPartsStatus } from '../lib/poReceive'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', bgCardHover: '#eef2eb',
  border: '#d6cdb8', text: '#2c3530', textSecondary: '#4d5a52',
  textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)'
}

export default function PurchaseOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const goBack = useSmartBack('/purchase-orders')
  const isMobile = useIsMobile()
  const companyId = useStore((s) => s.companyId)
  const company = useStore((s) => s.company)
  const businessUnits = useStore((s) => s.businessUnits)
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const [po, setPo] = useState(null)
  const [lines, setLines] = useState([])
  const [vendors, setVendors] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Header form (locked to po row except when editing)
  const [vendorId, setVendorId] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [tax, setTax] = useState('')
  const [shipping, setShipping] = useState('')
  const [notes, setNotes] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [poBusinessUnit, setPoBusinessUnit] = useState('')  // BU name string

  // New-line draft
  const [draft, setDraft] = useState({ product_id: '', description: '', quantity: 1, unit_cost: 0 })
  const [productPickerOpen, setProductPickerOpen] = useState(false)

  // Link-to-job modal state — adds an additional job that needs the
  // same product as this PO line. Used for the "we already sent the PO,
  // now another job needs the same part — combine them" case.
  const [linkJobModal, setLinkJobModal] = useState(null)  // { line } | null
  const [linkCandidates, setLinkCandidates] = useState([])
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkSelectedJobLineId, setLinkSelectedJobLineId] = useState('')
  const [linkQty, setLinkQty] = useState('')

  // Receive modal state
  const [receiveModalOpen, setReceiveModalOpen] = useState(false)
  const [receiveItems, setReceiveItems] = useState([])   // [{ poLineId, receivedQty }]
  const [receivePackingSlip, setReceivePackingSlip] = useState('')
  const [receiveNotes, setReceiveNotes] = useState('')
  const [receiving, setReceiving] = useState(false)

  // Send modal state
  const [sendModalOpen, setSendModalOpen] = useState(false)
  const [sendEmail, setSendEmail] = useState('')
  const [sendCc, setSendCc] = useState('')
  const [sendSubject, setSendSubject] = useState('')
  const [sendBody, setSendBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!companyId) { navigate('/'); return }
    fetchAll()
  }, [companyId, id])

  const fetchAll = async () => {
    setLoading(true)
    const [poRes, linesRes, vRes, pRes] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, vendor:vendors(id, name, email, billing_address, default_payment_terms), job:jobs(id, job_id, job_title, customer_name, job_address, business_unit)')
        .eq('id', id).eq('company_id', companyId).maybeSingle(),
      supabase.from('purchase_order_lines').select('*').eq('po_id', id).order('sort_order').order('id'),
      supabase.from('vendors').select('id, name').eq('company_id', companyId).eq('active', true).order('name'),
      supabase.from('products_services')
        .select('id, item_id, name, cost, unit_price, vendor_sku, default_vendor_id')
        .eq('company_id', companyId).eq('active', true).order('name').limit(2000),
    ])
    const poRow = poRes.data
    if (!poRow) { setLoading(false); return }
    setPo(poRow)
    const baseLines = linesRes.data || []

    // Pull the per-line job allocations so the vendor sees which job each
    // line is for. Bryce flagged: vendors usually pick + label by job, so
    // they need that on the PO. Renders inline under each line on the
    // detail page AND on the PDF the vendor receives.
    const lineIds = baseLines.map(l => l.id)
    let lineJobs = []
    if (lineIds.length > 0) {
      const { data } = await supabase
        .from('purchase_order_line_jobs')
        .select('id, po_line_id, job_line_id, job_id, quantity, jobs(id, job_id, job_title, customer_name)')
        .in('po_line_id', lineIds)
      lineJobs = data || []
    }
    // Bucket by po_line_id for easy attachment to each line row
    const linesWithJobs = baseLines.map(l => ({
      ...l,
      jobLinks: lineJobs.filter(lj => lj.po_line_id === l.id),
    }))
    setLines(linesWithJobs)
    setVendors(vRes.data || [])
    setProducts(pRes.data || [])
    setVendorId(String(poRow.vendor_id || ''))
    setExpectedDate(poRow.expected_delivery_date || '')
    setTax(poRow.tax || '')
    setShipping(poRow.shipping || '')
    setNotes(poRow.notes || '')
    setInternalNotes(poRow.internal_notes || '')
    // Seed BU: stored value → job's BU → blank (multi-job PO)
    setPoBusinessUnit(poRow.business_unit || poRow.job?.business_unit || '')
    setLoading(false)
  }

  const isEditable = po && (po.status === 'draft')
  // Line-level qty + delete is allowed on sent/partial_received too — lets
  // users correct automation mistakes without voiding the whole PO.
  const isLineEditable = po && ['draft', 'sent', 'partial_received'].includes(po.status)
  const status = po ? (PO_STATUS_LABELS[po.status] || PO_STATUS_LABELS.draft) : null

  const totals = useMemo(() => computePoTotals(lines, tax, shipping), [lines, tax, shipping])

  // Persist header changes (vendor / dates / tax / shipping / notes)
  const saveHeader = async (extra = {}) => {
    setSaving(true)
    const t = computePoTotals(lines, tax, shipping)
    const { error } = await supabase
      .from('purchase_orders')
      .update({
        vendor_id: parseInt(vendorId) || po.vendor_id,
        expected_delivery_date: expectedDate || null,
        tax: t.tax, shipping: t.shipping,
        subtotal: t.subtotal, total: t.total,
        notes: notes || null,
        internal_notes: internalNotes || null,
        business_unit: poBusinessUnit || null,
        ...extra,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) toast.error('Save failed: ' + error.message)
    else {
      toast.success('Saved')
      await fetchAll()
    }
    setSaving(false)
  }

  // Add a new line to this PO from a product pick OR a custom row.
  const addLineFromProduct = async (product) => {
    if (!product) return
    setProductPickerOpen(false)
    const unitCost = parseFloat(product.cost) || 0
    const qty = 1
    const { error } = await supabase
      .from('purchase_order_lines')
      .insert({
        company_id: companyId,
        po_id: parseInt(id),
        product_id: product.id,
        description: product.vendor_sku ? `${product.name} (${product.vendor_sku})` : product.name,
        quantity_ordered: qty,
        quantity_received: 0,
        unit_cost: unitCost,
        line_total: qty * unitCost,
        sort_order: lines.length,
      })
    if (error) toast.error('Failed to add line: ' + error.message)
    else {
      await fetchAll()
      // Recompute totals on the PO row after adding
      await refreshTotals()
    }
  }

  const addCustomLine = async () => {
    if (!draft.description.trim()) {
      toast.error('Description is required for a custom line')
      return
    }
    const qty = parseFloat(draft.quantity) || 0
    const cost = parseFloat(draft.unit_cost) || 0
    const { error } = await supabase
      .from('purchase_order_lines')
      .insert({
        company_id: companyId,
        po_id: parseInt(id),
        product_id: null,
        description: draft.description.trim(),
        quantity_ordered: qty,
        quantity_received: 0,
        unit_cost: cost,
        line_total: qty * cost,
        sort_order: lines.length,
      })
    if (error) toast.error('Failed to add line: ' + error.message)
    else {
      setDraft({ product_id: '', description: '', quantity: 1, unit_cost: 0 })
      await fetchAll()
      await refreshTotals()
    }
  }

  const updateLineField = async (lineId, field, value) => {
    const line = lines.find(l => l.id === lineId); if (!line) return
    const patched = { ...line, [field]: value }
    const qty = parseFloat(patched.quantity_ordered) || 0
    const cost = parseFloat(patched.unit_cost) || 0
    patched.line_total = Math.round(qty * cost * 100) / 100
    setLines(prev => prev.map(l => l.id === lineId ? patched : l))
    // Debounced save would be nicer; for now persist on every change.
    await supabase.from('purchase_order_lines').update({
      [field]: value,
      line_total: patched.line_total,
      updated_at: new Date().toISOString(),
    }).eq('id', lineId)
    await refreshTotals()
  }

  const deleteLine = async (lineId) => {
    if (!confirm('Remove this line?')) return
    await supabase.from('purchase_order_lines').delete().eq('id', lineId)
    await fetchAll()
    await refreshTotals()
  }

  // After any line change, recompute and persist header totals so the
  // list view and totals card stay in sync without a manual save.
  const refreshTotals = async () => {
    const { data: fresh } = await supabase
      .from('purchase_order_lines').select('quantity_ordered, unit_cost, line_total').eq('po_id', id)
    const t = computePoTotals(fresh || [], tax, shipping)
    await supabase.from('purchase_orders').update({
      subtotal: t.subtotal, total: t.total, updated_at: new Date().toISOString(),
    }).eq('id', id)
    setPo(p => p ? { ...p, subtotal: t.subtotal, total: t.total } : p)
  }

  // PDF + Send helpers ────────────────────────────────────────────────

  // Build a fresh PDF doc from current state (vendor + lines + job).
  const buildPdf = () => {
    // Resolve the full BU object (has name/address/phone/email) from the
    // stored BU name so the PDF header shows the right division.
    const buName = poBusinessUnit || po.job?.business_unit
    const buObj = Array.isArray(businessUnits)
      ? businessUnits.find(bu => (bu.name || bu) === buName) || null
      : null
    return generatePoPdf({ po, lines, vendor: po.vendor, company, job: po.job, businessUnit: buObj })
  }

  const downloadPdf = () => {
    try {
      const doc = buildPdf()
      doc.save(`${po.po_number}.pdf`)
      toast.success('PDF downloaded')
    } catch (err) {
      toast.error('PDF failed: ' + err.message)
    }
  }

  const previewPdf = () => {
    try {
      const doc = buildPdf()
      const blob = doc.output('blob')
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) {
      toast.error('Preview failed: ' + err.message)
    }
  }

  // Open send modal with sensible defaults pulled from vendor + company
  const openSendModal = () => {
    const vendorEmail = po.vendor?.email || ''
    if (!lines.length) {
      toast.error('Add at least one line item before sending the PO.')
      return
    }
    setSendEmail(vendorEmail)
    setSendCc('')
    const companyName = company?.company_name || company?.name || 'Our Company'
    setSendSubject(`Purchase Order ${po.po_number} from ${companyName}`)
    setSendBody(
      `Hi${po.vendor?.contact_name ? ' ' + po.vendor.contact_name.split(' ')[0] : ''},\n\n` +
      `Please find attached Purchase Order ${po.po_number} for our records.\n\n` +
      (po.expected_delivery_date
        ? `We're expecting delivery by ${new Date(po.expected_delivery_date).toLocaleDateString()}. `
        : '') +
      `Please confirm receipt of this order and let us know if anything needs clarification.\n\n` +
      `Thank you,\n${companyName}`
    )
    setSendModalOpen(true)
  }

  // Generate PDF → base64 → send via send-email edge function
  const sendToVendor = async () => {
    if (!sendEmail.trim()) {
      toast.error('Enter a recipient email')
      return
    }
    setSending(true)
    try {
      const doc = buildPdf()
      const pdfBlob = doc.output('blob')
      // Base64 encode
      const arrayBuffer = await pdfBlob.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
      }
      const base64 = btoa(binary)

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      const ccList = sendCc.split(',').map(s => s.trim()).filter(Boolean)
      const toList = [sendEmail.trim(), ...ccList]
      const companyName = company?.company_name || company?.name || 'Our Company'

      const escapedBody = sendBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#2c3530;padding:20px;">
        <div style="max-width:600px;margin:0 auto;background:#fff;padding:24px;border:1px solid #d6cdb8;border-radius:10px;">
          <div style="font-size:11px;letter-spacing:2px;color:rgba(0,0,0,0.5);text-transform:uppercase;font-weight:600;margin-bottom:6px;">Purchase Order</div>
          <div style="font-size:22px;font-weight:700;margin-bottom:16px;">${po.po_number}</div>
          <div style="font-size:14px;line-height:1.6;color:#2c3530;white-space:pre-line;">${escapedBody}</div>
          <div style="margin-top:20px;padding-top:16px;border-top:1px solid #eef2eb;font-size:11px;color:#7d8a7f;">
            PDF attached &middot; Sent from ${companyName}
          </div>
        </div>
      </body></html>`

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify({
          to: toList,
          from: `${companyName} <invoices@appsannex.com>`,
          subject: sendSubject,
          html,
          attachments: [{
            filename: `${po.po_number}.pdf`,
            content: base64,
            content_type: 'application/pdf',
          }],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.success === false) {
        throw new Error(data.error || `send-email HTTP ${res.status}`)
      }

      // Flip status to 'sent' + record sent_at + auto-update linked jobs
      await markPoSentAndUpdateJobs()

      toast.success(`PO sent to ${sendEmail}`)
      setSendModalOpen(false)
      await fetchAll()
    } catch (err) {
      toast.error('Send failed: ' + err.message)
    }
    setSending(false)
  }

  // Shared helper: flip PO to 'sent', then auto-flip every linked job's
  // workflow status to "Waiting Product" if the company has that status
  // configured. Bryce asked: when a PO ships out, the Job Board should
  // reflect that the work is blocked on parts. We check the company's
  // job_statuses setting before flipping so we don't fight custom
  // pipelines that don't use "Waiting Product".
  const markPoSentAndUpdateJobs = async () => {
    await supabase.from('purchase_orders').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    // Collect every job linked to this PO (single-job via po.job_id,
    // multi-job via purchase_order_line_jobs)
    const jobIds = new Set()
    if (po.job_id) jobIds.add(po.job_id)
    const { data: links } = await supabase
      .from('purchase_order_line_jobs')
      .select('job_id')
      .in('po_line_id', lines.map(l => l.id))
    for (const link of links || []) jobIds.add(link.job_id)
    if (jobIds.size === 0) return

    // Always update parts_status to 'ordered' (always safe)
    for (const jobId of jobIds) {
      await recomputeJobPartsStatus(jobId)
    }

    // Conditionally flip workflow status to "Waiting Product" if it
    // exists in this company's job_statuses setting
    const { data: setting } = await supabase
      .from('settings').select('value')
      .eq('company_id', companyId).eq('key', 'job_statuses').maybeSingle()
    let companyStatuses = null
    if (setting?.value) {
      try {
        const v = JSON.parse(setting.value)
        if (Array.isArray(v)) companyStatuses = v
      } catch { /* fall through */ }
    }
    const HAS_WAITING_PRODUCT = companyStatuses
      ? companyStatuses.some(s => String(s).toLowerCase() === 'waiting product')
      : true  // unset settings = default list which includes it on HHH
    if (!HAS_WAITING_PRODUCT) return

    // Only bump jobs that aren't already in a terminal/late stage
    const KEEP_AS_IS = new Set(['Waiting Product', 'In Progress', 'Completed', 'Complete', 'Verified', 'Verified Complete', 'Invoiced', 'Paid', 'Closed', 'Archived', 'Cancelled'])
    for (const jobId of jobIds) {
      const { data: job } = await supabase
        .from('jobs').select('id, status').eq('id', jobId).maybeSingle()
      if (job && !KEEP_AS_IS.has(job.status)) {
        await supabase.from('jobs').update({
          status: 'Waiting Product',
          updated_at: new Date().toISOString(),
        }).eq('id', jobId)
      }
    }
  }

  // Mark sent manually (vendor doesn't have email or user prefers to send out-of-band)
  const markSentManually = async () => {
    if (!confirm('Mark this PO as sent without emailing the vendor? Use this when you sent the PO some other way (printed + handed over, called in, etc.)')) return
    await markPoSentAndUpdateJobs()
    toast.success('PO marked as sent · linked jobs moved to Waiting Product')
    await fetchAll()
  }

  // ── Link an additional job to an existing PO line ──────────────────

  const openLinkJobModal = async (line) => {
    setLinkJobModal({ line })
    setLinkLoading(true)
    setLinkCandidates([])
    setLinkSelectedJobLineId('')
    setLinkQty('')
    try {
      // Find every job_line in this company that wants the same product
      // AND isn't already on a PO line (po_line_id is null). Only show
      // jobs whose parent job's parts_status is needs_order or in_stock —
      // skip jobs already done/billed.
      if (!line.product_id) {
        setLinkLoading(false); return
      }
      const { data } = await supabase
        .from('job_lines')
        .select('id, job_id, quantity, allocated_qty, po_line_id, jobs(id, job_id, job_title, customer_name, status, parts_status, start_date)')
        .eq('company_id', companyId)
        .eq('item_id', line.product_id)
        .is('po_line_id', null)
        .limit(500)
      // Filter by job parts_status + needed qty > 0
      const usable = (data || []).filter(jl => {
        const need = (parseFloat(jl.quantity) || 0) - (parseFloat(jl.allocated_qty) || 0)
        if (need <= 0) return false
        const ps = jl.jobs?.parts_status
        return !ps || ['not_needed', 'in_stock', 'needs_order'].includes(ps)
      })
      // Exclude jobs that already have a row on THIS PO line via the join
      const alreadyLinkedJobIds = new Set((line.jobLinks || []).map(lj => lj.job_id))
      const filtered = usable.filter(jl => !alreadyLinkedJobIds.has(jl.job_id))
      // Sort oldest scheduled first
      filtered.sort((a, b) => {
        const ad = a.jobs?.start_date; const bd = b.jobs?.start_date
        if (!ad && !bd) return a.id - b.id
        if (!ad) return 1; if (!bd) return -1
        return new Date(ad) - new Date(bd)
      })
      setLinkCandidates(filtered)
    } catch (err) {
      toast.error('Failed to load candidate jobs: ' + err.message)
    }
    setLinkLoading(false)
  }

  const commitLinkJob = async () => {
    if (!linkJobModal || !linkSelectedJobLineId) return
    const jobLine = linkCandidates.find(c => String(c.id) === String(linkSelectedJobLineId))
    if (!jobLine) return
    const qty = parseFloat(linkQty) || 0
    if (qty <= 0) { toast.error('Enter a quantity > 0'); return }
    const need = (parseFloat(jobLine.quantity) || 0) - (parseFloat(jobLine.allocated_qty) || 0)
    if (qty > need) {
      if (!confirm(`This job only needs ${need} more. Link ${qty} anyway?`)) return
    }
    setSaving(true)
    try {
      const line = linkJobModal.line
      // 1) Insert the join row
      await supabase.from('purchase_order_line_jobs').insert({
        company_id: companyId,
        po_line_id: line.id,
        job_line_id: jobLine.id,
        job_id: jobLine.job_id,
        quantity: qty,
      })
      // 2) Tag job_line.po_line_id so it doesn't show up in /procurement
      await supabase.from('job_lines').update({
        po_line_id: line.id, updated_at: new Date().toISOString(),
      }).eq('id', jobLine.id)
      // 3) Bump quantity_ordered on the PO line + recompute totals
      const newQty = (parseFloat(line.quantity_ordered) || 0) + qty
      const unitCost = parseFloat(line.unit_cost) || 0
      const newLineTotal = Math.round(newQty * unitCost * 100) / 100
      await supabase.from('purchase_order_lines').update({
        quantity_ordered: newQty,
        line_total: newLineTotal,
        updated_at: new Date().toISOString(),
      }).eq('id', line.id)
      await refreshTotals()
      // 4) Update the linked job's parts_status (now on order)
      await recomputeJobPartsStatus(jobLine.job_id)
      // 5) If PO is already sent, also flip the job's workflow status to
      //    Waiting Product (same rule as send-to-vendor)
      if (po.status === 'sent' || po.status === 'partial_received') {
        const { data: setting } = await supabase
          .from('settings').select('value')
          .eq('company_id', companyId).eq('key', 'job_statuses').maybeSingle()
        let companyStatuses = null
        if (setting?.value) {
          try { const v = JSON.parse(setting.value); if (Array.isArray(v)) companyStatuses = v } catch {}
        }
        const HAS_WP = companyStatuses
          ? companyStatuses.some(s => String(s).toLowerCase() === 'waiting product')
          : true
        if (HAS_WP) {
          const KEEP = new Set(['Waiting Product','In Progress','Completed','Complete','Verified','Verified Complete','Invoiced','Paid','Closed','Archived','Cancelled'])
          const { data: job } = await supabase.from('jobs').select('id, status').eq('id', jobLine.job_id).maybeSingle()
          if (job && !KEEP.has(job.status)) {
            await supabase.from('jobs').update({ status: 'Waiting Product', updated_at: new Date().toISOString() }).eq('id', job.id)
          }
        }
      }
      toast.success(`Linked ${jobLine.jobs?.job_id || 'job'} · qty ${qty}`)
      setLinkJobModal(null)
      await fetchAll()
    } catch (err) {
      toast.error('Link failed: ' + err.message)
    }
    setSaving(false)
  }

  const unlinkJobFromLine = async (link) => {
    if (!confirm(`Remove ${link.jobs?.job_id || 'this job'} from the PO line? The job will go back to needs_order so you can re-source the parts elsewhere.`)) return
    setSaving(true)
    try {
      // Find the linked job_line and release its po_line_id
      await supabase.from('purchase_order_line_jobs').delete().eq('id', link.id)
      await supabase.from('job_lines').update({
        po_line_id: null, updated_at: new Date().toISOString(),
      }).eq('id', link.job_line_id)
      // Decrement PO line quantity by the unlinked amount
      const poLine = lines.find(l => l.id === link.po_line_id)
      if (poLine) {
        const newQty = Math.max(0, (parseFloat(poLine.quantity_ordered) || 0) - (parseFloat(link.quantity) || 0))
        const unitCost = parseFloat(poLine.unit_cost) || 0
        await supabase.from('purchase_order_lines').update({
          quantity_ordered: newQty,
          line_total: Math.round(newQty * unitCost * 100) / 100,
          updated_at: new Date().toISOString(),
        }).eq('id', poLine.id)
        await refreshTotals()
      }
      // Recompute job's parts_status
      await recomputeJobPartsStatus(link.job_id)
      toast.success('Job unlinked')
      await fetchAll()
    } catch (err) {
      toast.error('Unlink failed: ' + err.message)
    }
    setSaving(false)
  }

  // ── Receive shipment ────────────────────────────────────────────────

  const openReceiveModal = () => {
    if (lines.length === 0) {
      toast.error('Nothing to receive — PO has no line items.')
      return
    }
    // Default each line to its remaining unreceived qty
    setReceiveItems(lines.map(l => ({
      poLineId: l.id,
      receivedQty: Math.max(0, (parseFloat(l.quantity_ordered) || 0) - (parseFloat(l.quantity_received) || 0)),
    })))
    setReceivePackingSlip('')
    setReceiveNotes('')
    setReceiveModalOpen(true)
  }

  const confirmReceive = async () => {
    setReceiving(true)
    try {
      const items = receiveItems
        .filter(i => parseFloat(i.receivedQty) > 0)
        .map(i => ({
          poLine: lines.find(l => l.id === i.poLineId),
          receivedQty: parseFloat(i.receivedQty) || 0,
        }))
      if (items.length === 0) {
        toast.error('No quantities entered to receive.')
        setReceiving(false); return
      }
      const result = await receiveShipment({
        companyId, po, items,
        packingSlip: receivePackingSlip,
        notes: receiveNotes,
      })
      toast.success(
        result.newStatus === 'received'
          ? 'Shipment received in full ✓'
          : 'Partial shipment recorded'
      )
      setReceiveModalOpen(false)
      await fetchAll()
    } catch (err) {
      toast.error('Receive failed: ' + err.message)
    }
    setReceiving(false)
  }

  // Create a Bill from this PO. Pulls vendor + total + due-date defaults
  // and navigates to the Bill detail for finishing touches + payment.
  // Idempotent guard: if a bill already exists pointing at this PO, just
  // navigate there instead of creating a duplicate.
  const createBillFromPo = async () => {
    setSaving(true)
    try {
      const { data: existing } = await supabase
        .from('bills').select('id').eq('po_id', po.id).limit(1)
      if (existing && existing[0]) {
        navigate(`/bills/${existing[0].id}`)
        setSaving(false); return
      }
      // Compute due_date from vendor.default_payment_terms (parses "Net 30" → +30 days)
      const terms = po.vendor?.default_payment_terms || 'Net 30'
      const match = terms.match(/(\d+)/)
      const daysOut = match ? parseInt(match[1], 10) : 30
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + daysOut)
      const amount = parseFloat(po.total) || 0

      const { data: bill, error } = await supabase
        .from('bills').insert({
          company_id: companyId,
          vendor_id: po.vendor_id,
          po_id: po.id,
          bill_number: null,  // user fills in vendor's invoice # on the Bill page
          amount,
          balance_due: amount,
          bill_date: new Date().toISOString().slice(0, 10),
          due_date: dueDate.toISOString().slice(0, 10),
          status: 'open',
          notes: `Auto-created from PO ${po.po_number}`,
        }).select().single()
      if (error) throw error
      toast.success(`Bill created · ${formatCurrency(amount)} due ${dueDate.toLocaleDateString()}`)
      navigate(`/bills/${bill.id}`)
    } catch (err) {
      toast.error('Bill creation failed: ' + err.message)
    }
    setSaving(false)
  }

  // Cancel a PO (soft — keeps the row + audit trail)
  const cancelPo = async () => {
    if (!confirm('Cancel this PO? It will move to the Cancelled status. Any jobs that were waiting on these parts will be released so they can be re-ordered.')) return
    // Release the job_lines that were tagged with this PO's line IDs so
    // their parent jobs can re-order. Without this the JobDetail Parts
    // tab hides the "Generate PO" button because lines look like they're
    // already on a PO — exactly what happened on the Nucor PO that was
    // cancelled and then couldn't be re-created.
    const poLineIds = lines.map(l => l.id)
    if (poLineIds.length > 0) {
      const { data: linkedJobLines } = await supabase
        .from('job_lines')
        .select('id, job_id')
        .in('po_line_id', poLineIds)
      const touchedJobIds = [...new Set((linkedJobLines || []).map(l => l.job_id))]
      await supabase.from('job_lines')
        .update({ po_line_id: null, updated_at: new Date().toISOString() })
        .in('po_line_id', poLineIds)
      // Recompute parts_status on each affected job
      for (const jobId of touchedJobIds) {
        await recomputeJobPartsStatus(jobId)
      }
    }
    await supabase.from('purchase_orders').update({
      status: 'cancelled', closed_at: new Date().toISOString(),
    }).eq('id', id)
    toast.success('PO cancelled — linked jobs released for re-ordering')
    await fetchAll()
  }

  // Hard delete — actually removes the PO row + cascades to lines /
  // line-jobs / receipts. Only allowed when status='draft' to prevent
  // accidental destruction of sent-or-received history.
  const deletePo = async () => {
    if (po.status !== 'draft' && po.status !== 'cancelled') {
      toast.error('Only Draft or Cancelled POs can be deleted')
      return
    }
    if (!confirm(`Permanently delete ${po.po_number}? This cannot be undone.`)) return
    // Release linked job_lines BEFORE the cascade deletes them
    const poLineIds = lines.map(l => l.id)
    if (poLineIds.length > 0) {
      const { data: linkedJobLines } = await supabase
        .from('job_lines').select('id, job_id').in('po_line_id', poLineIds)
      const touchedJobIds = [...new Set((linkedJobLines || []).map(l => l.job_id))]
      await supabase.from('job_lines')
        .update({ po_line_id: null, updated_at: new Date().toISOString() })
        .in('po_line_id', poLineIds)
      await supabase.from('purchase_orders').delete().eq('id', id)
      for (const jobId of touchedJobIds) {
        await recomputeJobPartsStatus(jobId)
      }
    } else {
      await supabase.from('purchase_orders').delete().eq('id', id)
    }
    toast.success(`${po.po_number} deleted`)
    navigate('/purchase-orders')
  }

  if (loading) return <div style={{ padding: 24, color: theme.textMuted }}>Loading PO…</div>
  if (!po) return (
    <div style={{ padding: 24 }}>
      <p style={{ color: '#dc2626', marginBottom: 16 }}>PO not found.</p>
      <button onClick={() => navigate('/purchase-orders')} style={{
        color: theme.accent, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer',
      }}>← Back to Purchase Orders</button>
    </div>
  )

  return (
    <div style={{ padding: isMobile ? 16 : 24 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        marginBottom: 20, flexWrap: 'wrap',
      }}>
        <button
          onClick={goBack}
          style={{
            padding: 10, backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 8,
            cursor: 'pointer', color: theme.textSecondary,
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>
            Purchase Order
          </p>
          <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, color: theme.text, margin: 0, fontFamily: 'monospace' }}>
            {po.po_number}
          </h1>
        </div>
        <span style={{
          padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
          backgroundColor: status.bg, color: status.color,
        }}>
          {status.label}
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 320px',
        gap: 20,
      }}>
        {/* Main column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Vendor + ship-to + dates card */}
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: 18,
          }}>
            <div style={{
              display: 'grid', gap: 14,
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            }}>
              <div>
                <Label theme={theme}>Vendor</Label>
                {isEditable ? (
                  <select
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    onBlur={() => saveHeader()}
                    style={selectStyle(theme)}
                  >
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                ) : (
                  <p style={readonlyText(theme)}>{po.vendor?.name || '—'}</p>
                )}
              </div>
              <div>
                <Label theme={theme}>Business Unit</Label>
                {isEditable ? (
                  <select
                    value={poBusinessUnit}
                    onChange={(e) => setPoBusinessUnit(e.target.value)}
                    onBlur={() => saveHeader()}
                    style={selectStyle(theme)}
                  >
                    <option value="">— Select business unit —</option>
                    {(Array.isArray(businessUnits) ? businessUnits : []).map((bu, i) => {
                      const name = bu.name || bu
                      return <option key={i} value={name}>{name}</option>
                    })}
                  </select>
                ) : (
                  <p style={readonlyText(theme)}>{poBusinessUnit || '—'}</p>
                )}
              </div>
              <div>
                <Label theme={theme}>Expected delivery</Label>
                {isEditable ? (
                  <input
                    type="date"
                    value={expectedDate || ''}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    onBlur={() => saveHeader()}
                    style={selectStyle(theme)}
                  />
                ) : (
                  <p style={readonlyText(theme)}>{po.expected_delivery_date || '—'}</p>
                )}
              </div>
            </div>

            {po.vendor?.billing_address && (
              <div style={{ marginTop: 14, fontSize: 12, color: theme.textMuted, whiteSpace: 'pre-wrap' }}>
                <strong style={{ color: theme.textSecondary, marginRight: 6 }}>Bill to:</strong>
                {po.vendor.billing_address}
              </div>
            )}
            {po.vendor?.default_payment_terms && (
              <div style={{ marginTop: 6, fontSize: 12, color: theme.textMuted }}>
                <strong style={{ color: theme.textSecondary, marginRight: 6 }}>Terms:</strong>
                {po.vendor.default_payment_terms}
              </div>
            )}
            {po.job && (
              <div style={{
                marginTop: 14, padding: '10px 12px',
                backgroundColor: theme.bg, borderRadius: 8,
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
              }}>
                <Briefcase size={14} style={{ color: theme.accent }} />
                <span style={{ color: theme.textSecondary }}>For job:</span>
                <button
                  onClick={() => navigate(`/jobs/${po.job.id}`)}
                  style={{ color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                >
                  {po.job.job_id}{po.job.customer_name ? ` — ${po.job.customer_name}` : po.job.job_title ? ` — ${po.job.job_title}` : ''}
                </button>
              </div>
            )}
          </div>

          {/* Line items */}
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: 18,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 14,
            }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text, margin: 0 }}>
                Line Items
              </h3>
              {isEditable && (
                <button
                  onClick={() => setProductPickerOpen(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', backgroundColor: theme.accentBg,
                    color: theme.accent, border: 'none', borderRadius: 6,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Plus size={14} />
                  Add from Catalog
                </button>
              )}
            </div>

            {/* Warn when editing a live PO so the user knows to re-send */}
            {isLineEditable && !isEditable && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', marginBottom: 12, borderRadius: 8,
                backgroundColor: 'rgba(234,179,8,0.12)',
                border: '1px solid rgba(234,179,8,0.3)',
                fontSize: 12, color: '#a16207',
              }}>
                <span style={{ fontWeight: 700 }}>PO already sent</span>
                {' '}— qty and line changes won't auto-notify the vendor. Re-send the PDF after editing.
              </div>
            )}

            {lines.length === 0 ? (
              <p style={{ color: theme.textMuted, fontSize: 13, fontStyle: 'italic', margin: 0 }}>
                No lines yet. {isEditable && 'Use Add from Catalog or the custom-line row below.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Column header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 90px 110px 110px 36px',
                  gap: 8, fontSize: 11, fontWeight: 600,
                  color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
                  padding: '0 4px',
                }}>
                  <span>Description</span>
                  <span style={{ textAlign: 'right' }}>Qty</span>
                  <span style={{ textAlign: 'right' }}>Unit Cost</span>
                  <span style={{ textAlign: 'right' }}>Total</span>
                  <span />
                </div>
                {lines.map(line => (
                  <div key={line.id} style={{ borderTop: `1px solid ${theme.border}`, padding: '8px 4px' }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 90px 110px 110px 36px',
                      gap: 8, alignItems: 'center',
                    }}>
                      {isLineEditable ? (
                        <input
                          type="text" value={line.description || ''}
                          onChange={(e) => setLines(prev => prev.map(l => l.id === line.id ? { ...l, description: e.target.value } : l))}
                          onBlur={(e) => updateLineField(line.id, 'description', e.target.value)}
                          style={inlineInput(theme)}
                        />
                      ) : (
                        <span style={{ fontSize: 13, color: theme.text }}>{line.description}</span>
                      )}
                      {isLineEditable ? (
                        <input
                          type="number" step="0.01" value={line.quantity_ordered}
                          onChange={(e) => setLines(prev => prev.map(l => l.id === line.id ? { ...l, quantity_ordered: e.target.value } : l))}
                          onBlur={(e) => updateLineField(line.id, 'quantity_ordered', parseFloat(e.target.value) || 0)}
                          style={{ ...inlineInput(theme), textAlign: 'right' }}
                        />
                      ) : (
                        <span style={{ fontSize: 13, textAlign: 'right' }}>{line.quantity_ordered}</span>
                      )}
                      {isLineEditable ? (
                        <input
                          type="number" step="0.01" value={line.unit_cost}
                          onChange={(e) => setLines(prev => prev.map(l => l.id === line.id ? { ...l, unit_cost: e.target.value } : l))}
                          onBlur={(e) => updateLineField(line.id, 'unit_cost', parseFloat(e.target.value) || 0)}
                          style={{ ...inlineInput(theme), textAlign: 'right' }}
                        />
                      ) : (
                        <span style={{ fontSize: 13, textAlign: 'right' }}>{formatCurrency(line.unit_cost)}</span>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', color: theme.text }}>
                        {formatCurrency(line.line_total)}
                      </span>
                      {isLineEditable && (
                        <button
                          onClick={() => deleteLine(line.id)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: theme.textMuted, padding: 4,
                          }}
                          title="Remove line"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    {/* Job allocation row — shows vendors which job each
                        portion is for so they can label / pack-list at
                        pick time. Also where the "+ Link to job" button
                        lives for adding more jobs to this line later. */}
                    <div style={{
                      marginTop: 6, marginLeft: 4,
                      paddingLeft: 10, borderLeft: `2px solid ${theme.border}`,
                      display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
                    }}>
                      {(line.jobLinks && line.jobLinks.length > 0) ? (
                        line.jobLinks.map(link => (
                          <button
                            key={link.id}
                            onClick={() => navigate(`/jobs/${link.job_id}`)}
                            style={{
                              padding: '3px 8px', borderRadius: 6,
                              backgroundColor: theme.accentBg, color: theme.accent,
                              border: 'none', cursor: 'pointer',
                              fontSize: 11, fontWeight: 600,
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                            title={`Linked to job — click to open`}
                          >
                            <Briefcase size={10} />
                            {link.jobs?.job_id || `Job ${link.job_id}`}
                            {link.jobs?.customer_name && (
                              <span style={{ opacity: 0.7, fontWeight: 400 }}>
                                — {link.jobs.customer_name}
                              </span>
                            )}
                            <span style={{ fontWeight: 700, padding: '0 4px', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 3 }}>
                              {link.quantity}
                            </span>
                            {isEditable && (
                              <X
                                size={10}
                                onClick={(e) => { e.stopPropagation(); unlinkJobFromLine(link) }}
                                style={{ marginLeft: 2, opacity: 0.6 }}
                                title="Remove this job from the line"
                              />
                            )}
                          </button>
                        ))
                      ) : (
                        <span style={{ fontSize: 11, color: theme.textMuted, fontStyle: 'italic' }}>
                          Not yet linked to a job
                        </span>
                      )}
                      {(po.status === 'draft' || po.status === 'sent' || po.status === 'partial_received') && (
                        <button
                          onClick={() => openLinkJobModal(line)}
                          style={{
                            padding: '3px 8px', borderRadius: 6,
                            backgroundColor: 'transparent', color: theme.textSecondary,
                            border: `1px dashed ${theme.border}`, cursor: 'pointer',
                            fontSize: 11, fontWeight: 500,
                          }}
                          title="Add another job that needs this part — increments the PO qty + flips that job to ordered"
                        >
                          + Link to job
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Custom line entry */}
            {isEditable && (
              <div style={{
                marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${theme.border}`,
                display: 'grid', gridTemplateColumns: '1fr 90px 110px auto', gap: 8, alignItems: 'center',
              }}>
                <input
                  type="text" placeholder="Custom line description (no product)"
                  value={draft.description}
                  onChange={(e) => setDraft(d => ({ ...d, description: e.target.value }))}
                  style={inlineInput(theme)}
                />
                <input
                  type="number" placeholder="Qty" step="0.01" value={draft.quantity}
                  onChange={(e) => setDraft(d => ({ ...d, quantity: e.target.value }))}
                  style={{ ...inlineInput(theme), textAlign: 'right' }}
                />
                <input
                  type="number" placeholder="Cost" step="0.01" value={draft.unit_cost}
                  onChange={(e) => setDraft(d => ({ ...d, unit_cost: e.target.value }))}
                  style={{ ...inlineInput(theme), textAlign: 'right' }}
                />
                <button
                  onClick={addCustomLine}
                  style={{
                    padding: '6px 12px', backgroundColor: theme.accent, color: '#fff',
                    border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div>
              <Label theme={theme}>Notes (visible on the PO sent to vendor)</Label>
              {isEditable ? (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => saveHeader()}
                  rows={3}
                  style={textareaStyle(theme)}
                />
              ) : (
                <p style={readonlyText(theme)}>{notes || '—'}</p>
              )}
            </div>
            <div>
              <Label theme={theme}>Internal notes (NOT shown to vendor)</Label>
              {isEditable ? (
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  onBlur={() => saveHeader()}
                  rows={3}
                  style={textareaStyle(theme)}
                />
              ) : (
                <p style={readonlyText(theme)}>{internalNotes || '—'}</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar — totals + actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: 18,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text, margin: '0 0 14px' }}>
              Totals
            </h3>
            <Row label="Subtotal" value={formatCurrency(totals.subtotal)} theme={theme} />
            <Row label="Tax" theme={theme} valueNode={
              isEditable
                ? <input type="number" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} onBlur={() => saveHeader()}
                    style={{ ...inlineInput(theme), width: 80, textAlign: 'right' }} />
                : formatCurrency(totals.tax)
            } />
            <Row label="Shipping" theme={theme} valueNode={
              isEditable
                ? <input type="number" step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} onBlur={() => saveHeader()}
                    style={{ ...inlineInput(theme), width: 80, textAlign: 'right' }} />
                : formatCurrency(totals.shipping)
            } />
            <div style={{
              marginTop: 10, paddingTop: 10, borderTop: `1px solid ${theme.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: theme.accent }}>
                {formatCurrency(totals.total)}
              </span>
            </div>
          </div>

          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: 18,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text, margin: '0 0 14px' }}>
              Actions
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* PDF — always available regardless of status */}
              <button
                onClick={previewPdf}
                disabled={lines.length === 0}
                style={actionBtn(theme.accentBg, theme.accent, { disabled: lines.length === 0 })}
                title={lines.length === 0 ? 'Add at least one line item' : 'Open the PO PDF in a new tab'}
              >
                <FileText size={16} /> Preview PDF
              </button>
              <button
                onClick={downloadPdf}
                disabled={lines.length === 0}
                style={actionBtn(theme.accentBg, theme.accent, { disabled: lines.length === 0 })}
              >
                <Download size={16} /> Download PDF
              </button>

              {/* Send / re-send to vendor */}
              {po.status === 'draft' && (
                <>
                  <button
                    onClick={openSendModal}
                    disabled={saving || lines.length === 0}
                    style={actionBtn(theme.accent, '#fff', { disabled: saving || lines.length === 0 })}
                    title={!po.vendor?.email ? 'Vendor has no email on file — use Mark Sent below or update the vendor' : 'Email the PDF to the vendor'}
                  >
                    <Send size={16} /> Send to Vendor
                  </button>
                  <button
                    onClick={markSentManually}
                    disabled={saving || lines.length === 0}
                    style={actionBtn('rgba(125,138,127,0.12)', theme.textSecondary)}
                    title="For vendors with no email or PO sent out-of-band"
                  >
                    <Mail size={16} /> Mark Sent Manually
                  </button>
                </>
              )}
              {po.status === 'sent' && (
                <button
                  onClick={openSendModal}
                  disabled={saving}
                  style={actionBtn(theme.accentBg, theme.accent)}
                  title="Re-send the PDF to the vendor"
                >
                  <Send size={16} /> Re-send to Vendor
                </button>
              )}
              {(po.status === 'sent' || po.status === 'partial_received') && (
                <button
                  onClick={openReceiveModal}
                  disabled={saving}
                  style={actionBtn('#16a34a', '#fff')}
                >
                  <Package size={16} /> Receive Shipment
                </button>
              )}

              {/* Create Bill from PO — visible once anything's received.
                  Pulls vendor + amount + due date defaults from the PO + vendor
                  terms. User can adjust before saving. */}
              {(po.status === 'received' || po.status === 'partial_received') && (
                <button
                  onClick={createBillFromPo}
                  disabled={saving}
                  style={actionBtn('rgba(59,130,246,0.10)', '#3b82f6')}
                  title="Create an Accounts Payable bill from this PO so the office can track + pay the vendor"
                >
                  <FileText size={16} /> Create Bill
                </button>
              )}
              {po.sent_at && (
                <div style={{
                  marginTop: 4, padding: '6px 10px', borderRadius: 6,
                  backgroundColor: 'rgba(59,130,246,0.08)',
                  fontSize: 11, color: '#1e40af',
                }}>
                  ✉ Sent {new Date(po.sent_at).toLocaleString()}
                </div>
              )}
              {po.status !== 'cancelled' && po.status !== 'closed' && (
                <button
                  onClick={cancelPo}
                  disabled={saving}
                  style={actionBtn('rgba(220,38,38,0.10)', '#dc2626')}
                >
                  <X size={16} /> Cancel PO
                </button>
              )}
              {(po.status === 'draft' || po.status === 'cancelled') && (
                <button
                  onClick={deletePo}
                  disabled={saving}
                  style={actionBtn('transparent', '#dc2626')}
                  title="Permanently delete this PO. Only available on Draft or Cancelled POs."
                >
                  <Trash2 size={16} /> Delete PO
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Product picker modal */}
      {productPickerOpen && (
        <ProductPicker
          products={products}
          theme={theme}
          onPick={addLineFromProduct}
          onClose={() => setProductPickerOpen(false)}
          defaultVendorId={po.vendor_id}
        />
      )}

      {/* Link-to-job modal — adds another job that needs the same product */}
      {linkJobModal && (
        <div
          onClick={() => !saving && setLinkJobModal(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            backgroundColor: theme.bgCard, borderRadius: 12,
            border: `1px solid ${theme.border}`, padding: 22,
            width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: theme.text, margin: 0 }}>
                  Link Another Job to This Line
                </h3>
                <p style={{ fontSize: 12, color: theme.textMuted, margin: '2px 0 0' }}>
                  {linkJobModal.line?.description}
                </p>
              </div>
              <button onClick={() => setLinkJobModal(null)} disabled={saving} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted,
              }}>
                <X size={20} />
              </button>
            </div>

            {linkLoading ? (
              <p style={{ color: theme.textMuted, fontSize: 13 }}>Loading candidate jobs…</p>
            ) : linkCandidates.length === 0 ? (
              <p style={{ color: theme.textMuted, fontSize: 13, fontStyle: 'italic' }}>
                No other jobs need this part right now. Add this product as a line item on a job first (the job needs to be in needs_order or in_stock).
              </p>
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>
                  <Label theme={theme}>Pick a job</Label>
                  <select
                    value={linkSelectedJobLineId}
                    onChange={(e) => {
                      setLinkSelectedJobLineId(e.target.value)
                      const jl = linkCandidates.find(c => String(c.id) === e.target.value)
                      if (jl) {
                        const need = (parseFloat(jl.quantity) || 0) - (parseFloat(jl.allocated_qty) || 0)
                        setLinkQty(String(need))
                      }
                    }}
                    style={selectStyle(theme)}
                  >
                    <option value="">— Select a job —</option>
                    {linkCandidates.map(c => {
                      const need = (parseFloat(c.quantity) || 0) - (parseFloat(c.allocated_qty) || 0)
                      return (
                        <option key={c.id} value={c.id}>
                          {c.jobs?.job_id} · {c.jobs?.customer_name || c.jobs?.job_title || 'Job'} · needs {need}
                        </option>
                      )
                    })}
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Label theme={theme}>Quantity to add for this job</Label>
                  <input
                    type="number" step="0.01" value={linkQty}
                    onChange={(e) => setLinkQty(e.target.value)}
                    style={selectStyle(theme)}
                  />
                </div>
                <div style={{
                  padding: '10px 12px', borderRadius: 8,
                  backgroundColor: theme.bg, fontSize: 12, color: theme.textSecondary,
                  lineHeight: 1.5,
                }}>
                  <strong>What happens on Save:</strong> PO line quantity bumps by {linkQty || '?'}.
                  Selected job tagged as on order for this product.
                  {(po.status === 'sent' || po.status === 'partial_received') && ` Job status flips to Waiting Product.`}
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => setLinkJobModal(null)} disabled={saving} style={{
                flex: 1, padding: 12, border: `1px solid ${theme.border}`,
                backgroundColor: 'transparent', color: theme.text, borderRadius: 8, fontSize: 14,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}>Cancel</button>
              <button
                onClick={commitLinkJob}
                disabled={saving || !linkSelectedJobLineId || !linkQty}
                style={{
                  flex: 1, padding: 12, backgroundColor: theme.accent, color: '#fff',
                  border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                  cursor: (saving || !linkSelectedJobLineId || !linkQty) ? 'not-allowed' : 'pointer',
                  opacity: (saving || !linkSelectedJobLineId || !linkQty) ? 0.6 : 1,
                }}
              >
                {saving ? 'Linking…' : 'Link to PO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receive shipment modal */}
      {receiveModalOpen && (
        <div
          onClick={() => !receiving && setReceiveModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            backgroundColor: theme.bgCard, borderRadius: 12,
            border: `1px solid ${theme.border}`, padding: 22,
            width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: theme.text, margin: 0 }}>
                  Receive Shipment
                </h3>
                <p style={{ fontSize: 12, color: theme.textMuted, margin: '2px 0 0' }}>
                  {po.po_number} · {po.vendor?.name} · enter what arrived for each line
                </p>
              </div>
              <button onClick={() => setReceiveModalOpen(false)} disabled={receiving} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted,
              }}>
                <X size={20} />
              </button>
            </div>

            {/* Per-line received qty inputs */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px',
                gap: 8, fontSize: 11, fontWeight: 600, color: theme.textMuted,
                textTransform: 'uppercase', letterSpacing: 0.5, padding: '0 4px 6px',
              }}>
                <span>Description</span>
                <span style={{ textAlign: 'right' }}>Ordered</span>
                <span style={{ textAlign: 'right' }}>Already Rec</span>
                <span style={{ textAlign: 'right' }}>This Receipt</span>
              </div>
              {lines.map(line => {
                const item = receiveItems.find(i => i.poLineId === line.id)
                const ordered = parseFloat(line.quantity_ordered) || 0
                const already = parseFloat(line.quantity_received) || 0
                const remaining = Math.max(0, ordered - already)
                return (
                  <div key={line.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px',
                    gap: 8, alignItems: 'center', padding: '8px 4px',
                    borderTop: `1px solid ${theme.border}`,
                  }}>
                    <span style={{ fontSize: 13, color: theme.text }}>{line.description}</span>
                    <span style={{ fontSize: 13, textAlign: 'right', color: theme.textSecondary }}>{ordered}</span>
                    <span style={{ fontSize: 13, textAlign: 'right', color: theme.textMuted }}>{already}</span>
                    <input
                      type="number" step="0.01" min="0" max={remaining}
                      value={item?.receivedQty ?? 0}
                      onChange={(e) => setReceiveItems(prev => prev.map(i =>
                        i.poLineId === line.id ? { ...i, receivedQty: e.target.value } : i
                      ))}
                      style={{
                        padding: '6px 8px', border: `1px solid ${theme.border}`, borderRadius: 6,
                        backgroundColor: theme.bg, color: theme.text, fontSize: 13, outline: 'none',
                        textAlign: 'right',
                      }}
                    />
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Label theme={theme}>Packing slip # (optional)</Label>
                <input
                  type="text" value={receivePackingSlip}
                  onChange={(e) => setReceivePackingSlip(e.target.value)}
                  style={selectStyle(theme)}
                />
              </div>
              <div>
                <Label theme={theme}>Notes (optional)</Label>
                <textarea
                  value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)}
                  rows={2} style={textareaStyle(theme)}
                  placeholder="Damaged items, missing pieces, backorder info, etc."
                />
              </div>
              <div style={{
                padding: '10px 12px', borderRadius: 8,
                backgroundColor: 'rgba(34,197,94,0.08)', fontSize: 12, color: '#15803d',
                lineHeight: 1.5,
              }}>
                <strong>What happens on Confirm:</strong> Inventory increases by the received
                qty per product. Each linked job's allocated_qty grows (oldest-scheduled-job
                first when one PO line serves multiple jobs). Job parts_status updates
                automatically.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => setReceiveModalOpen(false)} disabled={receiving} style={{
                flex: 1, padding: 12, border: `1px solid ${theme.border}`,
                backgroundColor: 'transparent', color: theme.text, borderRadius: 8,
                fontSize: 14, cursor: receiving ? 'not-allowed' : 'pointer',
              }}>
                Cancel
              </button>
              <button onClick={confirmReceive} disabled={receiving} style={{
                flex: 1, padding: 12, backgroundColor: '#16a34a', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: receiving ? 'not-allowed' : 'pointer',
                opacity: receiving ? 0.6 : 1,
              }}>
                {receiving ? 'Receiving…' : 'Confirm Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send-to-vendor modal */}
      {sendModalOpen && (
        <div
          onClick={() => !sending && setSendModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            backgroundColor: theme.bgCard, borderRadius: 12,
            border: `1px solid ${theme.border}`, padding: 22,
            width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: theme.text, margin: 0 }}>
                  Send PO to Vendor
                </h3>
                <p style={{ fontSize: 12, color: theme.textMuted, margin: '2px 0 0' }}>
                  {po.po_number} · {formatCurrency(po.total)} · {lines.length} line{lines.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                onClick={() => setSendModalOpen(false)}
                disabled={sending}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Label theme={theme}>To *</Label>
                <input type="email" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)}
                  placeholder="vendor@example.com" style={selectStyle(theme)} />
              </div>
              <div>
                <Label theme={theme}>CC (comma-separated)</Label>
                <input type="text" value={sendCc} onChange={(e) => setSendCc(e.target.value)}
                  placeholder="ops@yourcompany.com" style={selectStyle(theme)} />
              </div>
              <div>
                <Label theme={theme}>Subject</Label>
                <input type="text" value={sendSubject} onChange={(e) => setSendSubject(e.target.value)}
                  style={selectStyle(theme)} />
              </div>
              <div>
                <Label theme={theme}>Body</Label>
                <textarea value={sendBody} onChange={(e) => setSendBody(e.target.value)} rows={7}
                  style={textareaStyle(theme)} />
              </div>
              <div style={{
                padding: '8px 10px', borderRadius: 6,
                backgroundColor: theme.bg, fontSize: 12, color: theme.textSecondary,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <FileText size={13} /> {po.po_number}.pdf will be attached.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button onClick={() => setSendModalOpen(false)} disabled={sending} style={{
                flex: 1, padding: 12,
                border: `1px solid ${theme.border}`, backgroundColor: 'transparent',
                color: theme.text, borderRadius: 8, fontSize: 14,
                cursor: sending ? 'not-allowed' : 'pointer',
              }}>
                Cancel
              </button>
              <button onClick={sendToVendor} disabled={sending || !sendEmail} style={{
                flex: 1, padding: 12,
                backgroundColor: theme.accent, color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: (sending || !sendEmail) ? 'not-allowed' : 'pointer',
                opacity: (sending || !sendEmail) ? 0.6 : 1,
              }}>
                {sending ? 'Sending…' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProductPicker({ products, theme, onPick, onClose, defaultVendorId }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    let list = products
    // Prefer products from this vendor at the top
    list = [...list].sort((a, b) => {
      const aMatch = String(a.default_vendor_id) === String(defaultVendorId) ? -1 : 0
      const bMatch = String(b.default_vendor_id) === String(defaultVendorId) ? -1 : 0
      return aMatch - bMatch
    })
    if (!term) return list.slice(0, 100)
    return list.filter(p =>
      [p.name, p.item_id, p.vendor_sku].filter(Boolean).some(s => String(s).toLowerCase().includes(term))
    ).slice(0, 200)
  }, [products, q, defaultVendorId])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: theme.bgCard, borderRadius: 12,
          border: `1px solid ${theme.border}`, padding: 18,
          width: '100%', maxWidth: 560, maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: theme.text, margin: 0 }}>Add from Catalog</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
            <X size={20} />
          </button>
        </div>
        <input
          type="text" autoFocus placeholder="Search by name, item ID, vendor SKU…"
          value={q} onChange={(e) => setQ(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px',
            border: `1px solid ${theme.border}`, borderRadius: 8,
            backgroundColor: theme.bg, color: theme.text, fontSize: 14, outline: 'none',
            marginBottom: 10,
          }}
        />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.map(p => {
            const isPreferred = String(p.default_vendor_id) === String(defaultVendorId)
            return (
              <button
                key={p.id}
                onClick={() => onPick(p)}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: 8,
                  backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
                  borderBottom: `1px solid ${theme.border}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.bgCardHover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                    {p.name}
                    {isPreferred && (
                      <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700, backgroundColor: 'rgba(34,197,94,0.15)', color: '#16a34a' }}>
                        VENDOR
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>
                    {p.item_id} {p.vendor_sku ? `· SKU ${p.vendor_sku}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: theme.textSecondary, whiteSpace: 'nowrap' }}>
                  cost {formatCurrency(p.cost)}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const Label = ({ children, theme }) => (
  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: theme.textSecondary, marginBottom: 6 }}>
    {children}
  </label>
)
const Row = ({ label, value, valueNode, theme }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 6 }}>
    <span style={{ color: theme.textSecondary }}>{label}</span>
    {valueNode || <span style={{ fontWeight: 500, color: theme.text }}>{value}</span>}
  </div>
)
const selectStyle = (theme) => ({
  width: '100%', padding: '8px 10px',
  border: `1px solid ${theme.border}`, borderRadius: 6,
  backgroundColor: theme.bgCard, color: theme.text, fontSize: 13, outline: 'none',
})
const inlineInput = (theme) => ({
  padding: '6px 8px', border: `1px solid ${theme.border}`, borderRadius: 6,
  backgroundColor: theme.bg, color: theme.text, fontSize: 13, outline: 'none', width: '100%',
})
const textareaStyle = (theme) => ({
  width: '100%', padding: '8px 10px',
  border: `1px solid ${theme.border}`, borderRadius: 6,
  backgroundColor: theme.bgCard, color: theme.text, fontSize: 13, outline: 'none', resize: 'vertical',
  fontFamily: 'inherit',
})
const readonlyText = (theme) => ({ fontSize: 14, color: theme.text, margin: 0, whiteSpace: 'pre-wrap' })
const actionBtn = (bg, color, opts = {}) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '10px 14px', backgroundColor: bg, color, border: 'none', borderRadius: 8,
  fontSize: 13, fontWeight: 600, cursor: opts.disabled ? 'not-allowed' : 'pointer',
  opacity: opts.disabled ? 0.5 : 1,
})
