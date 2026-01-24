import { useState, createContext, useContext } from 'react'
import { useNavigate, NavLink, Outlet } from 'react-router-dom'
import { useStore } from '../lib/store'
import {
  LayoutDashboard,
  UserPlus,
  TrendingUp,
  Building2,
  FileText,
  Briefcase,
  Calendar,
  Receipt,
  Clock,
  Users,
  Truck,
  Package,
  Lightbulb,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown
} from 'lucide-react'
import logo from '../assets/logo.png'

// Theme context
const ThemeContext = createContext(null)

export const useTheme = () => {
  const context = useContext(ThemeContext)
  return context || {
    theme: {
      bg: '#09090b',
      bgCard: '#18181b',
      bgCardHover: '#27272a',
      border: '#27272a',
      text: '#ffffff',
      textSecondary: '#a1a1aa',
      textMuted: '#71717a',
      accent: '#f97316',
      accentBg: 'rgba(249,115,22,0.15)'
    }
  }
}

const theme = {
  bg: '#09090b',
  bgCard: '#18181b',
  bgCardHover: '#27272a',
  border: '#27272a',
  text: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  accent: '#f97316',
  accentBg: 'rgba(249,115,22,0.15)'
}

export default function Layout() {
  const navigate = useNavigate()
  const user = useStore((state) => state.user)
  const company = useStore((state) => state.company)
  const clearSession = useStore((state) => state.clearSession)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [jobsExpanded, setJobsExpanded] = useState(false)

  const handleLogout = async () => {
    await clearSession()
    navigate('/login')
  }

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/leads', icon: UserPlus, label: 'Leads' },
    { to: '/pipeline', icon: TrendingUp, label: 'Sales Pipeline' },
    { to: '/customers', icon: Building2, label: 'Customers' },
    { to: '/quotes', icon: FileText, label: 'Quotes' },
    {
      label: 'Jobs',
      icon: Briefcase,
      children: [
        { to: '/jobs', icon: Briefcase, label: 'All Jobs' },
        { to: '/jobs/calendar', icon: Calendar, label: 'Calendar' }
      ]
    },
    { to: '/invoices', icon: Receipt, label: 'Invoices' },
    { to: '/time-logs', icon: Clock, label: 'Time Logs' },
    { to: '/employees', icon: Users, label: 'Employees' },
    { to: '/fleet', icon: Truck, label: 'Fleet' },
    { to: '/inventory', icon: Package, label: 'Inventory' },
    { to: '/lighting-audits', icon: Lightbulb, label: 'Lighting Audits' },
    { to: '/settings', icon: Settings, label: 'Settings' }
  ]

  const displayName = user?.name || user?.email || 'User'

  const NavItem = ({ item, mobile = false }) => {
    if (item.children) {
      return (
        <div>
          <button
            onClick={() => setJobsExpanded(!jobsExpanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '8px',
              color: theme.textSecondary,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme.bgCardHover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <item.icon size={20} />
              {item.label}
            </span>
            <ChevronDown
              size={16}
              style={{
                transform: jobsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s'
              }}
            />
          </button>
          {jobsExpanded && (
            <div style={{ marginLeft: '20px', marginTop: '4px' }}>
              {item.children.map((child) => (
                <NavLink
                  key={child.to}
                  to={child.to}
                  end={child.to === '/jobs'}
                  onClick={() => mobile && setMobileMenuOpen(false)}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    color: isActive ? theme.accent : theme.textSecondary,
                    backgroundColor: isActive ? theme.accentBg : 'transparent',
                    textDecoration: 'none',
                    fontSize: '14px',
                    transition: 'all 0.15s'
                  })}
                >
                  <child.icon size={18} />
                  {child.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      )
    }

    return (
      <NavLink
        to={item.to}
        end={item.to === '/'}
        onClick={() => mobile && setMobileMenuOpen(false)}
        style={({ isActive }) => ({
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 12px',
          borderRadius: '8px',
          color: isActive ? theme.accent : theme.textSecondary,
          backgroundColor: isActive ? theme.accentBg : 'transparent',
          textDecoration: 'none',
          fontSize: '14px',
          transition: 'all 0.15s'
        })}
      >
        <item.icon size={20} />
        {item.label}
      </NavLink>
    )
  }

  return (
    <ThemeContext.Provider value={{ theme }}>
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: theme.bg
      }}>
        {/* Desktop Sidebar */}
        <aside style={{
          width: '240px',
          backgroundColor: theme.bgCard,
          borderRight: `1px solid ${theme.border}`,
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 40
        }}
        className="hidden md:flex"
        >
          {/* Logo/Company */}
          <div style={{
            padding: '20px 16px',
            borderBottom: `1px solid ${theme.border}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img src={logo} alt="Job Scout" style={{ height: '40px' }} />
              <div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>
                  Job Scout
                </div>
                {company && (
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>
                    {company.company_name}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav style={{
            flex: 1,
            padding: '16px 12px',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {navItems.map((item, index) => (
                <NavItem key={item.to || index} item={item} />
              ))}
            </div>
          </nav>

          {/* User/Logout */}
          <div style={{
            padding: '16px',
            borderTop: `1px solid ${theme.border}`
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '12px'
            }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: theme.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: '600',
                fontSize: '14px'
              }}>
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: theme.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {displayName}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: theme.textMuted,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {user?.role || 'User'}
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                padding: '10px',
                backgroundColor: 'transparent',
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                color: theme.textSecondary,
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.bgCardHover
                e.currentTarget.style.color = theme.text
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = theme.textSecondary
              }}
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Mobile Header */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: '60px',
            backgroundColor: theme.bgCard,
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            zIndex: 50
          }}
          className="md:hidden"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src={logo} alt="Job Scout" style={{ height: '32px' }} />
            <span style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>
              Job Scout
            </span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              padding: '8px',
              backgroundColor: 'transparent',
              border: 'none',
              color: theme.text,
              cursor: 'pointer'
            }}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <>
            <div
              onClick={() => setMobileMenuOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                zIndex: 45
              }}
              className="md:hidden"
            />
            <aside
              style={{
                position: 'fixed',
                top: '60px',
                left: 0,
                bottom: 0,
                width: '280px',
                backgroundColor: theme.bgCard,
                borderRight: `1px solid ${theme.border}`,
                zIndex: 46,
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto'
              }}
              className="md:hidden"
            >
              {company && (
                <div style={{
                  padding: '16px',
                  borderBottom: `1px solid ${theme.border}`
                }}>
                  <div style={{ fontSize: '14px', color: theme.textMuted }}>Company</div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
                    {company.company_name}
                  </div>
                </div>
              )}
              <nav style={{ flex: 1, padding: '16px 12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {navItems.map((item, index) => (
                    <NavItem key={item.to || index} item={item} mobile />
                  ))}
                </div>
              </nav>
              <div style={{
                padding: '16px',
                borderTop: `1px solid ${theme.border}`
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '12px'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: theme.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: '600'
                  }}>
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                      {displayName}
                    </div>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>
                      {user?.role || 'User'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '10px',
                    backgroundColor: 'transparent',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    color: theme.textSecondary,
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  <LogOut size={18} />
                  Sign Out
                </button>
              </div>
            </aside>
          </>
        )}

        {/* Main Content */}
        <main
          style={{
            flex: 1,
            marginLeft: '240px',
            minHeight: '100vh',
            backgroundColor: theme.bg
          }}
          className="md:ml-[240px] ml-0 mt-[60px] md:mt-0"
        >
          <Outlet />
        </main>
      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .hidden { display: none !important; }
          .md\\:hidden { display: flex !important; }
          .md\\:flex { display: none !important; }
          .md\\:ml-\\[240px\\] { margin-left: 0 !important; }
          .ml-0 { margin-left: 0 !important; }
          .mt-\\[60px\\] { margin-top: 60px !important; }
          .md\\:mt-0 { margin-top: 60px !important; }
        }
        @media (min-width: 769px) {
          .hidden { display: flex !important; }
          .md\\:hidden { display: none !important; }
          .md\\:flex { display: flex !important; }
          .md\\:ml-\\[240px\\] { margin-left: 240px !important; }
          .mt-\\[60px\\] { margin-top: 0 !important; }
          .md\\:mt-0 { margin-top: 0 !important; }
        }
      `}</style>
    </ThemeContext.Provider>
  )
}
