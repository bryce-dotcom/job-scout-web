import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { toast } from '../lib/toast'
import {
  Compass, Clock, MapPin, Play, Square, Coffee,
  ChevronDown, ChevronUp, ExternalLink, Navigation,
  CheckCircle, Timer, Briefcase, DollarSign, Star,
  AlertTriangle, Send, X, CreditCard, Banknote, Smartphone,
  Loader2, ShieldCheck, Shield, Search, FileText, Lock,
  Camera
} from 'lucide-react'
import VictorVerify from './agents/victor/VictorVerify'
import ArnieFloatingPanel from '../components/ArnieFloatingPanel'

// Stripe card payment form (rendered inside Elements provider)
function StripeCardForm({ theme, amount, onSuccess, onError }) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setProcessing(true)
    setError(null)

    const { error: submitError } = await elements.submit()
    if (submitError) {
      setError(submitError.message)
      setProcessing(false)
      return
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: 'if_required',
    })

    if (confirmError) {
      setError(confirmError.message)
      onError?.(confirmError.message)
      setProcessing(false)
    } else if (paymentIntent?.status === 'succeeded') {
      onSuccess?.(paymentIntent)
    } else {
      setError('Payment was not completed. Please try again.')
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement options={{
        layout: 'tabs',
        defaultValues: { billingDetails: { address: { country: 'US' } } }
      }} />
      {error && (
        <div style={{
          marginTop: '12px', padding: '10px 14px', backgroundColor: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', color: '#ef4444',
          fontSize: '13px', fontWeight: '500'
        }}>
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || processing}
        style={{
          width: '100%', marginTop: '16px', padding: '18px',
          background: processing ? theme.bg : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
          border: 'none', borderRadius: '14px',
          color: processing ? theme.textMuted : '#fff',
          fontSize: '17px', fontWeight: '700',
          cursor: processing ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
          minHeight: '56px'
        }}
      >
        {processing ? (
          <><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Processing...</>
        ) : (
          <><ShieldCheck size={20} /> Pay ${parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</>
        )}
      </button>
      <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '11px', color: theme.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
        <ShieldCheck size={12} /> Secure payment powered by Stripe
      </div>
    </form>
  )
}

export default function FieldScout() {
  const isMobile = useIsMobile()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const companyId = useStore((s) => s.companyId)
  const company = useStore((s) => s.company)
  const user = useStore((s) => s.user)
  const jobs = useStore((s) => s.jobs)
  const employees = useStore((s) => s.employees)

  const [currentTime, setCurrentTime] = useState(new Date())
  const [activeEntry, setActiveEntry] = useState(null)
  const [todayEntries, setTodayEntries] = useState([])
  const [expandedJob, setExpandedJob] = useState(null)
  const [clockingIn, setClockingIn] = useState(false)
  const [clockingOut, setClockingOut] = useState(false)
  const [gpsStatus, setGpsStatus] = useState(null) // null | 'capturing' | 'done' | 'failed'
  const [selectedJobId, setSelectedJobId] = useState('')
  const [jobSections, setJobSections] = useState({})
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapError, setMapError] = useState(false)
  const [jobCoords, setJobCoords] = useState({})
  const [userLocation, setUserLocation] = useState(null)

  // Payment collection
  const [paymentJob, setPaymentJob] = useState(null)
  const [paymentInvoice, setPaymentInvoice] = useState(null) // linked invoice for payment
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Cash', reference: '', notes: '' })
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)

  // Stripe card payment state
  const [stripePromise, setStripePromise] = useState(null)
  const [clientSecret, setClientSecret] = useState(null)
  const [stripeLoading, setStripeLoading] = useState(false)
  const [stripeError, setStripeError] = useState(null)
  const [paymentIntentId, setPaymentIntentId] = useState(null)

  // Google review & settings
  const settings = useStore((s) => s.settings)
  const [googleReviewUrl, setGoogleReviewUrl] = useState('')
  const [reviewSent, setReviewSent] = useState(new Set())

  // Victor verification
  const [victorModal, setVictorModal] = useState(null) // null | { type: 'daily' } | { type: 'completion', jobId }
  const [showDailyCheckPrompt, setShowDailyCheckPrompt] = useState(false)
  const [verifiedJobs, setVerifiedJobs] = useState(new Set()) // job IDs with passing verification
  const [clockOutBlocked, setClockOutBlocked] = useState(false)
  const [hasDailyVerification, setHasDailyVerification] = useState(false) // field roles need this

  // Invoice presentation
  const [invoiceJob, setInvoiceJob] = useState(null) // job to show invoice for
  const [invoiceData, setInvoiceData] = useState(null) // { invoice, lines }
  const [invoiceLoading, setInvoiceLoading] = useState(false)

  // Job search (for clock-in when no today's jobs)
  const [jobSearchQuery, setJobSearchQuery] = useState('')

  // Receipt capture
  const [receiptUploading, setReceiptUploading] = useState(null) // job ID being uploaded
  const receiptInputRef = useRef(null)
  const [receiptJobId, setReceiptJobId] = useState(null)

  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const geocodeCacheRef = useRef({})
  const jobCardRefs = useRef({})

  const currentEmployee = employees.find(e => e.email === user?.email)

  // Determine if user is a field role that requires Victor verification before clock-out
  const fieldRoles = ['field tech', 'installer', 'project manager', 'technician', 'foreman', 'crew lead']
  const isFieldRole = currentEmployee?.role && fieldRoles.includes(currentEmployee.role.toLowerCase())

  // Today's jobs — only show jobs assigned to this user (or unassigned)
  const todayStr = new Date().toDateString()
  const employeeName = currentEmployee?.name || ''
  const todaysJobs = jobs.filter(j => {
    if (!j.start_date) return false
    if (new Date(j.start_date).toDateString() !== todayStr) return false
    // Show if assigned to this employee, or unassigned
    if (!j.assigned_team) return true
    return j.assigned_team.toLowerCase().includes(employeeName.toLowerCase())
  })

  // Sort: working first, then upcoming (Scheduled/In Progress), then completed
  const sortedJobs = [...todaysJobs].sort((a, b) => {
    const aWorking = activeEntry?.job_id === a.id ? -1 : 0
    const bWorking = activeEntry?.job_id === b.id ? -1 : 0
    if (aWorking !== bWorking) return aWorking - bWorking
    const statusOrder = { 'In Progress': 0, 'Scheduled': 1, 'Completed': 2, 'Cancelled': 3 }
    return (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1)
  })

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Fetch time entries
  const fetchEntries = useCallback(async () => {
    if (!companyId || !currentEmployee) return
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data } = await supabase
      .from('time_clock')
      .select('*')
      .eq('company_id', companyId)
      .eq('employee_id', currentEmployee.id)
      .gte('clock_in', todayStart.toISOString())
      .order('clock_in', { ascending: false })

    if (data) {
      setTodayEntries(data)
      const active = data.find(e => !e.clock_out)
      setActiveEntry(active || null)
    }
  }, [companyId, currentEmployee])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  // Fetch verification status for today's jobs
  const fetchVerifiedJobs = useCallback(async () => {
    if (!companyId || todaysJobs.length === 0) return
    const jobIds = todaysJobs.map(j => j.id)
    const { data } = await supabase
      .from('verification_reports')
      .select('job_id, score, grade')
      .eq('company_id', companyId)
      .eq('verification_type', 'completion')
      .in('job_id', jobIds)
      .gte('score', 60)
    if (data) {
      setVerifiedJobs(new Set(data.map(r => r.job_id)))
    }
  }, [companyId, todaysJobs.length])

  useEffect(() => { fetchVerifiedJobs() }, [fetchVerifiedJobs])

  // Fetch daily verification status for field roles
  useEffect(() => {
    if (!companyId || !currentEmployee || !isFieldRole) return
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    supabase
      .from('verification_reports')
      .select('id')
      .eq('company_id', companyId)
      .eq('verified_by', currentEmployee.id)
      .eq('verification_type', 'daily')
      .gte('created_at', todayStart.toISOString())
      .gte('score', 60)
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setHasDailyVerification(true)
      })
  }, [companyId, currentEmployee, isFieldRole])

  // Fetch invoice for a job (for presentation)
  const fetchInvoice = async (job) => {
    setInvoiceJob(job)
    setInvoiceLoading(true)
    setInvoiceData(null)
    try {
      const { data: invArr } = await supabase
        .from('invoices')
        .select('*')
        .eq('company_id', companyId)
        .eq('job_id', job.id)
        .order('created_at', { ascending: false })
        .limit(1)
      const inv = invArr?.[0] || null
      // Get job lines (work order items)
      const { data: jobLines } = await supabase
        .from('job_lines')
        .select('*, item:products_services(id, name, description)')
        .eq('job_id', job.id)
      setInvoiceData({ invoice: inv, lines: jobLines || [], fromJob: !inv })
    } catch (err) {
      console.error('Error fetching invoice:', err)
      setInvoiceData(null)
    }
    setInvoiceLoading(false)
  }

  // Load google review URL from settings store
  useEffect(() => {
    const setting = settings.find(s => s.key === 'google_review_url')
    if (setting?.value) {
      try { setGoogleReviewUrl(JSON.parse(setting.value)) } catch { setGoogleReviewUrl(setting.value) }
    }
  }, [settings])

  // Fetch job sections for expanded jobs
  const fetchJobSections = async (jobId) => {
    if (jobSections[jobId]) return
    const { data } = await supabase
      .from('job_sections')
      .select('*, assigned_employee:employees!job_sections_assigned_to_fkey(id, name)')
      .eq('job_id', jobId)
      .order('sort_order')
    if (data) setJobSections(prev => ({ ...prev, [jobId]: data }))
  }

  // Greeting
  const getGreeting = () => {
    const h = currentTime.getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const firstName = (user?.name || user?.email || 'Scout').split(' ')[0]

  // GPS helper
  const getLocation = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: null, lng: null, address: null })
        return
      }
      setGpsStatus('capturing')
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            )
            const data = await res.json()
            setGpsStatus('done')
            resolve({
              lat: latitude,
              lng: longitude,
              address: data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
            })
          } catch {
            setGpsStatus('done')
            resolve({ lat: latitude, lng: longitude, address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` })
          }
        },
        () => {
          setGpsStatus('failed')
          resolve({ lat: null, lng: null, address: null })
        },
        { timeout: 10000 }
      )
    })
  }

  // Clock in
  const handleClockIn = async (jobId) => {
    if (clockingIn) return
    setClockingIn(true)
    const location = await getLocation()
    try {
      const { error } = await supabase.from('time_clock').insert({
        company_id: companyId,
        employee_id: currentEmployee.id,
        job_id: jobId || null,
        clock_in: new Date().toISOString(),
        clock_in_lat: location.lat,
        clock_in_lng: location.lng,
        clock_in_address: location.address
      })
      if (error) throw error

      // Auto-update job status to In Progress when clocking in
      if (jobId) {
        await supabase
          .from('jobs')
          .update({ status: 'In Progress', updated_at: new Date().toISOString() })
          .eq('id', jobId)
          .eq('company_id', companyId)
          .in('status', ['Chillin', 'Scheduled'])
      }

      await fetchEntries()
    } catch (err) {
      alert('Error clocking in: ' + err.message)
    } finally {
      setClockingIn(false)
      setGpsStatus(null)
    }
  }

  // Mark job complete → requires Victor verification
  const handleMarkComplete = (jobId) => {
    setVictorModal({ type: 'completion', jobId, markComplete: true })
  }

  // Clock out
  const handleClockOut = async () => {
    if (!activeEntry || clockingOut) return
    // Block clock-out if clocked into a job that hasn't been verified
    if (activeEntry.job_id && !verifiedJobs.has(activeEntry.job_id)) {
      setClockOutBlocked(true)
      return
    }
    // Block field roles clocked in as General if they haven't done daily verification
    if (isFieldRole && !activeEntry.job_id && !hasDailyVerification) {
      setClockOutBlocked(true)
      return
    }
    setClockingOut(true)
    const location = await getLocation()
    const clockIn = new Date(activeEntry.clock_in)
    const clockOut = new Date()
    let totalHours = (clockOut - clockIn) / (1000 * 60 * 60)
    if (activeEntry.lunch_start && activeEntry.lunch_end) {
      totalHours -= (new Date(activeEntry.lunch_end) - new Date(activeEntry.lunch_start)) / (1000 * 60 * 60)
    }
    try {
      const { error } = await supabase
        .from('time_clock')
        .update({
          clock_out: clockOut.toISOString(),
          clock_out_lat: location.lat,
          clock_out_lng: location.lng,
          clock_out_address: location.address,
          total_hours: Math.round(totalHours * 100) / 100
        })
        .eq('id', activeEntry.id)
      if (error) throw error
      await fetchEntries()
      setShowDailyCheckPrompt(true)
    } catch (err) {
      alert('Error clocking out: ' + err.message)
    } finally {
      setClockingOut(false)
      setGpsStatus(null)
    }
  }

  // Lunch
  const handleLunchStart = async () => {
    if (!activeEntry) return
    await supabase.from('time_clock').update({ lunch_start: new Date().toISOString() }).eq('id', activeEntry.id)
    await fetchEntries()
  }
  const handleLunchEnd = async () => {
    if (!activeEntry) return
    await supabase.from('time_clock').update({ lunch_end: new Date().toISOString() }).eq('id', activeEntry.id)
    await fetchEntries()
  }

  // Collect Payment — find or create invoice, then open portal for card/ACH payment
  const openPaymentModal = async (job) => {
    setPaymentJob(job)
    setPaymentForm({ amount: '', method: 'Cash', reference: '', notes: '' })
    setPaymentSuccess(false)
    setPaymentInvoice(null)
    setStripeLoading(true)

    try {
      // 1. Find existing invoice for this job
      const { data: invArr } = await supabase
        .from('invoices')
        .select('id, invoice_id, amount, payment_status, job_id')
        .eq('company_id', companyId)
        .eq('job_id', job.id)
        .in('payment_status', ['Pending', 'Partial', 'Partially Paid', 'Sent', 'Open'])
        .order('created_at', { ascending: false })
        .limit(1)

      let invoice = invArr?.[0] || null

      // 2. If no invoice, auto-create one from the job
      if (!invoice) {
        const jobTotal = parseFloat(job.job_total) || 0
        // Get business unit from settings
        const storeSettings = useStore.getState().settings
        const buSetting = storeSettings.find(s => s.key === 'business_units')
        let buName = ''
        if (buSetting?.value) {
          try {
            const units = JSON.parse(buSetting.value)
            if (units.length === 1) buName = units[0].name
          } catch {}
        }

        const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`
        const { data: newInv } = await supabase
          .from('invoices')
          .insert({
            company_id: companyId,
            invoice_id: invoiceNumber,
            job_id: job.id,
            customer_id: job.customer_id || null,
            amount: jobTotal,
            payment_status: 'Pending',
            business_unit: buName || null,
            job_description: job.job_title || null
          })
          .select()
          .single()
        invoice = newInv
      }

      if (invoice) {
        setPaymentInvoice(invoice)

        // Calculate balance
        const { data: existingPayments } = await supabase
          .from('payments')
          .select('amount')
          .eq('invoice_id', invoice.id)
          .eq('status', 'Completed')
        const paid = (existingPayments || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
        const balance = Math.max(0, (parseFloat(invoice.amount) || 0) - paid)
        if (balance > 0) {
          setPaymentForm(f => ({ ...f, amount: balance.toFixed(2) }))
        }
      }
    } catch (err) {
      console.error('Error setting up payment:', err)
    }
    setStripeLoading(false)
  }

  // Open portal for card/ACH payment — customer pays on their phone
  const handlePayWithPortal = async () => {
    if (!paymentInvoice) return
    setStripeLoading(true)
    try {
      // Create portal token for this invoice
      const { data: portalToken } = await supabase
        .from('customer_portal_tokens')
        .insert({
          document_type: 'invoice',
          document_id: paymentInvoice.id,
          company_id: companyId,
          customer_id: paymentInvoice.customer_id || paymentJob?.customer_id || null,
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select('token')
        .single()

      if (portalToken?.token) {
        const portalUrl = `https://jobscout.appsannex.com/portal/${portalToken.token}`
        window.open(portalUrl, '_blank')
        // Update invoice with portal token
        await supabase.from('invoices').update({ portal_token: portalToken.token }).eq('id', paymentInvoice.id)
      }
    } catch (err) {
      alert('Failed to open payment page: ' + err.message)
    }
    setStripeLoading(false)
  }

  // Record cash/check payment (manual, tied to invoice)
  const handleRecordPayment = async () => {
    if (!paymentJob || !paymentForm.amount) return
    setPaymentSaving(true)
    try {
      const paymentData = {
        company_id: companyId,
        job_id: paymentJob.id,
        customer_id: paymentJob.customer_id,
        amount: parseFloat(paymentForm.amount),
        method: paymentForm.method,
        status: 'Completed',
        date: new Date().toISOString(),
        notes: paymentForm.notes || `Collected on-site by ${firstName}${paymentForm.reference ? ` — Ref: ${paymentForm.reference}` : ''}`
      }
      if (paymentInvoice?.id) paymentData.invoice_id = paymentInvoice.id
      await supabase.from('payments').insert(paymentData)

      // Update invoice payment status + amount if it was $0
      if (paymentInvoice?.id) {
        let invAmt = parseFloat(paymentInvoice.amount) || 0
        // If invoice was auto-created with $0 amount, update it to the payment amount
        if (invAmt === 0 && parseFloat(paymentForm.amount) > 0) {
          invAmt = parseFloat(paymentForm.amount)
          await supabase.from('invoices').update({ amount: invAmt }).eq('id', paymentInvoice.id)
        }
        const { data: allPayments } = await supabase
          .from('payments')
          .select('amount')
          .eq('invoice_id', paymentInvoice.id)
          .eq('status', 'Completed')
        const totalPaid = (allPayments || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
        const newStatus = totalPaid >= invAmt ? 'Paid' : 'Partially Paid'
        await supabase.from('invoices').update({ payment_status: newStatus }).eq('id', paymentInvoice.id)
      }

      setPaymentSuccess(true)
      setTimeout(() => closePaymentModal(), 1500)
    } catch (err) {
      alert('Error recording payment: ' + err.message)
    } finally {
      setPaymentSaving(false)
    }
  }

  // Clean up stripe state when modal closes
  const closePaymentModal = () => {
    setPaymentJob(null)
    setPaymentInvoice(null)
    setPaymentForm({ amount: '', method: 'Cash', reference: '', notes: '' })
    setPaymentSuccess(false)
    setClientSecret(null)
    setStripePromise(null)
    setStripeError(null)
    setPaymentIntentId(null)
  }

  // Share Google review link
  const shareReviewLink = (job) => {
    if (!googleReviewUrl) {
      toast.error('Set your Google Review URL in Settings → My Money first')
      return
    }
    const msg = `Thank you for choosing us! We'd love your feedback. Please leave us a review: ${googleReviewUrl}`
    if (navigator.share) {
      navigator.share({ title: 'Leave us a review!', text: msg, url: googleReviewUrl }).catch(() => {})
    } else if (job.customer?.phone) {
      window.open(`sms:${job.customer.phone}?body=${encodeURIComponent(msg)}`, '_blank')
    } else {
      window.open(googleReviewUrl, '_blank')
    }
    setReviewSent(prev => new Set(prev).add(job.id))
  }

  // Receipt capture — uploads photo to storage and creates expense record for job costing
  const handleReceiptCapture = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !receiptJobId) return
    setReceiptUploading(receiptJobId)

    try {
      const timestamp = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `jobs/${receiptJobId}/receipts/${timestamp}_${safeName}`

      const { error: uploadErr } = await supabase.storage
        .from('project-documents')
        .upload(storagePath, file, { contentType: file.type })

      if (uploadErr) {
        toast.error('Receipt upload failed: ' + uploadErr.message)
        return
      }

      const { data: urlData } = supabase.storage.from('project-documents').getPublicUrl(storagePath)

      const { error: insertErr } = await supabase.from('expenses').insert([{
        company_id: companyId,
        job_id: receiptJobId,
        amount: 0,
        category: 'Materials',
        date: new Date().toISOString().split('T')[0],
        description: 'Receipt capture — Field Scout',
        receipt_url: urlData.publicUrl,
        receipt_storage_path: storagePath,
        source: 'receipt'
      }])

      if (insertErr) {
        toast.error('Failed to save expense: ' + insertErr.message)
      } else {
        toast.success('Receipt captured — edit amount in Expenses')
      }
    } catch (err) {
      toast.error('Receipt upload error: ' + err.message)
    } finally {
      setReceiptUploading(null)
      setReceiptJobId(null)
      if (receiptInputRef.current) receiptInputRef.current.value = ''
    }
  }

  const triggerReceiptCapture = (jobId) => {
    setReceiptJobId(jobId)
    setTimeout(() => receiptInputRef.current?.click(), 50)
  }

  // Timer formatting
  const formatElapsed = (clockIn) => {
    const diff = Math.max(0, Math.floor((currentTime - new Date(clockIn)) / 1000))
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    const s = diff % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const formatDuration = (hours) => {
    if (!hours) return '0h 0m'
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    return `${h}h ${m}m`
  }

  const isOnLunch = activeEntry?.lunch_start && !activeEntry?.lunch_end
  const elapsedHours = activeEntry ? (currentTime - new Date(activeEntry.clock_in)) / (1000 * 60 * 60) : 0
  const activeJobName = activeEntry?.job_id
    ? (jobs.find(j => j.id === activeEntry.job_id)?.job_title || 'Job')
    : 'General'

  // Quick stats
  const jobsToday = todaysJobs.length
  const hoursAllotted = todaysJobs.reduce((sum, j) => sum + (parseFloat(j.hours_allotted) || 0), 0)
  const completedToday = todaysJobs.filter(j => j.status === 'Completed').length

  // Open address in native maps
  const openMaps = (address) => {
    if (!address) return
    const encoded = encodeURIComponent(address)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const url = isIOS ? `maps://maps.apple.com/?q=${encoded}` : `https://www.google.com/maps/search/?api=1&query=${encoded}`
    window.open(url, '_blank')
  }

  // Status pill colors
  const statusColor = (status) => {
    const colors = {
      'Scheduled': { bg: 'rgba(90,155,213,0.15)', text: '#5a9bd5' },
      'In Progress': { bg: 'rgba(74,124,89,0.15)', text: '#4a7c59' },
      'Completed': { bg: 'rgba(107,114,128,0.15)', text: '#6b7280' },
      'Cancelled': { bg: 'rgba(239,68,68,0.1)', text: '#ef4444' }
    }
    return colors[status] || { bg: theme.accentBg, text: theme.accent }
  }

  // ============== MAP SECTION ==============
  // Geocode job addresses for map pins
  const geocodeAddress = async (address) => {
    if (!address) return null
    if (geocodeCacheRef.current[address]) return geocodeCacheRef.current[address]
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
      )
      const data = await res.json()
      if (data?.[0]) {
        const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
        geocodeCacheRef.current[address] = coords
        return coords
      }
    } catch { /* ignore */ }
    return null
  }

  // Parse gps_location field "lat,lng"
  const parseGpsLocation = (gpsStr) => {
    if (!gpsStr) return null
    const parts = gpsStr.split(',').map(s => parseFloat(s.trim()))
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { lat: parts[0], lng: parts[1] }
    }
    return null
  }

  // Geocode all jobs sequentially with rate limiting
  useEffect(() => {
    if (todaysJobs.length === 0) return
    let cancelled = false

    const geocodeAll = async () => {
      const newCoords = {}
      for (const job of todaysJobs) {
        if (cancelled) break
        // Try gps_location first
        const gps = parseGpsLocation(job.gps_location)
        if (gps) {
          newCoords[job.id] = gps
          continue
        }
        // Try job address or customer address
        const addr = job.job_address || job.customer?.address
        if (!addr) continue
        if (geocodeCacheRef.current[addr]) {
          newCoords[job.id] = geocodeCacheRef.current[addr]
          continue
        }
        // Rate limit: 1 req/sec
        await new Promise(r => setTimeout(r, 1100))
        if (cancelled) break
        const coords = await geocodeAddress(addr)
        if (coords) newCoords[job.id] = coords
      }
      if (!cancelled) setJobCoords(prev => ({ ...prev, ...newCoords }))
    }
    geocodeAll()
    return () => { cancelled = true }
  }, [todaysJobs.length])

  // Get user location for map
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { timeout: 10000 }
      )
    }
  }, [])

  // Load Leaflet CSS & JS from CDN
  useEffect(() => {
    if (todaysJobs.length === 0) return
    if (document.getElementById('leaflet-css')) {
      setMapLoaded(true)
      return
    }

    const link = document.createElement('link')
    link.id = 'leaflet-css'
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.id = 'leaflet-js'
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => setMapLoaded(true)
    script.onerror = () => setMapError(true)
    document.head.appendChild(script)
  }, [todaysJobs.length])

  // Initialize map when Leaflet loaded + coords available
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || typeof window.L === 'undefined') return
    const coordEntries = Object.entries(jobCoords)
    if (coordEntries.length === 0 && !userLocation) return

    // Cleanup previous map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    const L = window.L
    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18
    }).addTo(map)

    const bounds = []

    // Job pins
    coordEntries.forEach(([jobId, coords]) => {
      const job = jobs.find(j => j.id === parseInt(jobId))
      if (!job) return
      const isActive = activeEntry?.job_id === parseInt(jobId)
      const marker = L.circleMarker([coords.lat, coords.lng], {
        radius: 8,
        fillColor: isActive ? '#22c55e' : theme.accent,
        color: '#fff',
        weight: 2,
        fillOpacity: 0.9
      }).addTo(map)
      marker.bindTooltip(job.job_title || job.customer?.name || 'Job', { direction: 'top', offset: [0, -10] })
      marker.on('click', () => {
        setExpandedJob(parseInt(jobId))
        jobCardRefs.current[jobId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      bounds.push([coords.lat, coords.lng])
    })

    // User location
    if (userLocation) {
      L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 8,
        fillColor: '#3b82f6',
        color: '#fff',
        weight: 3,
        fillOpacity: 1
      }).addTo(map).bindTooltip('You', { direction: 'top', offset: [0, -10] })
      bounds.push([userLocation.lat, userLocation.lng])
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 })
    }

    mapInstanceRef.current = map
  }, [mapLoaded, jobCoords, userLocation, activeEntry?.job_id])

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // ============== RENDER ==============
  return (
    <div style={{ padding: '16px', maxWidth: '600px', margin: '0 auto', overflowX: 'hidden' }}>

      {/* Hidden file input for receipt camera */}
      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleReceiptCapture}
        style={{ display: 'none' }}
      />

      {/* ===== SECTION 1: HEADER ===== */}
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
          <Compass size={24} style={{ color: theme.accent }} />
          <h1 style={{ fontSize: isMobile ? '20px' : '22px', fontWeight: '700', color: theme.text, margin: 0 }}>
            {getGreeting()}, {firstName}
          </h1>
        </div>
        <div style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '8px' }}>
          {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
        <div style={{
          fontSize: '36px',
          fontWeight: '700',
          fontFamily: 'monospace',
          color: theme.accent,
          letterSpacing: '2px'
        }}>
          {currentTime.toLocaleTimeString()}
        </div>
      </div>

      {/* ===== SECTION 2: ACTIVE CLOCK BANNER ===== */}
      {activeEntry && (
        <div style={{
          background: isOnLunch
            ? 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)'
            : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '16px',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Pulsing dot */}
          <div style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: '#fff',
            animation: 'fieldScoutPulse 2s infinite'
          }} />

          <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '4px' }}>
            {isOnLunch ? 'On Lunch Break' : 'Currently Working'}
          </div>
          <div style={{
            fontSize: '42px',
            fontWeight: '900',
            fontFamily: 'monospace',
            lineHeight: 1,
            marginBottom: '4px'
          }}>
            {formatElapsed(activeEntry.clock_in)}
          </div>
          <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>
            {activeJobName}
          </div>

          {/* Progress bar (8-hour day) */}
          <div style={{
            height: '6px',
            backgroundColor: 'rgba(255,255,255,0.3)',
            borderRadius: '3px',
            marginBottom: '16px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${Math.min(elapsedHours / 8 * 100, 100)}%`,
              height: '100%',
              backgroundColor: elapsedHours > 8 ? '#ef4444' : '#fff',
              borderRadius: '3px',
              transition: 'width 1s linear'
            }} />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {!isOnLunch ? (
              <button
                onClick={handleLunchStart}
                disabled={!!activeEntry.lunch_end}
                style={{
                  flex: 1,
                  padding: '14px',
                  backgroundColor: activeEntry.lunch_end ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.25)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: activeEntry.lunch_end ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  minHeight: '48px',
                  opacity: activeEntry.lunch_end ? 0.6 : 1
                }}
              >
                <Coffee size={18} />
                {activeEntry.lunch_end ? 'Lunch Done' : 'Take Lunch'}
              </button>
            ) : (
              <button
                onClick={handleLunchEnd}
                style={{
                  flex: 1,
                  padding: '14px',
                  backgroundColor: 'rgba(255,255,255,0.3)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  minHeight: '48px'
                }}
              >
                <Coffee size={18} />
                End Lunch
              </button>
            )}
            <button
              onClick={handleClockOut}
              disabled={clockingOut}
              style={{
                flex: 1,
                padding: '14px',
                backgroundColor: ((activeEntry?.job_id && !verifiedJobs.has(activeEntry.job_id)) || (isFieldRole && !activeEntry?.job_id && !hasDailyVerification))
                  ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.9)',
                border: 'none',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '15px',
                fontWeight: '600',
                cursor: clockingOut ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                minHeight: '48px'
              }}
            >
              {(activeEntry?.job_id && !verifiedJobs.has(activeEntry.job_id)) || (isFieldRole && !activeEntry?.job_id && !hasDailyVerification) ? (
                <><Lock size={18} /> Clock Out</>
              ) : (
                <><Square size={18} /> {clockingOut ? 'Saving...' : 'Clock Out'}</>
              )}
            </button>
          </div>

          {/* Clock-out blocked warning */}
          {clockOutBlocked && (
            <div style={{
              marginTop: '12px',
              padding: '14px',
              backgroundColor: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <Lock size={20} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#ef4444', marginBottom: '4px' }}>
                  Verify before clocking out
                </div>
                <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '10px' }}>
                  {activeEntry.job_id
                    ? 'Complete a Victor verification on your active job before clocking out.'
                    : 'Field crew must complete a daily Victor verification before clocking out.'}
                </div>
                <button
                  onClick={() => {
                    setClockOutBlocked(false)
                    if (activeEntry.job_id) {
                      handleMarkComplete(activeEntry.job_id)
                    } else {
                      setVictorModal({ type: 'daily', jobId: null })
                    }
                  }}
                  style={{
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    minHeight: '44px'
                  }}
                >
                  <Shield size={16} />
                  {activeEntry.job_id ? 'Verify Now' : 'Run Daily Check'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== NO-JOB WARNING ===== */}
      {activeEntry && !activeEntry.job_id && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          marginBottom: '16px',
          backgroundColor: 'rgba(234,179,8,0.12)',
          border: '1px solid rgba(234,179,8,0.4)',
          borderRadius: '12px'
        }}>
          <AlertTriangle size={20} style={{ color: '#ca8a04', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#92400e' }}>
              You're clocked in without a job
            </div>
            <div style={{ fontSize: '12px', color: '#a16207', marginTop: '2px' }}>
              Select a job below and clock in to it for accurate time tracking.
            </div>
          </div>
        </div>
      )}

      {/* ===== SECTION 3: QUICK STATS ===== */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px'
      }}>
        {[
          { label: 'Jobs Today', value: jobsToday, icon: Briefcase },
          { label: 'Hours Allotted', value: hoursAllotted ? `${hoursAllotted}h` : '—', icon: Timer },
          { label: 'Completed', value: completedToday, icon: CheckCircle }
        ].map((stat) => (
          <div key={stat.label} style={{
            flex: 1,
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            padding: '10px 8px',
            textAlign: 'center'
          }}>
            <stat.icon size={16} style={{ color: theme.accent, marginBottom: '4px' }} />
            <div style={{ fontSize: '20px', fontWeight: '700', color: theme.text, lineHeight: 1.2 }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '2px' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* ===== UNVERIFIED COMPLETED JOBS WARNING ===== */}
      {(() => {
        const unverifiedCompleted = todaysJobs.filter(j =>
          j.status === 'Completed' && !verifiedJobs.has(j.id)
        )
        const isLead = unverifiedCompleted.some(j =>
          j.job_lead_id && currentEmployee && j.job_lead_id === currentEmployee.id
        )
        if (unverifiedCompleted.length === 0) return null
        return (
          <div style={{
            padding: '14px 16px',
            marginBottom: '16px',
            backgroundColor: 'rgba(239,68,68,0.08)',
            border: '2px solid rgba(239,68,68,0.4)',
            borderRadius: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <AlertTriangle size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#ef4444' }}>
                {isLead ? 'You are the Job Lead — verification required!' : 'Completed jobs need verification'}
              </div>
            </div>
            <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '10px' }}>
              {unverifiedCompleted.length} completed job{unverifiedCompleted.length > 1 ? 's' : ''} {unverifiedCompleted.length > 1 ? 'have' : 'has'} not been verified.
              {isLead ? ' As the lead, you must photograph each line item and run Victor verification before clocking out.' : ' The job lead must complete verification with line-item photos.'}
            </div>
            {unverifiedCompleted.map(j => (
              <button
                key={j.id}
                onClick={() => handleMarkComplete(j.id)}
                style={{
                  width: '100%',
                  marginBottom: '6px',
                  padding: '10px 14px',
                  background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  minHeight: '44px'
                }}
              >
                <Shield size={16} />
                Verify: {j.job_title || j.job_id}
              </button>
            ))}
          </div>
        )
      })()}

      {/* ===== DAILY CHECK PROMPT (after clock-out) ===== */}
      {showDailyCheckPrompt && (
        <div style={{
          backgroundColor: 'rgba(168,85,247,0.08)',
          border: '1px solid rgba(168,85,247,0.3)',
          borderRadius: '14px',
          padding: '16px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <Shield size={22} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '2px' }}>
              Day complete — run end-of-day check?
            </div>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>
              Victor will verify your truck, tools, and site are good to go.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={() => { setShowDailyCheckPrompt(false); setVictorModal({ type: 'daily', jobId: activeEntry?.job_id || null }) }}
              style={{
                padding: '8px 14px',
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                border: 'none', borderRadius: '8px',
                color: '#fff', fontSize: '12px', fontWeight: '600',
                cursor: 'pointer', whiteSpace: 'nowrap'
              }}
            >
              Run Check
            </button>
            <button
              onClick={() => setShowDailyCheckPrompt(false)}
              style={{
                padding: '6px 14px',
                background: 'transparent',
                border: `1px solid ${theme.border}`, borderRadius: '8px',
                color: theme.textMuted, fontSize: '12px', fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* ===== STANDALONE VICTOR BUTTON ===== */}
      <button
        onClick={() => setVictorModal({ type: 'completion', jobId: activeEntry?.job_id || null })}
        style={{
          width: '100%',
          padding: '14px',
          background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
          border: 'none',
          borderRadius: '12px',
          color: '#fff',
          fontSize: '15px',
          fontWeight: '600',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          marginBottom: '16px',
          minHeight: '48px'
        }}
      >
        <Shield size={20} />
        Open Victor Verification
      </button>

      {/* ===== SECTION 4: TODAY'S JOBS ===== */}
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Briefcase size={18} style={{ color: theme.accent }} />
          Today's Jobs
        </h2>

        {sortedJobs.length === 0 ? (
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: '12px',
            padding: '32px 20px',
            textAlign: 'center',
            color: theme.textMuted
          }}>
            No jobs scheduled for today
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {sortedJobs.map(job => {
              const isActive = activeEntry?.job_id === job.id
              const isExpanded = expandedJob === job.id
              const sc = statusColor(job.status)
              const address = job.job_address || job.customer?.address
              const sections = jobSections[job.id]

              return (
                <div
                  key={job.id}
                  ref={el => jobCardRefs.current[job.id] = el}
                  style={{
                    backgroundColor: theme.bgCard,
                    border: `1px solid ${isActive ? '#22c55e' : theme.border}`,
                    borderLeft: isActive ? '4px solid #22c55e' : `1px solid ${theme.border}`,
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: isActive ? '0 0 20px rgba(34,197,94,0.15)' : theme.shadow,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Card header — tappable */}
                  <button
                    onClick={() => {
                      const next = isExpanded ? null : job.id
                      setExpandedJob(next)
                      if (next) fetchJobSections(next)
                    }}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      minHeight: '44px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '2px' }}>
                          {job.job_title || job.job_id}
                        </div>
                        <div style={{ fontSize: '13px', color: theme.textMuted }}>
                          {job.customer?.name}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: sc.bg,
                          color: sc.text
                        }}>
                          {isActive ? 'Working' : job.status}
                        </span>
                        {isExpanded ? <ChevronUp size={16} color={theme.textMuted} /> : <ChevronDown size={16} color={theme.textMuted} />}
                      </div>
                    </div>

                    {/* Address */}
                    {address && (
                      <div
                        onClick={(e) => { e.stopPropagation(); openMaps(address) }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          color: '#3b82f6',
                          cursor: 'pointer'
                        }}
                      >
                        <MapPin size={12} />
                        <span style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {address}
                        </span>
                      </div>
                    )}

                    {/* Meta row */}
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {job.hours_allotted && (
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          backgroundColor: theme.accentBg,
                          color: theme.accent,
                          borderRadius: '4px',
                          fontWeight: '500'
                        }}>
                          {job.hours_allotted}h allotted
                        </span>
                      )}
                      {job.start_date && (
                        <span style={{ fontSize: '11px', color: theme.textMuted }}>
                          {new Date(job.start_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    {/* Notes preview */}
                    {job.notes && !isExpanded && (
                      <div style={{
                        fontSize: '12px',
                        color: theme.textMuted,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: '1.4'
                      }}>
                        {job.notes}
                      </div>
                    )}
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div style={{
                      padding: '0 16px 16px',
                      borderTop: `1px solid ${theme.border}`
                    }}>
                      {/* Full notes */}
                      {job.notes && (
                        <div style={{
                          padding: '12px 0',
                          fontSize: '13px',
                          color: theme.textSecondary,
                          lineHeight: '1.5',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {job.notes}
                        </div>
                      )}

                      {/* Job details */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                        {job.customer?.phone && (
                          <a href={`tel:${job.customer.phone}`} style={{
                            fontSize: '12px',
                            color: '#3b82f6',
                            textDecoration: 'none',
                            padding: '4px 10px',
                            backgroundColor: 'rgba(59,130,246,0.1)',
                            borderRadius: '6px'
                          }}>
                            Call Customer
                          </a>
                        )}
                      </div>

                      {/* Job sections */}
                      {sections && sections.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px' }}>
                            Job Sections
                          </div>
                          {sections.map(sec => (
                            <div key={sec.id} style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '6px 10px',
                              backgroundColor: theme.bg,
                              borderRadius: '6px',
                              marginBottom: '4px',
                              fontSize: '13px'
                            }}>
                              <span style={{ color: theme.text }}>{sec.section_name}</span>
                              <span style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                backgroundColor: sec.status === 'Completed' ? 'rgba(34,197,94,0.15)' : 'rgba(90,155,213,0.15)',
                                color: sec.status === 'Completed' ? '#22c55e' : '#5a9bd5'
                              }}>
                                {sec.status || 'Pending'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Actions ── */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

                        {/* Primary: Clock In (if not clocked in) */}
                        {!activeEntry && (
                          <button
                            onClick={() => handleClockIn(job.id)}
                            disabled={clockingIn}
                            style={{
                              width: '100%', padding: '16px', height: '54px',
                              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                              border: 'none', borderRadius: '12px', color: '#fff',
                              fontSize: '16px', fontWeight: '700',
                              cursor: clockingIn ? 'wait' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                            }}
                          >
                            <Play size={20} />
                            {clockingIn ? 'Capturing location...' : 'Clock In to This Job'}
                          </button>
                        )}

                        {/* Row: Navigate + Work Order */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {address && (
                            <button
                              onClick={() => openMaps(address)}
                              style={{
                                flex: 1, padding: '12px',
                                backgroundColor: theme.accentBg,
                                border: `1px solid ${theme.accent}`,
                                borderRadius: '10px', color: theme.accent,
                                fontSize: '14px', fontWeight: '500', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                minHeight: '44px'
                              }}
                            >
                              <Navigation size={16} /> Navigate
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/jobs/${job.id}`)}
                            style={{
                              flex: 1, padding: '12px',
                              backgroundColor: 'transparent',
                              border: `1px solid ${theme.border}`,
                              borderRadius: '10px', color: theme.textSecondary,
                              fontSize: '14px', fontWeight: '500', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                              minHeight: '44px'
                            }}
                          >
                            <FileText size={16} /> Work Order
                          </button>
                        </div>

                        {/* Primary: Collect Payment */}
                        <button
                          onClick={() => openPaymentModal(job)}
                          style={{
                            width: '100%', padding: '14px',
                            background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                            border: 'none', borderRadius: '10px', color: '#fff',
                            fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            minHeight: '48px'
                          }}
                        >
                          <DollarSign size={18} /> Collect Payment
                        </button>

                        {/* Complete Job */}
                        {job.status !== 'Completed' && (
                          <button
                            onClick={() => handleMarkComplete(job.id)}
                            style={{
                              width: '100%', padding: '12px',
                              background: verifiedJobs.has(job.id)
                                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                                : 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                              border: 'none', borderRadius: '10px', color: '#fff',
                              fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                              minHeight: '44px'
                            }}
                          >
                            {verifiedJobs.has(job.id)
                              ? <><CheckCircle size={16} /> Verified — Complete</>
                              : <><Shield size={16} /> Complete Job</>}
                          </button>
                        )}

                        {/* Secondary row: Receipt + Review */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => triggerReceiptCapture(job.id)}
                            disabled={receiptUploading === job.id}
                            style={{
                              flex: 1, padding: '10px',
                              backgroundColor: 'transparent',
                              border: `1px solid ${theme.border}`,
                              borderRadius: '10px',
                              color: theme.textSecondary,
                              fontSize: '13px', fontWeight: '500',
                              cursor: receiptUploading === job.id ? 'wait' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                              minHeight: '44px'
                            }}
                          >
                            <Camera size={14} />
                            {receiptUploading === job.id ? 'Uploading...' : 'Receipt Photo'}
                          </button>
                          <button
                            onClick={() => shareReviewLink(job)}
                            style={{
                              flex: 1, padding: '10px',
                              backgroundColor: reviewSent.has(job.id) ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                              border: `1px solid ${reviewSent.has(job.id) ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                              borderRadius: '10px',
                              color: reviewSent.has(job.id) ? '#16a34a' : '#d97706',
                              fontSize: '13px', fontWeight: '500', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                              minHeight: '44px'
                            }}
                          >
                            <Star size={14} />
                            {reviewSent.has(job.id) ? 'Review Sent' : 'Get Review'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ===== SECTION 5: MAP ===== */}
      {todaysJobs.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={18} style={{ color: theme.accent }} />
            Job Locations
          </h2>

          {mapError ? (
            // Fallback: address list
            <div style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '8px' }}>
                Map unavailable — job addresses:
              </div>
              {todaysJobs.map(job => {
                const addr = job.job_address || job.customer?.address
                if (!addr) return null
                return (
                  <div
                    key={job.id}
                    onClick={() => openMaps(addr)}
                    style={{
                      padding: '8px 0',
                      borderBottom: `1px solid ${theme.border}`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <MapPin size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text }}>
                        {job.job_title || job.job_id}
                      </div>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>{addr}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div
              ref={mapRef}
              style={{
                width: '100%',
                height: '250px',
                borderRadius: '12px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.bg,
                overflow: 'hidden'
              }}
            />
          )}
        </div>
      )}

      {/* ===== SECTION 6: STANDALONE CLOCK-IN ===== */}
      {!activeEntry && (() => {
        const hasTodaysJobs = todaysJobs.length > 0
        const searchResults = !hasTodaysJobs && jobSearchQuery.trim().length >= 2
          ? jobs.filter(j => {
              const q = jobSearchQuery.toLowerCase()
              return (
                (j.status === 'Scheduled' || j.status === 'In Progress' || j.status === 'Completed' || j.status === 'Complete') &&
                (
                  (j.job_title || '').toLowerCase().includes(q) ||
                  (j.job_id || '').toString().toLowerCase().includes(q) ||
                  (j.customer?.name || j.customer_name || '').toLowerCase().includes(q) ||
                  (j.job_address || '').toLowerCase().includes(q)
                )
              )
            }).slice(0, 10)
          : []
        const selectedSearchJob = !hasTodaysJobs && selectedJobId
          ? jobs.find(j => String(j.id) === String(selectedJobId))
          : null

        return (
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px'
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} style={{ color: theme.accent }} />
              Clock In
            </h2>

            {hasTodaysJobs ? (
              /* Dropdown for today's jobs */
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: theme.bg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '10px',
                  color: theme.text,
                  fontSize: '15px',
                  marginBottom: '12px',
                  minHeight: '44px'
                }}
              >
                <option value="">General — No specific job</option>
                {todaysJobs.map(job => (
                  <option key={job.id} value={job.id}>
                    {job.job_title || job.job_id} — {job.customer?.name || 'No customer'}
                  </option>
                ))}
              </select>
            ) : (
              /* Search for any job when none scheduled today */
              <div style={{ marginBottom: '12px' }}>
                {selectedSearchJob ? (
                  /* Selected job chip */
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    backgroundColor: theme.accentBg,
                    border: `1px solid ${theme.accent}`,
                    borderRadius: '10px',
                    marginBottom: '0'
                  }}>
                    <Briefcase size={16} style={{ color: theme.accent, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedSearchJob.job_title || selectedSearchJob.job_id}
                      </div>
                      <div style={{ fontSize: '12px', color: theme.textSecondary }}>
                        {selectedSearchJob.customer?.name || selectedSearchJob.customer_name || 'No customer'}
                        {selectedSearchJob.job_address ? ` — ${selectedSearchJob.job_address}` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedJobId(''); setJobSearchQuery('') }}
                      style={{
                        padding: '4px', backgroundColor: 'transparent', border: 'none',
                        cursor: 'pointer', color: theme.textMuted, flexShrink: 0
                      }}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ position: 'relative' }}>
                      <Search size={16} style={{
                        position: 'absolute', left: '12px', top: '50%',
                        transform: 'translateY(-50%)', color: theme.textMuted
                      }} />
                      <input
                        type="text"
                        value={jobSearchQuery}
                        onChange={(e) => { setJobSearchQuery(e.target.value); setSelectedJobId('') }}
                        placeholder="Search jobs by name, customer, or address..."
                        style={{
                          width: '100%',
                          padding: '12px 12px 12px 36px',
                          backgroundColor: theme.bg,
                          border: `1px solid ${theme.border}`,
                          borderRadius: searchResults.length > 0 ? '10px 10px 0 0' : '10px',
                          color: theme.text,
                          fontSize: '15px',
                          minHeight: '44px',
                          boxSizing: 'border-box',
                          outline: 'none'
                        }}
                      />
                    </div>

                    {/* Search results dropdown */}
                    {searchResults.length > 0 && (
                      <div style={{
                        border: `1px solid ${theme.border}`,
                        borderTop: 'none',
                        borderRadius: '0 0 10px 10px',
                        overflow: 'hidden',
                        maxHeight: '240px',
                        overflowY: 'auto'
                      }}>
                        {searchResults.map(job => (
                          <button
                            key={job.id}
                            onClick={() => {
                              setSelectedJobId(String(job.id))
                              setJobSearchQuery('')
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 14px',
                              backgroundColor: theme.bgCard,
                              border: 'none',
                              borderBottom: `1px solid ${theme.border}`,
                              cursor: 'pointer',
                              textAlign: 'left',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              minHeight: '44px',
                              justifyContent: 'center'
                            }}
                          >
                            <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                              {job.job_title || job.job_id}
                            </div>
                            <div style={{ fontSize: '12px', color: theme.textMuted }}>
                              {job.customer?.name || job.customer_name || 'No customer'}
                              {job.job_address ? ` — ${job.job_address}` : ''}
                              {' '}({job.status})
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* No results message */}
                    {jobSearchQuery.trim().length >= 2 && searchResults.length === 0 && (
                      <div style={{
                        padding: '12px 14px',
                        fontSize: '13px',
                        color: theme.textMuted,
                        border: `1px solid ${theme.border}`,
                        borderTop: 'none',
                        borderRadius: '0 0 10px 10px',
                        backgroundColor: theme.bgCard
                      }}>
                        No jobs found matching "{jobSearchQuery}"
                      </div>
                    )}

                    {jobSearchQuery.trim().length < 2 && (
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '6px' }}>
                        No jobs scheduled today. Search to find a job, or clock in general.
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <button
              onClick={() => handleClockIn(selectedJobId ? parseInt(selectedJobId) : null)}
              disabled={clockingIn}
              style={{
                width: '100%',
                padding: '18px',
                height: '54px',
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                border: 'none',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '18px',
                fontWeight: '700',
                cursor: clockingIn ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}
            >
              <Play size={22} />
              {clockingIn ? (gpsStatus === 'capturing' ? 'Capturing location...' : 'Starting...') : 'Clock In'}
            </button>
          </div>
        )
      })()}

      {/* ===== SECTION 7: TODAY'S WORK LOG ===== */}
      {todayEntries.filter(e => e.clock_out).length > 0 && (
        <div style={{
          backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '16px'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} style={{ color: theme.accent }} />
            Today's Work Log
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {todayEntries.filter(e => e.clock_out).map(entry => {
              const entryJob = entry.job_id ? jobs.find(j => j.id === entry.job_id) : null
              return (
                <div key={entry.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  backgroundColor: theme.bg,
                  borderRadius: '8px'
                }}>
                  {/* Timeline dot */}
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: theme.accent,
                    flexShrink: 0
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                      {entryJob?.job_title || 'General'}
                    </div>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>
                      {new Date(entry.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      {' — '}
                      {new Date(entry.clock_out).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: theme.accent, flexShrink: 0 }}>
                    {formatDuration(entry.total_hours)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ===== VICTOR VERIFICATION MODAL ===== */}
      {victorModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center'
        }}>
          {/* Backdrop */}
          <div
            onClick={() => setVictorModal(null)}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)'
            }}
          />

          {/* Sheet */}
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: '500px',
            backgroundColor: theme.bgCard,
            borderRadius: '20px 20px 0 0',
            padding: '24px 20px',
            maxHeight: '90vh',
            overflowY: 'auto',
            animation: 'slideUp 0.3s ease'
          }}>
            {/* Handle */}
            <div style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: theme.border, margin: '0 auto 16px' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={20} style={{ color: '#a855f7' }} />
                {victorModal.type === 'daily' ? 'End-of-Day Check' : 'Victor Verification'}
              </h3>
              <button onClick={() => setVictorModal(null)} style={{ padding: '8px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <VictorVerify
              embeddedMode
              verificationType={victorModal.type}
              preselectedJobId={victorModal.jobId}
              onComplete={async (reportId) => {
                const jobId = victorModal.jobId
                const shouldMarkComplete = victorModal.markComplete
                setVictorModal(null)
                // Check the report score
                const { data: report } = await supabase
                  .from('verification_reports')
                  .select('score, grade')
                  .eq('id', reportId)
                  .single()
                if (report?.score >= 60) {
                  if (jobId) {
                    setVerifiedJobs(prev => new Set(prev).add(jobId))
                    setClockOutBlocked(false)
                    if (shouldMarkComplete) {
                      await supabase.from('jobs')
                        .update({ status: 'Completed', updated_at: new Date().toISOString() })
                        .eq('id', jobId).eq('company_id', companyId)
                      toast.success('Job verified and marked complete!')
                      const { fetchJobs } = useStore.getState()
                      if (fetchJobs) fetchJobs(companyId)
                    }
                  }
                  // Also check if this was a daily verification (unlocks General clock-out for field roles)
                  if (victorModal.type === 'daily') {
                    setHasDailyVerification(true)
                    setClockOutBlocked(false)
                  }
                }
                navigate(`/agents/victor/report/${reportId}`)
              }}
              onClose={() => setVictorModal(null)}
            />
          </div>
        </div>
      )}

      {/* ===== PAYMENT MODAL ===== */}
      {paymentJob && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center'
        }}>
          {/* Backdrop */}
          <div
            onClick={() => !paymentSaving && closePaymentModal()}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)'
            }}
          />

          {/* Sheet */}
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: '500px',
            backgroundColor: theme.bgCard,
            borderRadius: '20px 20px 0 0',
            padding: '24px 20px',
            maxHeight: '85vh',
            overflowY: 'auto',
            animation: 'slideUp 0.3s ease'
          }}>
            {/* Handle */}
            <div style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: theme.border, margin: '0 auto 16px' }} />

            {paymentSuccess ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>&#10003;</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#16a34a' }}>Payment Recorded!</div>
                <div style={{ fontSize: '14px', color: theme.textMuted, marginTop: '4px' }}>{paymentJob.job_title || paymentJob.job_id}</div>

                <button
                  onClick={() => { shareReviewLink(paymentJob); if (googleReviewUrl) closePaymentModal() }}
                  style={{
                    marginTop: '24px',
                    padding: '16px 28px',
                    background: reviewSent.has(paymentJob.id)
                      ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                      : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    border: 'none',
                    borderRadius: '14px',
                    color: '#fff',
                    fontSize: '16px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <Star size={18} />
                  {reviewSent.has(paymentJob.id) ? 'Review Sent!' : 'Ask for a Google Review'}
                </button>

                <button
                  onClick={() => closePaymentModal()}
                  style={{
                    display: 'block',
                    margin: '16px auto 0',
                    padding: '12px 24px',
                    backgroundColor: 'transparent',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '10px',
                    color: theme.textSecondary,
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Done
                </button>
              </div>
            ) : stripeLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: theme.textMuted }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
                <div style={{ fontSize: '15px' }}>Setting up invoice...</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: 0 }}>Collect Payment</h3>
                  <button onClick={() => closePaymentModal()} style={{ padding: '8px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                    <X size={20} />
                  </button>
                </div>

                {/* Job + Invoice info */}
                <div style={{ marginBottom: '16px', padding: '12px 14px', backgroundColor: theme.bg, borderRadius: '10px' }}>
                  <div style={{ fontWeight: '600', color: theme.text, fontSize: '15px' }}>{paymentJob.job_title || paymentJob.job_id}</div>
                  <div style={{ fontSize: '13px', color: theme.textSecondary }}>{paymentJob.customer?.name}</div>
                  {paymentInvoice && (
                    <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', color: theme.textSecondary }}>{paymentInvoice.invoice_id}</span>
                      <span style={{ fontSize: '16px', fontWeight: '700', color: '#16a34a' }}>
                        ${paymentForm.amount ? parseFloat(paymentForm.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Option 1: Pay with Card or Bank Account (opens portal) */}
                <button
                  onClick={handlePayWithPortal}
                  disabled={!paymentInvoice || stripeLoading}
                  style={{
                    width: '100%',
                    padding: '18px',
                    background: paymentInvoice
                      ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
                      : theme.bg,
                    border: 'none',
                    borderRadius: '14px',
                    color: paymentInvoice ? '#fff' : theme.textMuted,
                    fontSize: '17px',
                    fontWeight: '700',
                    cursor: paymentInvoice ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    minHeight: '56px',
                    marginBottom: '6px'
                  }}
                >
                  <CreditCard size={20} />
                  Pay with Card or Bank
                </button>
                <p style={{ fontSize: '12px', color: theme.textMuted, textAlign: 'center', margin: '0 0 20px', lineHeight: '1.4' }}>
                  Opens secure payment page — hand phone to customer
                </p>

                {/* Amount input */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '6px' }}>Amount</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted, fontSize: '16px', fontWeight: '600' }}>$</span>
                    <input
                      type="number"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0.00"
                      step="0.01"
                      style={{
                        width: '100%', padding: '12px 12px 12px 28px',
                        backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
                        borderRadius: '10px', color: theme.text, fontSize: '18px', fontWeight: '700',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '0 0 16px' }}>
                  <div style={{ flex: 1, height: '1px', backgroundColor: theme.border }} />
                  <span style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' }}>or record manually</span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: theme.border }} />
                </div>

                {/* Cash/Check method pills */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  {[
                    { id: 'Cash', label: 'Cash' },
                    { id: 'Check', label: 'Check' },
                    { id: 'Venmo', label: 'Venmo' },
                    { id: 'Zelle', label: 'Zelle' },
                    { id: 'Other', label: 'Other' }
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setPaymentForm(f => ({ ...f, method: m.id }))}
                      style={{
                        padding: '8px 14px',
                        backgroundColor: paymentForm.method === m.id ? theme.accent : theme.bg,
                        color: paymentForm.method === m.id ? '#fff' : theme.textSecondary,
                        border: `1px solid ${paymentForm.method === m.id ? theme.accent : theme.border}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '600',
                        minHeight: '40px'
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {/* Check # / Reference */}
                {['Check', 'Other'].includes(paymentForm.method) && (
                  <div style={{ marginBottom: '12px' }}>
                    <input
                      value={paymentForm.reference}
                      onChange={(e) => setPaymentForm(f => ({ ...f, reference: e.target.value }))}
                      placeholder={paymentForm.method === 'Check' ? 'Check #' : 'Reference'}
                      style={{
                        width: '100%', padding: '10px 12px',
                        backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
                        borderRadius: '8px', color: theme.text, fontSize: '14px', boxSizing: 'border-box'
                      }}
                    />
                  </div>
                )}

                {/* Record button */}
                <button
                  onClick={handleRecordPayment}
                  disabled={!paymentForm.amount || paymentSaving}
                  style={{
                    width: '100%',
                    padding: '14px',
                    backgroundColor: paymentForm.amount ? theme.accent : theme.bg,
                    border: 'none',
                    borderRadius: '10px',
                    color: paymentForm.amount ? '#fff' : theme.textMuted,
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: paymentForm.amount ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    minHeight: '48px'
                  }}
                >
                  <DollarSign size={18} />
                  {paymentSaving ? 'Recording...' : `Record ${paymentForm.method} — $${paymentForm.amount || '0.00'}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== INVOICE PRESENTATION MODAL ===== */}
      {invoiceJob && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
        }}>
          <div
            onClick={() => { setInvoiceJob(null); setInvoiceData(null) }}
            style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          />
          <div style={{
            position: 'relative', width: '100%', maxWidth: '500px',
            backgroundColor: '#fff', borderRadius: '20px 20px 0 0',
            padding: '24px 20px', maxHeight: '90vh', overflowY: 'auto',
            animation: 'slideUp 0.3s ease'
          }}>
            <div style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: '#ddd', margin: '0 auto 16px' }} />

            {invoiceLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: theme.textMuted }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
                <div style={{ fontSize: '15px' }}>Loading invoice...</div>
              </div>
            ) : invoiceData ? (
              <div>
                {/* Customer-facing invoice header */}
                <div style={{ textAlign: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '2px solid #e5e7eb' }}>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: '#1f2937', marginBottom: '4px' }}>
                    {company?.company_name || 'Invoice'}
                  </div>
                  {invoiceData.invoice && (
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>
                      Invoice #{invoiceData.invoice.invoice_number || invoiceData.invoice.id}
                    </div>
                  )}
                  {!invoiceData.invoice && invoiceData.fromJob && (
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>Job Summary</div>
                  )}
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                    {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>

                {/* Customer info */}
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '10px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                    {invoiceJob.customer?.name || 'Customer'}
                  </div>
                  <div style={{ fontSize: '13px', color: '#6b7280' }}>
                    {invoiceJob.job_title || invoiceJob.job_id}
                  </div>
                </div>

                {/* Line items */}
                {invoiceData.lines.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Items
                    </div>
                    {invoiceData.lines.map((line, idx) => (
                      <div key={line.id || idx} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        padding: '10px 0', borderBottom: idx < invoiceData.lines.length - 1 ? '1px solid #f3f4f6' : 'none'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                            {line.item?.name || line.description || line.item_name || 'Item'}
                          </div>
                          {line.description && line.item?.name && (
                            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{line.description}</div>
                          )}
                          {(line.quantity && line.quantity > 1) && (
                            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                              Qty: {line.quantity} x ${parseFloat(line.unit_price || line.price || 0).toFixed(2)}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', flexShrink: 0, marginLeft: '16px' }}>
                          ${parseFloat(line.total || line.amount || (line.quantity || 1) * (line.unit_price || line.price || 0)).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Total */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '12px',
                  marginBottom: '20px'
                }}>
                  <span style={{ fontSize: '18px', fontWeight: '700', color: '#166534' }}>Total</span>
                  <span style={{ fontSize: '24px', fontWeight: '800', color: '#166534' }}>
                    ${parseFloat(
                      invoiceData.invoice?.total_amount ||
                      invoiceData.invoice?.amount ||
                      invoiceJob.job_total ||
                      invoiceData.lines.reduce((sum, l) => sum + parseFloat(l.total || l.amount || (l.quantity || 1) * (l.unit_price || l.price || 0)), 0)
                    ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      setInvoiceJob(null); setInvoiceData(null)
                      setPaymentJob(invoiceJob)
                      setPaymentForm({
                        amount: String(invoiceData.invoice?.total_amount || invoiceData.invoice?.amount || invoiceJob.job_total || invoiceData.lines.reduce((sum, l) => sum + parseFloat(l.total || l.amount || (l.quantity || 1) * (l.unit_price || l.price || 0)), 0)),
                        method: 'Card', reference: '', notes: ''
                      })
                      setPaymentSuccess(false)
                    }}
                    style={{
                      flex: 1, padding: '16px',
                      background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                      border: 'none', borderRadius: '12px', color: '#fff',
                      fontSize: '16px', fontWeight: '700', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      minHeight: '52px'
                    }}
                  >
                    <CreditCard size={18} /> Pay Now
                  </button>
                  <button
                    onClick={() => { setInvoiceJob(null); setInvoiceData(null) }}
                    style={{
                      padding: '16px 20px',
                      backgroundColor: '#f3f4f6', border: 'none', borderRadius: '12px',
                      color: '#6b7280', fontSize: '14px', fontWeight: '500', cursor: 'pointer',
                      minHeight: '52px'
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0', color: theme.textMuted }}>
                <FileText size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <div style={{ fontSize: '15px', fontWeight: '500' }}>No invoice found for this job</div>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>Create an invoice from the job detail page first.</div>
                <button
                  onClick={() => { setInvoiceJob(null); setInvoiceData(null) }}
                  style={{
                    marginTop: '16px', padding: '12px 24px',
                    backgroundColor: theme.accentBg, border: `1px solid ${theme.accent}`,
                    borderRadius: '10px', color: theme.accent, fontSize: '14px',
                    fontWeight: '500', cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== ARNIE FLOATING PANEL ===== */}
      <ArnieFloatingPanel />

      {/* Animations */}
      <style>{`
        @keyframes fieldScoutPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
