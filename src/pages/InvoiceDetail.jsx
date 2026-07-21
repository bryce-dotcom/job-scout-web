import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { RecordHistoryButton } from '../components/RecordHistory'
import { useTheme } from '../components/Layout'
import { ArrowLeft, Plus, X, DollarSign, CheckCircle, Send, Lock, Pencil, Download, FileText, Trash2, Mail, Link2, RotateCcw, AlertTriangle, CreditCard, ExternalLink, Paperclip, Receipt } from 'lucide-react'
import DealBreadcrumb from '../components/DealBreadcrumb'
import { invoiceStatusColors as statusColors } from '../lib/statusColors'
import { toast } from '../lib/toast'
import { jsPDF } from 'jspdf'
import { useIsMobile } from '../hooks/useIsMobile'
import useSmartBack from '../lib/useSmartBack'
import { resolveMatLabSplit, splitLinePartsLabor } from '../lib/materialLaborSplit'
import { isAdmin as checkAdmin } from '../lib/accessControl'
import { buildInvoiceSections, incentiveLineLabel } from '../lib/invoiceSections'
import { isLegacyNetShape, invoicePaymentStatus } from '../lib/arHelpers'

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
  const goBack = useSmartBack('/invoices')
  const companyId = useStore((state) => state.companyId)
  const company = useStore((state) => state.company)
  const user = useStore((state) => state.user)
  const employees = useStore((state) => state.employees)
  // Determine if the current user is allowed to edit invoice TOTALS.
  // Office/bookkeeper roles (Tracy) historically lowered totals to record
  // partial payments — that's how MFCP and 12 other invoices ended up
  // misclassified ($394K of utility-side dollars sitting on customer
  // invoices). Lock the amount field for non-admins; they can still
  // record payments via the Payment modal.
  const currentEmployee = (employees || []).find(e => e.email === user?.email)
  const canEditAmount = checkAdmin(currentEmployee)
  const fetchInvoices = useStore((state) => state.fetchInvoices)
  const settings = useStore((state) => state.settings)
  const getSettingValue = useStore((state) => state.getSettingValue)
  const fetchSettings = useStore((state) => state.fetchSettings)

  const [invoice, setInvoice] = useState(null)
  const [parentInvoice, setParentInvoice] = useState(null)
  const [linkedUtilityInvoice, setLinkedUtilityInvoice] = useState(null)
  const [matLabSplit, setMatLabSplit] = useState(null)
  const [invoiceLines, setInvoiceLines] = useState([])
  // Component graph + product index used by the bundle-aware
  // splitLinePartsLabor() helper for Summary-format PDF rendering.
  // Loaded for every invoice that has line items so bundles with labor
  // priced into their components get split correctly.
  const [componentMaps, setComponentMaps] = useState({ productMap: new Map(), componentsByParent: new Map() })
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingReceipt, setSendingReceipt] = useState(false)
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
    project_discount: '',
    discount_other: '',
    job_description: '',
    notes: '',
    parts_total_override: '',
    labor_total_override: ''
  })

  // Whether this tenant has Stripe configured. Drives whether the
  // Send Payment Link / Charge Saved Card buttons offer the real
  // action or a "Connect Stripe →" CTA. Avoids the Antonino-style
  // failure where the user clicks Send Payment Link, gets a toast
  // saying "Stripe not configured," and doesn't know what to do.
  // null = still loading; false = no key; true = configured.
  const [stripeConfigured, setStripeConfigured] = useState(null)

  // PDF state
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfHistory, setPdfHistory] = useState([])
  const [latestPdfSignedUrl, setLatestPdfSignedUrl] = useState(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null)
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState(null)

  // Conversation log — payment-arrangement notes per invoice with timestamps.
  const [logEntry, setLogEntry] = useState('')
  const [savingLog, setSavingLog] = useState(false)

  // Move-payment state — Tracy reported needing to delete + re-create
  // a payment to shift it from one invoice to another (Fieldstone Canyon
  // → Fieldstone Willow). Setting this to a payment opens a modal that
  // lets her reassign the payment_id to another invoice for the same
  // customer without losing the original payment metadata.
  const [movePayment, setMovePayment] = useState(null)
  const [moveCandidates, setMoveCandidates] = useState([])
  const [moveLoading, setMoveLoading] = useState(false)
  const [moveTargetId, setMoveTargetId] = useState('')

  // Send modal state
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendEmail, setSendEmail] = useState('')
  const [sendSubject, setSendSubject] = useState('')
  const [sendAttachments, setSendAttachments] = useState([]) // [{ file, name, base64 }]
  const [sendingEmail, setSendingEmail] = useState(false)

  // Charge saved card state
  const [savedCards, setSavedCards] = useState([])
  const [showChargeModal, setShowChargeModal] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState(null)
  const [charging, setCharging] = useState(false)

  // Payment plan state (recurring scheduled payments)
  const [paymentPlans, setPaymentPlans] = useState([])
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [planForm, setPlanForm] = useState({
    frequency: 'monthly',
    installment_amount: '',
    total_installments: '6',
    start_date: new Date().toISOString().split('T')[0],
    payment_method_id: '',
    auto_charge: false,
    notes: '',
  })
  const [savingPlan, setSavingPlan] = useState(false)

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

  // Auto-open the Send modal when the URL hash is #send — used by the
  // "↻ Resend" shortcut on JobDetail's invoices list so the user lands
  // here with the modal already up, instead of having to find and click
  // the Send button themselves. We strip the hash after to avoid the
  // modal re-opening on subsequent renders or page back-navigations.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash === '#send' && invoice) {
      setShowSendModal(true)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [invoice])

  const fetchInvoiceData = async () => {
    setLoading(true)

    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('*, customer:customers(id, name, email, phone, address), job:jobs(id, job_id, job_title, job_address, lead_id, quote_id, service_kind, parts_coverage, labor_coverage, coverage_notes, parent_job_id)')
      .eq('id', id)
      .single()

    if (invoiceData) {
      setInvoice(invoiceData)
      setSendEmail(invoiceData.sent_to_email || invoiceData.customer?.email || '')

      // Detect Stripe configuration up-front so the Send Payment Link
      // button can render the right action (or a setup CTA when the
      // tenant hasn't connected Stripe yet — Antonino Lawn Care kept
      // clicking the button and getting an opaque error because no
      // payment_config row existed for their company).
      try {
        const { data: cfgRow } = await supabase
          .from('settings')
          .select('value')
          .eq('company_id', invoiceData.company_id)
          .eq('key', 'payment_config')
          .maybeSingle()
        let hasKey = false
        if (cfgRow?.value) {
          try { hasKey = !!JSON.parse(cfgRow.value).stripe_secret_key } catch { /* leave false */ }
        }
        setStripeConfigured(hasKey)
      } catch {
        setStripeConfigured(false)
      }

      // If this invoice rolls a deposit credit into discount_applied,
      // load the parent so the discount block can show the deposit as
      // its own line (instead of hiding it inside the bulk total).
      if (invoiceData.parent_invoice_id) {
        const { data: parent } = await supabase
          .from('invoices')
          .select('id, invoice_id, amount, invoice_type, payment_status, created_at, updated_at')
          .eq('id', invoiceData.parent_invoice_id)
          .single()
        setParentInvoice(parent || null)
      } else {
        setParentInvoice(null)
      }

      // Check if this invoice is linked to a utility invoice (Mode B —
      // incentive-bearing). Used to gate the Materials/Labor breakdown.
      const { data: linkedU } = await supabase
        .from('utility_invoices')
        .select('id, utility_name, amount, payment_status, paid_at')
        .eq('invoice_id', invoiceData.id)
        .maybeSingle()
      setLinkedUtilityInvoice(linkedU || null)

      // Fetch payments for this invoice
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', id)
        .order('date', { ascending: false })

      setPayments(paymentsData || [])

      // Fetch invoice line items + the product type so we can split
      // Parts (Product) vs Labor (Service/Labor types) for the summary
      // format toggle.
      const { data: linesData } = await supabase
        .from('invoice_lines')
        .select('*, item:products_services(id, name, type)')
        .eq('invoice_id', id)
        .order('sort_order', { ascending: true })

      setInvoiceLines(linesData || [])

      // Load the line items' product + bundle-component graph so the
      // summary-format PDF can split bundles by their component
      // classification (labor priced into the bundle, not on the line).
      // Also feeds the Mode-B materials/labor split when there's a
      // linked utility invoice.
      const itemIds = [...new Set((linesData || []).map(l => l.item_id).filter(Boolean))]
      let comps = []
      let prods = []
      if (itemIds.length > 0) {
        const { data: compsData } = await supabase
          .from('product_components')
          .select('parent_product_id, component_product_id, quantity')
          .in('parent_product_id', itemIds)
        comps = compsData || []
        const subIds = [...new Set([
          ...itemIds,
          ...comps.map(c => c.component_product_id),
        ])]
        const { data: prodsData } = await supabase
          .from('products_services')
          .select('id, cost, material_or_labor')
          .in('id', subIds)
        prods = prodsData || []
      }

      const productMap = new Map(prods.map(p => [p.id, p]))
      const componentsByParent = new Map()
      for (const c of comps) {
        const arr = componentsByParent.get(c.parent_product_id) || []
        arr.push(c)
        componentsByParent.set(c.parent_product_id, arr)
      }
      setComponentMaps({ productMap, componentsByParent })

      // Show the breakdown when the invoice is utility-linked (Mode B) OR
      // when a manual Parts/Labor override is set — the override means the
      // user explicitly wants a breakdown on the document, so show THEIR
      // numbers (resolveMatLabSplit gives the override top priority).
      const hasManualSplit = invoiceData.parts_total_override != null && invoiceData.labor_total_override != null
      if (linkedU || hasManualSplit) {
        setMatLabSplit(resolveMatLabSplit(invoiceData, linesData || [], comps, prods))
      } else {
        setMatLabSplit(null)
      }

      // Fetch payment plans for this invoice
      const { data: plansData } = await supabase
        .from('payment_plans')
        .select('*')
        .eq('invoice_id', id)
        .order('created_at', { ascending: false })

      setPaymentPlans(plansData || [])

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

  // Generate (or re-fetch) a hosted Stripe Payment Link for this
  // invoice. Customers click the URL, pay via Stripe Checkout, the
  // existing stripe-webhook records the payment automatically.
  const [generatingLink, setGeneratingLink] = useState(false)
  const sendStripePaymentLink = async () => {
    setGeneratingLink(true)
    try {
      let url = invoice?.stripe_payment_link_url || null
      if (!url) {
        await supabase.auth.refreshSession()
        const res = await supabase.functions.invoke('stripe-create-payment-link', {
          body: { company_id: companyId, invoice_id: parseInt(id) },
        })
        if (res.error || res.data?.error) {
          toast.error(res.data?.error || res.error?.message || 'Failed to create payment link')
          setGeneratingLink(false)
          return
        }
        url = res.data?.url
        await fetchInvoiceData()
      }
      if (!url) {
        toast.error('No payment link returned')
        setGeneratingLink(false)
        return
      }
      try {
        await navigator.clipboard.writeText(url)
        toast.success('Payment link copied — paste it to your customer or use Send to email it')
      } catch {
        toast.success('Payment link ready: ' + url)
      }
    } catch (err) {
      toast.error(err.message || 'Failed')
    }
    setGeneratingLink(false)
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

  // ── Payment plan helpers ──
  const computeNextChargeDate = (startDate, frequency, completed = 0) => {
    const d = new Date(startDate)
    if (frequency === 'weekly')      d.setDate(d.getDate() + (7 * completed))
    else if (frequency === 'bi-weekly')   d.setDate(d.getDate() + (14 * completed))
    else if (frequency === 'monthly')     d.setMonth(d.getMonth() + completed)
    else if (frequency === 'quarterly')   d.setMonth(d.getMonth() + (3 * completed))
    return d.toISOString().split('T')[0]
  }

  const createPaymentPlan = async () => {
    if (!planForm.installment_amount || !planForm.total_installments) {
      toast.error('Installment amount and number of installments are required')
      return
    }
    setSavingPlan(true)
    try {
      const totalInstall = parseInt(planForm.total_installments)
      const start = planForm.start_date
      const end = computeNextChargeDate(start, planForm.frequency, totalInstall - 1)
      const { error } = await supabase.from('payment_plans').insert({
        company_id: companyId,
        invoice_id: parseInt(id),
        customer_id: invoice.customer_id || null,
        payment_method_id: planForm.auto_charge && planForm.payment_method_id ? planForm.payment_method_id : null,
        frequency: planForm.frequency,
        installment_amount: parseFloat(planForm.installment_amount),
        total_installments: totalInstall,
        installments_completed: 0,
        start_date: start,
        next_charge_date: start,
        end_date: end,
        status: 'active',
        auto_charge: !!planForm.auto_charge,
        notes: planForm.notes || null,
      })
      if (error) throw error
      toast.success('Payment plan created')
      setShowPlanModal(false)
      setPlanForm({ frequency: 'monthly', installment_amount: '', total_installments: '6', start_date: new Date().toISOString().split('T')[0], payment_method_id: '', auto_charge: false, notes: '' })
      await fetchInvoiceData()
    } catch (err) {
      toast.error(err.message || 'Failed to create payment plan')
    }
    setSavingPlan(false)
  }

  const cancelPaymentPlan = async (planId) => {
    if (!window.confirm('Cancel this payment plan? Recorded payments will not be removed.')) return
    try {
      await supabase.from('payment_plans').update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      }).eq('id', planId)
      toast.success('Payment plan cancelled')
      await fetchInvoiceData()
    } catch (err) {
      toast.error(err.message || 'Failed to cancel plan')
    }
  }

  // Email a payment receipt to the client via the send-receipt edge function.
  // Returns { ok } on send, { skipped } when there's no email on file, or
  // { ok:false, error } on failure — so callers can give real feedback
  // instead of the old fire-and-forget that left Tracy unsure it worked.
  const sendReceiptEmail = async ({ amount, method, date, totalPaid }) => {
    let receiptEmail = invoice.sent_to_email || ''
    if (!receiptEmail && invoice.customer_id) {
      const { data: cust } = await supabase.from('customers').select('email').eq('id', invoice.customer_id).single()
      receiptEmail = cust?.email || ''
    }
    if (!receiptEmail) return { skipped: true }

    const storeSettings = useStore.getState().settings
    const buSetting = storeSettings.find(s => s.key === 'business_units')
    let buObj = null
    if (buSetting?.value && invoice.business_unit) {
      try { buObj = JSON.parse(buSetting.value).find(u => u.name === invoice.business_unit) } catch { /* ignore */ }
    }
    let rLogoUrl = buObj?.logo_url || ''
    if (!rLogoUrl) {
      const logoSetting = storeSettings.find(s => s.key === 'company_logo_url')
      rLogoUrl = logoSetting?.value || company?.logo_url || ''
    }
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
    const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY },
        body: JSON.stringify({
          recipient_email: receiptEmail,
          customer_name: invoice.customer?.name || '',
          invoice_number: invoice.invoice_id || `INV-${invoice.id}`,
          payment_amount: amount,
          payment_method: method,
          payment_date: date,
          balance_remaining: Math.max(0, (parseFloat(invoice.amount) || 0) - totalPaid),
          invoice_total: invoice.amount,
          total_paid: totalPaid,
          company_name: company?.company_name || '',
          business_unit_name: buObj?.name || invoice.business_unit || '',
          business_unit_phone: buObj?.phone || company?.phone || '',
          business_unit_email: buObj?.email || company?.owner_email || '',
          business_unit_address: buObj?.address || company?.remit_to_address || company?.address || '',
          logo_url: rLogoUrl,
          portal_url: invoice.portal_token ? `https://jobscout.appsannex.com/portal/${invoice.portal_token}` : null
        })
      })
      const j = await res.json().catch(() => ({}))
      if (j?.success) return { ok: true, email: receiptEmail }
      return { ok: false, error: j?.error || `send failed (${res.status})`, email: receiptEmail }
    } catch (e) {
      return { ok: false, error: e.message, email: receiptEmail }
    }
  }

  // Manually (re)send a receipt for what's been paid so far — Tracy wanted to
  // send a receipt on demand (e.g. after a card payment she applied manually).
  const handleSendReceipt = async () => {
    const totalPaid = (payments || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
    if (totalPaid <= 0) { toast.error('No payment recorded yet — nothing to receipt.'); return }
    const latest = [...(payments || [])].sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at))[0]
    setSendingReceipt(true)
    const r = await sendReceiptEmail({
      amount: parseFloat(latest?.amount) || totalPaid,
      method: latest?.method || 'Payment',
      date: latest?.date || new Date().toISOString().split('T')[0],
      totalPaid,
    })
    setSendingReceipt(false)
    if (r.ok) toast.success(`Receipt emailed to ${r.email}`)
    else if (r.skipped) toast.error('No email on file for this customer — add one to send a receipt.')
    else toast.error('Receipt failed: ' + r.error)
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
      source: 'manual',
      notes: paymentData.notes || (ccFeeAmount > 0 ? `Includes $${ccFeeAmount.toFixed(2)} CC processing fee` : null)
    }])

    // Update payment status vs the customer's NET total (gross − incentive/
    // discount) plus any CC fee — never gross alone, or Energy Scout invoices
    // stick on "Partially Paid" after the customer pays their full portion.
    const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) + paymentAmount
    const ccFeeTotal = (parseFloat(invoice.credit_card_fee) || 0) + ccFeeAmount
    await supabase.from('invoices').update({
      payment_status: invoicePaymentStatus(invoice, totalPaid, ccFeeTotal),
      updated_at: new Date().toISOString()
    }).eq('id', id)

    await fetchInvoiceData()
    await fetchInvoices()

    // Email the client a receipt — and tell the user what happened, so they
    // aren't left guessing (Tracy's whole ticket was "I thought the system
    // would send a receipt"). Non-blocking on the payment record itself.
    try {
      const r = await sendReceiptEmail({
        amount: paymentAmount, method: paymentData.method, date: paymentData.date, totalPaid,
      })
      if (r.ok) toast.success(`Payment saved · receipt emailed to ${r.email}`)
      else if (r.skipped) toast.success('Payment saved · no email on file, so no receipt was sent')
      else toast.success('Payment saved · receipt failed to send (' + r.error + ')')
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
    try {
      // Calculate the outstanding balance so we can insert a payment row that
      // covers exactly what's owed. Without a payment row, the payroll
      // commission engine (payment_received trigger) sees no payment in the
      // pay period and silently awards $0 commission for this invoice.
      const invoiceTotal =
        (parseFloat(invoice?.amount) || 0) +
        (parseFloat(invoice?.credit_card_fee) || 0)
      const alreadyPaid = (payments || []).reduce(
        (sum, p) => sum + (parseFloat(p.amount) || 0), 0
      )
      const outstanding = Math.max(0, invoiceTotal - alreadyPaid)

      if (outstanding > 0.005) {
        const { error: payErr } = await supabase.from('payments').insert([{
          company_id: companyId,
          invoice_id: parseInt(id),
          customer_id: invoice?.customer_id || null,
          job_id: invoice?.job_id || null,
          amount: Math.round(outstanding * 100) / 100,
          date: new Date().toISOString().split('T')[0],
          method: 'Manual',
          status: 'Completed',
          source: 'mark_paid',
          notes: 'Created by Mark as Paid'
        }])
        if (payErr) {
          // Don't block the status flip — but warn so the user knows commission
          // tracking will be missing for this invoice until they add a payment.
          toast.error('Marked paid, but failed to create payment row: ' + payErr.message + ' — commissions for this invoice may not appear on payroll. Add a payment manually on the Payments tab.')
        }
      }

      const { error: invErr } = await supabase.from('invoices').update({
        payment_status: 'Paid',
        updated_at: new Date().toISOString()
      }).eq('id', id)
      if (invErr) throw invErr

      await fetchInvoiceData()
      await fetchInvoices()
      toast.success(outstanding > 0.005 ? `Marked Paid — payment of $${outstanding.toFixed(2)} recorded` : 'Marked Paid')
    } catch (err) {
      toast.error('Failed to mark paid: ' + (err.message || 'unknown error'))
    } finally {
      setSaving(false)
    }
  }

  // Reopen a paid invoice so a new payment can be applied (e.g. customer
  // sends a check after the invoice was prematurely marked paid).
  const reopenInvoice = async () => {
    if (!confirm('Reopen this invoice? Status will go back to Pending so you can apply a new payment. Existing payment records are kept untouched — review them on the Payments tab if you need to delete or reassign one.')) return
    setSaving(true)
    const { error } = await supabase.from('invoices').update({
      payment_status: 'Pending',
      updated_at: new Date().toISOString()
    }).eq('id', id)
    if (error) {
      toast.error('Failed to reopen: ' + error.message)
    } else {
      await fetchInvoiceData()
      await fetchInvoices()
      toast.success('Invoice reopened')
    }
    setSaving(false)
  }

  const addConversationEntry = async () => {
    const text = logEntry.trim()
    if (!text) return
    setSavingLog(true)
    const existing = Array.isArray(invoice.conversation_log) ? invoice.conversation_log : []
    const entry = {
      at: new Date().toISOString(),
      by: user?.email || 'Unknown',
      text
    }
    const next = [...existing, entry]
    const { error } = await supabase.from('invoices')
      .update({ conversation_log: next, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      toast.error('Failed to add note: ' + error.message)
    } else {
      setInvoice(prev => ({ ...prev, conversation_log: next }))
      setLogEntry('')
    }
    setSavingLog(false)
  }

  // Open the "Move payment to another invoice" modal — fetches other
  // open invoices for the same customer so Tracy can pick one. Skips
  // the current invoice and any closed/archived ones.
  const openMovePayment = async (payment) => {
    setMovePayment(payment)
    setMoveTargetId('')
    setMoveCandidates([])
    setMoveLoading(true)
    try {
      const customerId = invoice?.customer_id
      if (!customerId) {
        toast.error('Invoice has no customer — cannot move payment')
        setMovePayment(null); setMoveLoading(false); return
      }
      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_id, amount, payment_status, job_description, created_at')
        .eq('company_id', companyId)
        .eq('customer_id', customerId)
        .neq('id', parseInt(id))
        .not('payment_status', 'in', '("Archived","Voided")')
        .order('created_at', { ascending: false })
        .limit(50)
      setMoveCandidates(data || [])
    } catch (err) {
      toast.error('Failed to load invoices: ' + err.message)
    }
    setMoveLoading(false)
  }

  const commitMovePayment = async () => {
    if (!movePayment || !moveTargetId) return
    const targetId = parseInt(moveTargetId)
    if (!targetId) return
    setSaving(true)
    try {
      // Reassign the payment to the new invoice — preserves amount /
      // method / stripe_payment_intent_id / receipt / source so the
      // audit trail stays intact.
      const { data: target } = await supabase
        .from('invoices')
        .select('id, job_id, customer_id, amount')
        .eq('id', targetId)
        .single()
      if (!target) throw new Error('Target invoice not found')

      const { error: upErr } = await supabase
        .from('payments')
        .update({
          invoice_id: target.id,
          job_id: target.job_id || null,
          customer_id: target.customer_id || movePayment.customer_id || null,
          notes: ((movePayment.notes || '') + `\nMoved from invoice #${id} on ${new Date().toLocaleDateString()}`).trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', movePayment.id)
      if (upErr) throw upErr

      // Recalculate BOTH invoices' payment_status — source + target.
      const recalcInvoice = async (invId) => {
        const { data: inv } = await supabase
          .from('invoices')
          .select('id, amount, discount_applied, credit_card_fee')
          .eq('id', invId).single()
        if (!inv) return
        const { data: pays } = await supabase
          .from('payments')
          .select('amount')
          .eq('invoice_id', invId)
        const totalPaid = (pays || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
        await supabase
          .from('invoices')
          .update({ payment_status: invoicePaymentStatus(inv, totalPaid, parseFloat(inv.credit_card_fee) || 0), updated_at: new Date().toISOString() })
          .eq('id', invId)
      }
      await Promise.all([recalcInvoice(parseInt(id)), recalcInvoice(target.id)])

      toast.success(`Payment moved to invoice ${target.id}`)
      setMovePayment(null)
      setMoveTargetId('')
      setMoveCandidates([])
      await fetchInvoiceData()
      await fetchInvoices()
    } catch (err) {
      toast.error('Failed to move payment: ' + err.message)
    }
    setSaving(false)
  }

  const rescindPayment = async (payment) => {
    if (!confirm(`Rescind ${formatCurrency(payment.amount)} payment from ${formatDate(payment.date)}? This will delete the payment record and update the invoice balance.`)) return

    setSaving(true)

    // If this payment came from a matched bank deposit, unmatch the plaid
    // transaction FIRST. Its matched_payment_id foreign key otherwise BLOCKS
    // the delete (this is why a bank-matched payment couldn't be rescinded —
    // it errored on the FK), and clearing it returns the deposit to the
    // unmatched pool so it can be re-matched to the correct invoice.
    const { error: unmatchErr } = await supabase.from('plaid_transactions')
      .update({ matched_invoice_id: null, matched_payment_id: null, matched_at: null })
      .eq('matched_payment_id', payment.id)
    if (unmatchErr) console.warn('Unmatch before rescind failed (non-fatal):', unmatchErr)

    const { error: delErr } = await supabase.from('payments').delete().eq('id', payment.id)
    if (delErr) {
      toast.error('Failed to rescind payment: ' + delErr.message)
      setSaving(false)
      return
    }

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

    // Recalculate status off the remaining payments vs the customer's NET total.
    const remainingPaid = payments
      .filter(p => p.id !== payment.id)
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)

    await supabase.from('invoices').update({
      payment_status: invoicePaymentStatus(invoice, remainingPaid),
      updated_at: new Date().toISOString()
    }).eq('id', id)

    toast.success('Payment rescinded')
    await fetchInvoiceData()
    await fetchInvoices()
    setSaving(false)
  }

  // Edit mode handlers
  const startEditing = () => {
    // Split the stored total deduction into the project-discount portion
    // and everything else (incentive and/or rolled-in deposit) so the two
    // edit fields land pre-filled. Saving recombines them.
    const totalDisc = parseFloat(invoice.discount_applied) || 0
    const projDisc = Math.min(Math.max(0, parseFloat(invoice.project_discount) || 0), totalDisc)
    setEditForm({
      invoice_id: invoice.invoice_id || '',
      amount: invoice.amount || '',
      project_discount: projDisc > 0 ? projDisc : '',
      discount_other: totalDisc - projDisc > 0 ? Math.round((totalDisc - projDisc) * 100) / 100 : '',
      credit_card_fee: invoice.credit_card_fee || '',
      job_description: invoice.job_description || '',
      notes: invoice.notes || '',
      parts_total_override: invoice.parts_total_override ?? '',
      labor_total_override: invoice.labor_total_override ?? ''
    })
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditForm({ invoice_id: '', amount: '', project_discount: '', discount_other: '', credit_card_fee: '', job_description: '', notes: '', parts_total_override: '', labor_total_override: '' })
  }

  const saveEdits = async () => {
    setSaving(true)
    // Invoice number changes: defend against blank + check uniqueness
    // within the same company. invoice_id is a free-text column so we
    // enforce the no-duplicate rule client-side.
    const trimmedNumber = (editForm.invoice_id || '').trim()
    const numberChanged = trimmedNumber && trimmedNumber !== invoice.invoice_id
    if (numberChanged) {
      const { data: dup } = await supabase
        .from('invoices')
        .select('id')
        .eq('company_id', companyId)
        .eq('invoice_id', trimmedNumber)
        .neq('id', id)
        .maybeSingle()
      if (dup) {
        const { toast } = await import('../lib/toast')
        toast.error(`Invoice number "${trimmedNumber}" is already in use. Pick a different one.`)
        setSaving(false)
        return
      }
    }
    // Parts/Labor manual override — both must be filled to take effect.
    // Blank/empty = clear override and fall back to per-line labor_cost
    // computation. Stored as numeric or NULL.
    const partsOv = editForm.parts_total_override === '' || editForm.parts_total_override == null
      ? null : parseFloat(editForm.parts_total_override)
    const laborOv = editForm.labor_total_override === '' || editForm.labor_total_override == null
      ? null : parseFloat(editForm.labor_total_override)
    // discount_applied stays the TOTAL deduction (all balance math reads
    // amount − discount_applied); project_discount records which part of
    // it is a whole-project discount for display breakout.
    const projDiscount = Math.max(0, parseFloat(editForm.project_discount) || 0)
    const otherDiscount = Math.max(0, parseFloat(editForm.discount_other) || 0)
    const payload = {
      amount: parseFloat(editForm.amount) || 0,
      discount_applied: Math.round((projDiscount + otherDiscount) * 100) / 100,
      project_discount: projDiscount > 0 ? projDiscount : null,
      credit_card_fee: parseFloat(editForm.credit_card_fee) || 0,
      job_description: editForm.job_description || null,
      notes: editForm.notes || null,
      parts_total_override: partsOv,
      labor_total_override: laborOv,
      updated_at: new Date().toISOString(),
    }
    if (trimmedNumber) payload.invoice_id = trimmedNumber
    const { error } = await supabase.from('invoices').update(payload).eq('id', id)

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

    // Capture the linked job before deletion so we can clear the cached
    // invoice_status — otherwise the JobDetail "Generate Invoice" button
    // stays hidden and the user has no path to create a new one.
    const linkedJobId = invoice?.job_id

    const { error } = await supabase.from('invoices').delete().eq('id', id)

    if (error) {
      toast.error('Failed to delete invoice: ' + error.message)
      setSaving(false)
    } else {
      if (linkedJobId) {
        await supabase.from('jobs')
          .update({ invoice_status: null, updated_at: new Date().toISOString() })
          .eq('id', linkedJobId)
      }
      toast.success('Invoice deleted')
      await fetchInvoices()
      // Send the user back to the job so they can immediately re-invoice
      // with the corrected line items, instead of dropping them on the
      // /invoices list with no obvious next step.
      navigate(linkedJobId ? `/jobs/${linkedJobId}` : '/invoices')
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
    const headerName = buInfo?.name || invoice.business_unit || company?.company_name || company?.name || 'Company'
    // Prefer remit_to_address for the invoice header — that's the address
    // customers should mail checks to (PO Box etc.). Fall back to BU
    // address, then physical company address.
    const headerAddress = buInfo?.address || company?.remit_to_address || company?.address
    const headerPhone = buInfo?.phone || company?.phone
    const headerEmail = buInfo?.email || company?.remit_to_email || company?.owner_email || company?.email

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
    // Honor the user's invoice_date override when set, otherwise default to
    // created_at. Lets staff back-date a regenerated invoice to the actual
    // work date when the customer expects that on the document.
    doc.text(`Date: ${formatDate(invoice.invoice_date || invoice.created_at)}`, rightEdge, iy, { align: 'right' }); iy += 5
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
    if (invoice.customer?.name) { doc.text(invoice.customer?.name, margin, y); y += 5 }
    if (invoice.customer?.address) {
      // Wrap long addresses
      const addrLines = doc.splitTextToSize(invoice.customer?.address, contentWidth / 2)
      for (const line of addrLines) { doc.text(line, margin, y); y += 5 }
    }
    if (invoice.customer?.email) { doc.text(invoice.customer?.email, margin, y); y += 5 }
    if (invoice.customer?.phone) { doc.text(invoice.customer?.phone, margin, y); y += 5 }
    // Service address (job site). An account can have many locations; without
    // this the customer can't tell which site the invoice is for (Tracy's
    // pushback). Only show it when it differs from the billing address.
    const jobSite = invoice.job?.job_address
    if (jobSite && jobSite.trim().toLowerCase() !== (invoice.customer?.address || '').trim().toLowerCase()) {
      y += 3
      doc.setFont('helvetica', 'bold'); doc.text('Service Address:', margin, y); y += 5
      doc.setFont('helvetica', 'normal')
      for (const line of doc.splitTextToSize(jobSite, contentWidth / 2)) { doc.text(line, margin, y); y += 5 }
    }
    y += 8

    // Shared totals-line drawer (label at totalsX, amount right-aligned at
    // rightEdge). Defined up here so the two-section subtotals AND the final
    // totals block below both use it.
    const totalsX = rightEdge - 70
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

    // Line-item label mode. When invoice.hide_line_descriptions is set, rows
    // show only the product NAME (e.g. "100W Wall Pack w/ Lift"); otherwise
    // the name is followed by the longer description detail (e.g. "Parts &
    // Labor / Adjustable, Cut Off..."). "(ARCHIVED …)" is stripped from names
    // so retired products still read cleanly on the customer's invoice.
    const hideLineDesc = !!invoice.hide_line_descriptions
    const cleanLineName = (l) => (l?.item?.name || '').replace(/\s*\(ARCHIVED[^)]*\)/i, '').trim()

    // Draw a line-items table (green column header + rows) for a subset of
    // lines. Extracted from the flat table so the two-section layout can
    // render the in-scope and add-on groups with identical formatting.
    const drawItemRows = (lines) => {
      const qtyColX = rightEdge - 90
      const priceColX = rightEdge - 60
      const totalColX = rightEdge - 4
      const descColMaxWidth = qtyColX - margin - 8
      doc.setFillColor(90, 99, 73)
      doc.rect(margin, y - 4, contentWidth, 8, 'F')
      doc.setTextColor(255)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Description', margin + 4, y)
      doc.text('Qty', qtyColX, y, { align: 'right' })
      doc.text('Unit Price', priceColX, y, { align: 'right' })
      doc.text('Total', totalColX, y, { align: 'right' })
      y += 8
      doc.setTextColor(0)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      lines.forEach((line, idx) => {
        const qty = parseFloat(line.quantity) || 1
        const unitPrice = parseFloat(line.unit_price) || 0
        const lineTotal = parseFloat(line.line_total) || (qty * unitPrice)
        const name = cleanLineName(line)
        const rawDesc = (line.description || '').trim()
        const primary = name || rawDesc || 'Item'
        const showDesc = !hideLineDesc && rawDesc && rawDesc !== primary
        const primaryLines = doc.splitTextToSize(primary, descColMaxWidth)
        const descLines = showDesc ? doc.splitTextToSize(rawDesc, descColMaxWidth) : []
        checkPage((primaryLines.length + descLines.length) * lineHeight + 4)
        // Primary label (product name, or the description when there is no name)
        doc.setTextColor(0)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        for (let i = 0; i < primaryLines.length; i++) {
          checkPage(lineHeight + 2)
          doc.text(primaryLines[i], margin + 4, y)
          if (i === 0) {
            doc.text(String(qty), qtyColX, y, { align: 'right' })
            doc.text(formatCurrency(unitPrice), priceColX, y, { align: 'right' })
            doc.text(formatCurrency(lineTotal), totalColX, y, { align: 'right' })
          }
          y += lineHeight
        }
        // Optional description detail (smaller, muted, indented)
        if (descLines.length) {
          doc.setFontSize(8.5)
          doc.setTextColor(120)
          for (const dl of descLines) { checkPage(5); doc.text(dl, margin + 6, y); y += 4.5 }
          doc.setFontSize(10)
          doc.setTextColor(0)
        }
        if (idx < lines.length - 1) {
          y += 1
          doc.setDrawColor(230, 225, 210)
          doc.line(margin, y, rightEdge, y)
          y += 3
        }
      })
      y += 3
      doc.setDrawColor(214, 205, 184)
      doc.line(margin, y, rightEdge, y)
      y += 8
    }

    // Section title above a group's table, with an optional right-aligned
    // italic caption (used to name the utility paying the incentive).
    const drawSectionTitle = (title, caption) => {
      checkPage(12)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(90, 99, 73)
      doc.text(title, margin, y)
      if (caption) {
        doc.setFontSize(8.5)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(120)
        doc.text(caption, rightEdge, y, { align: 'right' })
      }
      doc.setTextColor(0)
      y += 6
    }

    // ── Line items table ──
    // Branch: summary_format renders Parts/Labor totals instead of
    // the per-line breakdown. Same total either way — just collapsed.
    if (invoice.summary_format && invoiceLines && invoiceLines.length > 0) {
      checkPage(30)

      // Compute Parts vs Labor with this hierarchy (highest priority first):
      //   1) Manual override on invoice.parts_total_override +
      //      invoice.labor_total_override (when both set)
      //   2) splitLinePartsLabor() per line, which itself prefers
      //      labor_cost, falls back to Service/Labor product type, then
      //      to the bundle-component classification (catches bundles
      //      where the labor lives in the bundle's components rather
      //      than on the line itself)
      let partsTotal = 0
      let laborTotal = 0
      const hasOverride = invoice.parts_total_override != null && invoice.labor_total_override != null

      if (hasOverride) {
        partsTotal = parseFloat(invoice.parts_total_override) || 0
        laborTotal = parseFloat(invoice.labor_total_override) || 0
      } else {
        for (const line of invoiceLines) {
          const { parts, labor } = splitLinePartsLabor(line, componentMaps.productMap, componentMaps.componentsByParent)
          partsTotal += parts
          laborTotal += labor
        }
      }

      // Header
      doc.setFillColor(90, 99, 73)
      doc.rect(margin, y - 4, contentWidth, 8, 'F')
      doc.setTextColor(255)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Description', margin + 4, y)
      doc.text('Amount', rightEdge - 4, y, { align: 'right' })
      y += 8

      // Two rows: Parts + Labor
      doc.setTextColor(0)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.text('Parts', margin + 4, y)
      doc.text(formatCurrency(partsTotal), rightEdge - 4, y, { align: 'right' })
      y += lineHeight + 2
      doc.text('Labor', margin + 4, y)
      doc.text(formatCurrency(laborTotal), rightEdge - 4, y, { align: 'right' })
      y += 6

      doc.setDrawColor(214, 205, 184)
      doc.line(margin, y, rightEdge, y)
      y += 8

      // Summary mode collapses the in-scope project into Parts/Labor, but
      // the out-of-scope add-ons are the customer's discretionary upsells —
      // itemize them so they see exactly what they're paying full price for.
      // Their subtotal + the incentive are reconciled in the totals below.
      if (useSectionLayout && sections.outScope.length > 0) {
        y += 2
        drawSectionTitle('Additional Services', 'Customer add-ons — not covered by utility')
        drawItemRows(sections.outScope)
      }
    } else if (invoiceLines && invoiceLines.length > 0) {
      checkPage(30)
      if (useSectionLayout) {
        // ── Two-section layout: in-scope utility project + add-ons ──
        // In-scope work: line items → project subtotal → utility incentive
        // → (project discount) → net project. The incentive visually
        // reduces ONLY the utility-qualifying project, then the add-ons are
        // billed on top at full price.
        const payer = linkedUtilityInvoice?.utility_name
        drawSectionTitle('Utility Project', payer ? `Incentive paid by ${payer}` : 'Eligible for utility incentive')
        drawItemRows(sections.inScope)
        drawTotalLine('Project Subtotal:', formatCurrency(sections.inScopeSubtotal))
        if (sections.incentive > 0) {
          drawTotalLine('Utility Incentive:', `-${formatCurrency(sections.incentive)}`, { color: [200, 0, 0] })
        }
        if (sections.projectDiscount > 0) {
          drawTotalLine('Project Discount:', `-${formatCurrency(sections.projectDiscount)}`, { color: [200, 0, 0] })
        }
        drawTotalLine('Net Project:', formatCurrency(sections.netInScope), { bold: true })
        y += 6

        // Out-of-scope add-ons: billed at full price, no incentive.
        drawSectionTitle('Additional Services', 'Customer add-ons — not covered by utility')
        drawItemRows(sections.outScope)
        drawTotalLine('Add-ons Subtotal:', formatCurrency(sections.outScopeSubtotal), { bold: true })
        y += 4
      } else {
        // ── Classic flat table (single group, all line items) ──
        drawItemRows(invoiceLines)
      }
    } else if (invoice.job_description) {
      // Fallback for invoices created before invoice_lines were tracked
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
    doc.setFontSize(10)

    // Mirror the same legacy-vs-new detection used by the page summary
    // so PDF balance math matches what the customer sees on screen.
    // Shared predicate — this was the ninth open-coded copy of the rule and
    // the last one still using `>=`, so a fully-covered invoice printed the
    // whole project as Balance Due even after the screen was fixed (SMC Auto:
    // $32,143.06 due on an invoice the customer owes $0 on). Alayda caught it.
    const pdfGross = parseFloat(invoice.amount) || 0
    const pdfDiscount = parseFloat(invoice.discount_applied) || 0
    const pdfCcFee = parseFloat(invoice.credit_card_fee) || 0
    const pdfLegacyNet = isLegacyNetShape(pdfGross, pdfDiscount)
    const pdfCustomerTotal = pdfLegacyNet ? pdfGross : (pdfGross - pdfDiscount)
    const totalPaidAmt = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)

    if (useSectionLayout && !invoice.summary_format) {
      // Itemized two-section layout already printed the project subtotal,
      // utility incentive, and add-on subtotal inline above. Only whole-
      // invoice credits remain: deposit paid, CC fee, prior payments.
      if (hasDepositBreakout) {
        const depositLabel = depositPaidDate
          ? `Deposit Applied (paid ${new Date(depositPaidDate).toLocaleDateString()}):`
          : 'Deposit Applied:'
        drawTotalLine(depositLabel, `-${formatCurrency(depositCredit)}`, { color: [200, 0, 0] })
      }
      if (pdfCcFee > 0) drawTotalLine('CC Processing Fee:', formatCurrency(pdfCcFee))
      if (totalPaidAmt > 0) drawTotalLine('Paid:', formatCurrency(totalPaidAmt), { color: [0, 128, 0] })
    } else if (useSectionLayout && invoice.summary_format) {
      // Summary (Parts/Labor) mode collapses the line items, so the split
      // can't be shown inline. Render the section breakdown here in the
      // totals — otherwise the utility incentive vanishes and the numbers
      // don't add up (Parts+Labor jumping straight to Balance Due).
      drawTotalLine('Project Subtotal:', formatCurrency(sections.inScopeSubtotal))
      if (sections.incentive > 0) {
        drawTotalLine('Utility Incentive:', `-${formatCurrency(sections.incentive)}`, { color: [200, 0, 0] })
      }
      if (sections.projectDiscount > 0) {
        drawTotalLine('Project Discount:', `-${formatCurrency(sections.projectDiscount)}`, { color: [200, 0, 0] })
      }
      drawTotalLine('Net Project:', formatCurrency(sections.netInScope), { bold: true })
      drawTotalLine('Add-ons Subtotal:', formatCurrency(sections.outScopeSubtotal), { bold: true })
      if (hasDepositBreakout) {
        const depositLabel = depositPaidDate
          ? `Deposit Applied (paid ${new Date(depositPaidDate).toLocaleDateString()}):`
          : 'Deposit Applied:'
        drawTotalLine(depositLabel, `-${formatCurrency(depositCredit)}`, { color: [200, 0, 0] })
      }
      if (pdfCcFee > 0) drawTotalLine('CC Processing Fee:', formatCurrency(pdfCcFee))
      if (totalPaidAmt > 0) drawTotalLine('Paid:', formatCurrency(totalPaidAmt), { color: [0, 128, 0] })
    } else {
      drawTotalLine('Subtotal:', formatCurrency(pdfGross))

      // Materials / Labor breakdown — Mode B invoices only
      if (matLabSplit && matLabSplit.total > 0) {
        drawTotalLine('  Materials:', formatCurrency(matLabSplit.materials), { color: [120, 120, 120] })
        drawTotalLine('  Labor:', formatCurrency(matLabSplit.labor), { color: [120, 120, 120] })
      }

      if (pdfDiscount > 0) {
        if (pdfLegacyNet) {
          drawTotalLine('Utility Incentive (applied):', formatCurrency(pdfDiscount), { color: [120, 120, 120] })
        } else if (hasDepositBreakout || hasProjectDiscountBreakout) {
          // Split project discount, utility incentive, and deposit credit into
          // separate lines so the customer (and utility, if they ask) can see
          // exactly where each deduction came from. Sum is unchanged.
          if (projectDiscountPortion > 0) {
            drawTotalLine('Project Discount:', `-${formatCurrency(projectDiscountPortion)}`, { color: [200, 0, 0] })
          }
          if (incentivePortion > 0) {
            drawTotalLine(linkedUtilityInvoice ? 'Utility Incentive:' : 'Discount:', `-${formatCurrency(incentivePortion)}`, { color: [200, 0, 0] })
          }
          if (hasDepositBreakout) {
            const depositLabel = depositPaidDate
              ? `Deposit Applied (paid ${new Date(depositPaidDate).toLocaleDateString()}):`
              : 'Deposit Applied:'
            drawTotalLine(depositLabel, `-${formatCurrency(depositCredit)}`, { color: [200, 0, 0] })
          }
        } else {
          drawTotalLine(linkedUtilityInvoice ? 'Utility Incentive:' : 'Discount:', `-${formatCurrency(pdfDiscount)}`, { color: [200, 0, 0] })
        }
      }

      if (pdfCcFee > 0) {
        drawTotalLine('CC Processing Fee:', formatCurrency(pdfCcFee))
      }

      if (totalPaidAmt > 0) {
        drawTotalLine('Paid:', formatCurrency(totalPaidAmt), { color: [0, 128, 0] })
      }
    }

    y += 2
    doc.setDrawColor(90, 99, 73)
    doc.setLineWidth(0.5)
    doc.line(totalsX, y, rightEdge, y)
    doc.setLineWidth(0.2)
    y += 7

    const balDue = pdfCustomerTotal + pdfCcFee - totalPaidAmt
    drawTotalLine('Balance Due:', formatCurrency(Math.max(0, balDue)), { bold: true, fontSize: 13 })
    y += 10

    // ── Remit Payment To block ──
    // Tracy asked the invoice to explicitly say "remit payment to <PO Box>".
    // We already use remit_to_address in the header, but customers read that
    // as the business address, not as mailing-payment instructions. Print a
    // labeled block here so check-payers know exactly where to send it.
    const remitAddress = company?.remit_to_address || buInfo?.address || company?.address
    if (remitAddress && balDue > 0) {
      checkPage(18)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0)
      doc.text('Remit Payment To:', margin, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60)
      const remitLines = doc.splitTextToSize(`${headerName}\n${remitAddress}`, contentWidth)
      for (const ln of remitLines) { doc.text(ln, margin, y); y += 5 }
      doc.setTextColor(0)
      y += 4
    }

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

  // Toggle whether the longer line-item descriptions are shown on the
  // invoice PDF + customer portal (persisted per invoice). When off, rows
  // show just the product name for a cleaner document.
  const toggleHideDescriptions = async () => {
    const next = !invoice.hide_line_descriptions
    const { error } = await supabase.from('invoices').update({ hide_line_descriptions: next }).eq('id', invoice.id)
    if (error) { toast.error('Could not save: ' + error.message); return }
    setInvoice(prev => ({ ...prev, hide_line_descriptions: next }))
    toast.success(next ? 'Line descriptions hidden' : 'Line descriptions shown')
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
          invoice_lines: (invoiceLines || []).map(l => ({
            description: l.description || l.item_name || 'Item',
            quantity: l.quantity || 1,
            unit_price: parseFloat(l.unit_price) || 0,
            line_total: parseFloat(l.line_total) || 0,
          })),
          customer_name: customerName,
          portal_url: portalUrl,
          logo_url: logoUrl,
          payment_methods: payMethods,
          business_unit_name: buObject?.name || invoice.business_unit || '',
          business_unit_phone: buObject?.phone || company?.phone || '',
          business_unit_email: buObject?.email || company?.owner_email || '',
          business_unit_address: buObject?.address || company?.remit_to_address || company?.address || '',
          custom_subject: sendSubject || undefined,
          extra_attachments: sendAttachments.length > 0 ? sendAttachments.map(a => ({ filename: a.name, content: a.base64 })) : undefined,
        })
      })

      const sendData = await sendRes.json()
      if (!sendData.success) throw new Error(sendData.error || 'Failed to send invoice')

      // Update invoice (capture Resend email_id for delivery tracking)
      await supabase.from('invoices').update({
        payment_status: invoice.payment_status === 'Draft' ? 'Sent' : invoice.payment_status,
        last_sent_at: new Date().toISOString(),
        sent_to_email: sendEmail,
        portal_token: portalToken?.token || null,
        email_id: sendData.emailId || null,
        email_status: 'sent',
        email_status_at: new Date().toISOString(),
        email_bounce_reason: null,
        email_opened_at: null,
        email_clicked_at: null,
        updated_at: new Date().toISOString()
      }).eq('id', id)

      // Move the job to 'Invoiced' pipeline stage now that the invoice is
      // actually in the customer's hands. Pipeline view no longer auto-
      // moves on invoice CREATION — only on this Send moment. Skip if job
      // is already past Invoiced (e.g., Paid).
      if (invoice.job_id) {
        const { data: currentJob } = await supabase
          .from('jobs')
          .select('status, lead_id')
          .eq('id', invoice.job_id)
          .single()
        const status = currentJob?.status
        if (status && !['Invoiced', 'Paid', 'Closed', 'Archived'].includes(status)) {
          await supabase.from('jobs').update({
            status: 'Invoiced',
            updated_at: new Date().toISOString(),
          }).eq('id', invoice.job_id)
        }
        // Mirror the move to the linked lead so the pipeline card lands
        // in Invoiced on Send (not on Create — that was Tracy's complaint
        // on JOB-MP2ZU0VY). Only bump when the lead is in an earlier
        // stage so we don't undo a manual move to a later column.
        if (currentJob?.lead_id) {
          const { data: lead } = await supabase
            .from('leads')
            .select('status')
            .eq('id', currentJob.lead_id)
            .single()
          const ls = lead?.status
          if (ls && !['Invoiced', 'Paid', 'Closed', 'Archived', 'Lost'].includes(ls)) {
            await supabase.from('leads').update({
              status: 'Invoiced',
              updated_at: new Date().toISOString(),
            }).eq('id', currentJob.lead_id)
          }
        }
      }

      toast.success('Invoice sent successfully!')
      setShowSendModal(false)
      setSendSubject('')
      setSendAttachments([])
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
  const discountApplied = parseFloat(invoice.discount_applied) || 0
  const grossAmount = parseFloat(invoice.amount) || 0
  // Two storage shapes exist in production for invoices with a utility
  // rebate, and the page has to handle both:
  //   NEW: amount = gross project total, discount = rebate amount, so
  //        customer total = amount - discount
  //   LEGACY: amount = net customer portion (already after incentive),
  //        discount = incentive amount (informational), so customer
  //        total = amount and discount must NOT be subtracted again
  // If discount > amount, the row was saved under the legacy shape —
  // double-subtracting would produce a phantom negative balance (e.g.
  // Redman INV-MNRW9RBU, Tracy INV-MNJD9UQN). Strictly greater: an equal
  // discount means the incentive/project discount fully covers the project
  // and the customer owes $0. Shared predicate so this can't drift again.
  const isLegacyNetInvoice = isLegacyNetShape(grossAmount, discountApplied)
  const customerTotal = isLegacyNetInvoice ? grossAmount : (grossAmount - discountApplied)
  const balanceDue = customerTotal + ccFeeOnInvoice - totalPaid

  // If the invoice was generated from a job with a paid deposit, the deposit
  // amount was rolled into discount_applied alongside the utility incentive
  // (see JobDetail.jsx invoice-create flow). Split them back out for display
  // so the customer can see their deposit was credited.
  const depositCredit = (parentInvoice && parentInvoice.invoice_type === 'deposit')
    ? (parseFloat(parentInvoice.amount) || 0)
    : 0
  // Same breakout idea for a whole-project discount: discount_applied stays
  // the TOTAL deduction (so balance math everywhere is untouched), and
  // project_discount records how much of it is a project discount vs a
  // utility incentive. Alayda's case: $971 project discount + $3,294
  // incentive had to share one field, so one of them always got lost.
  const projectDiscountPortion = Math.min(
    Math.max(0, parseFloat(invoice.project_discount) || 0),
    Math.max(0, discountApplied - depositCredit)
  )
  const incentivePortion = Math.max(0, discountApplied - depositCredit - projectDiscountPortion)
  const hasDepositBreakout = depositCredit > 0 && !isLegacyNetInvoice && discountApplied >= depositCredit
  const hasProjectDiscountBreakout = projectDiscountPortion > 0 && !isLegacyNetInvoice
  const depositPaidDate = parentInvoice?.updated_at || parentInvoice?.created_at
  const statusStyle = statusColors[invoice.payment_status] || statusColors['Pending']

  // Two-section model (in-scope utility project + out-of-scope add-ons).
  // Single source of truth in invoiceSections.js; reconciles to the same
  // customerTotal computed above. Only drives a NEW layout when there are
  // out-of-scope add-on lines — otherwise the classic flat layout stands.
  // The linked utility invoice's amount is the authoritative incentive.
  const sections = buildInvoiceSections(invoice, invoiceLines, {
    parentInvoice,
    utilityIncentive: linkedUtilityInvoice ? (parseFloat(linkedUtilityInvoice.amount) || 0) : null,
  })
  const useSectionLayout = sections.applicable && sections.hasOutScope
  const incentiveLabel = linkedUtilityInvoice
    ? incentiveLineLabel(linkedUtilityInvoice.utility_name)
    : 'Discount'

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
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
        <RecordHistoryButton tableName="invoices" recordId={invoice.id} style={{ marginRight: 8 }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '13px', color: theme.accent, fontWeight: '600', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {isEditing ? (
              <input
                type="text"
                value={editForm.invoice_id}
                onChange={(e) => setEditForm(prev => ({ ...prev, invoice_id: e.target.value }))}
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
              invoice.invoice_id
            )}
            {invoice.invoice_type === 'deposit' && (
              <span style={{
                padding: '2px 10px', borderRadius: 999,
                fontSize: 10, fontWeight: 800, letterSpacing: 0.8,
                background: 'rgba(212,175,55,0.15)', color: '#a88527',
                border: '1px solid rgba(212,175,55,0.4)',
                textTransform: 'uppercase',
              }}>Deposit</span>
            )}
            {invoice.invoice_type === 'final' && (
              <span style={{
                padding: '2px 10px', borderRadius: 999,
                fontSize: 10, fontWeight: 800, letterSpacing: 0.8,
                background: 'rgba(74,124,89,0.15)', color: '#3d6549',
                border: '1px solid rgba(74,124,89,0.4)',
                textTransform: 'uppercase',
              }}>Final</span>
            )}
            {invoice.invoice_type === 'progress' && (
              <span style={{
                padding: '2px 10px', borderRadius: 999,
                fontSize: 10, fontWeight: 800, letterSpacing: 0.8,
                background: 'rgba(59,130,246,0.15)', color: '#2a5fb5',
                border: '1px solid rgba(59,130,246,0.4)',
                textTransform: 'uppercase',
              }}>Progress</span>
            )}
            {invoice.is_locked && (
              <span style={{ marginLeft: '8px', fontSize: '11px', color: theme.textMuted }}>
                <Lock size={12} style={{ verticalAlign: 'middle', marginRight: '2px' }} />
                Locked
              </span>
            )}
          </p>
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text }}>
            {invoice.customer?.business_name || invoice.customer?.name || 'Invoice'}
          </h1>
          {/* Editable invoice date + due date. Invoice date defaults to
              created_at when blank (no override). Tracy needs to back-date
              regenerated invoices to the actual work date and shorten or
              extend terms on a per-invoice basis. */}
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '8px' }}>
            <label style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 600 }}>
              <span style={{ display: 'block', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invoice date</span>
              <input
                type="date"
                value={(invoice.invoice_date || invoice.created_at || '').slice(0, 10)}
                disabled={invoice.is_locked}
                onChange={async (e) => {
                  const val = e.target.value || null
                  // Local optimistic update so the input doesn't flicker
                  setInvoice(prev => ({ ...prev, invoice_date: val }))
                  await supabase.from('invoices').update({ invoice_date: val }).eq('id', invoice.id)
                }}
                style={{
                  padding: '4px 8px', fontSize: 12, fontWeight: 500,
                  color: theme.text, backgroundColor: theme.bgCard,
                  border: `1px solid ${theme.border}`, borderRadius: 6,
                  outline: 'none', cursor: invoice.is_locked ? 'not-allowed' : 'text',
                }}
              />
            </label>
            <label style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 600 }}>
              <span style={{ display: 'block', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Due date</span>
              <input
                type="date"
                value={(invoice.due_date || '').slice(0, 10)}
                disabled={invoice.is_locked}
                onChange={async (e) => {
                  const val = e.target.value || null
                  setInvoice(prev => ({ ...prev, due_date: val }))
                  await supabase.from('invoices').update({ due_date: val }).eq('id', invoice.id)
                }}
                style={{
                  padding: '4px 8px', fontSize: 12, fontWeight: 500,
                  color: theme.text, backgroundColor: theme.bgCard,
                  border: `1px solid ${theme.border}`, borderRadius: 6,
                  outline: 'none', cursor: invoice.is_locked ? 'not-allowed' : 'text',
                }}
              />
            </label>
          </div>
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

      {/* Coverage banner — when this invoice is for a service visit
          where parts and/or labor are covered by manufacturer or
          absorbed by us, surface it prominently so reps don't accidentally
          collect from the customer and the customer doesn't get confused
          by the $0 lines below. */}
      {(() => {
        const j = invoice.job
        const partsCov = j?.parts_coverage
        const laborCov = j?.labor_coverage
        if (!partsCov && !laborCov) return null
        if (partsCov === 'customer' && laborCov === 'customer') return null
        const labelFor = (c) => c === 'manufacturer' ? 'manufacturer warranty' : c === 'company' ? 'us — no customer charge' : c === 'split' ? 'split (see notes)' : c
        const bits = []
        if (partsCov && partsCov !== 'customer') bits.push(`Parts: ${labelFor(partsCov)}`)
        if (laborCov && laborCov !== 'customer') bits.push(`Labor: ${labelFor(laborCov)}`)
        return (
          <div style={{
            marginBottom: '16px', padding: '12px 14px',
            backgroundColor: 'rgba(217,119,6,0.08)',
            border: '1px solid rgba(217,119,6,0.28)',
            borderRadius: '10px',
            display: 'flex', alignItems: 'flex-start', gap: '10px',
          }}>
            <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400e' }}>
                Coverage on this {j?.service_kind ? j.service_kind.replace(/_/g, ' ') : 'service visit'}
              </div>
              <div style={{ fontSize: '12px', color: '#92400e', marginTop: '2px' }}>
                {bits.join(' · ')}. Customer is only billed for items not listed above.
                {j?.coverage_notes ? ` Notes: ${j.coverage_notes}.` : ''}
              </div>
            </div>
          </div>
        )
      })()}

      {/* minmax(0, …) on both layouts — plain 1fr's min size is content
          width, which let wide children push past phone viewports and get
          clipped by the page-root overflowX:hidden (same bug as JobDetail
          and EstimateDetail in the June-10 mobile-cutoff cluster). */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 360px', gap: '24px' }}>
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
                  <button onClick={() => navigate(`/customers/${invoice.customer?.id}`)} style={{ fontSize: '14px', fontWeight: '500', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                    {invoice.customer?.name}
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

            {/* Email Delivery Status */}
            {invoice.email_id && (() => {
              const status = invoice.email_status || 'sent'
              const statusConfig = {
                sent: { label: 'Sent', color: theme.info, bg: 'rgba(59,130,246,0.12)' },
                delivered: { label: 'Delivered', color: theme.success, bg: 'rgba(34,197,94,0.12)' },
                delayed: { label: 'Delayed', color: theme.warning, bg: 'rgba(234,179,8,0.12)' },
                bounced: { label: 'Bounced', color: theme.error, bg: 'rgba(239,68,68,0.12)' },
                complained: { label: 'Spam Complaint', color: theme.error, bg: 'rgba(239,68,68,0.12)' },
              }
              const cfg = statusConfig[status] || statusConfig.sent
              const ts = invoice.email_status_at ? new Date(invoice.email_status_at).toLocaleString() : ''
              return (
                <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: cfg.bg }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Email Delivery</p>
                      <p style={{ fontSize: '14px', fontWeight: '600', color: cfg.color }}>
                        {cfg.label}
                        {ts ? ` — ${ts}` : ''}
                      </p>
                      {invoice.sent_to_email && (
                        <p style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '2px' }}>To: {invoice.sent_to_email}</p>
                      )}
                      {invoice.email_bounce_reason && (
                        <p style={{ fontSize: '12px', color: theme.error, marginTop: '4px' }}>{invoice.email_bounce_reason}</p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '12px', color: theme.textMuted }}>
                      {invoice.email_opened_at && <div>Opened {new Date(invoice.email_opened_at).toLocaleString()}</div>}
                      {invoice.email_clicked_at && <div>Clicked {new Date(invoice.email_clicked_at).toLocaleString()}</div>}
                    </div>
                  </div>
                  {/* Inline Resend — same action as the sidebar
                      Send/Resend button but right next to the delivery
                      panel so it's findable without scrolling. Christopher
                      reported needing to download + re-attach manually
                      because he couldn't find the Resend button. */}
                  <div style={{ marginTop: '10px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => setShowSendModal(true)}
                      style={{
                        padding: '6px 14px', borderRadius: '6px',
                        backgroundColor: '#ffffff', color: cfg.color,
                        border: `1px solid ${cfg.color}40`, cursor: 'pointer',
                        fontSize: '12px', fontWeight: '600',
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                      }}
                      title={invoice.email_bounce_reason ? 'Re-send to a corrected address' : 'Re-send this invoice to the customer'}
                    >
                      ↻ Resend Invoice
                    </button>
                  </div>
                </div>
              )
            })()}
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
                {invoice.job.job_address && (
                  <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}>
                    <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Service Address</p>
                    <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.job.job_address}</p>
                  </div>
                )}
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

          {/* Conversation Log — payment-arrangement chat history */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>
              Conversation Log
            </h3>
            <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '14px' }}>
              Timestamped notes — payment arrangements, follow-ups, customer commitments.
            </p>

            {(Array.isArray(invoice.conversation_log) && invoice.conversation_log.length > 0) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                {[...invoice.conversation_log].reverse().map((e, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '10px 12px',
                      backgroundColor: theme.bg,
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: theme.accent }}>
                        {e.by || 'Unknown'}
                      </span>
                      <span style={{ fontSize: '11px', color: theme.textMuted }}>
                        {e.at ? new Date(e.at).toLocaleString() : ''}
                      </span>
                    </div>
                    <p style={{ fontSize: '14px', color: theme.text, margin: 0, whiteSpace: 'pre-wrap' }}>
                      {e.text}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: theme.textMuted, fontStyle: 'italic', marginBottom: '14px' }}>
                No entries yet.
              </p>
            )}

            <textarea
              value={logEntry}
              onChange={(e) => setLogEntry(e.target.value)}
              rows={2}
              placeholder="Spoke with customer — agreed to pay by Friday..."
              style={{ ...inputStyle, resize: 'vertical', marginBottom: '8px' }}
            />
            <button
              onClick={addConversationEntry}
              disabled={savingLog || !logEntry.trim()}
              style={{
                padding: '10px 16px',
                backgroundColor: theme.accent,
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: (savingLog || !logEntry.trim()) ? 'not-allowed' : 'pointer',
                opacity: (savingLog || !logEntry.trim()) ? 0.5 : 1,
              }}
            >
              {savingLog ? 'Adding...' : 'Add Note'}
            </button>
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
                {payments.map((payment) => {
                  const refunded = parseFloat(payment.refunded_amount || 0)
                  const refundable = parseFloat(payment.amount || 0) - refunded
                  const canRefund = !!payment.stripe_payment_intent_id && refundable > 0.005
                  const statusColor = payment.status === 'Refunded' || payment.status === 'Partially Refunded'
                    ? { bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c' }
                    : payment.status === 'Completed'
                      ? { bg: 'rgba(74,124,89,0.12)', fg: '#4a7c59' }
                      : { bg: 'rgba(194,139,56,0.12)', fg: '#c28b38' }
                  return (
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
                          {refunded > 0 && (
                            <span style={{ fontSize: 12, fontWeight: 500, color: '#b91c1c', marginLeft: 8 }}>
                              − {formatCurrency(refunded)} refunded
                            </span>
                          )}
                        </p>
                        <p style={{ fontSize: '12px', color: theme.textMuted }}>
                          {formatDate(payment.date)} - {payment.method}
                          {payment.stripe_payment_intent_id && <span style={{ marginLeft: 6, opacity: 0.6 }}>· Stripe</span>}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '12px',
                          fontSize: '11px', fontWeight: '500',
                          backgroundColor: statusColor.bg, color: statusColor.fg,
                        }}>
                          {payment.status}
                        </span>
                        {canRefund && (
                          <button
                            onClick={async () => {
                              const reason = prompt(`Refund ${formatCurrency(refundable)} via Stripe?\n\nOptional: enter a reason (will be saved + sent to Stripe).`)
                              if (reason === null) return
                              try {
                                await supabase.auth.refreshSession()
                                const r = await supabase.functions.invoke('stripe-refund-payment', {
                                  body: { company_id: companyId, payment_id: payment.id, reason: reason.trim() || null },
                                })
                                if (r.error || r.data?.error) {
                                  toast.error(r.data?.error || r.error?.message || 'Refund failed')
                                  return
                                }
                                toast.success(`Refund of ${formatCurrency(r.data.refunded_amount)} issued`)
                                await fetchInvoiceData()
                                await fetchInvoices()
                              } catch (err) { toast.error(err.message || 'Refund failed') }
                            }}
                            disabled={saving}
                            title={`Refund ${formatCurrency(refundable)} via Stripe`}
                            style={{
                              background: 'none', border: `1px solid #b91c1c33`,
                              padding: '3px 8px', borderRadius: 6,
                              cursor: saving ? 'not-allowed' : 'pointer',
                              color: '#b91c1c', fontSize: 11, fontWeight: 600,
                              display: 'flex', alignItems: 'center', gap: 3,
                            }}
                          >
                            ↺ Refund
                          </button>
                        )}
                        <button
                          onClick={() => openMovePayment(payment)}
                          disabled={saving}
                          title="Move this payment to another invoice for the same customer"
                          style={{
                            background: 'none', border: `1px solid ${theme.border}`,
                            padding: '3px 8px', borderRadius: 6,
                            cursor: saving ? 'not-allowed' : 'pointer',
                            color: theme.textSecondary, fontSize: 11, fontWeight: 600,
                          }}
                        >
                          ↔ Move
                        </button>
                        <button
                          onClick={() => rescindPayment(payment)}
                          disabled={saving}
                          title="Rescind payment record (does NOT refund Stripe; for manual entries)"
                          style={{
                            background: 'none', border: 'none', padding: '4px',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            color: theme.textMuted,
                            opacity: saving ? 0.4 : 0.6,
                            display: 'flex', alignItems: 'center'
                          }}
                        >
                          <RotateCcw size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Payment Plan section */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            overflow: 'hidden',
            marginBottom: '24px'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
                Payment Plan
              </h3>
              {paymentPlans.filter(p => p.status === 'active').length === 0 && invoice.payment_status !== 'Paid' && (
                <button
                  onClick={() => setShowPlanModal(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 12px',
                    backgroundColor: '#a855f7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={16} />
                  Set Up Plan
                </button>
              )}
            </div>

            {paymentPlans.length === 0 ? (
              <div style={{ padding: '24px 20px', textAlign: 'center', color: theme.textMuted, fontSize: '14px' }}>
                No payment plan. Set one up to spread the balance over recurring installments.
              </div>
            ) : (
              paymentPlans.map(plan => {
                const remaining = (plan.total_installments || 0) - (plan.installments_completed || 0)
                const statusColor = plan.status === 'active' ? '#a855f7' : plan.status === 'completed' ? '#22c55e' : plan.status === 'cancelled' ? '#71717a' : '#eab308'
                return (
                  <div key={plan.id} style={{ padding: '14px 20px', borderBottom: `1px solid ${theme.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600, color: theme.text, fontSize: '14px' }}>
                            {formatCurrency(plan.installment_amount)} {plan.frequency}
                          </span>
                          <span style={{
                            padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                            backgroundColor: `${statusColor}1f`, color: statusColor,
                            textTransform: 'capitalize',
                          }}>{plan.status}</span>
                          {plan.auto_charge && (
                            <span style={{
                              padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                              backgroundColor: 'rgba(34,197,94,0.12)', color: '#16a34a',
                            }}>Auto-charge</span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: theme.textMuted }}>
                          {plan.installments_completed || 0} of {plan.total_installments} paid
                          {plan.status === 'active' && remaining > 0 && plan.next_charge_date && (
                            <> · Next: {formatDate(plan.next_charge_date)}</>
                          )}
                          {plan.end_date && <> · Ends: {formatDate(plan.end_date)}</>}
                        </div>
                        {plan.notes && (
                          <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px', fontStyle: 'italic' }}>
                            {plan.notes}
                          </div>
                        )}
                      </div>
                      {plan.status === 'active' && (
                        <button
                          onClick={() => cancelPaymentPlan(plan.id)}
                          style={{
                            background: 'none',
                            border: `1px solid ${theme.border}`,
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            color: theme.textSecondary,
                            cursor: 'pointer',
                          }}
                        >Cancel</button>
                      )}
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: '6px', backgroundColor: theme.border, borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, ((plan.installments_completed || 0) / Math.max(1, plan.total_installments)) * 100)}%`,
                        backgroundColor: statusColor,
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </div>
                )
              })
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={toggleHideDescriptions}
                  title="Show or hide the longer line-item descriptions on the invoice PDF and customer portal. When off, rows show just the product name."
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    backgroundColor: invoice.hide_line_descriptions ? theme.bg : 'rgba(90,99,73,0.12)',
                    color: invoice.hide_line_descriptions ? theme.textMuted : theme.accent,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  {invoice.hide_line_descriptions ? 'Descriptions: Off' : 'Descriptions: On'}
                </button>
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
              {useSectionLayout && !isEditing ? (
                <>
                  {/* Two-section breakdown — mirrors the customer PDF/portal:
                      utility-qualifying project (incentive applied) + add-ons
                      billed on top. Reconciles to the same Balance Due. */}
                  <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Utility Project
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                    <span style={{ color: theme.textSecondary }}>Project Subtotal</span>
                    <span style={{ fontWeight: '500', color: theme.text }}>{formatCurrency(sections.inScopeSubtotal)}</span>
                  </div>
                  {sections.incentive > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                      <span style={{ color: theme.textSecondary }}>{incentiveLabel}</span>
                      <span style={{ color: '#dc2626' }}>-{formatCurrency(sections.incentive)}</span>
                    </div>
                  )}
                  {sections.projectDiscount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                      <span style={{ color: theme.textSecondary }}>Project Discount</span>
                      <span style={{ color: '#dc2626' }}>-{formatCurrency(sections.projectDiscount)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                    <span style={{ color: theme.textSecondary, fontWeight: '600' }}>Net Project</span>
                    <span style={{ fontWeight: '600', color: theme.text }}>{formatCurrency(sections.netInScope)}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>
                    Additional Services
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                    <span style={{ color: theme.textSecondary }}>Add-ons Subtotal</span>
                    <span style={{ fontWeight: '500', color: theme.text }}>{formatCurrency(sections.outScopeSubtotal)}</span>
                  </div>
                  {hasDepositBreakout && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                      <span style={{ color: theme.textSecondary }}>
                        Deposit Applied
                        {depositPaidDate && (
                          <span style={{ color: theme.textMuted, marginLeft: '6px', fontSize: '12px' }}>
                            (paid {new Date(depositPaidDate).toLocaleDateString()})
                          </span>
                        )}
                      </span>
                      <span style={{ color: '#dc2626' }}>-{formatCurrency(depositCredit)}</span>
                    </div>
                  )}
                </>
              ) : (
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
              )}

              {/* Materials / Labor breakdown — shown on Mode B (incentive-
                  bearing) invoices and whenever a manual Parts/Labor
                  override is set. resolveMatLabSplit gives the manual
                  override top priority so the numbers here always match
                  what was typed in Edit mode. */}
              {!isEditing && matLabSplit && matLabSplit.total > 0 && (
                <div style={{ padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '6px', border: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                    Project Total Breakdown
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: theme.textSecondary }}>Materials</span>
                    <span style={{ fontWeight: '500', color: theme.text }}>{formatCurrency(matLabSplit.materials)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: theme.textSecondary }}>Labor</span>
                    <span style={{ fontWeight: '500', color: theme.text }}>{formatCurrency(matLabSplit.labor)}</span>
                  </div>
                  {matLabSplit.source === 'manual' ? (
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                      Entered manually in Edit mode.
                    </div>
                  ) : matLabSplit.fallbackLineCount > 0 && (
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                      {matLabSplit.fallbackLineCount} of {matLabSplit.totalLineCount} line{matLabSplit.totalLineCount !== 1 ? 's' : ''} using 70/30 estimate — classify components in Products & Services for real numbers, or type the real split in Edit mode.
                    </div>
                  )}
                </div>
              )}

              {/* Discount block — discount_applied stays the TOTAL deduction
                  (balance math everywhere reads amount − discount_applied);
                  project_discount + the deposit parent let us break it out
                  into Project Discount / Utility Incentive / Deposit lines
                  so two real-world deductions no longer fight over one
                  field (Alayda: $971 project discount + $3,294 incentive). */}
              {isEditing ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                    <span style={{ color: theme.textSecondary }}>Project Discount</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.project_discount}
                      onChange={(e) => setEditForm(prev => ({ ...prev, project_discount: e.target.value }))}
                      placeholder="0.00"
                      style={{ ...inputStyle, width: '140px', textAlign: 'right' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                    <span style={{ color: theme.textSecondary }}>
                      {linkedUtilityInvoice ? 'Utility Incentive' : 'Utility Incentive / Other'}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.discount_other}
                      onChange={(e) => setEditForm(prev => ({ ...prev, discount_other: e.target.value }))}
                      placeholder="0.00"
                      style={{ ...inputStyle, width: '140px', textAlign: 'right' }}
                    />
                  </div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, textAlign: 'right' }}>
                    Total deductions: {formatCurrency((parseFloat(editForm.project_discount) || 0) + (parseFloat(editForm.discount_other) || 0))}
                    {hasDepositBreakout ? ` (includes ${formatCurrency(depositCredit)} deposit credit)` : ''}
                  </div>
                </>
              ) : useSectionLayout ? null : isLegacyNetInvoice ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                  <span style={{ color: theme.textSecondary }}>Utility Incentive (already applied)</span>
                  <span style={{ color: theme.textMuted }}>{formatCurrency(invoice.discount_applied)}</span>
                </div>
              ) : (hasProjectDiscountBreakout || hasDepositBreakout) ? (
                <>
                  {projectDiscountPortion > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                      <span style={{ color: theme.textSecondary }}>Project Discount</span>
                      <span style={{ color: '#dc2626' }}>-{formatCurrency(projectDiscountPortion)}</span>
                    </div>
                  )}
                  {incentivePortion > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                      <span style={{ color: theme.textSecondary }}>{linkedUtilityInvoice ? 'Utility Incentive' : 'Discount'}</span>
                      <span style={{ color: '#dc2626' }}>-{formatCurrency(incentivePortion)}</span>
                    </div>
                  )}
                  {hasDepositBreakout && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                      <span style={{ color: theme.textSecondary }}>
                        Deposit Applied
                        {depositPaidDate && (
                          <span style={{ color: theme.textMuted, marginLeft: '6px', fontSize: '12px' }}>
                            (paid {new Date(depositPaidDate).toLocaleDateString()})
                          </span>
                        )}
                      </span>
                      <span style={{ color: '#dc2626' }}>-{formatCurrency(depositCredit)}</span>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                  <span style={{ color: theme.textSecondary }}>
                    {linkedUtilityInvoice ? 'Utility Incentive' : 'Discount'}
                  </span>
                  {invoice.discount_applied > 0 ? (
                    <span style={{ color: '#dc2626' }}>-{formatCurrency(invoice.discount_applied)}</span>
                  ) : (
                    <span style={{ color: theme.textMuted }}>$0.00</span>
                  )}
                </div>
              )}

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

              {/* Manual Parts/Labor override — only shown in edit mode when
                  the invoice is set to Summary format. Both fields must be
                  filled for the override to take effect; leaving them blank
                  falls back to per-line labor_cost computation. */}
              {isEditing && invoice.summary_format && (
                <div style={{
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
                    Both blank = auto-compute from line items. Set both to force the breakdown everywhere (page, PDF, customer portal).
                  </p>
                  {/* Consistency guard — Alayda's INV-MQ8C2T1X printed
                      Parts+Labor that didn't add up to the Invoice Total
                      and nothing flagged it. Surface the mismatch with a
                      one-click fix instead of silently printing both. */}
                  {(() => {
                    const p = editForm.parts_total_override
                    const l = editForm.labor_total_override
                    if (p === '' || p == null || l === '' || l == null) return null
                    const ovSum = Math.round(((parseFloat(p) || 0) + (parseFloat(l) || 0)) * 100) / 100
                    const editAmount = parseFloat(editForm.amount) || 0
                    if (Math.abs(ovSum - editAmount) <= 0.01) return null
                    return (
                      <div style={{
                        padding: '8px 10px',
                        backgroundColor: 'rgba(234,179,8,0.10)',
                        border: '1px solid rgba(234,179,8,0.35)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#92400e',
                        lineHeight: '1.4',
                      }}>
                        Parts + Labor = {formatCurrency(ovSum)} but Invoice Total is {formatCurrency(editAmount)} — the document will show both.
                        <button
                          onClick={() => setEditForm(prev => ({ ...prev, amount: ovSum }))}
                          style={{
                            display: 'block',
                            marginTop: '6px',
                            padding: '6px 10px',
                            backgroundColor: 'rgba(234,179,8,0.18)',
                            color: '#92400e',
                            border: '1px solid rgba(234,179,8,0.4)',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            minHeight: '32px',
                          }}
                        >
                          Set Invoice Total to {formatCurrency(ovSum)}
                        </button>
                      </div>
                    )
                  })()}
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
                {/* Tracy flagged on INV-MNJD9UQN: header showed a
                    negative Balance Due even when the PDF showed it
                    correctly (PDF clamps via Math.max(0, balDue)).
                    Mirror that clamp for the display + add an explicit
                    "Overpaid by $X" indicator so a real overpayment
                    isn't hidden — just labeled correctly. */}
                <span style={{ fontWeight: '600', color: theme.text }}>
                  {balanceDue < -0.005 ? 'Overpaid by' : 'Balance Due'}
                </span>
                <span style={{
                  fontSize: '20px', fontWeight: '600',
                  color: balanceDue > 0 ? '#c28b38' : (balanceDue < -0.005 ? '#7c3aed' : '#4a7c59'),
                }}>
                  {formatCurrency(Math.abs(balanceDue) < 0.005 ? 0 : Math.abs(balanceDue))}
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
                  {stripeConfigured === false ? (
                    // Stripe not connected yet — render a setup CTA
                    // instead of letting the user click into an error.
                    <button
                      onClick={() => navigate('/settings?tab=integrations')}
                      style={actionBtnStyle('rgba(124,58,237,0.10)', '#7c3aed')}
                      title="Connect your Stripe account in Settings → Integrations so customers can pay invoices by card or ACH"
                    >
                      <Link2 size={18} />
                      Connect Stripe to Send Payment Links
                    </button>
                  ) : (
                    <button
                      onClick={sendStripePaymentLink}
                      disabled={generatingLink || stripeConfigured === null}
                      style={actionBtnStyle('#7c3aed', '#ffffff')}
                      title={invoice.stripe_payment_link_url ? 'Copy existing payment link to clipboard' : 'Generate a one-click Stripe Payment Link the customer can pay via card or ACH'}
                    >
                      <Link2 size={18} />
                      {generatingLink ? 'Generating…' : (invoice.stripe_payment_link_url ? 'Copy Payment Link' : 'Send Payment Link')}
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

              {invoice.payment_status === 'Paid' && (
                <button
                  onClick={reopenInvoice}
                  disabled={saving}
                  style={actionBtnStyle('rgba(234,179,8,0.12)', '#a16207')}
                  title="Reopen so you can apply a new payment"
                >
                  <RotateCcw size={18} />
                  Reopen Invoice
                </button>
              )}

              {/* Edit button — only if not locked, not editing, AND user
                  has admin access. Office-role users can still record
                  payments but can't change the totals. */}
              {!invoice.is_locked && !isEditing && canEditAmount && (
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

              {/* Format toggle: Itemized vs Summary (Parts/Labor totals).
                  Persists to invoices.summary_format so the next preview
                  + send + download all use the chosen format. Disabled
                  when locked (would change the customer-facing invoice). */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 0,
                padding: 3,
                backgroundColor: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
              }}>
                {['itemized', 'summary'].map(mode => {
                  const isActive = (mode === 'summary') === !!invoice.summary_format
                  return (
                    <button
                      key={mode}
                      onClick={async () => {
                        if (isActive || invoice.is_locked) return
                        const nextValue = mode === 'summary'
                        const { error } = await supabase
                          .from('invoices')
                          .update({ summary_format: nextValue, updated_at: new Date().toISOString() })
                          .eq('id', invoice.id)
                        if (error) { toast.error('Could not save format: ' + error.message); return }
                        setInvoice(prev => ({ ...prev, summary_format: nextValue }))
                        toast.success(`Invoice format: ${mode === 'summary' ? 'Parts & Labor summary' : 'Itemized'}`)
                      }}
                      disabled={invoice.is_locked}
                      title={invoice.is_locked ? 'Locked invoices cannot change format' : mode === 'summary' ? 'Show one Parts + one Labor total instead of every line' : 'Show every line item'}
                      style={{
                        padding: '6px 12px', minHeight: 32,
                        backgroundColor: isActive ? '#fff' : 'transparent',
                        color: isActive ? theme.text : theme.textMuted,
                        border: 'none', borderRadius: 6,
                        fontSize: 12, fontWeight: 600,
                        cursor: (isActive || invoice.is_locked) ? 'default' : 'pointer',
                        boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                        opacity: invoice.is_locked && !isActive ? 0.5 : 1,
                      }}
                    >
                      {mode === 'summary' ? 'Summary' : 'Itemized'}
                    </button>
                  )
                })}
              </div>

              {/* Send Invoice — same button is used for first send and resend */}
              <button
                onClick={() => setShowSendModal(true)}
                disabled={generatingPdf}
                style={actionBtnStyle(theme.accent, '#ffffff')}
              >
                <Mail size={18} />
                {invoice.last_sent_at ? 'Resend Invoice' : 'Send Invoice'}
              </button>

              {/* Send Receipt — email the client a payment receipt on demand.
                  Shown once any payment is recorded (Tracy: send a receipt
                  after applying a card/manual payment). */}
              {(payments && payments.length > 0) && (
                <button
                  onClick={handleSendReceipt}
                  disabled={sendingReceipt}
                  style={actionBtnStyle('#16a34a', '#ffffff')}
                >
                  <Receipt size={18} />
                  {sendingReceipt ? 'Sending…' : 'Send Receipt'}
                </button>
              )}

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
                {/* Partial-payment hint — Tracy was editing the invoice
                    amount to make partial payments, which corrupted the
                    balance. The Amount input below already supports any
                    amount up to (or over, for tip) the balance. */}
                <div style={{ padding: '10px 12px', backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid #3b82f6', borderRadius: '8px', fontSize: '13px', color: '#1e40af' }}>
                  Enter any amount below to record a partial payment.
                  The invoice keeps its original total ({formatCurrency(invoice.amount)}); the balance auto-updates. Want recurring auto-charges? Use <b>Set Up Plan</b> on the Payment Plan card.
                </div>
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
                  {/* Quick-fill chips for common installment splits */}
                  {Number(invoice.amount) > 0 && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: theme.textMuted }}>Quick:</span>
                      {[
                        { label: 'Full balance', amt: balanceDue.toFixed(2) },
                        { label: '½', amt: (balanceDue / 2).toFixed(2) },
                        { label: '⅓', amt: (balanceDue / 3).toFixed(2) },
                        { label: '6-mo', amt: (Number(invoice.amount) / 6).toFixed(2) },
                      ].map(opt => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => setPaymentData(prev => ({ ...prev, amount: opt.amt }))}
                          style={{ padding: '2px 8px', fontSize: '11px', fontWeight: '500', backgroundColor: theme.bg, color: theme.accent, border: `1px solid ${theme.border}`, borderRadius: '4px', cursor: 'pointer' }}
                        >
                          {opt.label} (${opt.amt})
                        </button>
                      ))}
                    </div>
                  )}
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

      {/* Set Up Payment Plan Modal */}
      {showPlanModal && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px', zIndex: 50
        }}>
          <div style={{
            backgroundColor: theme.bgCard, borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            width: '100%', maxWidth: isMobile ? 'calc(100vw - 32px)' : '480px',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '20px', borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                Set Up Payment Plan
              </h2>
              <button onClick={() => setShowPlanModal(false)} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '13px', color: theme.textSecondary, padding: '10px 12px', backgroundColor: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '8px' }}>
                The plan will appear on the Invoices Dashboard under "Active Plan" so you know when payments are coming due. When the invoice balance reaches zero the plan auto-completes and stops appearing.
              </div>

              <div>
                <label style={labelStyle}>Frequency</label>
                <select
                  value={planForm.frequency}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, frequency: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-Weekly (every 2 weeks)</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Installment Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={planForm.installment_amount}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, installment_amount: e.target.value }))}
                    style={inputStyle}
                    placeholder="0.00"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}># of Installments</label>
                  <input
                    type="number"
                    min="1"
                    value={planForm.total_installments}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, total_installments: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>First Charge Date</label>
                <input
                  type="date"
                  value={planForm.start_date}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, start_date: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              {savedCards.length > 0 && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.text, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={planForm.auto_charge}
                      onChange={(e) => setPlanForm(prev => ({ ...prev, auto_charge: e.target.checked, payment_method_id: e.target.checked && savedCards[0] ? savedCards[0].id : '' }))}
                    />
                    Auto-charge a saved card on each due date
                  </label>
                  {planForm.auto_charge && (
                    <div>
                      <label style={labelStyle}>Card to Charge</label>
                      <select
                        value={planForm.payment_method_id}
                        onChange={(e) => setPlanForm(prev => ({ ...prev, payment_method_id: e.target.value }))}
                        style={inputStyle}
                      >
                        {savedCards.map(c => (
                          <option key={c.id} value={c.id}>{c.brand} ····{c.last_four} (exp {c.exp_month}/{c.exp_year})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              <div>
                <label style={labelStyle}>Notes (optional)</label>
                <textarea
                  value={planForm.notes}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  placeholder="e.g. 6-month payment plan agreed via email 4/15"
                />
              </div>

              {planForm.installment_amount && planForm.total_installments && (
                <div style={{ padding: '10px 12px', backgroundColor: theme.accentBg, borderRadius: '8px', fontSize: '13px', color: theme.text }}>
                  <strong>Plan total:</strong> {formatCurrency(parseFloat(planForm.installment_amount || 0) * parseInt(planForm.total_installments || 0))}
                  <br />
                  <strong>Final payment:</strong> {formatDate(computeNextChargeDate(planForm.start_date, planForm.frequency, parseInt(planForm.total_installments || 1) - 1))}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  onClick={() => setShowPlanModal(false)}
                  style={{
                    flex: 1, padding: '10px 16px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: 'transparent', color: theme.text,
                    borderRadius: '8px', fontSize: '14px', cursor: 'pointer'
                  }}
                >Cancel</button>
                <button
                  onClick={createPaymentPlan}
                  disabled={savingPlan || !planForm.installment_amount || !planForm.total_installments}
                  style={{
                    flex: 1, padding: '10px 16px',
                    backgroundColor: '#a855f7', color: '#ffffff',
                    border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
                    cursor: (savingPlan || !planForm.installment_amount) ? 'not-allowed' : 'pointer',
                    opacity: (savingPlan || !planForm.installment_amount) ? 0.6 : 1,
                  }}
                >
                  {savingPlan ? 'Saving...' : 'Create Plan'}
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

      {/* Move Payment Modal — Tracy's "delete payment + reapply to
          other invoice" workflow without the data loss. */}
      {movePayment && (
        <div
          onClick={() => !saving && setMovePayment(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '16px',
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '24px', width: '100%', maxWidth: '480px',
          }}>
            <h3 style={{ fontSize: '17px', fontWeight: '700', color: theme.text, marginBottom: '4px' }}>
              Move Payment to Another Invoice
            </h3>
            <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '16px' }}>
              Reassigns this {formatCurrency(movePayment.amount)} {movePayment.method} payment from {formatDate(movePayment.date)} to another invoice for the same customer. The original payment record stays intact — just its invoice link changes.
            </p>

            {moveLoading ? (
              <p style={{ fontSize: '13px', color: theme.textMuted }}>Loading invoices…</p>
            ) : moveCandidates.length === 0 ? (
              <p style={{ fontSize: '13px', color: theme.textMuted, fontStyle: 'italic' }}>
                No other invoices found for this customer.
              </p>
            ) : (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>
                  Move to invoice
                </label>
                <select
                  value={moveTargetId}
                  onChange={(e) => setMoveTargetId(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px',
                    border: `1px solid ${theme.border}`, borderRadius: '8px',
                    fontSize: '14px', color: theme.text, backgroundColor: theme.bgCard,
                  }}
                >
                  <option value="">— Pick an invoice —</option>
                  {moveCandidates.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.invoice_id} · {formatCurrency(c.amount)} · {c.payment_status}
                      {c.job_description ? ` — ${c.job_description.slice(0, 50)}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setMovePayment(null)}
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
                onClick={commitMovePayment}
                disabled={saving || !moveTargetId}
                style={{
                  flex: 1, padding: '12px',
                  backgroundColor: theme.accent, color: '#ffffff',
                  border: 'none', borderRadius: '8px', fontSize: '14px',
                  fontWeight: '600',
                  cursor: (saving || !moveTargetId) ? 'not-allowed' : 'pointer',
                  opacity: (saving || !moveTargetId) ? 0.6 : 1,
                }}
              >
                {saving ? 'Moving…' : 'Move Payment'}
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
              <div>
                <label style={labelStyle}>Subject Line <span style={{ color: theme.textMuted, fontWeight: '400' }}>(optional)</span></label>
                <input
                  type="text"
                  value={sendSubject}
                  onChange={(e) => setSendSubject(e.target.value)}
                  placeholder={`Invoice ${invoice?.invoice_id || ''} from ${company?.company_name || 'Company'}`}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Attachments <span style={{ color: theme.textMuted, fontWeight: '400' }}>(spec sheets, documents)</span></label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {sendAttachments.map((att, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', backgroundColor: theme.bg, borderRadius: '6px', border: `1px solid ${theme.border}` }}>
                      <Paperclip size={14} style={{ color: theme.textMuted }} />
                      <span style={{ fontSize: '13px', color: theme.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                      <span style={{ fontSize: '11px', color: theme.textMuted }}>{(att.file.size / 1024).toFixed(0)} KB</span>
                      <button onClick={() => setSendAttachments(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: theme.textMuted }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <label style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                    border: `1px dashed ${theme.border}`, borderRadius: '6px', cursor: 'pointer',
                    fontSize: '13px', color: theme.accent, background: 'transparent'
                  }}>
                    <Paperclip size={14} />
                    Add File
                    <input type="file" multiple style={{ display: 'none' }} onChange={(e) => {
                      Array.from(e.target.files).forEach(file => {
                        const reader = new FileReader()
                        reader.onload = () => {
                          const base64 = reader.result.split(',')[1]
                          setSendAttachments(prev => [...prev, { file, name: file.name, base64 }])
                        }
                        reader.readAsDataURL(file)
                      })
                      e.target.value = ''
                    }} />
                  </label>
                </div>
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
