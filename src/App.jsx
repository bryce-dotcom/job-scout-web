import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useStore } from './lib/store'
import Login from './pages/Login'
import Employees from './pages/Employees'
import Customers from './pages/Customers'
import Leads from './pages/Leads'
import SalesPipeline from './pages/SalesPipeline'
import Layout from './components/Layout'

function Dashboard() {
  const company = useStore((state) => state.company)

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to Job Scout</h2>
      {company ? (
        <p className="text-gray-600">You're logged in as {company.company_name}</p>
      ) : (
        <p className="text-gray-600">Dashboard coming soon...</p>
      )}
    </div>
  )
}

function ProtectedRoute({ children }) {
  const user = useStore((state) => state.user)
  const isLoading = useStore((state) => state.isLoading)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

function App() {
  const setUser = useStore((state) => state.setUser)
  const setCompany = useStore((state) => state.setCompany)
  const setIsLoading = useStore((state) => state.setIsLoading)
  const companyId = useStore((state) => state.companyId)
  const fetchAllData = useStore((state) => state.fetchAllData)

  useEffect(() => {
    setIsLoading(true)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)

      // Auto-fetch or create company for user
      if (session?.user) {
        const { data: companies } = await supabase
          .from('companies')
          .select('*')
          .eq('owner_email', session.user.email)
          .limit(1)

        if (companies && companies.length > 0) {
          setCompany(companies[0])
        } else {
          // Create default company for new user
          const { data: newCompany } = await supabase
            .from('companies')
            .insert([{
              company_name: 'My Company',
              owner_email: session.user.email
            }])
            .select()
            .single()

          if (newCompany) {
            setCompany(newCompany)
          }
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [setUser, setCompany, setIsLoading])

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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
