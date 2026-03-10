// ALWAYS READ JOBSCOUT_PROJECT_RULES.md BEFORE MAKING CHANGES
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useStore } from './lib/store'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import Onboarding from './pages/Onboarding'
import Employees from './pages/Employees'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Leads from './pages/Leads'
import LeadDetail from './pages/LeadDetail'
import LeadSetter from './pages/LeadSetter'
import SalesPipeline from './pages/SalesPipeline'
import ProductsServices from './pages/ProductsServices'
import Estimates from './pages/Estimates'
import EstimateDetail from './pages/EstimateDetail'
import Jobs from './pages/Jobs'
import JobDetail from './pages/JobDetail'
import JobCalendar from './pages/JobCalendar'
import PMJobSetter from './pages/PMJobSetter'
import Invoices from './pages/Invoices'
import InvoiceDetail from './pages/InvoiceDetail'
import TimeLog from './pages/TimeLog'
import Inventory from './pages/Inventory'
import Fleet from './pages/Fleet'
import FleetDetail from './pages/FleetDetail'
import FleetCalendar from './pages/FleetCalendar'
import LightingAudits from './pages/LightingAudits'
import NewLightingAudit from './pages/NewLightingAudit'
import LightingAuditDetail from './pages/LightingAuditDetail'
import FixtureTypes from './pages/FixtureTypes'
import UtilityProviders from './pages/UtilityProviders'
import UtilityPrograms from './pages/UtilityPrograms'
import RebateRates from './pages/RebateRates'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import DocumentRules from './pages/DocumentRules'
import Reports from './pages/Reports'
import CommunicationsLog from './pages/CommunicationsLog'
import Expenses from './pages/Expenses'
import Appointments from './pages/Appointments'
import RoutesPage from './pages/RoutesPage'
import RoutesCalendar from './pages/RoutesCalendar'
import Bookings from './pages/Bookings'
import LeadPayments from './pages/LeadPayments'
import UtilityInvoiceDetail from './pages/UtilityInvoiceDetail'
import Incentives from './pages/Incentives'
import TimeClock from './pages/TimeClock'
import FieldScout from './pages/FieldScout'
import Payroll from './pages/Payroll'
import Books from './pages/Books'
import BaseCamp from './pages/BaseCamp'
import RobotMarketplace from './pages/RobotMarketplace'
import MyCrew from './pages/MyCrew'
import LenardWorkspace from './pages/agents/lenard/LenardWorkspace'
import FreddyWorkspace from './pages/agents/freddy/FreddyWorkspace'
import ConradWorkspace from './pages/agents/conrad/ConradWorkspace'
import ConradDashboard from './pages/agents/conrad/ConradDashboard'
import ConradCampaigns from './pages/agents/conrad/ConradCampaigns'
import ConradTemplates from './pages/agents/conrad/ConradTemplates'
import ConradContacts from './pages/agents/conrad/ConradContacts'
import ConradAutomations from './pages/agents/conrad/ConradAutomations'
import ConradSettings from './pages/agents/conrad/ConradSettings'
import VictorWorkspace from './pages/agents/victor/VictorWorkspace'
import VictorDashboard from './pages/agents/victor/VictorDashboard'
import VictorVerify from './pages/agents/victor/VictorVerify'
import VictorReport from './pages/agents/victor/VictorReport'
import VictorHistory from './pages/agents/victor/VictorHistory'
import VictorSettings from './pages/agents/victor/VictorSettings'
import CustomerPortal from './pages/CustomerPortal'
import LenardAZSRP from './pages/agents/LenardAZSRP'
import LenardUTRMP from './pages/agents/LenardUTRMP'
import DataConsole from './pages/admin/DataConsole'
import Layout from './components/Layout'
import ToastContainer from './components/Toast'
import OfflineBanner from './components/OfflineBanner'
import { syncQueue } from './lib/syncQueue'
import { photoQueue } from './lib/photoQueue'

// Light theme fallback
const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
}

