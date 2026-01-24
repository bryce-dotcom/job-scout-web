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
import Layout, { useTheme } from './components/Layout'

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

function Dashboard() {
  const company = useStore((state) => state.company)
  const user = useStore((state) => state.user)

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  return (
    <div style={{ padding: '24px' }}>
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '32px'
      }}>
        <h2 style={{
          fontSize: '24px',
          fontWeight: '700',
          color: theme.text,
          marginBottom: '12px'
        }}>
          Welcome to Job Scout
        </h2>
        {company && (
          <p style={{
            fontSize: '15px',
            color: theme.textSecondary
          }}>
            Logged in as <span style={{ fontWeight: '500' }}>{user?.name || user?.email}</span> at <span style={{ fontWeight: '500' }}>{company.company_name}</span>
          </p>
        )}
      </div>
    </div>
  )
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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
