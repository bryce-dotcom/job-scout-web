import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import {
  UserPlus,
  Briefcase,
  Receipt,
  DollarSign,
  AlertTriangle,
  Clock,
  Calendar,
  TrendingUp,
  Package,
  Truck,
  ChevronRight,
  Plus
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  bgCardHover: '#eef2eb',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
}

const DEFAULT_PIPELINE_STAGES = ['New Lead', 'Quoted', 'Under Review', 'Approved', 'Lost']
const STAGE_COLOR_PALETTE = ['#5a9bd5', '#f4b942', '#9b59b6', '#4a7c59', '#c25a5a', '#e67e22', '#1abc9c', '#e74c3c']

export default function Dashboard() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const company = useStore((state) => state.company)
  const user = useStore((state) => state.user)
  const leads = useStore((state) => state.leads)
  const jobs = useStore((state) => state.jobs)
  const invoices = useStore((state) => state.invoices)
  const payments = useStore((state) => state.payments)
  const salesPipeline = useStore((state) => state.salesPipeline)
  const inventory = useStore((state) => state.inventory)
  const fleet = useStore((state) => state.fleet)
  const appointments = useStore((state) => state.appointments)
  const employees = useStore((state) => state.employees)
  const timeLogs = useStore((state) => state.timeLogs)
  const storePipelineStages = useStore((state) => state.pipelineStages)

  const currentEmployee = employees.find(e => e.email === user?.email)

  const pipelineStages = storePipelineStages?.length > 0 ? storePipelineStages : DEFAULT_PIPELINE_STAGES
  const pipelineColors = Object.fromEntries(
    pipelineStages.map((stage, i) => [stage, STAGE_COLOR_PALETTE[i % STAGE_COLOR_PALETTE.length]])
  )

  const [clockedIn, setClockedIn] = useState(false)
  const [activeTimeLog, setActiveTimeLog] = useState(null)

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    checkActiveTimeLog()
  }, [companyId, navigate])

  const checkActiveTimeLog = async () => {
    if (!currentEmployee?.id) return
    const { data } = await supabase
      .from('time_log')
      .select('*')
      .eq('employee_id', currentEmployee.id)
      .is('clock_out_time', null)
      .single()

    if (data) {
      setClockedIn(true)
      setActiveTimeLog(data)
    }
  }

  const handleClockToggle = async () => {
    if (clockedIn && activeTimeLog) {
      // Clock out
      await supabase
        .from('time_log')
        .update({ clock_out_time: new Date().toISOString() })
        .eq('id', activeTimeLog.id)
      setClockedIn(false)
      setActiveTimeLog(null)
    } else {
      // Clock in
      const { data } = await supabase
        .from('time_log')
        .insert({
          company_id: companyId,
          employee_id: currentEmployee?.id,
          clock_in_time: new Date().toISOString()
        })
        .select()
        .single()

      if (data) {
        setClockedIn(true)
        setActiveTimeLog(data)
      }
    }
  }

  // Calculate metrics
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  const activeLeads = leads.filter(l => !['Won', 'Lost', 'Converted', 'Not Qualified'].includes(l.status)).length
  const openJobs = jobs.filter(j => ['Scheduled', 'In Progress'].includes(j.status)).length
  const pendingInvoices = invoices.filter(i => i.payment_status === 'Pending').length

  const thisMonthRevenue = payments
    .filter(p => new Date(p.date) >= firstOfMonth)
    .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)

  // Pipeline counts
  const pipelineCounts = pipelineStages.map(stage => ({
    stage,
    count: salesPipeline.filter(p => p.stage === stage).length
  }))
  const totalPipeline = pipelineCounts.reduce((sum, p) => sum + p.count, 0)

  // Today's jobs
  const todaysJobs = jobs.filter(j => j.start_date?.startsWith(todayStr))

  // Recent activity
  const recentLeads = [...leads]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)

  const recentCompletedJobs = jobs
    .filter(j => j.status === 'Completed')
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 5)

  // Alerts
  const lowInventory = inventory.filter(i => i.quantity < (i.min_quantity || 10))
  const overdueFleet = fleet.filter(f => f.next_pm_due && new Date(f.next_pm_due) < today)
  const overdueInvoices = invoices.filter(i => {
    if (i.payment_status !== 'Pending') return false
    const invoiceDate = new Date(i.created_at)
    const daysPending = Math.floor((today - invoiceDate) / (1000 * 60 * 60 * 24))
    return daysPending > 30
  })
  const todaysAppointments = appointments.filter(a => a.start_time?.startsWith(todayStr))

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0)
  }

  const formatTime = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const MetricCard = ({ icon: Icon, label, value, color, onClick }) => (
    <div
      onClick={onClick}
      style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '20px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease'
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '10px',
          backgroundColor: color || theme.accentBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Icon size={22} style={{ color: color ? '#fff' : theme.accent }} />
        </div>
        <span style={{ fontSize: '13px', color: theme.textMuted, fontWeight: '500' }}>{label}</span>
      </div>
      <div style={{ fontSize: '32px', fontWeight: '700', color: theme.text }}>{value}</div>
    </div>
  )

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: theme.text, marginBottom: '4px' }}>
          Welcome back, {user?.name || 'User'}
        </h1>
        <div style={{ fontSize: '14px', color: theme.textMuted }}>
          {company?.company_name} &middot; {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      {/* Row 1: Key Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <MetricCard
          icon={UserPlus}
          label="Active Leads"
          value={activeLeads}
          onClick={() => navigate('/leads')}
        />
        <MetricCard
          icon={Briefcase}
          label="Open Jobs"
          value={openJobs}
          onClick={() => navigate('/jobs')}
        />
        <MetricCard
          icon={Receipt}
          label="Pending Invoices"
          value={pendingInvoices}
          onClick={() => navigate('/invoices')}
        />
        <MetricCard
          icon={DollarSign}
          label="This Month Revenue"
          value={formatCurrency(thisMonthRevenue)}
          color="#4a7c59"
        />
      </div>

      {/* Row 2: Pipeline Overview */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '20px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={20} style={{ color: theme.accent }} />
            Sales Pipeline
          </h2>
          <button
            onClick={() => navigate('/pipeline')}
            style={{
              padding: '6px 12px',
              backgroundColor: theme.accentBg,
              color: theme.accent,
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            View All <ChevronRight size={14} />
          </button>
        </div>

        {/* Pipeline Bar */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            display: 'flex',
            height: '32px',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: theme.bg
          }}>
            {pipelineCounts.map((p, idx) => (
              p.count > 0 && (
                <div
                  key={p.stage}
                  style={{
                    width: `${(p.count / Math.max(totalPipeline, 1)) * 100}%`,
                    backgroundColor: pipelineColors[p.stage],
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: p.count > 0 ? '40px' : 0
                  }}
                >
                  <span style={{ color: '#fff', fontSize: '12px', fontWeight: '600' }}>{p.count}</span>
                </div>
              )
            ))}
          </div>
        </div>

        {/* Pipeline Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          {pipelineCounts.map(p => (
            <div key={p.stage} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '3px',
                backgroundColor: pipelineColors[p.stage]
              }} />
              <span style={{ fontSize: '13px', color: theme.textSecondary }}>{p.stage}</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{p.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Today's Schedule & Recent Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {/* Today's Schedule */}
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={20} style={{ color: theme.accent }} />
              Today's Schedule
            </h2>
            <button
              onClick={() => navigate('/jobs/calendar')}
              style={{
                padding: '6px 12px',
                backgroundColor: theme.accentBg,
                color: theme.accent,
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Calendar
            </button>
          </div>

          {todaysJobs.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: theme.textMuted }}>
              No jobs scheduled for today
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {todaysJobs.slice(0, 5).map(job => (
                <div
                  key={job.id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  style={{
                    padding: '12px',
                    backgroundColor: theme.bg,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.bgCardHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.bg}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{job.job_title || job.job_id}</div>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>{job.customer?.name}</div>
                    </div>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '500',
                      backgroundColor: job.status === 'Scheduled' ? 'rgba(90,155,213,0.15)' : 'rgba(74,124,89,0.15)',
                      color: job.status === 'Scheduled' ? '#5a9bd5' : '#4a7c59'
                    }}>
                      {job.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '20px'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={20} style={{ color: theme.accent }} />
            Recent Activity
          </h2>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>New Leads</div>
            {recentLeads.slice(0, 3).map(lead => (
              <div
                key={lead.id}
                onClick={() => navigate('/leads')}
                style={{
                  padding: '8px 0',
                  borderBottom: `1px solid ${theme.border}`,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}
              >
                <span style={{ fontSize: '13px', color: theme.text }}>{lead.customer_name}</span>
                <span style={{ fontSize: '12px', color: theme.textMuted }}>{formatDate(lead.created_at)}</span>
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Completed Jobs</div>
            {recentCompletedJobs.slice(0, 3).map(job => (
              <div
                key={job.id}
                onClick={() => navigate(`/jobs/${job.id}`)}
                style={{
                  padding: '8px 0',
                  borderBottom: `1px solid ${theme.border}`,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}
              >
                <span style={{ fontSize: '13px', color: theme.text }}>{job.job_title || job.job_id}</span>
                <span style={{ fontSize: '12px', color: theme.textMuted }}>{formatDate(job.updated_at || job.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: Alerts & Warnings */}
      {(lowInventory.length > 0 || overdueFleet.length > 0 || overdueInvoices.length > 0 || todaysAppointments.length > 0) && (
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '20px',
          marginBottom: '24px'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={20} style={{ color: '#f4b942' }} />
            Alerts & Warnings
          </h2>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {lowInventory.length > 0 && (
              <div
                onClick={() => navigate('/inventory')}
                style={{
                  padding: '10px 16px',
                  backgroundColor: 'rgba(194,90,90,0.1)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Package size={16} style={{ color: '#c25a5a' }} />
                <span style={{ fontSize: '13px', color: '#c25a5a', fontWeight: '500' }}>
                  {lowInventory.length} Low Stock Items
                </span>
              </div>
            )}

            {overdueFleet.length > 0 && (
              <div
                onClick={() => navigate('/fleet')}
                style={{
                  padding: '10px 16px',
                  backgroundColor: 'rgba(244,185,66,0.15)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Truck size={16} style={{ color: '#d4940a' }} />
                <span style={{ fontSize: '13px', color: '#d4940a', fontWeight: '500' }}>
                  {overdueFleet.length} Fleet PM Overdue
                </span>
              </div>
            )}

            {overdueInvoices.length > 0 && (
              <div
                onClick={() => navigate('/invoices')}
                style={{
                  padding: '10px 16px',
                  backgroundColor: 'rgba(194,90,90,0.1)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Receipt size={16} style={{ color: '#c25a5a' }} />
                <span style={{ fontSize: '13px', color: '#c25a5a', fontWeight: '500' }}>
                  {overdueInvoices.length} Invoices Overdue (30+ days)
                </span>
              </div>
            )}

            {todaysAppointments.length > 0 && (
              <div
                onClick={() => navigate('/appointments')}
                style={{
                  padding: '10px 16px',
                  backgroundColor: 'rgba(90,155,213,0.15)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Calendar size={16} style={{ color: '#5a9bd5' }} />
                <span style={{ fontSize: '13px', color: '#5a9bd5', fontWeight: '500' }}>
                  {todaysAppointments.length} Appointments Today
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Row 5: Quick Actions */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '20px'
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
          Quick Actions
        </h2>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <button
            onClick={() => navigate('/leads')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              backgroundColor: theme.accent,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            <Plus size={18} /> New Lead
          </button>

          <button
            onClick={() => navigate('/jobs')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              backgroundColor: theme.accentBg,
              color: theme.accent,
              border: `1px solid ${theme.accent}`,
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            <Plus size={18} /> New Job
          </button>

          <button
            onClick={() => navigate('/invoices')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              backgroundColor: theme.accentBg,
              color: theme.accent,
              border: `1px solid ${theme.accent}`,
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            <Plus size={18} /> New Invoice
          </button>

          <button
            onClick={handleClockToggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              backgroundColor: clockedIn ? 'rgba(194,90,90,0.1)' : 'rgba(74,124,89,0.15)',
              color: clockedIn ? '#c25a5a' : '#4a7c59',
              border: `1px solid ${clockedIn ? '#c25a5a' : '#4a7c59'}`,
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            <Clock size={18} /> {clockedIn ? 'Clock Out' : 'Clock In'}
          </button>
        </div>
      </div>
    </div>
  )
}
