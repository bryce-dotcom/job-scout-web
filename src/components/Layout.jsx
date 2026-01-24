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
  ChevronDown,
  MapPin
} from 'lucide-react'
import logo from '../assets/logo.png'

// Theme context
const ThemeContext = createContext(null)

// Job Scout Theme - Forest Green with Topo aesthetic
const theme = {
  bg: '#0c1210',
  bgCard: '#151f1a',
  bgCardHover: '#1e2d25',
  border: '#2a3f32',
  text: '#f0fdf4',
  textSecondary: '#9cb3a3',
  textMuted: '#6b8073',
  accent: '#22c55e',
  accentHover: '#16a34a',
  accentBg: 'rgba(34,197,94,0.15)',
  shadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)',
  shadowLg: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.2)'
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  return context || { theme }
}

// SVG Topo Map Pattern - subtle contour lines
const TopoBackground = () => (
  <svg
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      opacity: 0.06,
      pointerEvents: 'none'
    }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <pattern id="topoPattern" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
        {/* Contour lines */}
        <path
          d="M0,50 Q50,20 100,50 T200,50"
          fill="none"
          stroke="#22c55e"
          strokeWidth="0.5"
        />
        <path
          d="M0,80 Q40,50 80,70 Q120,90 160,60 Q200,30 200,80"
          fill="none"
          stroke="#22c55e"
          strokeWidth="0.5"
        />
        <path
          d="M0,120 Q30,100 60,110 Q100,130 140,100 Q180,70 200,120"
          fill="none"
          stroke="#22c55e"
          strokeWidth="0.5"
        />
        <path
          d="M0,160 Q50,140 100,160 T200,160"
          fill="none"
          stroke="#22c55e"
          strokeWidth="0.5"
        />
        <path
          d="M50,0 Q30,50 50,100 Q70,150 50,200"
          fill="none"
          stroke="#22c55e"
          strokeWidth="0.5"
        />
        <path
          d="M150,0 Q170,60 150,100 Q130,140 150,200"
          fill="none"
          stroke="#22c55e"
          strokeWidth="0.5"
        />
        {/* Subtle circles for elevation markers */}
        <circle cx="100" cy="100" r="30" fill="none" stroke="#22c55e" strokeWidth="0.3" />
        <circle cx="100" cy="100" r="50" fill="none" stroke="#22c55e" strokeWidth="0.3" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#topoPattern)" />
  </svg>
)

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
              color: theme.textMuted,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme.bgCardHover
              e.currentTarget.style.color = theme.accent
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = theme.textMuted
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
                transition: 'transform 0.2s ease'
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
                    color: isActive ? theme.accent : theme.textMuted,
                    backgroundColor: isActive ? theme.accentBg : 'transparent',
                    textDecoration: 'none',
                    fontSize: '14px',
                    transition: 'all 0.2s ease'
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
          color: isActive ? theme.accent : theme.textMuted,
          backgroundColor: isActive ? theme.accentBg : 'transparent',
          textDecoration: 'none',
          fontSize: '14px',
          fontWeight: isActive ? '500' : '400',
          transition: 'all 0.2s ease'
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
          width: '260px',
          backgroundColor: theme.bgCard,
          borderRight: `1px solid ${theme.border}`,
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 40,
          boxShadow: theme.shadowLg
        }}
        className="hidden md:flex"
        >
          {/* Logo/Company */}
          <div style={{
            padding: '24px 20px',
            borderBottom: `1px solid ${theme.border}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                backgroundColor: theme.accentBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${theme.accent}30`
              }}>
                <MapPin size={24} style={{ color: theme.accent }} />
              </div>
              <div>
                <div style={{
                  fontSize: '18px',
                  fontWeight: '700',
                  color: theme.text,
                  letterSpacing: '-0.02em'
                }}>
                  Job Scout
                </div>
                {company && (
                  <div style={{
                    fontSize: '12px',
                    color: theme.textMuted,
                    marginTop: '2px'
                  }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
              padding: '12px',
              backgroundColor: theme.bg,
              borderRadius: '10px',
              marginBottom: '12px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accentHover} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: '600',
                fontSize: '16px',
                boxShadow: `0 2px 8px ${theme.accent}40`
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
                  {user?.role || 'Team Member'}
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
                color: theme.textMuted,
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.bgCardHover
                e.currentTarget.style.color = theme.text
                e.currentTarget.style.borderColor = theme.textMuted
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = theme.textMuted
                e.currentTarget.style.borderColor = theme.border
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
            height: '64px',
            backgroundColor: theme.bgCard,
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            zIndex: 50,
            boxShadow: theme.shadow
          }}
          className="md:hidden"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: theme.accentBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <MapPin size={20} style={{ color: theme.accent }} />
            </div>
            <span style={{
              fontSize: '18px',
              fontWeight: '700',
              color: theme.text,
              letterSpacing: '-0.02em'
            }}>
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
                backgroundColor: 'rgba(0,0,0,0.6)',
                zIndex: 45,
                backdropFilter: 'blur(4px)'
              }}
              className="md:hidden"
            />
            <aside
              style={{
                position: 'fixed',
                top: '64px',
                left: 0,
                bottom: 0,
                width: '280px',
                backgroundColor: theme.bgCard,
                borderRight: `1px solid ${theme.border}`,
                zIndex: 46,
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
                boxShadow: theme.shadowLg
              }}
              className="md:hidden"
            >
              {company && (
                <div style={{
                  padding: '16px',
                  borderBottom: `1px solid ${theme.border}`
                }}>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>
                    Company
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
                    {company.company_name}
                  </div>
                </div>
              )}
              <nav style={{ flex: 1, padding: '16px 12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
                  marginBottom: '12px',
                  padding: '12px',
                  backgroundColor: theme.bg,
                  borderRadius: '10px'
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accentHover} 100%)`,
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
                      {user?.role || 'Team Member'}
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
                    color: theme.textMuted,
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
            marginLeft: '260px',
            minHeight: '100vh',
            backgroundColor: theme.bg,
            position: 'relative'
          }}
          className="md:ml-[260px] ml-0 mt-[64px] md:mt-0"
        >
          {/* Topo Background */}
          <TopoBackground />

          {/* Content */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <Outlet />
          </div>
        </main>
      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .hidden { display: none !important; }
          .md\\:hidden { display: flex !important; }
          .md\\:flex { display: none !important; }
          .md\\:ml-\\[260px\\] { margin-left: 0 !important; }
          .ml-0 { margin-left: 0 !important; }
          .mt-\\[64px\\] { margin-top: 64px !important; }
          .md\\:mt-0 { margin-top: 64px !important; }
        }
        @media (min-width: 769px) {
          .hidden { display: flex !important; }
          .md\\:hidden { display: none !important; }
          .md\\:flex { display: flex !important; }
          .md\\:ml-\\[260px\\] { margin-left: 260px !important; }
          .mt-\\[64px\\] { margin-top: 0 !important; }
          .md\\:mt-0 { margin-top: 0 !important; }
        }

        /* Scrollbar styling */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: ${theme.bg};
        }
        ::-webkit-scrollbar-thumb {
          background: ${theme.border};
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: ${theme.textMuted};
        }
      `}</style>
    </ThemeContext.Provider>
  )
}
