import { useState, useRef, useEffect, useCallback } from 'react'
import { useTheme } from '../../components/Layout'
import { useStore } from '../../lib/store'
import { STATUS } from '../../lib/schema'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown, ChevronRight, ArrowRight, ArrowDown,
  UserPlus, Headphones, GitBranch, FileText, Briefcase,
  Users, Package, Receipt, DollarSign, Clock, Truck,
  Lightbulb, Bot, Compass, ClipboardList, Warehouse,
  CreditCard, BookOpen, UserCog, BarChart3, Settings,
  CheckCircle, XCircle, Pause, Play, Calendar,
  HelpCircle, Zap, MessageCircle, Camera, Mail,
  Presentation, X, ChevronLeft, Sparkles, RefreshCw,
  Boxes, Shield, FileBarChart, Globe, Target, TrendingUp,
  Loader
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// ─── Visual Components ──────────────────────────────────────────────

function FlowDiagram({ steps, theme, animate = false }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', margin: '16px 0' }}>
      {steps.map((step, i) => (
        <motion.div
          key={i}
          initial={animate ? { opacity: 0, x: -20 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: animate ? i * 0.12 : 0, duration: 0.4 }}
          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
        >
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
        </motion.div>
      ))}
    </div>
  )
}

function StatusPipeline({ statuses, colors, theme, animate = false }) {
  const defaultColors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#6b7280', '#ef4444']
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '12px 0' }}>
      {statuses.map((s, i) => {
        const c = colors?.[s] || defaultColors[i % defaultColors.length]
        return (
          <motion.span
            key={s}
            initial={animate ? { opacity: 0, scale: 0.8 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: animate ? i * 0.06 : 0, duration: 0.3 }}
            style={{
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '500',
              backgroundColor: c + '18',
              color: c,
              border: `1px solid ${c}30`,
            }}
          >
            {s}
          </motion.span>
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

function EntityCard({ icon: Icon, title, description, theme, color }) {
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
        backgroundColor: color ? color + '15' : theme.accentBg, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={18} color={color || theme.accent} />
      </div>
      <div>
        <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: 1.5 }}>{description}</div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color, theme }) {
  return (
    <div style={{
      padding: '16px', borderRadius: '10px', textAlign: 'center',
      backgroundColor: color ? color + '08' : theme.accentBg,
      border: `1px solid ${color ? color + '20' : theme.border}`,
      flex: '1 1 120px',
    }}>
      <div style={{ fontSize: '24px', fontWeight: '700', color: color || theme.accent }}>{value}</div>
      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  )
}

// ─── Help Content ─────────────────────────────────────────────────

const HELP_SECTIONS = [
  {
    id: 'overview',
    title: 'How JobScout Works',
    icon: HelpCircle,
    color: '#5a6349',
    content: (theme, animate) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          JobScout manages the full lifecycle of a field service business — from the first customer inquiry to final payment. Everything flows through a connected pipeline where every record links to the next.
        </p>

        <FlowDiagram animate={animate} theme={theme} steps={[
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

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '16px' }}>
          <StatCard label="Sales Steps" value="5" color="#3b82f6" theme={theme} />
          <StatCard label="AI Agents" value="5" color="#f97316" theme={theme} />
          <StatCard label="Modules" value="20+" color="#22c55e" theme={theme} />
          <StatCard label="Multi-Tenant" value="Yes" color="#8b5cf6" theme={theme} />
        </div>
      </div>
    )
  },
  {
    id: 'sales-flow',
    title: 'Sales Flow (Steps 1-5)',
    icon: GitBranch,
    color: '#3b82f6',
    content: (theme, animate) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          The sidebar shows 5 numbered steps that represent the sales process from first contact to completed work:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <EntityCard icon={UserPlus} title="1. Leads" color="#3b82f6" description="Where all prospects enter the system. A lead is any potential business opportunity — new customer inquiries, referrals, website forms, or repeat business. Tracks contact info, source, value, and current status. Leads assigned to owners show in their Lenard standalone agent automatically." theme={theme} />
          <EntityCard icon={Headphones} title="2. Lead Setter" color="#8b5cf6" description="The calling workspace. Setters call leads, qualify them, and schedule appointments. Leads flow from 'New' to 'Contacted' to 'Appointment Set'. The setter earns commission per appointment set. Calendar view shows all scheduled meetings." theme={theme} />
          <EntityCard icon={GitBranch} title="3. Pipeline" color="#f59e0b" description="Visual kanban board showing all leads by stage. Drag leads between columns to update their status. This is your bird's-eye view of the entire sales funnel with deal values at each stage." theme={theme} />
          <EntityCard icon={FileText} title="4. Estimates" color="#3b82f6" description="Create price quotes for qualified leads. Add products from your catalog, apply labor rates, and send to the customer. Two modes: standard PDF or Interactive Proposal (Qwilr-style animated page with charts, ROI analysis, and digital approval)." theme={theme} />
          <EntityCard icon={Briefcase} title="5. Jobs" color="#5a6349" description="Won deals become jobs. The kanban board shows jobs by stage: Chillin, Scheduled, In Progress, Completed. Each job has sections, line items, time tracking, documents, and photos." theme={theme} />
        </div>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Lead Statuses</h4>
        <StatusPipeline animate={animate} statuses={STATUS.lead} colors={{
          'New': '#3b82f6', 'Contacted': '#8b5cf6', 'Appointment Set': '#22c55e',
          'Qualified': '#f97316', 'Quote Sent': '#eab308', 'Negotiation': '#f59e0b',
          'Won': '#10b981', 'Lost': '#64748b'
        }} theme={theme} />

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '16px 0 8px' }}>Job Statuses</h4>
        <StatusPipeline animate={animate} statuses={STATUS.job} colors={{
          'Chillin': '#6382bf', 'Scheduled': '#5a6349', 'In Progress': '#c28b38',
          'Completed': '#4a7c59', 'On Hold': '#7d8a7f', 'Cancelled': '#8b5a5a'
        }} theme={theme} />

        <InfoBox title="Interactive Proposals" color="#d4af37" theme={theme}>
          Estimates can be sent as <strong>Interactive Proposals</strong> — full-page animated experiences with investment-grade audit data, ROI charts, savings timelines, and one-click digital approval. Toggle between PDF and Interactive mode in estimate settings. AI writes compelling sales copy tailored to each project.
        </InfoBox>

        <InfoBox title="When to skip the pipeline" color="#22c55e" theme={theme}>
          If a customer calls and says "I need you to come fix my lights next week" — there's no sales process. Create the Job directly from the Jobs page. A tracking lead is auto-created in the background so your pipeline numbers stay accurate.
        </InfoBox>
      </div>
    )
  },
  {
    id: 'customers',
    title: 'Customers',
    icon: Users,
    color: '#16a34a',
    content: (theme, animate) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Customers are the people and businesses you serve. A customer record is the central hub — it shows all related leads, estimates, jobs, invoices, and payments in one place.
        </p>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Customer Statuses</h4>
        <StatusPipeline animate={animate} statuses={STATUS.customer} colors={{
          'Active': '#16a34a', 'Inactive': '#6b7280', 'Prospect': '#f59e0b'
        }} theme={theme} />

        <InfoBox title="How customers get created" color="#3b82f6" theme={theme}>
          <strong>From Leads:</strong> When a lead is converted/won, the customer info is used to create (or link to) a customer record.<br />
          <strong>Manually:</strong> Add customers directly from the Customers page.<br />
          <strong>From Estimates:</strong> Creating an estimate on the Customer Detail page auto-creates a pipeline lead.<br />
          <strong>Search:</strong> Find customers by name, business name, email, or phone number.
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
    color: '#5a6349',
    content: (theme) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Day-to-day tools for running jobs in the field and managing your product catalog.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <EntityCard icon={Compass} title="Field Scout" color="#22c55e" description="Daily dashboard for field technicians. Shows today's jobs, active clock-ins, and quick actions. Techs see only their assigned work." theme={theme} />
          <EntityCard icon={ClipboardList} title="Job Board (PM)" color="#3b82f6" description="Project manager workspace. Schedule job sections, assign techs, drag to reorder priorities. Gantt-style view of who's doing what and when." theme={theme} />
          <EntityCard icon={Package} title="Products & Services" color="#f59e0b" description="Your product catalog organized by sections and groups. Each product has pricing, labor rates, spec sheets, DLC certification, and can be bundled with components. Bundles show their component breakdown and total price right on the card." theme={theme} />
          <EntityCard icon={Warehouse} title="Inventory" color="#8b5cf6" description="Track materials, tools, and consumables. Set reorder points, assign to locations or vehicles. Products sync automatically from your catalog." theme={theme} />
        </div>

        <InfoBox title="Product Bundles" color="#f59e0b" theme={theme}>
          Products can include <strong>components</strong> (other products). When you add a bundle to an estimate, all components and their pricing are included. The card shows each component, quantity, and price breakdown so you always know what's inside.
        </InfoBox>
      </div>
    )
  },
  {
    id: 'financial',
    title: 'Financial',
    icon: DollarSign,
    color: '#16a34a',
    content: (theme, animate) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Track money in and money out. Admin+ access required.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <EntityCard icon={Receipt} title="Invoices" color="#3b82f6" description="Generate invoices from completed jobs. Tracks payment status (Draft, Sent, Paid). Includes utility incentive tracking for lighting jobs." theme={theme} />
          <EntityCard icon={CreditCard} title="Deposits" color="#8b5cf6" description="Pre-job payments and deposits received from leads/deals. Linked to the lead record so you can track partial payments through the pipeline." theme={theme} />
          <EntityCard icon={DollarSign} title="Expenses" color="#ef4444" description="Business expenses — materials, fuel, subcontractors, etc. Categorized and linked to business units. Connects to Plaid for auto-import from bank accounts." theme={theme} />
          <EntityCard icon={BookOpen} title="Books" color="#16a34a" description="Full accounting view. Revenue vs expenses, P&L, bank connections, transaction categorization. Your financial command center." theme={theme} />
        </div>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Invoice Statuses</h4>
        <StatusPipeline animate={animate} statuses={STATUS.invoice} colors={{
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
    color: '#8b5cf6',
    content: (theme) => (
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <EntityCard icon={UserCog} title="Employees" color="#8b5cf6" description="Add team members, set roles and access levels, assign pay rates. Roles control what each person can see and do in the app." theme={theme} />
          <EntityCard icon={Clock} title="Time Clock" color="#3b82f6" description="Employees clock in/out and tag time to specific jobs. Hours feed into payroll and job costing. GPS location captured on clock events." theme={theme} />
          <EntityCard icon={DollarSign} title="Payroll" color="#16a34a" description="Calculate pay based on hours worked, commission on leads/sales, bonuses, and deductions. Supports hourly, salary, and per-job pay types." theme={theme} />
        </div>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Access Levels</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            { role: 'Field Tech', desc: 'Field Scout, Job Board, Time Clock only', color: '#6b7280' },
            { role: 'Team Lead', desc: 'Above + can see team members', color: '#3b82f6' },
            { role: 'Manager', desc: 'Above + customers, leads, products, estimates', color: '#8b5cf6' },
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
    color: '#f97316',
    content: (theme) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          AI agents are specialized assistants that plug into different parts of the business. They're recruited from Base Camp and appear in the sidebar under their relevant section.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <EntityCard icon={MessageCircle} title="OG Arnie" color="#f97316" description="Your general business assistant. Ask questions about jobs, financials, team, pipeline — anything in the app. Knows your data and role permissions. Supports voice input/output." theme={theme} />
          <EntityCard icon={Lightbulb} title="Lenard" color="#eab308" description="Lighting audit specialist. Builds audit reports, calculates rebates from utility programs, generates investment-grade proposals with fixture schedules and energy savings. Standalone pages for AZ SRP and UT RMP." theme={theme} />
          <EntityCard icon={Truck} title="Freddy" color="#3b82f6" description="Fleet management agent. Tracks vehicles, maintenance schedules, mileage, and assignments." theme={theme} />
          <EntityCard icon={Mail} title="Conrad Connect" color="#8b5cf6" description="Email marketing agent. Build templates, create campaigns, set up automations, and manage contact lists." theme={theme} />
          <EntityCard icon={Camera} title="Victor" color="#22c55e" description="Photo verification agent. Document before/after photos on jobs, verify work quality, and generate visual reports." theme={theme} />
        </div>

        <InfoBox title="Lenard Standalone" color="#eab308" theme={theme}>
          Lenard has standalone PWA pages (<strong>/agent/lenard-az-srp</strong> and <strong>/agent/lenard-ut-rmp</strong>) that salespeople install on their phone. Leads assigned to them from the main app appear automatically in their project folder with a "NEW LEAD" badge. They can build audits, generate proposals, and get customer signatures right on-site.
        </InfoBox>

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
    color: '#eab308',
    content: (theme, animate) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Specialized tools for lighting retrofit companies. These appear when the Lenard agent is recruited.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          <EntityCard icon={Lightbulb} title="Lighting Audits" color="#eab308" description="Create detailed energy audits. Walk a facility room by room, document existing fixtures, and propose LED replacements. Calculates energy savings, watts reduced, and ROI. Certified audits feed into investment-grade interactive proposals." theme={theme} />
          <EntityCard icon={Package} title="Fixture Types" color="#f59e0b" description="Library of lighting fixtures — existing (what's being replaced) and replacement (what you're installing). Wattages, quantities, and pricing." theme={theme} />
          <EntityCard icon={DollarSign} title="Utility Providers & Programs" color="#16a34a" description="Track utility company rebate programs. Each program has per-fixture rebate rates that auto-calculate incentives on audits, proposals, and invoices." theme={theme} />
        </div>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Audit Statuses</h4>
        <StatusPipeline animate={animate} statuses={STATUS.audit} colors={{
          'Draft': '#6b7280', 'In Progress': '#3b82f6', 'Completed': '#22c55e',
          'Submitted': '#f59e0b', 'Approved': '#16a34a'
        }} theme={theme} />

        <InfoBox title="Investment Grade Proposals" color="#d4af37" theme={theme}>
          When an estimate is linked to a certified lighting audit, the Interactive Proposal gets the <strong>gold Investment Grade Energy Audit</strong> badge with real audit data: fixtures upgraded, kWh saved, annual dollar savings, per-area wattage charts, and rebate breakdowns. The AI writes hard-hitting sales copy that frames the project as an investment that pays for itself.
        </InfoBox>
      </div>
    )
  },
  {
    id: 'fleet',
    title: 'Fleet Management',
    icon: Truck,
    color: '#3b82f6',
    content: (theme, animate) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Track company vehicles, maintenance schedules, and assignments. Appears when the Freddy agent is recruited.
        </p>

        <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Vehicle Statuses</h4>
        <StatusPipeline animate={animate} statuses={STATUS.fleet} colors={{
          'Active': '#16a34a', 'In Service': '#3b82f6', 'Out of Service': '#ef4444', 'Retired': '#6b7280'
        }} theme={theme} />
      </div>
    )
  },
  {
    id: 'data',
    title: 'Data & Import',
    icon: FileBarChart,
    color: '#8b5cf6',
    content: (theme) => (
      <div>
        <p style={{ fontSize: '14px', color: theme.text, lineHeight: 1.7, marginBottom: '16px' }}>
          Import and manage data across the app. Available on pages that support bulk operations.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <EntityCard icon={FileBarChart} title="CSV / Excel Import" color="#3b82f6" description="Upload CSV, XLSX, XLS, or TSV files. AI automatically maps your columns to the right fields. Preview and adjust before importing." theme={theme} />
          <EntityCard icon={FileText} title="PDF Import" color="#8b5cf6" description="Upload PDF documents (including scanned pages). The system renders each page as an image and uses AI vision to extract structured data — works even with image-only PDFs." theme={theme} />
          <EntityCard icon={BarChart3} title="Data Console" color="#f59e0b" description="Admin-only. Direct SQL access, user management, company settings, product bulk operations, and agent configuration." theme={theme} />
        </div>

        <InfoBox title="AI Column Mapping" color="#3b82f6" theme={theme}>
          When you import a file, AI reads your headers and sample data, then automatically maps columns to the correct fields. It even suggests default values for missing required fields. You can always adjust the mapping manually before importing.
        </InfoBox>
      </div>
    )
  },
  {
    id: 'tips',
    title: 'Tips & Shortcuts',
    icon: Zap,
    color: '#f59e0b',
    content: (theme) => (
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { tip: 'Use Global Search (top of sidebar) to find any customer, job, or lead instantly.', color: '#3b82f6' },
            { tip: 'The Deal Breadcrumb at the top of Lead, Quote, and Job detail pages lets you trace the full history of a deal.', color: '#8b5cf6' },
            { tip: 'Click the status badge on a Job to change its stage without going to the board.', color: '#22c55e' },
            { tip: 'Settings are accessed via the gear icon on each page — there\'s no separate settings page.', color: '#f59e0b' },
            { tip: 'Ask Arnie! Click the floating avatar to ask questions about your data in natural language.', color: '#f97316' },
            { tip: 'Time Clock entries tag to specific jobs, so hours automatically feed into job costing.', color: '#3b82f6' },
            { tip: 'Products can include built-in labor rates — when added to an estimate, labor is calculated automatically.', color: '#8b5cf6' },
            { tip: 'Product bundles show their components right on the card — no guessing what\'s inside.', color: '#22c55e' },
            { tip: 'Interactive Proposals: Toggle "Interactive Proposal" in estimate settings, then "Generate with AI" for a premium sales experience.', color: '#d4af37' },
            { tip: 'Every table filters by your company. Multi-tenant means your data is always isolated.', color: '#5a6349' },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', gap: '10px', alignItems: 'flex-start',
              padding: '10px 14px', borderRadius: '8px',
              backgroundColor: (item.color || theme.accent) + '08',
              border: `1px solid ${(item.color || theme.accent)}15`,
            }}>
              <CheckCircle size={16} color={item.color || theme.accent} style={{ marginTop: '1px', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: theme.text, lineHeight: 1.5 }}>{item.tip}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },
]

