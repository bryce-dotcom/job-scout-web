import { useState } from 'react'
import { useTheme } from '../../components/Layout'
import { STATUS } from '../../lib/schema'
import {
  ChevronDown, ChevronRight, ArrowRight, ArrowDown,
  UserPlus, Headphones, GitBranch, FileText, Briefcase,
  Users, Package, Receipt, DollarSign, Clock, Truck,
  Lightbulb, Bot, Compass, ClipboardList, Warehouse,
  CreditCard, BookOpen, UserCog, BarChart3, Settings,
  CheckCircle, XCircle, Pause, Play, Calendar,
  HelpCircle, Zap, MessageCircle, Camera, Mail
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// ─── Visual Components ──────────────────────────────────────────────

function FlowDiagram({ steps, theme }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', margin: '16px 0' }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{
            padding: '8px 14px',
            borderRadius: '8px',
            backgroundColor: step.color ? step.color + '18' : theme.accentBg,
            border: `1px solid ${step.color ? step.color + '40' : theme.border}`,
            color: step.color || theme.accent,
            fontSize: '13px',
            fontWeight: '600',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            {step.icon && <step.icon size={14} />}
            {step.label}
          </div>
          {i < steps.length - 1 && (
            <ArrowRight size={16} color={theme.textMuted} style={{ flexShrink: 0 }} />
          )}
        </div>
      ))}
    </div>
  )
}

function StatusPipeline({ statuses, colors, theme }) {
  const defaultColors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#6b7280', '#ef4444']
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '12px 0' }}>
      {statuses.map((s, i) => {
        const c = colors?.[s] || defaultColors[i % defaultColors.length]
        return (
          <span key={s} style={{
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '500',
            backgroundColor: c + '18',
            color: c,
            border: `1px solid ${c}30`,
          }}>
            {s}
          </span>
        )
      })}
    </div>
  )
}

function InfoBox({ title, children, color, theme }) {
  const c = color || theme.accent
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: '10px',
      backgroundColor: c + '10',
      border: `1px solid ${c}25`,
      marginBottom: '12px',
    }}>
      {title && (
        <div style={{ fontSize: '13px', fontWeight: '600', color: c, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Zap size={14} />
          {title}
        </div>
      )}
      <div style={{ fontSize: '13px', color: theme.text, lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

function EntityCard({ icon: Icon, title, description, theme }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: '10px',
      backgroundColor: theme.bgCard,
      border: `1px solid ${theme.border}`,
      display: 'flex',
      gap: '12px',
      alignItems: 'flex-start',
    }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: '8px',
        backgroundColor: theme.accentBg, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={18} color={theme.accent} />
      </div>
      <div>
        <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: 1.5 }}>{description}</div>
      </div>
    </div>
  )
}

// ─── Help Content (single object — edit here to update) ─────────────

