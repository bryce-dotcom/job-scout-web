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
import { getCurrentPayPeriod, calculateEfficiencyBonus, timeClockToJobHours } from '../lib/bonusCalc'
import { computeAllottedHours } from '../lib/allottedHours'
import RankBadge from '../components/RankBadge'

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

  // Efficiency bonus (accumulating this pay period)
  const [bonusSummary, setBonusSummary] = useState({ bonus: 0, details: [], loading: true, period: null })
  const [showBonusDetail, setShowBonusDetail] = useState(false)

  // Victor verification
  const [victorModal, setVictorModal] = useState(null) // null | { type: 'daily' } | { type: 'completion', jobId }
  const [showDailyCheckPrompt, setShowDailyCheckPrompt] = useState(false)
  const [verifiedJobs, setVerifiedJobs] = useState(new Set()) // job IDs with passing completion verification
  const [dailyVerifiedJobs, setDailyVerifiedJobs] = useState(new Set()) // job IDs with passing daily verification TODAY (per-job, any crew member)
  const [clockOutBlocked, setClockOutBlocked] = useState(false)
  const [hasDailyVerification, setHasDailyVerification] = useState(false) // field roles need this

  // Invoice presentation
  const [invoiceJob, setInvoiceJob] = useState(null) // job to show invoice for
  const [invoiceData, setInvoiceData] = useState(null) // { invoice, lines }
  const [invoiceLoading, setInvoiceLoading] = useState(false)

  // Active job briefing (allotted hours + notes + line items + sections)
  // for the job the rep is currently clocked into. Shown inside the
  // green "Currently Working" card so the tech can see everything they
  // need to do in one glance.
  const [activeBriefing, setActiveBriefing] = useState(null) // { job, lines, notes }
  const [briefingExpanded, setBriefingExpanded] = useState(true)
  // Per-line photo counts { [lineId]: { before: n, after: n } } so the
  // briefing can show a photo badge next to each line without re-fetching
  const [briefingLinePhotoCounts, setBriefingLinePhotoCounts] = useState({})
  // Which line the rep is currently capturing a photo for + context
  // ('line_before' | 'line_after') so we can re-use one hidden file
  // input for every line.
  const [linePhotoPicker, setLinePhotoPicker] = useState(null) // lineId
  const [linePhotoTarget, setLinePhotoTarget] = useState(null) // { lineId, context }
  const [linePhotoUploading, setLinePhotoUploading] = useState(false)
  const linePhotoInputRef = useRef(null)

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
    // Always include the job we're actively clocked into, even if not scheduled today
    if (activeEntry?.job_id && j.id === activeEntry.job_id) return true
    if (!j.start_date) return false
    if (new Date(j.start_date).toDateString() !== todayStr) return false
    // Assigned directly to this employee via job_lead_id
    if (currentEmployee?.id && j.job_lead_id === currentEmployee.id) return true
    // Assigned as salesperson or PM
    if (currentEmployee?.id && (j.salesperson_id === currentEmployee.id || j.pm_id === currentEmployee.id)) return true
    // No assignment at all — show to everyone
    if (!j.assigned_team && !j.job_lead_id) return true
    // Assigned via team — handle both array and comma-separated string
    if (j.assigned_team && employeeName) {
      if (Array.isArray(j.assigned_team)) {
        if (j.assigned_team.some(name => name.toLowerCase().includes(employeeName.toLowerCase()))) return true
      } else if (typeof j.assigned_team === 'string') {
        if (j.assigned_team.toLowerCase().includes(employeeName.toLowerCase())) return true
      }
    }
    return false
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

  // Fetch verification status for today's jobs.
  // Both queries are scoped per-JOB (not per-employee) so that once any
  // crew member runs a passing verification, the "run daily check" /
  // "run completion check" buttons disappear for everyone on the crew.
  const fetchVerifiedJobs = useCallback(async () => {
    if (!companyId || todaysJobs.length === 0) return
    const jobIds = todaysJobs.map(j => j.id)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [compRes, dailyRes] = await Promise.all([
      // Completion: any time, any crew member, per job
      supabase
        .from('verification_reports')
        .select('job_id, score')
        .eq('company_id', companyId)
        .eq('verification_type', 'completion')
        .in('job_id', jobIds)
        .eq('voided', false)
        .gte('score', 60),
      // Daily: today only, any crew member, per job
      supabase
        .from('verification_reports')
        .select('job_id, score')
        .eq('company_id', companyId)
        .eq('verification_type', 'daily')
        .in('job_id', jobIds)
        .gte('created_at', todayStart.toISOString())
        .eq('voided', false)
        .gte('score', 60),
    ])
    if (compRes.data) setVerifiedJobs(new Set(compRes.data.map(r => r.job_id)))
    if (dailyRes.data) setDailyVerifiedJobs(new Set(dailyRes.data.map(r => r.job_id).filter(Boolean)))
  }, [companyId, todaysJobs.length])

  useEffect(() => { fetchVerifiedJobs() }, [fetchVerifiedJobs])

  // Fetch accumulating bonus for this pay period (uses shared calc with Payroll)
  const fetchBonusSummary = useCallback(async () => {
    if (!companyId || !currentEmployee) return
    try {
      // 1. Load payroll config + skill levels from settings table
      const { data: cfgRows } = await supabase
        .from('settings')
        .select('key, value')
        .eq('company_id', companyId)
        .in('key', ['payroll_config', 'skill_levels'])

      let payrollConfig = {}
      let skillLevels = []
      for (const row of (cfgRows || [])) {
        try {
          const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
          if (row.key === 'payroll_config') payrollConfig = parsed || {}
          if (row.key === 'skill_levels') skillLevels = Array.isArray(parsed) ? parsed : []
        } catch { /* ignore malformed JSON */ }
      }

      if (!payrollConfig.efficiency_bonus_enabled) {
        setBonusSummary({ bonus: 0, details: [], loading: false, period: null, disabled: true })
        return
      }

      // 2. Figure out the current pay period window
      const { periodStart, periodEnd } = getCurrentPayPeriod(payrollConfig, 0)

      // 3. Pull this employee's time_clock for the period to find which jobs they worked.
      //    time_clock is the single source of truth — the same rows Payroll's edit
      //    screen adjusts — so fixes to a tech's time automatically flow through
      //    the bonus calc.
      const { data: myClockRows } = await supabase
        .from('time_clock')
        .select('id, employee_id, job_id, clock_in, clock_out, total_hours, lunch_start, lunch_end')
        .eq('company_id', companyId)
        .eq('employee_id', currentEmployee.id)
        .gte('clock_in', periodStart.toISOString())
        .lte('clock_in', periodEnd.toISOString())
        .not('clock_out', 'is', null)
        .not('job_id', 'is', null)

      const myJobIds = [...new Set((myClockRows || []).map(l => l.job_id).filter(Boolean))]
      if (myJobIds.length === 0) {
        setBonusSummary({ bonus: 0, details: [], loading: false, period: { periodStart, periodEnd } })
        return
      }

      // 4. Pull ALL time_clock rows for those jobs (any employee, any date) so the
      //    total actual-hours and crew composition per job are correct.
      const { data: allClockRows } = await supabase
        .from('time_clock')
        .select('id, employee_id, job_id, clock_in, clock_out, total_hours, lunch_start, lunch_end')
        .eq('company_id', companyId)
        .in('job_id', myJobIds)
        .not('clock_out', 'is', null)
      const allLogs = timeClockToJobHours(allClockRows || [])

      // 5. Load the jobs themselves (need allotted_time_hours + has_callback)
      const { data: jobRows } = await supabase
        .from('jobs')
        .select('id, job_id, job_title, customer_name, allotted_time_hours, has_callback')
        .in('id', myJobIds)

      // 5b. Victor verification gates: load completion + daily reports for these jobs.
      //     completion = any date; daily = any date within period, keyed by job_id+YYYY-MM-DD.
      const { data: verReports } = await supabase
        .from('verification_reports')
        .select('job_id, verification_type, score, created_at')
        .eq('company_id', companyId)
        .in('job_id', myJobIds)
        .eq('voided', false)
        .gte('score', 60)

      const verifiedJobIds = new Set(
        (verReports || [])
          .filter(r => r.verification_type === 'completion')
          .map(r => r.job_id)
      )
      const dailyVerifiedJobDays = new Set(
        (verReports || [])
          .filter(r => r.verification_type === 'daily' && r.created_at)
          .map(r => `${r.job_id}|${new Date(r.created_at).toISOString().split('T')[0]}`)
      )

      // 6. Run the shared calc
      const result = calculateEfficiencyBonus({
        employeeId: currentEmployee.id,
        timeLogEntries: allLogs || [],
        timeClockRows: allClockRows || [],
        jobs: jobRows || [],
        employees,
        skillLevels,
        payrollConfig,
        verifiedJobIds,
        dailyVerifiedJobDays,
      })

      setBonusSummary({
        bonus: result.bonus,
        details: result.details,
        loading: false,
        period: { periodStart, periodEnd },
      })
    } catch (err) {
      console.error('Error loading bonus summary:', err)
      setBonusSummary({ bonus: 0, details: [], loading: false, period: null, error: true })
    }
  }, [companyId, currentEmployee, employees])

  useEffect(() => { fetchBonusSummary() }, [fetchBonusSummary])

  // Fetch the full briefing for whatever job the rep is clocked into:
  // job row (allotted_time_hours, notes, customer, address), the
  // job_lines (what to install), and any line photos already on file.
  // Reruns whenever the active job changes so swapping jobs keeps the
  // briefing in sync.
  const refreshBriefingPhotoCounts = useCallback(async (jobId) => {
    try {
      const { data } = await supabase
        .from('file_attachments')
        .select('id, job_line_id, photo_context')
        .eq('job_id', jobId)
        .in('photo_context', ['line_before', 'line_after'])
      const counts = {}
      for (const p of data || []) {
        if (!p.job_line_id) continue
        if (!counts[p.job_line_id]) counts[p.job_line_id] = { before: 0, after: 0 }
        if (p.photo_context === 'line_before') counts[p.job_line_id].before += 1
        else if (p.photo_context === 'line_after') counts[p.job_line_id].after += 1
      }
      setBriefingLinePhotoCounts(counts)
    } catch (err) {
      console.warn('[FieldScout] photo counts fetch failed', err)
    }
  }, [])

  useEffect(() => {
    const jobId = activeEntry?.job_id
    if (!jobId || !companyId) { setActiveBriefing(null); setBriefingLinePhotoCounts({}); return }
    let cancelled = false
    ;(async () => {
      try {
        const { data: jobRow } = await supabase
          .from('jobs')
          .select('id, job_id, job_title, customer_name, job_address, details, notes, allotted_time_hours, job_total, business_unit, status, quote_id, customer:customers!customer_id(id, name, business_name, phone, address, email)')
          .eq('id', jobId)
          .maybeSingle()
        const { data: lineRows } = await supabase
          .from('job_lines')
          .select('id, quantity, price, total, notes, item:products_services(id, name, description, allotted_time_hours)')
          .eq('job_id', jobId)
          .order('id')
        if (cancelled) return

        // If the persisted jobs.allotted_time_hours is missing/zero,
        // compute it live with the shared helper and backfill the row
        // so bonusCalc + Payroll see the same number the field tech sees.
        let effectiveJob = jobRow || null
        if (effectiveJob) {
          const persisted = parseFloat(effectiveJob.allotted_time_hours) || 0
          if (persisted <= 0) {
            const liveHours = computeAllottedHours({
              lines: lineRows || [],
              jobTotal: effectiveJob.job_total,
              businessUnit: effectiveJob.business_unit,
              settings: useStore.getState().settings || [],
            })
            if (liveHours > 0) {
              effectiveJob = { ...effectiveJob, allotted_time_hours: liveHours }
              // Fire-and-forget backfill; don't block the UI on it
              supabase.from('jobs').update({
                allotted_time_hours: liveHours,
                calculated_allotted_time: liveHours,
              }).eq('id', effectiveJob.id).then(({ error }) => {
                if (error) console.warn('[FieldScout] allotted hours backfill failed', error)
              })
            }
          }
        }

        // If this job has an associated lighting audit (from Lenard or a
        // manual audit), pull the per-area breakdown so the field crew can
        // see fixture locations, counts, lighting type, and AI notes right
        // in the briefing. Skipped silently for jobs with no audit link.
        let auditAreas = []
        let auditInfo = null
        try {
          const { data: audit } = await supabase
            .from('lighting_audits')
            .select('id, audit_id, facility_name, total_fixtures, notes')
            .eq('company_id', companyId)
            .eq('job_id', jobId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (audit?.id) {
            auditInfo = audit
            const { data: areas } = await supabase
              .from('audit_areas')
              .select('id, area_name, fixture_count, fixture_type_detected, lighting_type, ceiling_height, existing_wattage, led_wattage, override_notes, ai_analysis_json, photos')
              .eq('audit_id', audit.id)
              .order('id')
            auditAreas = areas || []
          }
        } catch (err) {
          console.warn('[FieldScout] audit area fetch failed', err)
        }

        setActiveBriefing({ job: effectiveJob, lines: lineRows || [], auditAreas, auditInfo })
        refreshBriefingPhotoCounts(jobId)
      } catch (err) {
        if (!cancelled) console.warn('[FieldScout] briefing fetch failed', err)
      }
    })()
    return () => { cancelled = true }
  }, [activeEntry?.job_id, companyId, refreshBriefingPhotoCounts])

  // Trigger the hidden file input for a specific line + context
  const triggerLinePhoto = (lineId, context) => {
    setLinePhotoTarget({ lineId, context })
    setLinePhotoPicker(null)
    // Give React a tick to attach the target, then click the file input
    setTimeout(() => linePhotoInputRef.current?.click(), 50)
  }

  // Upload the captured photo to Supabase storage + file_attachments
  const handleLinePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !linePhotoTarget || !activeEntry?.job_id) return
    const { lineId, context } = linePhotoTarget
    setLinePhotoUploading(true)
    try {
      const safeName = (file.name || `photo_${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `jobs/${activeEntry.job_id}/lines/${lineId}/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage
        .from('project-documents')
        .upload(filePath, file, { contentType: file.type || 'image/jpeg', upsert: false })
      if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('file_attachments').insert({
        company_id: companyId,
        job_id: activeEntry.job_id,
        job_line_id: lineId,
        file_name: safeName,
        file_path: filePath,
        file_type: file.type || 'image/jpeg',
        file_size: file.size,
        storage_bucket: 'project-documents',
        photo_context: context,
      })
      if (dbErr) throw dbErr
      toast.success(`${context === 'line_before' ? 'Before' : 'After'} photo added`)
      await refreshBriefingPhotoCounts(activeEntry.job_id)
    } catch (err) {
      console.error('[FieldScout] line photo upload failed', err)
      toast.error('Photo upload failed: ' + (err?.message || 'unknown'))
    } finally {
      setLinePhotoUploading(false)
      setLinePhotoTarget(null)
    }
  }

  // Fetch daily verification status for field roles (general / no-job path).
  // This is only used when a tech clocks in WITHOUT a job_id (general
  // clock-in). Per-job daily verifications are tracked in dailyVerifiedJobs
  // and don't depend on who ran the check — any crew member covers the crew.
  useEffect(() => {
    if (!companyId || !currentEmployee || !isFieldRole) return
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    supabase
      .from('verification_reports')
      .select('id')
      .eq('company_id', companyId)
      .eq('verification_type', 'daily')
      .is('job_id', null)
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

  // Fast GPS grab — returns lat/lng only (no blocking reverse-geocode).
  // We backfill the human-readable address in the background after the
  // DB write so clock-in/out responds instantly.
  const getCoordsFast = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: null, lng: null })
        return
      }
      setGpsStatus('capturing')
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsStatus('done')
          resolve({ lat: position.coords.latitude, lng: position.coords.longitude })
        },
        () => {
          setGpsStatus('failed')
          resolve({ lat: null, lng: null })
        },
        { timeout: 4000, maximumAge: 60000, enableHighAccuracy: false }
      )
    })
  }

  // Reverse-geocode lat/lng and patch the row after the fact. Cosmetic only.
  const backfillAddress = async (entryId, lat, lng, which /* 'in' | 'out' */) => {
    if (lat == null || lng == null || !entryId) return
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      )
      const data = await res.json()
      const address = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      const patch = which === 'in'
        ? { clock_in_address: address }
        : { clock_out_address: address }
      await supabase.from('time_clock').update(patch).eq('id', entryId)
      fetchEntries()
    } catch { /* geocode is cosmetic — ignore failures */ }
  }

  // Clock in
  const handleClockIn = async (jobId) => {
    if (clockingIn) return
    setClockingIn(true)
    const { lat, lng } = await getCoordsFast()
    try {
      const { data: inserted, error } = await supabase
        .from('time_clock')
        .insert({
          company_id: companyId,
          employee_id: currentEmployee.id,
          job_id: jobId || null,
          clock_in: new Date().toISOString(),
          clock_in_lat: lat,
          clock_in_lng: lng,
        })
        .select()
        .single()
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
      // Auto-expand the job card so the user sees full details (line items,
      // payment buttons, verification, etc.) — even for jobs found via search.
      if (jobId) {
        setExpandedJob(jobId)
        fetchJobSections(jobId)
        // Clear search selection so the now-active job renders inline
        setSelectedJobId('')
        setJobSearchQuery('')
      }
      // Fill in the address in the background — doesn't block the UI.
      if (inserted?.id && lat != null) backfillAddress(inserted.id, lat, lng, 'in')
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
    const entryId = activeEntry.id
    const { lat, lng } = await getCoordsFast()
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
          clock_out_lat: lat,
          clock_out_lng: lng,
          total_hours: Math.round(totalHours * 100) / 100
        })
        .eq('id', entryId)
      if (error) throw error
      await fetchEntries()
      setShowDailyCheckPrompt(true)
      if (lat != null) backfillAddress(entryId, lat, lng, 'out')
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
  const hoursAllotted = todaysJobs.reduce((sum, j) => sum + (parseFloat(j.allotted_time_hours) || 0), 0)
  // Hours used today: stored job.time_tracked across today's jobs, plus any in-progress elapsed for the active job
  const hoursUsedStored = todaysJobs.reduce((sum, j) => sum + (parseFloat(j.time_tracked) || 0), 0)
  const liveActiveOnTodayJob = activeEntry?.job_id && todaysJobs.some(j => j.id === activeEntry.job_id)
  const hoursUsed = hoursUsedStored + (liveActiveOnTodayJob ? elapsedHours : 0)
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
        {currentEmployee?.skill_level && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
            <RankBadge rank={currentEmployee.skill_level} theme={theme} />
          </div>
        )}
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

          {/* Progress bar \u2014 uses the job's allotted hours when known,
              otherwise falls back to an 8-hour day. Adds a clear label
              so field techs can see exactly how much budget they have. */}
          {(() => {
            const jobAllotted = parseFloat(activeBriefing?.job?.allotted_time_hours) || 0
            const basis = jobAllotted > 0 ? jobAllotted : 8
            const pct = Math.min(elapsedHours / basis * 100, 100)
            const over = elapsedHours > basis
            const remaining = Math.max(0, basis - elapsedHours)
            return (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: '8px', marginBottom: '6px', flexWrap: 'wrap',
                }}>
                  <span style={{ fontSize: '11px', opacity: 0.9 }}>
                    {jobAllotted > 0 ? `${elapsedHours.toFixed(1)} / ${jobAllotted.toFixed(1)} allotted hrs` : `${elapsedHours.toFixed(1)} hrs today`}
                  </span>
                  {jobAllotted > 0 && (
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: over ? 'rgba(239,68,68,0.85)' : 'rgba(255,255,255,0.22)',
                    }}>
                      {over ? `${(elapsedHours - basis).toFixed(1)} hrs over` : `${remaining.toFixed(1)} hrs left`}
                    </span>
                  )}
                </div>
                <div style={{
                  height: '10px',
                  backgroundColor: 'rgba(255,255,255,0.3)',
                  borderRadius: '5px',
                  marginBottom: '16px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${pct}%`,
                    height: '100%',
                    backgroundColor: over ? '#ef4444' : '#fff',
                    borderRadius: '5px',
                    transition: 'width 1s linear',
                  }} />
                </div>
              </>
            )
          })()}

          {/* Job briefing \u2014 everything a tech needs to know about this
              job in one place: notes, address, customer, line items. */}
          {activeBriefing?.job && (
            <div style={{
              backgroundColor: 'rgba(255,255,255,0.14)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '16px',
              border: '1px solid rgba(255,255,255,0.2)',
            }}>
              <button
                type="button"
                onClick={() => setBriefingExpanded(v => !v)}
                style={{
                  width: '100%',
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#fff', textAlign: 'left',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Briefcase size={16} />
                  <span style={{ fontSize: '13px', fontWeight: '700', letterSpacing: '0.3px' }}>
                    Job Briefing
                  </span>
                </div>
                {briefingExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {briefingExpanded && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Customer + address */}
                  {(activeBriefing.job.customer?.business_name || activeBriefing.job.customer?.name || activeBriefing.job.customer_name || activeBriefing.job.job_address) && (
                    <div style={{ fontSize: '12px', lineHeight: 1.5, opacity: 0.95 }}>
                      {(activeBriefing.job.customer?.business_name || activeBriefing.job.customer?.name || activeBriefing.job.customer_name) && (
                        <div style={{ fontWeight: '700' }}>
                          {activeBriefing.job.customer?.business_name || activeBriefing.job.customer?.name || activeBriefing.job.customer_name}
                        </div>
                      )}
                      {activeBriefing.job.job_address && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); const a = encodeURIComponent(activeBriefing.job.job_address); window.open(`https://www.google.com/maps/search/?api=1&query=${a}`, '_blank', 'noopener') }}
                          style={{
                            background: 'none', border: 'none', padding: 0, margin: '2px 0 0',
                            color: '#fff', textDecoration: 'underline', cursor: 'pointer',
                            fontSize: '12px', textAlign: 'left',
                          }}
                        >
                          {activeBriefing.job.job_address}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Notes / details */}
                  {(activeBriefing.job.details || activeBriefing.job.notes) && (
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: '700', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>
                        Notes
                      </div>
                      <div style={{ fontSize: '12px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {activeBriefing.job.details || activeBriefing.job.notes}
                      </div>
                    </div>
                  )}

                  {/* Audit locations — only when a Lenard/lighting audit is
                      linked to this job. Shows each area (room/zone) with
                      fixture count, type, height, and any AI/override notes
                      so the crew knows WHERE to go. */}
                  {activeBriefing.auditAreas && activeBriefing.auditAreas.length > 0 && (
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: '700', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>
                        Locations ({activeBriefing.auditAreas.length})
                        {activeBriefing.auditInfo?.facility_name && (
                          <span style={{ fontWeight: '500', opacity: 0.85 }}> · {activeBriefing.auditInfo.facility_name}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {activeBriefing.auditAreas.map((a, idx) => {
                          const aiNotes = a.override_notes || a.ai_analysis_json?.notes || a.ai_analysis_json?.observations || ''
                          const fxLabel = a.fixture_type_detected || a.lighting_type || ''
                          return (
                            <div key={a.id || idx} style={{
                              padding: '8px 10px',
                              backgroundColor: 'rgba(255,255,255,0.12)',
                              borderRadius: '8px',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                <div style={{
                                  minWidth: '28px', height: '22px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(255,255,255,0.25)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '11px', fontWeight: '800',
                                  flexShrink: 0,
                                }}>
                                  {a.fixture_count || '?'}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '12px', fontWeight: '700' }}>
                                    {a.area_name || `Area ${idx + 1}`}
                                  </div>
                                  {(fxLabel || a.ceiling_height || a.existing_wattage) && (
                                    <div style={{ fontSize: '10px', opacity: 0.85, marginTop: '2px' }}>
                                      {[
                                        fxLabel,
                                        a.ceiling_height ? `${a.ceiling_height}ft ceiling` : null,
                                        a.existing_wattage ? `${a.existing_wattage}W → ${a.led_wattage || '?'}W LED` : null,
                                      ].filter(Boolean).join(' · ')}
                                    </div>
                                  )}
                                  {aiNotes && (
                                    <div style={{ fontSize: '10px', opacity: 0.9, marginTop: '4px', fontStyle: 'italic', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                                      {aiNotes}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Line items (work scope) */}
                  {activeBriefing.lines && activeBriefing.lines.length > 0 && (
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: '700', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>
                        Scope ({activeBriefing.lines.length} item{activeBriefing.lines.length === 1 ? '' : 's'})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {activeBriefing.lines.map((l, idx) => {
                          const name = l.item?.name || l.notes || `Item ${idx + 1}`
                          const qty = parseFloat(l.quantity) || 0
                          const counts = briefingLinePhotoCounts[l.id] || { before: 0, after: 0 }
                          const totalPhotos = counts.before + counts.after
                          const pickerOpen = linePhotoPicker === l.id
                          return (
                            <div key={l.id || idx} style={{
                              padding: '8px 10px',
                              backgroundColor: 'rgba(255,255,255,0.12)',
                              borderRadius: '8px',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                <div style={{
                                  minWidth: '28px', height: '22px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(255,255,255,0.25)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '11px', fontWeight: '800',
                                  flexShrink: 0,
                                }}>
                                  {qty || '1'}x
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '12px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {name}
                                  </div>
                                  {l.item?.description && (
                                    <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {l.item.description}
                                    </div>
                                  )}
                                  {l.notes && (
                                    <div style={{ fontSize: '10px', opacity: 0.9, marginTop: '2px', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                                      {l.notes}
                                    </div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setLinePhotoPicker(pickerOpen ? null : l.id) }}
                                  disabled={linePhotoUploading}
                                  title={totalPhotos > 0 ? `${totalPhotos} photo${totalPhotos > 1 ? 's' : ''} on file` : 'Add a photo'}
                                  style={{
                                    flexShrink: 0,
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    padding: '6px 10px',
                                    minHeight: '32px',
                                    background: totalPhotos > 0 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.16)',
                                    border: '1px solid rgba(255,255,255,0.35)',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    cursor: linePhotoUploading ? 'wait' : 'pointer',
                                  }}
                                >
                                  <Camera size={14} />
                                  {totalPhotos > 0 && (
                                    <span style={{ fontSize: 11, fontWeight: 700 }}>{totalPhotos}</span>
                                  )}
                                </button>
                              </div>
                              {pickerOpen && (
                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                  <button
                                    type="button"
                                    onClick={() => triggerLinePhoto(l.id, 'line_before')}
                                    disabled={linePhotoUploading}
                                    style={{
                                      flex: 1,
                                      padding: '10px 12px', minHeight: '44px',
                                      background: 'rgba(59,130,246,0.25)',
                                      border: '1px solid rgba(59,130,246,0.55)',
                                      borderRadius: '8px',
                                      color: '#fff',
                                      fontSize: '12px', fontWeight: '700',
                                      cursor: linePhotoUploading ? 'wait' : 'pointer',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    }}
                                  >
                                    <Camera size={14} />
                                    Before{counts.before > 0 ? ` (${counts.before})` : ''}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => triggerLinePhoto(l.id, 'line_after')}
                                    disabled={linePhotoUploading}
                                    style={{
                                      flex: 1,
                                      padding: '10px 12px', minHeight: '44px',
                                      background: 'rgba(34,197,94,0.3)',
                                      border: '1px solid rgba(34,197,94,0.6)',
                                      borderRadius: '8px',
                                      color: '#fff',
                                      fontSize: '12px', fontWeight: '700',
                                      cursor: linePhotoUploading ? 'wait' : 'pointer',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    }}
                                  >
                                    <Camera size={14} />
                                    After{counts.after > 0 ? ` (${counts.after})` : ''}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setLinePhotoPicker(null)}
                                    style={{
                                      padding: '10px 12px', minHeight: '44px',
                                      background: 'rgba(255,255,255,0.15)',
                                      border: '1px solid rgba(255,255,255,0.3)',
                                      borderRadius: '8px',
                                      color: '#fff',
                                      fontSize: '12px', fontWeight: '600',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      {/* Hidden file input shared by all line photo buttons */}
                      <input
                        ref={linePhotoInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleLinePhotoUpload}
                        style={{ display: 'none' }}
                      />
                    </div>
                  )}

                  {activeBriefing.lines?.length === 0 && !activeBriefing.job.details && !activeBriefing.job.notes && (
                    <div style={{ fontSize: '11px', opacity: 0.8 }}>
                      No scope or notes added yet. Ask your project manager if you need more info.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                  <button
                    onClick={() => {
                      if (confirm('Clock out without verification? This will be flagged for review.')) {
                        setClockOutBlocked(false)
                        setVerifiedJobs(prev => { const s = new Set(prev); if (activeEntry.job_id) s.add(activeEntry.job_id); return s })
                        setHasDailyVerification(true)
                        handleClockOut()
                      }
                    }}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${theme.border}`,
                      borderRadius: '10px',
                      color: theme.textSecondary,
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      minHeight: '44px'
                    }}
                  >
                    Force Clock Out
                  </button>
                </div>
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
          {
            label: 'Hours Used / Allotted',
            value: hoursAllotted
              ? `${hoursUsed.toFixed(1)} / ${hoursAllotted}h`
              : (hoursUsed > 0 ? `${hoursUsed.toFixed(1)}h` : '—'),
            icon: Timer,
            valueColor: hoursAllotted && hoursUsed > hoursAllotted ? '#ef4444' : theme.text
          },
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
            <div style={{ fontSize: '18px', fontWeight: '700', color: stat.valueColor || theme.text, lineHeight: 1.2 }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '2px' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* ===== BONUS ACCUMULATING (this pay period) ===== */}
      {!bonusSummary.loading && !bonusSummary.disabled && (
        <div style={{
          background: bonusSummary.bonus > 0
            ? 'linear-gradient(135deg, rgba(168,85,247,0.10) 0%, rgba(124,58,237,0.06) 100%)'
            : theme.bgCard,
          border: `1px solid ${bonusSummary.bonus > 0 ? 'rgba(168,85,247,0.35)' : theme.border}`,
          borderRadius: '14px',
          padding: '14px 16px',
          marginBottom: '16px'
        }}>
          <button
            onClick={() => bonusSummary.details.length > 0 && setShowBonusDetail(!showBonusDetail)}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: bonusSummary.details.length > 0 ? 'pointer' : 'default',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <div style={{
              width: '42px', height: '42px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <DollarSign size={22} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '500' }}>
                Bonus Earned This Pay Period
              </div>
              <div style={{ fontSize: '22px', fontWeight: '700', color: bonusSummary.bonus > 0 ? '#8b5cf6' : theme.textMuted, lineHeight: 1.2 }}>
                ${bonusSummary.bonus.toFixed(2)}
              </div>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                {bonusSummary.details.length === 0
                  ? 'Finish a job under allotted hours to start earning'
                  : `From ${bonusSummary.details.filter(d => d.bonusAmount > 0).length} job${bonusSummary.details.filter(d => d.bonusAmount > 0).length === 1 ? '' : 's'} — tap to see breakdown`}
              </div>
            </div>
            {bonusSummary.details.length > 0 && (
              showBonusDetail ? <ChevronUp size={18} color={theme.textMuted} /> : <ChevronDown size={18} color={theme.textMuted} />
            )}
          </button>

          {showBonusDetail && bonusSummary.details.length > 0 && (
            <div style={{
              marginTop: '12px',
              paddingTop: '12px',
              borderTop: `1px solid ${theme.border}`,
              display: 'flex', flexDirection: 'column', gap: '8px'
            }}>
              {bonusSummary.details.map((d, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 12px', backgroundColor: theme.bgCard,
                  borderRadius: '8px', border: `1px solid ${theme.border}`
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.jobTitle}
                    </div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                      Allotted {d.allottedHours}h · Actual {d.actualHours.toFixed(1)}h · Saved {d.savedHours.toFixed(1)}h
                      {d.crewSize > 1 && ` · Split ${d.crewSize} ways`}
                    </div>
                  </div>
                  <div style={{
                    fontSize: '14px', fontWeight: '700',
                    color: d.bonusAmount > 0 ? '#8b5cf6' : theme.textMuted,
                    flexShrink: 0, marginLeft: '8px'
                  }}>
                    ${d.bonusAmount.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

      {/* ===== DAILY CHECK PROMPT (after clock-out) =====
          Hide this if the active/last job already had a passing daily
          verification from any crew member — one per job per day. */}
      {showDailyCheckPrompt && !(activeEntry?.job_id && dailyVerifiedJobs.has(activeEntry.job_id)) && (
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

      {/* ===== STANDALONE VICTOR BUTTONS =====
          One per verification type, hidden once any crew member has
          covered the active job for that type. */}
      {activeEntry?.job_id && !dailyVerifiedJobs.has(activeEntry.job_id) && (
        <button
          onClick={() => setVictorModal({ type: 'daily', jobId: activeEntry.job_id })}
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
            marginBottom: '10px',
            minHeight: '48px'
          }}
        >
          <Shield size={20} />
          Run Victor Daily Check
        </button>
      )}
      {!(activeEntry?.job_id && verifiedJobs.has(activeEntry.job_id)) && (
        <button
          onClick={() => setVictorModal({ type: 'completion', jobId: activeEntry?.job_id || null })}
          style={{
            width: '100%',
            padding: '14px',
            background: activeEntry?.job_id && dailyVerifiedJobs.has(activeEntry.job_id)
              ? 'linear-gradient(135deg, #64748b 0%, #475569 100%)'
              : 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
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
          Run Victor Completion Check
        </button>
      )}
      {activeEntry?.job_id && verifiedJobs.has(activeEntry.job_id) && dailyVerifiedJobs.has(activeEntry.job_id) && (
        <div style={{
          width: '100%',
          padding: '12px 14px',
          backgroundColor: 'rgba(34,197,94,0.1)',
          border: '1px solid rgba(34,197,94,0.4)',
          borderRadius: '12px',
          color: '#22c55e',
          fontSize: '13px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '16px',
        }}>
          <Shield size={16} />
          Victor verified: daily + completion complete
        </div>
      )}

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
                      {(() => {
                        const allotted = parseFloat(job.allotted_time_hours) || 0
                        const stored = parseFloat(job.time_tracked) || 0
                        const used = stored + (isActive ? elapsedHours : 0)
                        if (!allotted && !used) return null
                        const over = allotted > 0 && used > allotted
                        const pct = allotted > 0 ? Math.min(100, (used / allotted) * 100) : 0
                        return (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '11px',
                            padding: '2px 8px',
                            backgroundColor: over ? 'rgba(239,68,68,0.12)' : theme.accentBg,
                            color: over ? '#ef4444' : theme.accent,
                            borderRadius: '4px',
                            fontWeight: '500'
                          }}>
                            <Timer size={10} />
                            {used.toFixed(1)}{allotted ? ` / ${allotted}` : ''}h
                            {allotted > 0 && (
                              <span style={{
                                display: 'inline-block',
                                width: '40px',
                                height: '4px',
                                backgroundColor: 'rgba(0,0,0,0.08)',
                                borderRadius: '2px',
                                overflow: 'hidden'
                              }}>
                                <span style={{
                                  display: 'block',
                                  width: `${pct}%`,
                                  height: '100%',
                                  backgroundColor: over ? '#ef4444' : theme.accent
                                }} />
                              </span>
                            )}
                          </span>
                        )
                      })()}
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
        // Denylist (not an allowlist) so every custom company status —
        // "Waiting Product", "Chillin", "On Deck", etc. — is clockable
        // by default. Only truly terminal jobs are excluded.
        const NON_CLOCKABLE_STATUSES = new Set([
          'Cancelled', 'Canceled', 'Archived', 'Verified', 'Verified Complete'
        ])
        const searchResults = jobSearchQuery.trim().length >= 2
          ? jobs.filter(j => {
              const q = jobSearchQuery.toLowerCase()
              if (j.status && NON_CLOCKABLE_STATUSES.has(j.status)) return false
              return (
                (j.job_title || '').toLowerCase().includes(q) ||
                (j.job_id || '').toString().toLowerCase().includes(q) ||
                (j.customer?.business_name || j.customer?.name || j.customer_name || '').toLowerCase().includes(q) ||
                (j.business_name || '').toLowerCase().includes(q) ||
                (j.job_address || '').toLowerCase().includes(q)
              )
            }).slice(0, 15)
          : []
        const selectedSearchJob = selectedJobId
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

            {hasTodaysJobs && !jobSearchQuery && !(selectedSearchJob && !todaysJobs.find(j => String(j.id) === String(selectedJobId))) && (
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
                  marginBottom: '10px',
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
            )}
            {/* Search is always available — finds any job up to and including Scheduled status */}
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

                    {jobSearchQuery.trim().length < 2 && !hasTodaysJobs && (
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '6px' }}>
                        No jobs scheduled today. Search to find a job, or clock in general.
                      </div>
                    )}
                    {jobSearchQuery.trim().length < 2 && hasTodaysJobs && (
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '6px' }}>
                        Can't find it above? Search for any job (up to Scheduled status).
                      </div>
                    )}
                  </>
                )}
            </div>

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

            {/* Bonus impact warning — techs need to see this EVERY time the
                Victor modal opens so they know skipping the check costs
                the whole crew real money. */}
            <div style={{
              marginBottom: '14px',
              padding: '12px 14px',
              backgroundColor: 'rgba(234,179,8,0.1)',
              border: '1px solid rgba(234,179,8,0.4)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}>
              <AlertTriangle size={18} style={{ color: '#eab308', flexShrink: 0, marginTop: '1px' }} />
              <div style={{ fontSize: '12px', color: theme.text, lineHeight: 1.45 }}>
                <div style={{ fontWeight: '700', marginBottom: '2px' }}>
                  Efficiency bonus gate
                </div>
                No bonus will be paid for this job unless Victor has a passing score for{' '}
                <strong>every crew member each day</strong> and a{' '}
                <strong>completion verification</strong> when the job wraps. One crew member running it covers the whole crew for that day.
              </div>
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
                  if (victorModal.type === 'completion' && jobId) {
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
                  // Daily verification: if it's tied to a job, flag that job
                  // as daily-verified for today (so every crew member sees
                  // the button disappear). Otherwise fall back to the legacy
                  // general daily flag for no-job clock-ins.
                  if (victorModal.type === 'daily') {
                    if (jobId) {
                      setDailyVerifiedJobs(prev => new Set(prev).add(jobId))
                    } else {
                      setHasDailyVerification(true)
                    }
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
                        amount: String(invoiceData.invoice?.amount || invoiceJob.job_total || invoiceData.lines.reduce((sum, l) => sum + parseFloat(l.total || l.amount || (l.quantity || 1) * (l.unit_price || l.price || 0)), 0)),
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
