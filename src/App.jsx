import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useStore } from './lib/store'
import Login from './pages/Login'
import Employees from './pages/Employees'
import Customers from './pages/Customers'
import Leads from './pages/Leads'
import SalesPipeline from './pages/SalesPipeline'
import Products from './pages/Products'
import Quotes from './pages/Quotes'
import QuoteDetail from './pages/QuoteDetail'
import Jobs from './pages/Jobs'
import JobDetail from './pages/JobDetail'
import JobCalendar from './pages/JobCalendar'
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
import Reports from './pages/Reports'
import CommunicationsLog from './pages/CommunicationsLog'
import Expenses from './pages/Expenses'
import Appointments from './pages/Appointments'
import RoutesPage from './pages/RoutesPage'
import RoutesCalendar from './pages/RoutesCalendar'
import Bookings from './pages/Bookings'
import LeadPayments from './pages/LeadPayments'
import UtilityInvoices from './pages/UtilityInvoices'
import Incentives from './pages/Incentives'
import Layout from './components/Layout'
import ToastContainer from './components/Toast'

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

  return children
}

function App() {
  const companyId = useStore((state) => state.companyId)
  const setUser = useStore((state) => state.setUser)
  const setCompany = useStore((state) => state.setCompany)
  const setIsLoading = useStore((state) => state.setIsLoading)
  const fetchAllData = useStore((state) => state.fetchAllData)
  const clearSession = useStore((state) => state.clearSession)

  // Check for existing session on mount and handle session recovery
  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true)

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
  }, [setUser, setCompany, setIsLoading, clearSession])

  // Fetch data when companyId changes
  useEffect(() => {
    if (companyId) {
      fetchAllData()
    }
  }, [companyId, fetchAllData])

  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        <Route path="/login" element={<Login />} />
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
          <Route path="/leads" element={<Leads />} />
          <Route path="/pipeline" element={<SalesPipeline />} />
          <Route path="/products" element={<Products />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/quotes/:id" element={<QuoteDetail />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/calendar" element={<JobCalendar />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
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
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/:reportType" element={<Reports />} />
          <Route path="/communications" element={<CommunicationsLog />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/appointments" element={<Appointments />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/routes/calendar" element={<RoutesCalendar />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/lead-payments" element={<LeadPayments />} />
          <Route path="/utility-invoices" element={<UtilityInvoices />} />
          <Route path="/incentives" element={<Incentives />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