// Protected route that checks for companyId (not just user)
function ProtectedRoute({ children }) {
  const companyId = useStore((state) => state.companyId)
  const company = useStore((state) => state.company)
  const isLoading = useStore((state) => state.isLoading)

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: defaultTheme.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ color: defaultTheme.textMuted }}>Loading...</div>
      </div>
    )
  }

  // Must have companyId to access protected routes
  if (!companyId) {
    return <Navigate to="/login" replace />
  }

  // Redirect to onboarding if setup not complete
  if (company && company.setup_complete === false) {
    return <Navigate to="/onboarding" replace />
  }

  return children
}

// Protected route for onboarding (requires auth but no onboarding redirect)
function ProtectedOnboardingRoute({ children }) {
  const companyId = useStore((state) => state.companyId)
  const isLoading = useStore((state) => state.isLoading)

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: defaultTheme.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ color: defaultTheme.textMuted }}>Loading...</div>
      </div>
    )
  }

  if (!companyId) {
    return <Navigate to="/login" replace />
  }

  return children
}

function App() {
  const companyId = useStore((state) => state.companyId)
  const setUser = useStore((state) => state.setUser)
  const setCompany = useStore((state) => state.setCompany)
  const setIsLoading = useStore((state) => state.setIsLoading)
  const fetchAllData = useStore((state) => state.fetchAllData)
  const clearSession = useStore((state) => state.clearSession)
  const checkDeveloperStatus = useStore((state) => state.checkDeveloperStatus)

  // Check for existing session on mount and handle session recovery
  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true)

      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.user) {
          // Session exists - check if store has company data
          const storedCompanyId = useStore.getState().companyId

          if (!storedCompanyId) {
            // Store is empty but we have a session - try to recover
            const { data: employee } = await supabase
              .from('employees')
              .select('*, company:companies(*)')
              .eq('email', session.user.email)
              .eq('active', true)
              .single()

            if (employee && employee.company) {
              setUser(employee)
              setCompany(employee.company)
            } else {
              // No valid employee - clear session
              await clearSession()
            }
          }

          // Don't block on developer status check
          checkDeveloperStatus().catch(() => {})
        }
      } catch (err) {
        console.error('[Auth] Init error:', err)
      }

      setIsLoading(false)
    }

    initializeAuth()

    // Listen for auth state changes (sign out from another tab, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        // Clear store on sign out
        setUser(null)
        setCompany(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [setUser, setCompany, setIsLoading, clearSession, checkDeveloperStatus])

  // Fetch data when companyId changes
  useEffect(() => {
    if (companyId) {
      fetchAllData()
    }
  }, [companyId, fetchAllData])

  // Request persistent storage so the browser won't evict offline data
  useEffect(() => {
    if (navigator.storage?.persist) {
      navigator.storage.persist().then(granted => {
        if (granted) console.log('[PWA] Persistent storage granted')
      })
    }
  }, [])

  // Periodic sync for queued offline changes (every 30s when online)
  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine) {
        syncQueue.processQueue()
        photoQueue.processQueue()
      }
    }, 30000)
    // Also try to sync on initial load
    if (navigator.onLine) {
      syncQueue.processQueue()
      photoQueue.processQueue()
    }
    return () => clearInterval(interval)
  }, [])

  return (
    <BrowserRouter>
      <OfflineBanner />
      <ToastContainer />
      <Routes>
        {/* Public agent routes - NO auth required */}
        <Route path="/agent/lenard-az-srp" element={<LenardAZSRP />} />
        <Route path="/agent/lenard-ut-rmp" element={<LenardUTRMP />} />

        {/* Customer Portal - public, no auth */}
        <Route path="/portal/:token" element={<CustomerPortal />} />

        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Onboarding (protected, full-screen, no layout) */}
        <Route path="/onboarding" element={
          <ProtectedOnboardingRoute><Onboarding /></ProtectedOnboardingRoute>
        } />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/leads/:id" element={<LeadDetail />} />
          <Route path="/lead-setter" element={<LeadSetter />} />
          <Route path="/pipeline" element={<SalesPipeline />} />
          <Route path="/products" element={<ProductsServices />} />
          <Route path="/estimates" element={<Estimates />} />
          <Route path="/estimates/:id" element={<EstimateDetail />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/calendar" element={<JobCalendar />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/job-board" element={<PMJobSetter />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/time-log" element={<TimeLog />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/fleet" element={<Fleet />} />
          <Route path="/fleet/calendar" element={<FleetCalendar />} />
          <Route path="/fleet/:id" element={<FleetDetail />} />
          <Route path="/lighting-audits" element={<LightingAudits />} />
          <Route path="/lighting-audits/new" element={<NewLightingAudit />} />
          <Route path="/lighting-audits/:id" element={<LightingAuditDetail />} />
          <Route path="/fixture-types" element={<FixtureTypes />} />
          <Route path="/utility-providers" element={<UtilityProviders />} />
          <Route path="/utility-programs" element={<UtilityPrograms />} />
          <Route path="/utility-programs/:id/rates" element={<RebateRates />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/document-rules" element={<DocumentRules />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/:reportType" element={<Reports />} />
          <Route path="/communications" element={<CommunicationsLog />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/appointments" element={<Appointments />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/routes/calendar" element={<RoutesCalendar />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/lead-payments" element={<LeadPayments />} />
          <Route path="/utility-invoices" element={<Navigate to="/invoices?type=utility" replace />} />
          <Route path="/utility-invoices/:id" element={<UtilityInvoiceDetail />} />
          <Route path="/incentives" element={<Incentives />} />
          <Route path="/time-clock" element={<TimeClock />} />
          <Route path="/field-scout" element={<FieldScout />} />
          <Route path="/payroll" element={<Payroll />} />
          <Route path="/books" element={<Books />} />

          {/* Base Camp & AI Agents */}
          <Route path="/base-camp" element={<BaseCamp />} />
          <Route path="/robot-marketplace" element={<RobotMarketplace />} />
          <Route path="/my-crew" element={<MyCrew />} />

          {/* Lenard Workspace (Lighting) */}
          <Route path="/agents/lenard" element={<LenardWorkspace />}>
            <Route index element={<LightingAudits />} />
            <Route path="fixture-types" element={<FixtureTypes />} />
            <Route path="providers" element={<UtilityProviders />} />
            <Route path="programs" element={<UtilityPrograms />} />
            <Route path="programs/:id/rates" element={<RebateRates />} />
            <Route path="rebates" element={<RebateRates />} />
            <Route path="audits/new" element={<NewLightingAudit />} />
            <Route path="audits/:id" element={<LightingAuditDetail />} />
          </Route>

          {/* Freddy Workspace (Fleet) */}
          <Route path="/agents/freddy" element={<FreddyWorkspace />}>
            <Route index element={<Fleet />} />
            <Route path="calendar" element={<FleetCalendar />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path=":id" element={<FleetDetail />} />
          </Route>

          {/* Conrad Workspace (Email Marketing) */}
          <Route path="/agents/conrad-connect" element={<ConradWorkspace />}>
            <Route index element={<ConradDashboard />} />
            <Route path="campaigns" element={<ConradCampaigns />} />
            <Route path="templates" element={<ConradTemplates />} />
            <Route path="contacts" element={<ConradContacts />} />
            <Route path="automations" element={<ConradAutomations />} />
            <Route path="settings" element={<ConradSettings />} />
          </Route>

          {/* Victor Workspace (Verification) */}
          <Route path="/agents/victor" element={<VictorWorkspace />}>
            <Route index element={<VictorDashboard />} />
            <Route path="verify" element={<VictorVerify />} />
            <Route path="history" element={<VictorHistory />} />
            <Route path="report/:id" element={<VictorReport />} />
            <Route path="settings" element={<VictorSettings />} />
          </Route>

          {/* Admin Data Console (Developer Only) */}
          <Route path="/admin/data-console/*" element={<DataConsole />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
