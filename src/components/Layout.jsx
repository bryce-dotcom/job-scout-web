import { useState, createContext, useContext, useMemo } from 'react'
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
  BookOpen,
  Wrench,
  Settings as SettingsIcon,
  X as XIcon,
  Database
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
  const aiModules = useStore((state) => state.aiModules) || []
  const updateAgentPlacement = useStore((state) => state.updateAgentPlacement)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState({})
  const [showAgentSettings, setShowAgentSettings] = useState(false)
  const [editingAgent, setEditingAgent] = useState(null)

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

  // Helper to get effective section for an agent (user override > default)
  const getAgentSection = (agent) => agent.user_menu_section || agent.default_menu_section
  const getAgentParent = (agent) => agent.user_menu_parent !== undefined ? agent.user_menu_parent : agent.default_menu_parent

  // Get agents for a specific section (optionally filtered by parent)
  const getAgentsForSection = (sectionName, parentLabel = null) => {
    return aiModules.filter(agent => {
      const effectiveSection = getAgentSection(agent)
      const effectiveParent = getAgentParent(agent)
      if (effectiveSection !== sectionName) return false
      if (parentLabel === null) {
        // Section-level agents (no parent)
        return !effectiveParent
      }
      return effectiveParent === parentLabel
    })
  }

  // Menu sections for agent placement settings
  const menuSectionOptions = [
    { value: 'SALES_FLOW', label: 'Sales Flow' },
    { value: 'CUSTOMERS', label: 'Customers' },
    { value: 'OPERATIONS', label: 'Operations' },
    { value: 'FINANCIAL', label: 'Financial' },
    { value: 'TEAM', label: 'Team' }
  ]

  // Menu parent options per section
  const menuParentOptions = {
    SALES_FLOW: [
      { value: '', label: '(Section level)' },
      { value: 'Leads', label: 'Under Leads' },
      { value: 'Lead Setter', label: 'Under Lead Setter' },
      { value: 'Pipeline', label: 'Under Pipeline' },
      { value: 'Quotes', label: 'Under Quotes' },
      { value: 'Jobs', label: 'Under Jobs' }
    ],
    CUSTOMERS: [
      { value: '', label: '(Section level)' },
      { value: 'Customers', label: 'Under Customers' },
      { value: 'Appointments', label: 'Under Appointments' }
    ],
    OPERATIONS: [
      { value: '', label: '(Section level)' },
      { value: 'Job Board', label: 'Under Job Board' },
      { value: 'Products & Services', label: 'Under Products & Services' },
      { value: 'Inventory', label: 'Under Inventory' }
    ],
    FINANCIAL: [
      { value: '', label: '(Section level)' },
      { value: 'Invoices', label: 'Under Invoices' },
      { value: 'Payments', label: 'Under Payments' },
      { value: 'Expenses', label: 'Under Expenses' }
    ],
    TEAM: [
      { value: '', label: '(Section level)' },
      { value: 'Employees', label: 'Under Employees' },
      { value: 'Time Clock', label: 'Under Time Clock' }
    ]
  }

  // Handle saving agent placement
  const handleSaveAgentPlacement = async (agent, newSection, newParent) => {
    await updateAgentPlacement(agent.id, newSection, newParent || null)
    setEditingAgent(null)
  }

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

  // Base navigation sections (without dynamically placed agents)
  const baseNavSections = [
    {
      key: 'CUSTOMERS',
      title: 'CUSTOMERS',
      sectionIcon: Users,
      baseItems: [
        { to: '/customers', icon: Users, label: 'Customers', hint: 'View and manage all your customers' },
        { to: '/appointments', icon: CalendarCheck, label: 'Appointments', hint: 'All scheduled meetings and site visits' }
      ]
    },
    {
      key: 'OPERATIONS',
      title: 'OPERATIONS',
      sectionIcon: Wrench,
      baseItems: [
        { to: '/job-board', icon: ClipboardList, label: 'Job Board', hint: 'PM workspace to schedule and track job sections' },
        { to: '/products', icon: Package, label: 'Products & Services', hint: 'Your product catalog and pricing' },
        { to: '/inventory', icon: Warehouse, label: 'Inventory', hint: 'Track materials tools and consumables' }
      ]
    },
    {
      key: 'FINANCIAL',
      title: 'FINANCIAL',
      sectionIcon: DollarSign,
      baseItems: [
        { to: '/invoices', icon: Receipt, label: 'Invoices', hint: 'Create and track customer invoices' },
        { to: '/lead-payments', icon: CreditCard, label: 'Payments', hint: 'Record and manage payments received' },
        { to: '/expenses', icon: DollarSign, label: 'Expenses', hint: 'Track business expenses and costs' }
      ]
    },
    {
      key: 'TEAM',
      title: 'TEAM',
      sectionIcon: Users,
      baseItems: [
        { to: '/employees', icon: UserCog, label: 'Employees', hint: 'Manage team members and roles' },
        { to: '/time-clock', icon: Clock, label: 'Time Clock', hint: 'Clock in and out track hours worked' }
      ]
    }
  ]

  // Build dynamic nav sections with agents injected
  const navSections = useMemo(() => {
    return baseNavSections.map(section => {
      const items = []

      // Add base items with any child agents
      section.baseItems.forEach(item => {
        items.push(item)
        // Check for agents placed under this menu item
        const childAgents = getAgentsForSection(section.key, item.label)
        childAgents.forEach(agent => {
          items.push({
            to: agent.route_path,
            icon: Bot,
            label: agent.display_name,
            hint: agent.description,
            isAgent: true,
            isChildAgent: true
          })
        })
      })

      // Add section-level agents (no parent)
      const sectionAgents = getAgentsForSection(section.key, null)
      sectionAgents.forEach(agent => {
        items.push({
          to: agent.route_path,
          icon: Bot,
          label: agent.display_name,
          hint: agent.description,
          isAgent: true
        })
      })

      return {
        title: section.title,
        sectionIcon: section.sectionIcon,
        items
      }
    })
  }, [aiModules])

  // AI CREW section - always shows all active agents
  const aiCrewSection = useMemo(() => ({
    title: 'AI CREW',
    sectionIcon: Bot,
    items: aiModules.map(agent => ({
      to: agent.route_path,
      icon: Bot,
      label: agent.display_name,
      hint: agent.description,
      isAgent: true
    })),
    isAiSection: true,
    hasSettings: true
  }), [aiModules])

  // Agent icon mapping
  const agentIcons = {
    'lenard': Lightbulb,
    'freddy': Truck
  }

  // Get agents placed under specific Sales Flow items
  const getSalesFlowChildAgents = (parentLabel) => {
    return aiModules.filter(agent => {
      const section = getAgentSection(agent)
      const parent = getAgentParent(agent)
      return section === 'SALES_FLOW' && parent === parentLabel
    })
  }

  // Get current user's access level from store
  const currentUserRole = user?.user_role || user?.role
  const isAdminOrOwner = currentUserRole === 'Admin' || currentUserRole === 'Owner'

  // Admin section - shown to Admin/Owner access levels
  const adminSection = isAdminOrOwner ? {
    title: 'ADMIN',
    sectionIcon: Settings,
    items: [
      { to: '/settings', icon: Settings, label: 'Settings', hint: 'Company and app settings' },
      { to: '/reports', icon: BarChart3, label: 'Reports', hint: 'Business reports and analytics' }
    ],
    isAdmin: true
  } : null

  // Dev section - only shown for super admins (isDeveloper flag)
  const devSection = isDeveloper ? {
    title: 'DEV & MAINT.',
    sectionIcon: Wrench,
    items: [
      { to: '/advanced-tools', icon: Wrench, label: 'Advanced Tools', hint: 'Advanced system tools and configuration' },
      { to: '/admin/data-console', icon: Database, label: 'Data Console', hint: 'Database management and developer tools' }
    ],
    isDev: true
  } : null

  const displayName = user?.name || user?.email || 'User'

  const NavItem = ({ item, mobile = false }) => (
    <NavLink
      to={item.to}
      end={item.to === '/' || item.to === '/jobs' || item.to === '/lighting-audits'}
      onClick={() => mobile && setMobileMenuOpen(false)}
      title={item.hint}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: item.isChildAgent ? '6px' : '10px',
        padding: item.isChildAgent ? '5px 10px' : '8px 12px',
        marginLeft: item.isChildAgent ? '28px' : 0,
        borderRadius: item.isChildAgent ? '4px' : '6px',
        color: item.isAgent ? (isActive ? '#a855f7' : theme.textMuted) : (isActive ? theme.accent : theme.textMuted),
        backgroundColor: item.isAgent ? (isActive ? 'rgba(168,85,247,0.12)' : 'transparent') : (isActive ? theme.accentBg : 'transparent'),
        textDecoration: 'none',
        fontSize: item.isChildAgent ? '11px' : '13px',
        fontWeight: isActive ? '500' : '400',
        transition: 'all 0.15s ease',
        minHeight: mobile ? (item.isChildAgent ? '36px' : '44px') : (item.isChildAgent ? '28px' : '36px')
      })}
    >
      <item.icon size={item.isChildAgent ? 12 : 18} style={{ color: item.isAgent ? '#a855f7' : undefined }} />
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

  const NavSection = ({ section, mobile = false }) => {
    const SectionIcon = section.sectionIcon
    const getSectionColor = () => {
      if (section.isDev) return '#ef4444' // Red for super admin
      if (section.isAdmin) return '#f59e0b' // Orange/amber for admin
      if (section.isAiSection) return '#a855f7' // Purple for AI
      return theme.textMuted
    }
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          fontSize: '10px',
          fontWeight: '600',
          color: getSectionColor(),
          letterSpacing: '0.05em',
          padding: (section.isDev || section.isAdmin) ? '16px 12px 4px' : '8px 12px 4px',
          textTransform: 'uppercase',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          {SectionIcon && <SectionIcon size={12} />}
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
                title={item.hint}
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
                  transition: 'all 0.15s ease',
                  minHeight: mobile ? '44px' : '36px'
                })}
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ) : section.isAdmin ? (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => mobile && setMobileMenuOpen(false)}
                title={item.hint}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  color: isActive ? '#f59e0b' : '#d97706',
                  backgroundColor: isActive ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: isActive ? '500' : '400',
                  transition: 'all 0.15s ease',
                  minHeight: mobile ? '44px' : '36px'
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
      </div>
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
            padding: '8px 8px',
            overflowY: 'auto'
          }}>
            {/* Dashboard Link - Always at top */}
            <div style={{ marginBottom: '8px' }}>
              <NavLink
                to="/"
                end
                title="Overview of your business metrics and activity"
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
                  <div key={item.to}>
                    <NavLink
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
                    {/* Dynamic AI Agents - Child list under each Sales Flow item */}
                    {getSalesFlowChildAgents(item.label).length > 0 && (
                      <div style={{ marginLeft: '34px', marginTop: '2px', marginBottom: '4px' }}>
                        {getSalesFlowChildAgents(item.label).map(agent => (
                          <NavLink
                            key={agent.id}
                            to={agent.route_path}
                            title={agent.description}
                            style={({ isActive }) => ({
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '5px 10px',
                              borderRadius: '4px',
                              color: isActive ? '#a855f7' : theme.textMuted,
                              backgroundColor: isActive ? 'rgba(168,85,247,0.1)' : 'transparent',
                              textDecoration: 'none',
                              fontSize: '11px',
                              fontWeight: isActive ? '500' : '400',
                              transition: 'all 0.15s ease'
                            })}
                          >
                            <Bot size={12} style={{ color: '#a855f7' }} />
                            {agent.display_name}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {navSections.map((section) => (
              <NavSection key={section.title} section={section} />
            ))}

            {/* AI CREW Section with Settings */}
            {aiModules.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '10px',
                  fontWeight: '600',
                  color: '#a855f7',
                  letterSpacing: '0.05em',
                  padding: '8px 12px 4px',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Bot size={12} />
                    AI CREW
                  </div>
                  <button
                    onClick={() => setShowAgentSettings(true)}
                    title="Configure AI agent menu placement"
                    style={{
                      padding: '4px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#a855f7',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <SettingsIcon size={12} />
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  {aiModules.map((agent) => (
                    <NavLink
                      key={agent.id}
                      to={agent.route_path}
                      title={agent.description}
                      style={({ isActive }) => ({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        color: isActive ? '#a855f7' : theme.textMuted,
                        backgroundColor: isActive ? 'rgba(168,85,247,0.12)' : 'transparent',
                        textDecoration: 'none',
                        fontSize: '13px',
                        fontWeight: isActive ? '500' : '400',
                        transition: 'all 0.15s ease',
                        minHeight: '36px'
                      })}
                    >
                      <Bot size={18} style={{ color: '#a855f7' }} />
                      {agent.display_name}
                    </NavLink>
                  ))}
                </div>
              </div>
            )}

            {adminSection && <NavSection section={adminSection} />}
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
                    title="Overview of your business metrics and activity"
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
                      transition: 'all 0.15s ease',
                      minHeight: '44px'
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
                      <div key={item.to}>
                        <NavLink
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
                        {/* Dynamic AI Agents - Child list under each Sales Flow item - Mobile */}
                        {getSalesFlowChildAgents(item.label).length > 0 && (
                          <div style={{ marginLeft: '36px', marginTop: '2px', marginBottom: '4px' }}>
                            {getSalesFlowChildAgents(item.label).map(agent => (
                              <NavLink
                                key={agent.id}
                                to={agent.route_path}
                                onClick={() => setMobileMenuOpen(false)}
                                title={agent.description}
                                style={({ isActive }) => ({
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '8px 10px',
                                  borderRadius: '4px',
                                  color: isActive ? '#a855f7' : theme.textMuted,
                                  backgroundColor: isActive ? 'rgba(168,85,247,0.1)' : 'transparent',
                                  textDecoration: 'none',
                                  fontSize: '12px',
                                  fontWeight: isActive ? '500' : '400',
                                  transition: 'all 0.15s ease',
                                  minHeight: '36px'
                                })}
                              >
                                <Bot size={14} style={{ color: '#a855f7' }} />
                                {agent.display_name}
                              </NavLink>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {navSections.map((section) => (
                  <NavSection key={section.title} section={section} mobile />
                ))}

                {/* AI CREW Section with Settings - Mobile */}
                {aiModules.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{
                      fontSize: '10px',
                      fontWeight: '600',
                      color: '#a855f7',
                      letterSpacing: '0.05em',
                      padding: '8px 12px 4px',
                      textTransform: 'uppercase',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Bot size={12} />
                        AI CREW
                      </div>
                      <button
                        onClick={() => setShowAgentSettings(true)}
                        title="Configure AI agent menu placement"
                        style={{
                          padding: '4px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: '#a855f7',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <SettingsIcon size={12} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      {aiModules.map((agent) => (
                        <NavLink
                          key={agent.id}
                          to={agent.route_path}
                          onClick={() => setMobileMenuOpen(false)}
                          title={agent.description}
                          style={({ isActive }) => ({
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px 12px',
                            borderRadius: '6px',
                            color: isActive ? '#a855f7' : theme.textMuted,
                            backgroundColor: isActive ? 'rgba(168,85,247,0.12)' : 'transparent',
                            textDecoration: 'none',
                            fontSize: '14px',
                            fontWeight: isActive ? '500' : '400',
                            transition: 'all 0.15s ease',
                            minHeight: '44px'
                          })}
                        >
                          <Bot size={18} style={{ color: '#a855f7' }} />
                          {agent.display_name}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                )}

                {adminSection && <NavSection section={adminSection} mobile />}
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

      {/* Agent Settings Modal */}
      {showAgentSettings && (
        <>
          <div
            onClick={() => { setShowAgentSettings(false); setEditingAgent(null); }}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 100
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              boxShadow: theme.shadowLg,
              width: '90%',
              maxWidth: '500px',
              maxHeight: '80vh',
              overflow: 'hidden',
              zIndex: 101
            }}
          >
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Bot size={20} style={{ color: '#a855f7' }} />
                <span style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
                  AI Agent Placement
                </span>
              </div>
              <button
                onClick={() => { setShowAgentSettings(false); setEditingAgent(null); }}
                style={{
                  padding: '6px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: theme.textMuted,
                  cursor: 'pointer',
                  borderRadius: '4px'
                }}
              >
                <XIcon size={20} />
              </button>
            </div>

            <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(80vh - 60px)' }}>
              <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '16px' }}>
                Customize where each AI agent appears in your menu. Changes are saved automatically.
              </p>

              {aiModules.map(agent => {
                const isEditing = editingAgent?.id === agent.id
                const effectiveSection = getAgentSection(agent)
                const effectiveParent = getAgentParent(agent)

                return (
                  <div
                    key={agent.id}
                    style={{
                      padding: '12px',
                      backgroundColor: isEditing ? theme.accentBg : theme.bg,
                      borderRadius: '8px',
                      marginBottom: '8px',
                      border: `1px solid ${isEditing ? theme.accent : theme.border}`
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: isEditing ? '12px' : 0
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Bot size={18} style={{ color: '#a855f7' }} />
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                            {agent.display_name}
                          </div>
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>
                            {menuSectionOptions.find(s => s.value === effectiveSection)?.label || effectiveSection}
                            {effectiveParent && ` > ${effectiveParent}`}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setEditingAgent(isEditing ? null : agent)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: isEditing ? theme.accent : 'transparent',
                          border: `1px solid ${isEditing ? theme.accent : theme.border}`,
                          borderRadius: '6px',
                          color: isEditing ? '#fff' : theme.textMuted,
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        {isEditing ? 'Done' : 'Edit'}
                      </button>
                    </div>

                    {isEditing && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div>
                          <label style={{ fontSize: '12px', color: theme.textSecondary, display: 'block', marginBottom: '4px' }}>
                            Menu Section
                          </label>
                          <select
                            value={agent.user_menu_section || agent.default_menu_section}
                            onChange={(e) => {
                              const newSection = e.target.value
                              handleSaveAgentPlacement(agent, newSection, '')
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              backgroundColor: theme.bgCard,
                              border: `1px solid ${theme.border}`,
                              borderRadius: '6px',
                              color: theme.text,
                              fontSize: '13px'
                            }}
                          >
                            {menuSectionOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ fontSize: '12px', color: theme.textSecondary, display: 'block', marginBottom: '4px' }}>
                            Show Under
                          </label>
                          <select
                            value={agent.user_menu_parent !== undefined ? (agent.user_menu_parent || '') : (agent.default_menu_parent || '')}
                            onChange={(e) => {
                              const currentSection = agent.user_menu_section || agent.default_menu_section
                              handleSaveAgentPlacement(agent, currentSection, e.target.value)
                            }}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              backgroundColor: theme.bgCard,
                              border: `1px solid ${theme.border}`,
                              borderRadius: '6px',
                              color: theme.text,
                              fontSize: '13px'
                            }}
                          >
                            {(menuParentOptions[agent.user_menu_section || agent.default_menu_section] || []).map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>

                        <button
                          onClick={() => handleSaveAgentPlacement(agent, null, null)}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: 'transparent',
                            border: `1px solid ${theme.border}`,
                            borderRadius: '6px',
                            color: theme.textMuted,
                            fontSize: '11px',
                            cursor: 'pointer',
                            alignSelf: 'flex-start'
                          }}
                        >
                          Reset to Default
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {aiModules.length === 0 && (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  color: theme.textMuted
                }}>
                  <Bot size={32} style={{ opacity: 0.5, marginBottom: '8px' }} />
                  <p>No AI agents installed yet.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

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
