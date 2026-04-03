import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import {
  Bell, Mail, MessageSquare, Phone, Clock, AlertTriangle,
  CheckCircle2, Send, ChevronRight, RefreshCw, Settings,
  DollarSign, Calendar, User, Filter, Search
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)',
  shadow: '0 1px 3px rgba(0,0,0,0.08)',
}

const urgencyLevels = {
  friendly: { label: 'Friendly', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: Mail, days: '1-15' },
  firm: { label: 'Firm', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: Bell, days: '16-30' },
  urgent: { label: 'Urgent', color: '#f97316', bg: 'rgba(249,115,22,0.12)', icon: AlertTriangle, days: '31-60' },
  final: { label: 'Final Notice', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: Phone, days: '60+' },
}

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function daysOverdue(dueDate) {
  if (!dueDate) return 0
  return Math.max(0, Math.floor((new Date() - new Date(dueDate)) / (1000 * 60 * 60 * 24)))
}

function getUrgency(days) {
  if (days <= 15) return 'friendly'
  if (days <= 30) return 'firm'
  if (days <= 60) return 'urgent'
  return 'final'
}

export default function FrankieCollections() {
  const navigate = useNavigate()
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const invoices = useStore(s => s.invoices) || []
  const companyId = useStore(s => s.companyId)
  const company = useStore(s => s.company)

  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedInvoices, setSelectedInvoices] = useState(new Set())
  const [sendingReminder, setSendingReminder] = useState(null)
  const [reminderLog, setReminderLog] = useState([])

  // Load reminder log
  useEffect(() => {
    if (!companyId) return
    loadReminderLog()
  }, [companyId])

  const loadReminderLog = async () => {
    const { data } = await supabase
      .from('collection_reminders')
      .select('*')
      .eq('company_id', companyId)
      .order('sent_at', { ascending: false })
      .limit(50)
    setReminderLog(data || [])
  }

  // Get overdue invoices with urgency levels
  const overdueInvoices = useMemo(() => {
    const now = new Date()
    return invoices
      .filter(inv =>
        inv.status !== 'Paid' && inv.status !== 'Void' &&
        parseFloat(inv.balance_due) > 0 &&
        inv.due_date && new Date(inv.due_date) < now
      )
      .map(inv => {
        const days = daysOverdue(inv.due_date)
        const urgency = getUrgency(days)
        const lastReminder = reminderLog.find(r => r.invoice_id === inv.id)
        return { ...inv, daysOverdue: days, urgency, lastReminder }
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
  }, [invoices, reminderLog])

  // Filter
  const filteredInvoices = useMemo(() => {
    let result = overdueInvoices
    if (filter !== 'all') result = result.filter(inv => inv.urgency === filter)
    if (search) {
      const s = search.toLowerCase()
      result = result.filter(inv =>
        (inv.customer?.name || '').toLowerCase().includes(s) ||
        (inv.invoice_id || '').toLowerCase().includes(s) ||
        (inv.invoice_number || '').toLowerCase().includes(s)
      )
    }
    return result
  }, [overdueInvoices, filter, search])

  // Stats
  const stats = useMemo(() => {
    const total = overdueInvoices.reduce((sum, inv) => sum + (parseFloat(inv.balance_due) || 0), 0)
    const byUrgency = {}
    Object.keys(urgencyLevels).forEach(key => {
      const items = overdueInvoices.filter(inv => inv.urgency === key)
      byUrgency[key] = {
        count: items.length,
        amount: items.reduce((sum, inv) => sum + (parseFloat(inv.balance_due) || 0), 0)
      }
    })
    return { total, count: overdueInvoices.length, byUrgency }
  }, [overdueInvoices])

  const handleSendReminder = async (invoice, method = 'email') => {
    setSendingReminder(invoice.id)
    try {
      // Log the reminder
      await supabase.from('collection_reminders').insert({
        company_id: companyId,
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        method,
        urgency: invoice.urgency,
        amount_due: invoice.balance_due,
        days_overdue: invoice.daysOverdue,
        sent_at: new Date().toISOString(),
        status: 'sent',
        message: generateReminderMessage(invoice, method)
      })
      await loadReminderLog()
    } catch (e) {
      console.error('Error sending reminder:', e)
    } finally {
      setSendingReminder(null)
    }
  }

  const generateReminderMessage = (invoice, method) => {
    const customerName = invoice.customer?.name || 'Customer'
    const amount = formatCurrency(invoice.balance_due)
    const invNum = invoice.invoice_id || invoice.invoice_number || `#${invoice.id}`
    const companyName = company?.name || company?.company_name || 'our company'

    if (invoice.urgency === 'friendly') {
      return `Hi ${customerName}, this is a friendly reminder that invoice ${invNum} for ${amount} is past due. Please let us know if you have any questions. Thank you! — ${companyName}`
    }
    if (invoice.urgency === 'firm') {
      return `${customerName}, invoice ${invNum} for ${amount} is now ${invoice.daysOverdue} days past due. Please arrange payment at your earliest convenience. — ${companyName}`
    }
    if (invoice.urgency === 'urgent') {
      return `URGENT: ${customerName}, invoice ${invNum} for ${amount} is ${invoice.daysOverdue} days overdue. Immediate payment is required to avoid service interruption. — ${companyName}`
    }
    return `FINAL NOTICE: ${customerName}, invoice ${invNum} for ${amount} is ${invoice.daysOverdue} days past due. This is our final notice before further action. Please contact us immediately. — ${companyName}`
  }

  const toggleSelect = (id) => {
    const next = new Set(selectedInvoices)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedInvoices(next)
  }

  const handleBulkRemind = async () => {
    for (const id of selectedInvoices) {
      const inv = overdueInvoices.find(i => i.id === id)
      if (inv) await handleSendReminder(inv, 'email')
    }
    setSelectedInvoices(new Set())
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between', marginBottom: '24px',
        flexWrap: 'wrap', gap: '12px'
      }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Collections
          </h1>
          <p style={{ fontSize: '14px', color: theme.textMuted, marginTop: '4px' }}>
            Automated invoice reminders and collection tracking
          </p>
        </div>
        {selectedInvoices.size > 0 && (
          <button
            onClick={handleBulkRemind}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', backgroundColor: theme.accent, color: '#fff',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontWeight: '600', fontSize: '14px'
            }}
          >
            <Send size={16} /> Send {selectedInvoices.size} Reminders
          </button>
        )}
      </div>

      {/* Urgency Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: '12px', marginBottom: '24px'
      }}>
        {Object.entries(urgencyLevels).map(([key, level]) => {
          const data = stats.byUrgency[key] || { count: 0, amount: 0 }
          const Icon = level.icon
          const isActive = filter === key
          return (
            <button
              key={key}
              onClick={() => setFilter(filter === key ? 'all' : key)}
              style={{
                background: isActive ? level.bg : theme.bgCard,
                borderRadius: '12px',
                border: `1px solid ${isActive ? level.color + '40' : theme.border}`,
                padding: '16px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Icon size={16} style={{ color: level.color }} />
                <span style={{ fontSize: '12px', fontWeight: '600', color: level.color }}>{level.label}</span>
                <span style={{ fontSize: '11px', color: theme.textMuted }}>({level.days}d)</span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{data.count}</div>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>{formatCurrency(data.amount)}</div>
            </button>
          )
        })}
      </div>

      {/* Total Overdue Banner */}
      {stats.count > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(249,115,22,0.06))',
          borderRadius: '12px',
          border: '1px solid rgba(239,68,68,0.15)',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '12px'
        }}>
          <div>
            <div style={{ fontSize: '13px', color: theme.textMuted, fontWeight: '600', marginBottom: '4px' }}>
              TOTAL OVERDUE
            </div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#ef4444' }}>
              {formatCurrency(stats.total)}
            </div>
          </div>
          <div style={{ fontSize: '14px', color: theme.textSecondary }}>
            {stats.count} overdue invoice{stats.count !== 1 ? 's' : ''} across {Object.values(stats.byUrgency).filter(v => v.count > 0).length} urgency levels
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{
        display: 'flex', gap: '12px', marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        <div style={{
          flex: 1, minWidth: '200px', position: 'relative'
        }}>
          <Search size={16} style={{
            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
            color: theme.textMuted
          }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by customer or invoice..."
            style={{
              width: '100%', padding: '10px 12px 10px 36px', borderRadius: '8px',
              border: `1px solid ${theme.border}`, background: theme.bgCard,
              color: theme.text, fontSize: '14px', outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Invoice List */}
      <div style={{
        background: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
        boxShadow: theme.shadow
      }}>
        {filteredInvoices.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: theme.textMuted }}>
            {overdueInvoices.length === 0 ? (
              <>
                <CheckCircle2 size={40} style={{ color: '#22c55e', marginBottom: '12px' }} />
                <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>
                  All caught up!
                </div>
                <div style={{ fontSize: '14px' }}>No overdue invoices right now.</div>
              </>
            ) : (
              <div style={{ fontSize: '14px' }}>No invoices match your filter.</div>
            )}
          </div>
        ) : (
          filteredInvoices.map((inv, i) => {
            const level = urgencyLevels[inv.urgency]
            const UrgencyIcon = level.icon
            const isSelected = selectedInvoices.has(inv.id)
            return (
              <div
                key={inv.id}
                style={{
                  padding: '16px 20px',
                  borderBottom: i < filteredInvoices.length - 1 ? `1px solid ${theme.border}` : 'none',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  background: isSelected ? theme.accentBg : 'transparent',
                  transition: 'background 0.15s'
                }}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleSelect(inv.id)}
                  style={{
                    width: '20px', height: '20px', borderRadius: '4px',
                    border: `2px solid ${isSelected ? theme.accent : theme.border}`,
                    background: isSelected ? theme.accent : 'transparent',
                    cursor: 'pointer', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {isSelected && <CheckCircle2 size={12} style={{ color: '#fff' }} />}
                </button>

                {/* Urgency indicator */}
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: level.bg, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <UrgencyIcon size={18} style={{ color: level.color }} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '600', color: theme.text, fontSize: '14px' }}>
                      {inv.invoice_id || inv.invoice_number || `#${inv.id}`}
                    </span>
                    <span style={{
                      padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
                      background: level.bg, color: level.color
                    }}>
                      {inv.daysOverdue}d overdue
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: theme.textSecondary }}>
                    {inv.customer?.name || 'Unknown'} — Due {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : 'N/A'}
                  </div>
                  {inv.lastReminder && (
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                      Last reminded: {new Date(inv.lastReminder.sent_at).toLocaleDateString()} via {inv.lastReminder.method}
                    </div>
                  )}
                </div>

                {/* Amount */}
                <div style={{
                  textAlign: 'right', flexShrink: 0
                }}>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#ef4444' }}>
                    {formatCurrency(inv.balance_due)}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleSendReminder(inv, 'email')}
                    disabled={sendingReminder === inv.id}
                    title="Send email reminder"
                    style={{
                      width: '36px', height: '36px', borderRadius: '8px',
                      background: theme.accentBg, border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: sendingReminder === inv.id ? 0.5 : 1
                    }}
                  >
                    <Mail size={16} style={{ color: theme.accent }} />
                  </button>
                  <button
                    onClick={() => handleSendReminder(inv, 'sms')}
                    disabled={sendingReminder === inv.id}
                    title="Send SMS reminder"
                    style={{
                      width: '36px', height: '36px', borderRadius: '8px',
                      background: theme.accentBg, border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: sendingReminder === inv.id ? 0.5 : 1
                    }}
                  >
                    <MessageSquare size={16} style={{ color: theme.accent }} />
                  </button>
                  <button
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    title="View invoice"
                    style={{
                      width: '36px', height: '36px', borderRadius: '8px',
                      background: theme.accentBg, border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <ChevronRight size={16} style={{ color: theme.accent }} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Recent Reminder Log */}
      {reminderLog.length > 0 && (
        <div style={{
          marginTop: '24px',
          background: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '20px',
          boxShadow: theme.shadow
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: '0 0 16px' }}>
            Recent Reminders
          </h2>
          {reminderLog.slice(0, 10).map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '8px 0',
              borderBottom: `1px solid ${theme.border}`,
              fontSize: '13px'
            }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '6px',
                background: r.method === 'sms' ? 'rgba(34,197,94,0.12)' : 'rgba(59,130,246,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                {r.method === 'sms'
                  ? <MessageSquare size={14} style={{ color: '#22c55e' }} />
                  : <Mail size={14} style={{ color: '#3b82f6' }} />
                }
              </div>
              <div style={{ flex: 1, color: theme.textSecondary }}>
                <span style={{ fontWeight: '500', color: theme.text }}>
                  {urgencyLevels[r.urgency]?.label || 'Reminder'}
                </span>
                {' '}sent for {formatCurrency(r.amount_due)}
                {r.days_overdue && ` (${r.days_overdue}d overdue)`}
              </div>
              <div style={{ color: theme.textMuted, flexShrink: 0 }}>
                {new Date(r.sent_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
