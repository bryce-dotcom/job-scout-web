import { NavLink, Outlet } from 'react-router-dom'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Home, Users, Building2, UserPlus, TrendingUp, Package, FileText, LogOut } from 'lucide-react'
import logo from '../assets/logo.png'

export default function Layout() {
  const user = useStore((state) => state.user)
  const company = useStore((state) => state.company)
  const clearSession = useStore((state) => state.clearSession)

  const handleLogout = async () => {
    await clearSession()
  }

  const navItems = [
    { to: '/', icon: Home, label: 'Dashboard' },
    { to: '/employees', icon: Users, label: 'Employees' },
    { to: '/customers', icon: Building2, label: 'Customers' },
    { to: '/leads', icon: UserPlus, label: 'Leads' },
    { to: '/pipeline', icon: TrendingUp, label: 'Pipeline' },
    { to: '/products', icon: Package, label: 'Products' },
    { to: '/quotes', icon: FileText, label: 'Quotes' }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Job Scout" className="h-10" />
              <div>
                <h1 className="text-lg font-bold text-gray-900">Job Scout</h1>
                {company && (
                  <p className="text-xs text-gray-500">{company.company_name}</p>
                )}
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`
                  }
                >
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 hidden sm:block">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="md:hidden border-t px-4 py-2 flex gap-1 overflow-x-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto">
        <Outlet />
      </main>
    </div>
  )
}