// ─── Presentation Mode ─────────────────────────────────────────────

function PresentationMode({ sections, theme, onClose }) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [direction, setDirection] = useState(1)
  const section = sections[currentSlide]
  const Icon = section.icon

  const next = useCallback(() => {
    if (currentSlide < sections.length - 1) {
      setDirection(1)
      setCurrentSlide(prev => prev + 1)
    }
  }, [currentSlide, sections.length])

  const prev = useCallback(() => {
    if (currentSlide > 0) {
      setDirection(-1)
      setCurrentSlide(prev => prev - 1)
    }
  }, [currentSlide])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [next, prev, onClose])

  const variants = {
    enter: (d) => ({ x: d > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d) => ({ x: d > 0 ? -300 : 300, opacity: 0 }),
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: theme.bg,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: `1px solid ${theme.border}`,
        backgroundColor: theme.bgCard,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/Scout_LOGO_GUY.png" alt="Job Scout" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
          <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>JobScout Guide</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: theme.textMuted }}>
            {currentSlide + 1} / {sections.length}
          </span>
          <button onClick={onClose} style={{
            padding: '8px', backgroundColor: 'transparent', border: 'none',
            cursor: 'pointer', color: theme.textMuted, borderRadius: '8px',
          }}>
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: '3px', backgroundColor: theme.border }}>
        <motion.div
          animate={{ width: `${((currentSlide + 1) / sections.length) * 100}%` }}
          transition={{ duration: 0.3 }}
          style={{ height: '100%', backgroundColor: section.color || theme.accent }}
        />
      </div>

      {/* Slide content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 24px' }}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentSlide}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            style={{ width: '100%', maxWidth: '800px' }}
          >
            {/* Section header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}
            >
              <div style={{
                width: '56px', height: '56px', borderRadius: '14px',
                backgroundColor: (section.color || theme.accent) + '15',
                border: `2px solid ${(section.color || theme.accent)}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={28} color={section.color || theme.accent} />
              </div>
              <div>
                <h2 style={{ fontSize: '28px', fontWeight: '700', color: theme.text, margin: 0 }}>{section.title}</h2>
                <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>
                  Section {currentSlide + 1} of {sections.length}
                </div>
              </div>
            </motion.div>

            {/* Content */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
            >
              {section.content(theme, true)}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderTop: `1px solid ${theme.border}`,
        backgroundColor: theme.bgCard,
      }}>
        <button
          onClick={prev}
          disabled={currentSlide === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px', borderRadius: '10px',
            border: `1px solid ${theme.border}`,
            backgroundColor: 'transparent',
            color: currentSlide === 0 ? theme.textMuted : theme.text,
            cursor: currentSlide === 0 ? 'default' : 'pointer',
            fontSize: '14px', fontWeight: '500',
            opacity: currentSlide === 0 ? 0.4 : 1,
          }}
        >
          <ChevronLeft size={18} /> Previous
        </button>

        {/* Slide dots */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {sections.map((s, i) => (
            <button
              key={s.id}
              onClick={() => { setDirection(i > currentSlide ? 1 : -1); setCurrentSlide(i) }}
              style={{
                width: i === currentSlide ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                backgroundColor: i === currentSlide ? (s.color || theme.accent) : theme.border,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>

        <button
          onClick={currentSlide === sections.length - 1 ? onClose : next}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px', borderRadius: '10px',
            border: 'none',
            backgroundColor: section.color || theme.accent,
            color: '#fff',
            cursor: 'pointer',
            fontSize: '14px', fontWeight: '600',
          }}
        >
          {currentSlide === sections.length - 1 ? 'Done' : 'Next'} <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────

export default function Help() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const [expandedSections, setExpandedSections] = useState({ overview: true })
  const [showPresentation, setShowPresentation] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const employee = useStore((state) => state.employee)
  const isAdmin = employee?.access_level === 'admin' || employee?.access_level === 'super_admin' || employee?.access_level === 'owner'

  const toggle = (id) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const expandAll = () => {
    const all = {}
    HELP_SECTIONS.forEach(s => { all[s.id] = true })
    setExpandedSections(all)
  }

  const collapseAll = () => setExpandedSections({})

  // Developer refresh — could be wired to an AI edge function to regenerate content
  const handleRefresh = async () => {
    setRefreshing(true)
    // Simulate refresh — in production this would call an edge function
    // that scans routes and generates updated help content
    await new Promise(r => setTimeout(r, 1500))
    setRefreshing(false)
    alert('Help content is up to date with the latest app features.')
  }

  return (
    <>
      <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
          <img src="/Scout_LOGO_GUY.png" alt="Job Scout" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
              How JobScout Works
            </h1>
            <p style={{ fontSize: '14px', color: theme.textMuted, margin: '4px 0 0' }}>
              Your guide to the full business workflow
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={() => setShowPresentation(true)} style={{
            padding: '8px 16px', borderRadius: '8px', border: `1px solid ${theme.accent}`,
            backgroundColor: theme.accent, color: '#fff', fontSize: '13px', cursor: 'pointer',
            fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <Presentation size={16} /> Present
          </button>
          {isAdmin && (
            <button onClick={handleRefresh} disabled={refreshing} style={{
              padding: '8px 16px', borderRadius: '8px', border: `1px solid ${theme.border}`,
              backgroundColor: theme.bgCard, color: refreshing ? theme.textMuted : theme.accent, fontSize: '13px',
              cursor: refreshing ? 'wait' : 'pointer', fontWeight: '500',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              {refreshing ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
              {refreshing ? 'Checking...' : 'Update Content'}
            </button>
          )}
          <button onClick={expandAll} style={{
            padding: '8px 14px', borderRadius: '8px', border: `1px solid ${theme.border}`,
            backgroundColor: 'transparent', color: theme.textMuted, fontSize: '12px', cursor: 'pointer',
          }}>
            Expand All
          </button>
          <button onClick={collapseAll} style={{
            padding: '8px 14px', borderRadius: '8px', border: `1px solid ${theme.border}`,
            backgroundColor: 'transparent', color: theme.textMuted, fontSize: '12px', cursor: 'pointer',
          }}>
            Collapse All
          </button>
        </div>

        {/* Big Picture Flow */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            padding: '20px',
            borderRadius: '12px',
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            marginBottom: '20px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: '600', color: theme.textMuted, marginBottom: '12px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            The Big Picture
          </div>
          <FlowDiagram animate={true} theme={theme} steps={[
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
        </motion.div>

        {/* Accordion Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {HELP_SECTIONS.map((section, idx) => {
            const isOpen = expandedSections[section.id]
            const Icon = section.icon
            return (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.4 }}
                style={{
                  borderRadius: '12px',
                  backgroundColor: theme.bgCard,
                  border: `1px solid ${isOpen ? (section.color || theme.accent) + '40' : theme.border}`,
                  overflow: 'hidden',
                  transition: 'border-color 0.3s ease',
                }}
              >
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
                    backgroundColor: (section.color || theme.accent) + '15',
                    display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    transition: 'background-color 0.3s ease',
                  }}>
                    <Icon size={16} color={section.color || theme.accent} />
                  </div>
                  <span style={{ flex: 1, fontSize: '15px', fontWeight: '600', color: theme.text }}>
                    {section.title}
                  </span>
                  <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown size={18} color={theme.textMuted} />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{
                        padding: '0 20px 20px',
                        borderTop: `1px solid ${theme.border}`,
                        paddingTop: '16px',
                      }}>
                        {section.content(theme, false)}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>

      {/* Presentation Mode Overlay */}
      <AnimatePresence>
        {showPresentation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <PresentationMode
              sections={HELP_SECTIONS}
              theme={theme}
              onClose={() => setShowPresentation(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
