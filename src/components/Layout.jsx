import { useState, createContext, useContext } from 'react'
import { useNavigate, NavLink, Outlet } from 'react-router-dom'
import { useStore } from '../lib/store'
import FeedbackButton from './FeedbackButton'
import {
  LayoutDashboard,
  UserPlus,
  GitBranch,
  CalendarDays,
  Users,
  FileText,
  Briefcase,
  Calendar,
  Clock,
  Receipt,
  Package,
  UserCog,
  Truck,
  Warehouse,
  ClipboardList,
  Lightbulb,
  Building,
  FileStack,
  MessageSquare,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  CalendarCheck,
  Route,
  DollarSign,
  CreditCard,
  Zap,
  Gift,
  Tent,
  Bot,
  ChevronRight,
  Terminal,
  Headphones,
  UserCircle,
  Rocket,
  BookOpen
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
  const isDeveloper = useStore((state) => state.isDeveloper)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState({})

  const toggleMenu = (key) => {
    setExpandedMenus(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleLogout = async () => {
    await clearSession()
    navigate('/login')
  }

  // Get recruited agents from store
  const companyAgents = useStore((state) => state.companyAgents) || []
  const recruitedAgents = companyAgents.filter(ca => ca.subscription_status === 'active')

  // Dashboard link (always visible at top)
  const dashboardItem = { to: '/', icon: LayoutDashboard, label: 'Dashboard' }

  // Sales Flow - Numbered steps with tooltips (per design standards)
  const salesFlowItems = [
    { to: '/leads', icon: UserPlus, label: 'Leads', step: 1, hint: 'All potential customers start here', color: '#6b7280' },
    { to: '/lead-setter', icon: Headphones, label: 'Lead Setter', step: 2, hint: 'Call leads and schedule appointments', color: '#8b5cf6' },
    { to: '/pipeline', icon: GitBranch, label: 'Pipeline', step: 3, hint: 'Track leads through sales process', color: '#f59e0b' },
    { to: '/quotes', icon: FileText, label: 'Quotes', step: 4, hint: 'Create and send price quotes', color: '#3b82f6' },
    { to: '/jobs', icon: Briefcase, label: 'Jobs', step: 5, hint: 'Won quotes become jobs', color: '#22c55e' }
  ]

  // Grouped navigation structure - Clean 5-section menu
  const navSections = [
    {
      title: 'CRM',
      sectionIcon: Users,
      items: [
        { to: '/customers', icon: Users, label: 'Customers' },
        { to: '/appointments', icon: CalendarCheck, label: 'Appointments' }
      ]
    },
    {
      title: 'OPERATIONS',
      sectionIcon: Briefcase,
      items: [
        { to: '/jobs/calendar', icon: CalendarDays, label: 'Job Calendar' },
        { to: '/routes', icon: Route, label: 'Routes' },
        { to: '/inventory', icon: Warehouse, label: 'Inventory' },
        { to: '/products', icon: Package, label: 'Products & Services' }
      ]
    },
    {
      title: 'FINANCIAL',
      sectionIcon: DollarSign,
      items: [
        { to: '/books', icon: BookOpen, label: 'Books' },
        { to: '/invoices', icon: Receipt, label: 'Invoices' },
        { to: '/lead-payments', icon: CreditCard, label: 'Payments' },
        { to: '/expenses', icon: DollarSign, label: 'Expenses' }
      ]
    },
    {
      title: 'TEAM',
      sectionIcon: UserCircle,
      items: [
        { to: '/employees', icon: UserCog, label: 'Employees' },
        { to: '/time-clock', icon: Clock, label: 'Time Clock' },
        { to: '/payroll', icon: DollarSign, label: 'Payroll' }
      ],
      hasCrewSection: true
    },
    {
      title: 'BASE CAMP',
      sectionIcon: Rocket,
      items: [
        { to: '/base-camp', icon: Tent, label: 'Agent Marketplace' },
        { to: '/robot-marketplace', icon: Bot, label: 'Robot Marketplace' },
        { to: '/settings', icon: Settings, label: 'Settings' }
      ]
    }
  ]

  // Agent icon mapping
  const agentIcons = {
    'lenard': Lightbulb,
    'freddy': Truck
  }

  // Dev section - only shown for developers (handled separately for red styling)
  const devSection = isDeveloper ? {
    title: 'DEVELOPMENT & MAINT.',
    items: [
      { to: '/admin/data-console', icon: Terminal, label: 'Data Console' }
    ],
    isDev: true
  } : null

  const displayName = user?.name || user?.email || 'User'

  const NavItem = ({ item, mobile = false }) => (
    <NavLink
      to={item.to}
      end={item.to === '/' || item.to === '/jobs' || item.to === '/lighting-audits'}
      onClick={() => mobile && setMobileMenuOpen(false)}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
        borderRadius: '6px',
        color: isActive ? theme.accent : theme.textMuted,
        backgroundColor: isActive ? theme.accentBg : 'transparent',
        textDecoration: 'none',
        fontSize: '13px',
        fontWeight: isActive ? '500' : '400',
        transition: 'all 0.15s ease'
      })}
    >
      <item.icon size={18} />
      {item.label}
    </NavLink>
  )

  const ExpandableNavItem = ({ item, mobile = false }) => {
    const isExpanded = expandedMenus[item.key]
    return (
      <div>
        <button
          onClick={() => toggleMenu(item.key)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 12px',
            borderRadius: '6px',
            color: isExpanded ? theme.accent : theme.textMuted,
            backgroundColor: isExpanded ? theme.accentBg : 'transparent',
            border: 'none',
            width: '100%',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: isExpanded ? '500' : '400',
            transition: 'all 0.15s ease',
            textAlign: 'left'
          }}
        >
          <item.icon size={18} />
          <span style={{ flex: 1 }}>{item.label}</span>
          <ChevronRight
            size={14}
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease'
            }}
          />
        </button>
        {isExpanded && (
          <div style={{ marginLeft: '28px', marginTop: '2px' }}>
            {item.subItems.map((subItem) => (
              <NavLink
                key={subItem.to}
                to={subItem.to}
                end={subItem.to === '/agents/lenard' || subItem.to === '/agents/freddy'}
                onClick={() => mobile && setMobileMenuOpen(false)}
                style={({ isActive }) => ({
                  display: 'block',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  color: isActive ? theme.accent : theme.textMuted,
                  backgroundColor: isActive ? theme.accentBg : 'transparent',
                  textDecoration: 'none',
                  fontSize: '12px',
                  fontWeight: isActive ? '500' : '400',
                  transition: 'all 0.15s ease'
                })}
              >
                {subItem.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    )
  }

  const NavSection = ({ section, mobile = false }) => (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        fontSize: '10px',
        fontWeight: '600',
        color: section.isDev ? '#ef4444' : theme.textMuted,
        letterSpacing: '0.05em',
        padding: section.isDev ? '16px 12px 4px' : '8px 12px 4px',
        textTransform: 'uppercase'
      }}>
        {section.title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {section.items.map((item) => (
          item.expandable ? (
            <ExpandableNavItem key={item.key} item={item} mobile={mobile} />
          ) : section.isDev ? (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => mobile && setMobileMenuOpen(false)}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                borderRadius: '6px',
                color: isActive ? '#f97316' : '#ef4444',
                backgroundColor: isActive ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: isActive ? '500' : '400',
                transition: 'all 0.15s ease'
              })}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ) : (
            <NavItem key={item.to} item={item} mobile={mobile} />
          )
        ))}
      </div>

      {/* MY AI CREW - Boxed Section (only in TEAM section) */}
      {section.hasCrewSection && recruitedAgents.length > 0 && (
        <div style={{
          margin: '8px 12px',
          padding: '12px',
          backgroundColor: 'rgba(168,85,247,0.1)',
          border: '1px solid rgba(168,85,247,0.3)',
          borderRadius: '8px'
        }}>
          <div style={{
            fontSize: '10px',
            fontWeight: '600',
            color: '#a855f7',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <Bot size={12} />
            My AI Crew
          </div>
          {recruitedAgents.map(ca => {
            const agent = ca.agent
            const AgentIcon = agentIcons[agent?.slug] || Bot
            return (
              <NavLink
                key={ca.id}
                to={`/agents/${agent?.slug}`}
                onClick={() => mobile && setMobileMenuOpen(false)}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  color: isActive ? '#a855f7' : '#9ca3af',
                  backgroundColor: isActive ? 'rgba(168,85,247,0.15)' : 'transparent',
                  textDecoration: 'none',
                  fontSize: '12px',
                  fontWeight: isActive ? '500' : '400',
                  transition: 'all 0.15s ease'
                })}
              >
                <AgentIcon size={14} />
                {ca.custom_name || agent?.name}
              </NavLink>
            )
          })}
        </div>
      )}
    </div>
  )

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
            padding: '8px 8px',
            overflowY: 'auto'
          }}>
            {/* Dashboard Link - Always at top */}
            <div style={{ marginBottom: '8px' }}>
              <NavLink
                to="/"
                end
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  color: isActive ? theme.accent : theme.textMuted,
                  backgroundColor: isActive ? theme.accentBg : 'transparent',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: '600',
                  transition: 'all 0.15s ease'
                })}
              >
                <LayoutDashboard size={20} />
                Dashboard
              </NavLink>
            </div>

            {/* Sales Flow - Numbered Steps */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                fontSize: '10px',
                fontWeight: '600',
                color: theme.textMuted,
                letterSpacing: '0.05em',
                padding: '8px 12px 4px',
                textTransform: 'uppercase'
              }}>
                Sales Flow
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {salesFlowItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={item.hint}
                    style={({ isActive }) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      color: isActive ? item.color : theme.textMuted,
                      backgroundColor: isActive ? item.color + '15' : 'transparent',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: isActive ? '500' : '400',
                      transition: 'all 0.15s ease',
                      minHeight: '40px'
                    })}
                  >
                    <div style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      backgroundColor: item.color + '20',
                      color: item.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: '700',
                      flexShrink: 0
                    }}>
                      {item.step}
                    </div>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    <item.icon size={16} style={{ opacity: 0.6 }} />
                  </NavLink>
                ))}
              </div>
            </div>

            {navSections.map((section) => (
              <NavSection key={section.title} section={section} />
            ))}
            {devSection && <NavSection section={devSection} />}
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
              <nav style={{ flex: 1, padding: '8px 8px' }}>
                {/* Dashboard Link - Mobile */}
                <div style={{ marginBottom: '8px' }}>
                  <NavLink
                    to="/"
                    end
                    onClick={() => setMobileMenuOpen(false)}
                    style={({ isActive }) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      color: isActive ? theme.accent : theme.textMuted,
                      backgroundColor: isActive ? theme.accentBg : 'transparent',
                      textDecoration: 'none',
                      fontSize: '14px',
                      fontWeight: '600',
                      transition: 'all 0.15s ease'
                    })}
                  >
                    <LayoutDashboard size={20} />
                    Dashboard
                  </NavLink>
                </div>

                {/* Sales Flow - Mobile (Numbered Steps) */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    fontSize: '10px',
                    fontWeight: '600',
                    color: theme.textMuted,
                    letterSpacing: '0.05em',
                    padding: '8px 12px 4px',
                    textTransform: 'uppercase'
                  }}>
                    Sales Flow
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    {salesFlowItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileMenuOpen(false)}
                        style={({ isActive }) => ({
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          color: isActive ? item.color : theme.textMuted,
                          backgroundColor: isActive ? item.color + '15' : 'transparent',
                          textDecoration: 'none',
                          fontSize: '14px',
                          fontWeight: isActive ? '500' : '400',
                          transition: 'all 0.15s ease',
                          minHeight: '44px' // Touch-friendly
                        })}
                      >
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: item.color + '20',
                          color: item.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: '700',
                          flexShrink: 0
                        }}>
                          {item.step}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div>{item.label}</div>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '1px' }}>
                            {item.hint}
                          </div>
                        </div>
                      </NavLink>
                    ))}
                  </div>
                </div>

                {navSections.map((section) => (
                  <NavSection key={section.title} section={section} mobile />
                ))}
                {devSection && <NavSection section={devSection} mobile />}
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

      {/* Feedback Button */}
      <FeedbackButton />

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

          /* Mobile grid responsiveness */
          .responsive-grid {
            grid-template-columns: 1fr !important;
          }
          .responsive-grid-2 {
            grid-template-columns: 1fr !important;
          }

          /* Mobile table scroll */
          .table-wrapper {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          /* Mobile padding adjustments */
          .page-padding {
            padding: 16px !important;
          }

          /* Mobile header flex wrap */
          .page-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }

          /* Mobile stat cards */
          .stat-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12px !important;
          }

          /* Mobile modal */
          .modal-content {
            width: 95vw !important;
            max-width: 95vw !important;
            max-height: 90vh !important;
            margin: 5vh auto !important;
          }

          /* Mobile form layout */
          .form-grid {
            grid-template-columns: 1fr !important;
          }

          /* Mobile button stack */
          .button-group {
            flex-direction: column !important;
            width: 100% !important;
          }
          .button-group button {
            width: 100% !important;
          }
        }

        @media (min-width: 769px) {
          .hidden { display: flex !important; }
          .md\\:hidden { display: none !important; }
          .md\\:flex { display: flex !important; }
          .md\\:ml-\\[260px\\] { margin-left: 260px !important; }
          .mt-\\[64px\\] { margin-top: 0 !important; }
          .md\\:mt-0 { margin-top: 0 !important; }
        }

        @media (max-width: 480px) {
          /* Extra small devices */
          .stat-grid {
            grid-template-columns: 1fr !important;
          }
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

        /* Global responsive utilities */
        * {
          box-sizing: border-box;
        }

        /* Prevent horizontal scroll */
        html, body {
          overflow-x: hidden;
        }
      `}</style>
    </ThemeContext.Provider>
  )
}