const HELP_SECTIONS = [
  {
    id: 'overview',
    title: 'How JobScout Works',
    icon: HelpCircle,
    content: (theme) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          JobScout manages the full lifecycle of a field service business — from the first customer inquiry to final payment. Everything flows through a connected pipeline:
        </p>

        <FlowDiagram theme={theme} steps={[
          { label: 'Lead', icon: UserPlus, color: '#3b82f6' },
          { label: 'Appointment', icon: Calendar, color: '#8b5cf6' },
          { label: 'Estimate', icon: FileText, color: '#f59e0b' },
          { label: 'Won!', icon: CheckCircle, color: '#22c55e' },
          { label: 'Job', icon: Briefcase, color: '#5a6349' },
          { label: 'Invoice', icon: Receipt, color: '#3b82f6' },
          { label: 'Paid', icon: DollarSign, color: '#16a34a' },
        ]} />

        <InfoBox title="Key Concept" color="#3b82f6" theme={theme}>
          Every new business opportunity is a <strong>Lead</strong> — even for existing customers. A lead tracks the sales process. Once the deal is <strong>Won</strong>, it becomes a <strong>Job</strong>. If a customer calls for work that's already sold (no sales process needed), you can create a Job directly and skip the lead pipeline.
        </InfoBox>
      </div>
    )
  },
  {
    id: 'sales-flow',
    title: 'Sales Flow (Steps 1-5)',
    icon: GitBranch,
    content: (theme) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          The sidebar shows 5 numbered steps that represent the sales process:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <EntityCard icon={UserPlus} title="1. Leads" description="Where all prospects enter the system. A lead is any potential business opportunity — new customer inquiries, referrals, website forms, or repeat business from existing customers. Each lead tracks contact info, source, and current status." theme={theme} />
          <EntityCard icon={Headphones} title="2. Lead Setter" description="The calling workspace. Setters call leads, qualify them, and schedule appointments. Leads flow from 'New' → 'Contacted' → 'Appointment Set'. The setter earns commission per appointment set." theme={theme} />
          <EntityCard icon={GitBranch} title="3. Pipeline" description="Visual kanban board showing all leads by stage. Drag leads between columns to update their status. This is your bird's-eye view of the entire sales funnel." theme={theme} />
          <EntityCard icon={FileText} title="4. Estimates" description="Create price quotes for qualified leads. Add products from your catalog, apply labor rates, and send to the customer. When approved, the estimate can be converted to a Job." theme={theme} />
          <EntityCard icon={Briefcase} title="5. Jobs" description="Won deals become jobs. The kanban board shows jobs by stage: Chillin → Scheduled → In Progress → Completed. Each job has line items, sections, time tracking, and documents." theme={theme} />
        </div>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Lead Statuses</h4>
        <StatusPipeline statuses={STATUS.lead} colors={{
          'New': '#3b82f6', 'Contacted': '#8b5cf6', 'Appointment Set': '#22c55e',
          'Qualified': '#f97316', 'Quote Sent': '#eab308', 'Negotiation': '#f59e0b',
          'Won': '#10b981', 'Lost': '#64748b'
        }} theme={theme} />

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '16px 0 8px' }}>Job Statuses</h4>
        <StatusPipeline statuses={STATUS.job} colors={{
          'Chillin': '#6382bf', 'Scheduled': '#5a6349', 'In Progress': '#c28b38',
          'Completed': '#4a7c59', 'On Hold': '#7d8a7f', 'Cancelled': '#8b5a5a'
        }} theme={theme} />

        <InfoBox title="When to skip the pipeline" color="#22c55e" theme={theme}>
          If a customer calls and says "I need you to come fix my lights next week" — there's no sales process. Create the Job directly from the Jobs page. A tracking lead is auto-created in the background so your pipeline numbers stay accurate.
        </InfoBox>

        <InfoBox title="Auto-linking" color="#f59e0b" theme={theme}>
          When a lead is Won and converted to a Job, the system links the Lead → Quote → Job → Customer together. You can trace any record back through the chain using the breadcrumb at the top of the detail page.
        </InfoBox>
      </div>
    )
  },
  {
    id: 'customers',
    title: 'Customers',
    icon: Users,
    content: (theme) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Customers are the people and businesses you serve. A customer record is the central hub — it shows all related leads, estimates, jobs, invoices, and payments in one place.
        </p>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Customer Statuses</h4>
        <StatusPipeline statuses={STATUS.customer} colors={{
          'Active': '#16a34a', 'Inactive': '#6b7280', 'Prospect': '#f59e0b'
        }} theme={theme} />

        <InfoBox title="How customers get created" color="#3b82f6" theme={theme}>
          <strong>From Leads:</strong> When a lead is converted/won, the customer info is used to create (or link to) a customer record.<br />
          <strong>Manually:</strong> Add customers directly from the Customers page.<br />
          <strong>From Estimates:</strong> Creating an estimate on the Customer Detail page auto-creates a pipeline lead.
        </InfoBox>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '16px 0 8px' }}>Customer Detail Tabs</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
          {[
            { label: 'Info', desc: 'Contact details, address, notes' },
            { label: 'Leads', desc: 'All sales opportunities' },
            { label: 'Estimates', desc: 'Price quotes sent' },
            { label: 'Jobs', desc: 'Work orders linked' },
            { label: 'Invoices', desc: 'Bills issued' },
            { label: 'Payments', desc: 'Money received' },
          ].map(tab => (
            <div key={tab.label} style={{
              padding: '10px 12px', borderRadius: '8px',
              backgroundColor: theme.accentBg, border: `1px solid ${theme.border}`,
            }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: theme.accent }}>{tab.label}</div>
              <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>{tab.desc}</div>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    id: 'operations',
    title: 'Operations',
    icon: ClipboardList,
    content: (theme) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Day-to-day tools for running jobs in the field and managing your catalog.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <EntityCard icon={Compass} title="Field Scout" description="Daily dashboard for field technicians. Shows today's jobs, active clock-ins, and quick actions. Techs see only their assigned work." theme={theme} />
          <EntityCard icon={ClipboardList} title="Job Board (PM)" description="Project manager workspace. Schedule job sections, assign techs to sections, drag to reorder priorities. Gantt-style view of who's doing what." theme={theme} />
          <EntityCard icon={Package} title="Products & Services" description="Your product catalog. Each product has pricing, labor rates, and can be grouped into packages. Used when building estimates and job line items." theme={theme} />
          <EntityCard icon={Warehouse} title="Inventory" description="Track materials, tools, and consumables. Set reorder points, assign to locations or vehicles. Low-stock alerts help you stay ahead." theme={theme} />
        </div>
      </div>
    )
  },
  {
    id: 'financial',
    title: 'Financial',
    icon: DollarSign,
    content: (theme) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Track money in and money out. Admin+ access required.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <EntityCard icon={Receipt} title="Invoices" description="Generate invoices from completed jobs. Tracks payment status (Draft → Sent → Paid). Includes utility incentive tracking for lighting jobs." theme={theme} />
          <EntityCard icon={CreditCard} title="Deposits" description="Pre-job payments and deposits received from leads/deals. Linked to the lead record so you can track partial payments through the pipeline." theme={theme} />
          <EntityCard icon={DollarSign} title="Expenses" description="Business expenses — materials, fuel, subcontractors, etc. Categorized and linked to business units. Connects to Plaid for auto-import from bank accounts." theme={theme} />
          <EntityCard icon={BookOpen} title="Books" description="Full accounting view. Revenue vs expenses, P&L, bank connections, transaction categorization. Your financial command center." theme={theme} />
        </div>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Invoice Statuses</h4>
        <StatusPipeline statuses={STATUS.invoice} colors={{
          'Draft': '#6b7280', 'Sent': '#3b82f6', 'Paid': '#16a34a',
          'Partial': '#f59e0b', 'Overdue': '#ef4444', 'Void': '#9ca3af'
        }} theme={theme} />

        <InfoBox title="Money Flow" color="#16a34a" theme={theme}>
          <strong>Deposits</strong> are collected during the sales process (before the job).<br />
          <strong>Invoices</strong> are generated after the job is done.<br />
          <strong>Books</strong> pulls everything together for accounting.
        </InfoBox>
      </div>
    )
  },
  {
    id: 'team',
    title: 'Team Management',
    icon: UserCog,
    content: (theme) => (
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <EntityCard icon={UserCog} title="Employees" description="Add team members, set roles and access levels, assign pay rates. Roles control what each person can see and do in the app." theme={theme} />
          <EntityCard icon={Clock} title="Time Clock" description="Employees clock in/out and tag time to specific jobs. Hours feed into payroll and job costing. GPS location captured on clock events." theme={theme} />
          <EntityCard icon={DollarSign} title="Payroll" description="Calculate pay based on hours worked, commission on leads/sales, bonuses, and deductions. Supports hourly, salary, and per-job pay types." theme={theme} />
        </div>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Access Levels</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            { role: 'Field Tech', desc: 'Field Scout, Job Board, Time Clock only', color: '#6b7280' },
            { role: 'Team Lead', desc: 'Above + can see team members', color: '#3b82f6' },
            { role: 'Manager', desc: 'Above + customers, leads, products', color: '#8b5cf6' },
            { role: 'Admin', desc: 'Above + financials, fleet, all data', color: '#f59e0b' },
            { role: 'Super Admin / Owner', desc: 'Full access including pay rates and settings', color: '#22c55e' },
          ].map(r => (
            <div key={r.role} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '8px 12px', borderRadius: '8px',
              backgroundColor: r.color + '10', border: `1px solid ${r.color}20`,
            }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: r.color, minWidth: '110px' }}>{r.role}</span>
              <span style={{ fontSize: '12px', color: theme.textSecondary }}>{r.desc}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    id: 'agents',
    title: 'AI Agents',
    icon: Bot,
    content: (theme) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          AI agents are specialized assistants that plug into different parts of the business. They're recruited from Base Camp and appear in the sidebar under their relevant section.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <EntityCard icon={MessageCircle} title="OG Arnie" description="Your general business assistant. Ask questions about jobs, financials, team, pipeline — anything in the app. Knows your data and role permissions. Supports voice input/output." theme={theme} />
          <EntityCard icon={Lightbulb} title="Lenard" description="Lighting audit specialist. Builds audit reports, calculates rebates from utility programs, generates proposals with fixture schedules and energy savings." theme={theme} />
          <EntityCard icon={Truck} title="Freddy" description="Fleet management agent. Tracks vehicles, maintenance schedules, mileage, and assignments." theme={theme} />
          <EntityCard icon={Mail} title="Conrad Connect" description="Email marketing agent. Build templates, create campaigns, set up automations, and manage contact lists." theme={theme} />
          <EntityCard icon={Camera} title="Victor" description="Photo verification agent. Document before/after photos on jobs, verify work quality, and generate visual reports." theme={theme} />
        </div>

        <InfoBox title="The floating Arnie" color="#f97316" theme={theme}>
          On desktop, the Arnie avatar floats in the bottom-right corner. Click it to open a chat panel without leaving your current page. He can see what page you're on and what job you're clocked into.
        </InfoBox>
      </div>
    )
  },
  {
    id: 'lighting',
    title: 'Lighting Module',
    icon: Lightbulb,
    content: (theme) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Specialized tools for lighting retrofit companies. These appear when the Lenard agent is recruited.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          <EntityCard icon={Lightbulb} title="Lighting Audits" description="Create detailed energy audits. Walk a facility room by room, document existing fixtures, and propose LED replacements. Calculates energy savings and ROI." theme={theme} />
          <EntityCard icon={Package} title="Fixture Types" description="Library of lighting fixtures — existing (what's being replaced) and replacement (what you're installing). Wattages, quantities, and pricing." theme={theme} />
          <EntityCard icon={DollarSign} title="Utility Providers & Programs" description="Track utility company rebate programs. Each program has per-fixture rebate rates that auto-calculate incentives on audits and jobs." theme={theme} />
        </div>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Audit Statuses</h4>
        <StatusPipeline statuses={STATUS.audit} colors={{
          'Draft': '#6b7280', 'In Progress': '#3b82f6', 'Completed': '#22c55e',
          'Submitted': '#f59e0b', 'Approved': '#16a34a'
        }} theme={theme} />
      </div>
    )
  },
  {
    id: 'fleet',
    title: 'Fleet Management',
    icon: Truck,
    content: (theme) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Track company vehicles, maintenance schedules, and assignments. Appears when the Freddy agent is recruited.
        </p>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Vehicle Statuses</h4>
        <StatusPipeline statuses={STATUS.fleet} colors={{
          'Active': '#16a34a', 'In Service': '#3b82f6', 'Out of Service': '#ef4444', 'Retired': '#6b7280'
        }} theme={theme} />
      </div>
    )
  },
  {
    id: 'tips',
    title: 'Tips & Shortcuts',
    icon: Zap,
    content: (theme) => (
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { tip: 'Use Global Search (top of sidebar) to find any customer, job, or lead instantly.' },
            { tip: 'The Deal Breadcrumb at the top of Lead, Quote, and Job detail pages lets you trace the full history of a deal.' },
            { tip: 'Click the status badge on a Job to change its stage without going to the board.' },
            { tip: 'Settings are accessed via the gear icon on each page — there\'s no separate settings page.' },
            { tip: 'Ask Arnie! Click the floating avatar to ask questions about your data in natural language.' },
            { tip: 'Time Clock entries tag to specific jobs, so hours automatically feed into job costing.' },
            { tip: 'Products can include built-in labor rates — when added to an estimate, labor is calculated automatically.' },
            { tip: 'Every table filters by your company. Multi-tenant means your data is always isolated.' },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: '10px', alignItems: 'flex-start',
              padding: '10px 14px', borderRadius: '8px',
              backgroundColor: theme.accentBg,
            }}>
              <CheckCircle size={16} color={theme.accent} style={{ marginTop: '1px', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: theme.text, lineHeight: 1.5 }}>{item.tip}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },
]

