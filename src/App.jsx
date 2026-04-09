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
import FreddySettings from './pages/agents/freddy/FreddySettings'
import FreddyTracking from './pages/agents/freddy/FreddyTracking'
import FreddyTrips from './pages/agents/freddy/FreddyTrips'
import FreddyCosts from './pages/agents/freddy/FreddyCosts'
import FreddyDrivers from './pages/agents/freddy/FreddyDrivers'
import FreddyAlerts from './pages/agents/freddy/FreddyAlerts'
import ConradWorkspace from './pages/agents/conrad/ConradWorkspace'
import ConradDashboard from './pages/agents/conrad/ConradDashboard'
import ConradCampaigns from './pages/agents/conrad/ConradCampaigns'
import ConradTemplates from './pages/agents/conrad/ConradTemplates'
import ConradContacts from './pages/agents/conrad/ConradContacts'
import ConradAutomations from './pages/agents/conrad/ConradAutomations'
import ConradSettings from './pages/agents/conrad/ConradSettings'
import VictorWorkspace from './pages/agents/victor/VictorWorkspace'
import ArnieWorkspace from './pages/agents/arnie/ArnieWorkspace'
import ArnieChatPage from './pages/agents/arnie/ArnieChatPage'
import ArnieHistory from './pages/agents/arnie/ArnieHistory'
import VictorDashboard from './pages/agents/victor/VictorDashboard'
import VictorVerify from './pages/agents/victor/VictorVerify'
import VictorReport from './pages/agents/victor/VictorReport'
import VictorHistory from './pages/agents/victor/VictorHistory'
import VictorSettings from './pages/agents/victor/VictorSettings'
import FrankieWorkspace from './pages/agents/frankie/FrankieWorkspace'
import FrankieDashboard from './pages/agents/frankie/FrankieDashboard'
import FrankieAsk from './pages/agents/frankie/FrankieAsk'
import FrankieCollections from './pages/agents/frankie/FrankieCollections'
import FrankieInsights from './pages/agents/frankie/FrankieInsights'
import FrankieSettings from './pages/agents/frankie/FrankieSettings'
import CustomerPortal from './pages/CustomerPortal'
import LenardAZSRP from './pages/agents/LenardAZSRP'
import LenardUTRMP from './pages/agents/LenardUTRMP'
import DataConsole from './pages/admin/DataConsole'
import Help from './pages/admin/Help'
import EOS from './pages/admin/EOS'
import Layout from './components/Layout'
import AgentRequired from './components/AgentRequired'
import ToastContainer from './components/Toast'
import CompanyNotifications from './components/CompanyNotifications'
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

