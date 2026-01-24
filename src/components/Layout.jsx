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

// Theme context
const ThemeContext = createContext(null)

// Job Scout Theme - Light Topo
const theme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  bgCardHover: '#eef2eb',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentHover: '#4a5239',
  accentBg: 'rgba(90,99,73,0.12)',
  shadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
  shadowLg: '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)'
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  return context || { theme }
}

// SVG Topo Map Pattern - subtle tan contour lines
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
        {/* Flowing contour lines */}
        <path
          d="M0,40 Q30,20 60,35 Q100,55 140,30 Q180,10 200,40"
          fill="none"
          stroke="#c4b59a"
          strokeWidth="1"
        />
        <path
          d="M0,70 Q50,50 100,70 T200,70"
          fill="none"
          stroke="#c4b59a"
          strokeWidth="1"
        />
        <path
          d="M0,100 Q25,80 50,95 Q80,115 120,85 Q160,55 200,100"
          fill="none"
          stroke="#c4b59a"
          strokeWidth="1"
        />
        <path
          d="M0,130 Q40,110 80,125 Q130,145 170,115 Q200,90 200,130"
          fill="none"
          stroke="#c4b59a"
          strokeWidth="1"
        />
        <path
          d="M0,160 Q60,140 100,160 T200,160"
          fill="none"
          stroke="#c4b59a"
          strokeWidth="1"
        />
        <path
          d="M0,190 Q35,170 70,185 Q110,200 150,175 Q200,150 200,190"
          fill="none"
          stroke="#c4b59a"
          strokeWidth="1"
        />
        {/* Vertical flowing lines */}
        <path
          d="M40,0 Q25,50 40,100 Q55,150 40,200"
          fill="none"
          stroke="#c4b59a"
          strokeWidth="0.8"
        />
        <path
          d="M100,0 Q85,40 100,80 Q115,120 100,160 Q85,200 100,200"
          fill="none"
          stroke="#c4b59a"
          strokeWidth="0.8"
        />
        <path
          d="M160,0 Q175,50 160,100 Q145,150 160,200"
          fill="none"
          stroke="#c4b59a"
          strokeWidth="0.8"
        />
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
              transition: 'all 0.15s ease'
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
                transition: 'transform 0.15s ease'
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
                    borderLeft: isActive ? `3px solid ${theme.accent}` : '3px solid transparent',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: isActive ? '500' : '400',
                    transition: 'all 0.15s ease'
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
          borderLeft: isActive ? `3px solid ${theme.accent}` : '3px solid transparent',
          textDecoration: 'none',
          fontSize: '14px',
          fontWeight: isActive ? '500' : '400',
          transition: 'all 0.15s ease'
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
          boxShadow: theme.shadow
        }}
        className="hidden md:flex"
        >
          {/* Logo/Company */}
          <div style={{
            padding: '20px',
            borderBottom: `1px solid ${theme.border}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img
                src="/Scout_LOGO_GUY.png"
                alt="Job Scout"
                style={{
                  width: '48px',
                  height: '48px',
                  objectFit: 'contain'
                }}
              />
              <div>
                <div style={{
                  fontSize: '20px',
                  fontWeight: '700',
                  color: theme.accent,
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
                backgroundColor: theme.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: '600',
                fontSize: '16px'
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
                transition: 'all 0.15s ease'
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              src="/Scout_LOGO_GUY.png"
              alt="Job Scout"
              style={{
                width: '36px',
                height: '36px',
                objectFit: 'contain'
              }}
            />
            <span style={{
              fontSize: '18px',
              fontWeight: '700',
              color: theme.accent,
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
                backgroundColor: 'rgba(0,0,0,0.3)',
                zIndex: 45
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
            backgroundImage: 'url(/topo-bg.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed',
            backgroundColor: theme.bg
          }}
          className="md:ml-[260px] ml-0 mt-[64px] md:mt-0"
        >
          {/* Semi-transparent overlay for readability */}
          <div style={{
            backgroundColor: 'rgba(247,245,239,0.85)',
            minHeight: '100vh'
          }}>
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