// ─── Main Component ─────────────────────────────────────────────────

export default function Help() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const [expandedSections, setExpandedSections] = useState({ overview: true })

  const toggle = (id) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const expandAll = () => {
    const all = {}
    HELP_SECTIONS.forEach(s => { all[s.id] = true })
    setExpandedSections(all)
  }

  const collapseAll = () => setExpandedSections({})

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
        <img src="/Scout_LOGO_GUY.png" alt="Job Scout" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
            How JobScout Works
          </h1>
          <p style={{ fontSize: '14px', color: theme.textMuted, margin: '4px 0 0' }}>
            Your guide to the full business workflow
          </p>
        </div>
      </div>

      {/* Expand/Collapse controls */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', justifyContent: 'flex-end' }}>
        <button onClick={expandAll} style={{
          padding: '6px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`,
          backgroundColor: 'transparent', color: theme.textMuted, fontSize: '12px', cursor: 'pointer',
        }}>
          Expand All
        </button>
        <button onClick={collapseAll} style={{
          padding: '6px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`,
          backgroundColor: 'transparent', color: theme.textMuted, fontSize: '12px', cursor: 'pointer',
        }}>
          Collapse All
        </button>
      </div>

      {/* Big Picture Flow */}
      <div style={{
        padding: '20px',
        borderRadius: '12px',
        backgroundColor: theme.bgCard,
        border: `1px solid ${theme.border}`,
        marginBottom: '20px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: theme.textMuted, marginBottom: '12px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          The Big Picture
        </div>
        <FlowDiagram theme={theme} steps={[
          { label: 'Lead', icon: UserPlus, color: '#3b82f6' },
          { label: 'Set Appt', icon: Headphones, color: '#8b5cf6' },
          { label: 'Qualify', icon: GitBranch, color: '#f59e0b' },
          { label: 'Estimate', icon: FileText, color: '#3b82f6' },
          { label: 'Win', icon: CheckCircle, color: '#22c55e' },
          { label: 'Job', icon: Briefcase, color: '#5a6349' },
          { label: 'Invoice', icon: Receipt, color: '#f59e0b' },
          { label: 'Paid', icon: DollarSign, color: '#16a34a' },
        ]} />
        <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '8px' }}>
          Every step links to the next. Click any record to trace it back through the chain.
        </div>
      </div>

      {/* Accordion Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {HELP_SECTIONS.map(section => {
          const isOpen = expandedSections[section.id]
          const Icon = section.icon
          return (
            <div key={section.id} style={{
              borderRadius: '12px',
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              overflow: 'hidden',
            }}>
              <button
                onClick={() => toggle(section.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '16px 20px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  backgroundColor: theme.accentBg, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={16} color={theme.accent} />
                </div>
                <span style={{ flex: 1, fontSize: '15px', fontWeight: '600', color: theme.text }}>
                  {section.title}
                </span>
                {isOpen ? <ChevronDown size={18} color={theme.textMuted} /> : <ChevronRight size={18} color={theme.textMuted} />}
              </button>
              {isOpen && (
                <div style={{
                  padding: '0 20px 20px',
                  borderTop: `1px solid ${theme.border}`,
                  paddingTop: '16px',
                }}>
                  {section.content(theme)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