// Field techs should only use Field Scout for clocking in/out — the
// Time Clock page is for office / PM / admin staff. If a field tech
// lands on /time-clock (old bookmark, muscle memory, etc.) send them
// to /field-scout instead. Everyone else sees the regular TimeClock page.
function TimeClockRouteGuard() {
  const user = useStore((state) => state.user)
  const roleLower = (user?.role || '').toLowerCase()
  if (roleLower === 'field tech') {
    return <Navigate to="/field-scout" replace />
  }
  return <TimeClock />
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
      // If we already have a persisted user+company, don't block the UI with
      // "Loading..." — let them see the app immediately while we verify in the
      // background. This is critical for field techs on flaky mobile networks.
      const persisted = useStore.getState()
      const hasPersisted = !!persisted.companyId && !!persisted.user

      if (!hasPersisted) setIsLoading(true)

      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.user) {
          // Always re-fetch employee record so role/permission changes
          // made in the DB are picked up without requiring a fresh login
          const { data: employee } = await supabase
            .from('employees')
            .select('*, company:companies(*)')
            .ilike('email', session.user.email)
            .eq('active', true)
            .single()

          if (employee && employee.company) {
            setUser(employee)
            setCompany(employee.company)
          } else if (!hasPersisted) {
            // Only clear if we had nothing cached anyway — avoids kicking a
            // field tech off the page because of a transient employee lookup
            // failure (network blip, RLS hiccup, etc.)
            await clearSession()
          } else {
            console.warn('[Auth] Employee lookup failed on refresh, keeping cached session')
          }

          // Don't block on developer status check
          checkDeveloperStatus().catch(() => {})
        } else if (hasPersisted) {
          // No Supabase session but we have cached user data. Try a silent
          // refresh once — if that fails, leave them logged in via cache and
          // let the next API call trigger a real re-auth if needed.
          try {
            const { data: refreshData } = await supabase.auth.refreshSession()
            if (!refreshData?.session) {
              console.warn('[Auth] No session on refresh, keeping cached user')
            }
          } catch (e) {
            console.warn('[Auth] Silent refresh failed, keeping cached user', e)
          }
        }
      } catch (err) {
        console.error('[Auth] Init error:', err)
      }

      setIsLoading(false)
    }

    initializeAuth()

    // Listen for auth state changes. Only clear the store on EXPLICIT sign-out
    // (user clicked logout). Transient refresh failures on mobile/PWA should
    // NOT kick the user to the login screen mid-shift.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setCompany(null)
      }
      // Intentionally ignore TOKEN_REFRESHED with no session. Supabase will
      // retry and the user's cached data remains usable in the meantime.
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
      <CompanyNotifications />
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
          <Route path="/fleet" element={<AgentRequired slug="freddy-fleet"><Fleet /></AgentRequired>} />
          <Route path="/fleet/calendar" element={<AgentRequired slug="freddy-fleet"><FleetCalendar /></AgentRequired>} />
          <Route path="/fleet/:id" element={<AgentRequired slug="freddy-fleet"><FleetDetail /></AgentRequired>} />
          <Route path="/lighting-audits" element={<AgentRequired slug="lenard-lighting"><LightingAudits /></AgentRequired>} />
          <Route path="/lighting-audits/new" element={<AgentRequired slug="lenard-lighting"><NewLightingAudit /></AgentRequired>} />
          <Route path="/lighting-audits/:id" element={<AgentRequired slug="lenard-lighting"><LightingAuditDetail /></AgentRequired>} />
          <Route path="/fixture-types" element={<AgentRequired slug="lenard-lighting"><FixtureTypes /></AgentRequired>} />
          <Route path="/utility-providers" element={<AgentRequired slug="lenard-lighting"><UtilityProviders /></AgentRequired>} />
          <Route path="/utility-programs" element={<AgentRequired slug="lenard-lighting"><UtilityPrograms /></AgentRequired>} />
          <Route path="/utility-programs/:id/rates" element={<AgentRequired slug="lenard-lighting"><RebateRates /></AgentRequired>} />
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
          <Route path="/time-clock" element={<TimeClockRouteGuard />} />
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
            <Route path="tracking" element={<FreddyTracking />} />
            <Route path="trips" element={<FreddyTrips />} />
            <Route path="costs" element={<FreddyCosts />} />
            <Route path="drivers" element={<FreddyDrivers />} />
            <Route path="alerts" element={<FreddyAlerts />} />
            <Route path="calendar" element={<FleetCalendar />} />
            <Route path="settings" element={<FreddySettings />} />
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
            <Route path="verify/:jobId" element={<VictorVerify />} />
            <Route path="history" element={<VictorHistory />} />
            <Route path="report/:id" element={<VictorReport />} />
            <Route path="settings" element={<VictorSettings />} />
          </Route>

          {/* Arnie Workspace (AI Assistant) */}
          <Route path="/agents/arnie" element={<ArnieWorkspace />}>
            <Route index element={<ArnieChatPage />} />
            <Route path="history" element={<ArnieHistory />} />
          </Route>

          {/* Frankie Workspace (AI CFO) */}
          <Route path="/agents/frankie" element={<FrankieWorkspace />}>
            <Route index element={<FrankieDashboard />} />
            <Route path="ask" element={<FrankieAsk />} />
            <Route path="collections" element={<FrankieCollections />} />
            <Route path="insights" element={<FrankieInsights />} />
            <Route path="settings" element={<FrankieSettings />} />
          </Route>

          {/* Admin */}
          <Route path="/admin/help" element={<Help />} />
          <Route path="/admin/eos" element={<EOS />} />
          <Route path="/admin/data-console/*" element={<DataConsole />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
