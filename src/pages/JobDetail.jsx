import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  ArrowLeft, Plus, Trash2, MapPin, Clock, FileText, ExternalLink,
  Play, CheckCircle, Pencil, X, DollarSign
} from 'lucide-react'

// Light theme fallback
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

const statusColors = {
  'Scheduled': { bg: 'rgba(90,99,73,0.12)', text: '#5a6349' },
  'In Progress': { bg: 'rgba(194,139,56,0.12)', text: '#c28b38' },
  'Completed': { bg: 'rgba(74,124,89,0.12)', text: '#4a7c59' },
  'Cancelled': { bg: 'rgba(139,90,90,0.12)', text: '#8b5a5a' },
  'On Hold': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' }
}

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const products = useStore((state) => state.products)
  const employees = useStore((state) => state.employees)
  const timeLogs = useStore((state) => state.timeLogs)
  const fetchJobs = useStore((state) => state.fetchJobs)
  const fetchTimeLogs = useStore((state) => state.fetchTimeLogs)

  const [job, setJob] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [jobTimeLogs, setJobTimeLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddLine, setShowAddLine] = useState(false)
  const [showAddTime, setShowAddTime] = useState(false)
  const [newLine, setNewLine] = useState({ item_id: '', quantity: 1 })
  const [newTime, setNewTime] = useState({ employee_id: '', hours: '', category: 'Regular', notes: '' })
  const [editMode, setEditMode] = useState(false)
  const [formData, setFormData] = useState({})

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchJobData()
    fetchTimeLogs()
  }, [companyId, id, navigate])

  useEffect(() => {
    // Filter time logs for this job
    setJobTimeLogs(timeLogs.filter(t => t.job_id === parseInt(id)))
  }, [timeLogs, id])

  const fetchJobData = async () => {
    setLoading(true)

    const { data: jobData } = await supabase
      .from('jobs')
      .select('*, customer:customers(id, name, email, phone, address), salesperson:employees(id, name), quote:quotes(id, quote_id)')
      .eq('id', id)
      .single()

    if (jobData) {
      setJob(jobData)
      setFormData(jobData)

      const { data: lines } = await supabase
        .from('job_lines')
        .select('*, item:products_services(id, name, description)')
        .eq('job_id', id)
        .order('id')

      setLineItems(lines || [])
    }

    setLoading(false)
  }

  const addLineItem = async () => {
    if (!newLine.item_id) return

    const product = products.find(p => p.id === parseInt(newLine.item_id))
    if (!product) return

    setSaving(true)

    const lineTotal = (product.unit_price || 0) * newLine.quantity

    await supabase.from('job_lines').insert([{
      company_id: companyId,
      job_id: parseInt(id),
      item_id: product.id,
      quantity: newLine.quantity,
      unit_price: product.unit_price,
      line_total: lineTotal
    }])

    await fetchJobData()
    setNewLine({ item_id: '', quantity: 1 })
    setShowAddLine(false)
    setSaving(false)
  }

  const removeLineItem = async (lineId) => {
    setSaving(true)
    await supabase.from('job_lines').delete().eq('id', lineId)
    await fetchJobData()
    setSaving(false)
  }

  const addTimeEntry = async () => {
    if (!newTime.employee_id || !newTime.hours) return

    setSaving(true)

    await supabase.from('time_log').insert([{
      company_id: companyId,
      job_id: parseInt(id),
      employee_id: parseInt(newTime.employee_id),
      hours: parseFloat(newTime.hours),
      category: newTime.category,
      notes: newTime.notes || null,
      date: new Date().toISOString().split('T')[0]
    }])

    await fetchTimeLogs()
    setNewTime({ employee_id: '', hours: '', category: 'Regular', notes: '' })
    setShowAddTime(false)
    setSaving(false)
  }

  const copyFromQuote = async () => {
    if (!job.quote_id) return
    if (!confirm('Copy line items from the linked quote?')) return

    setSaving(true)

    const { data: quoteLines } = await supabase
      .from('quote_lines')
      .select('*')
      .eq('quote_id', job.quote_id)

    if (quoteLines && quoteLines.length > 0) {
      const jobLines = quoteLines.map(ql => ({
        company_id: companyId,
        job_id: parseInt(id),
        item_id: ql.item_id,
        quantity: ql.quantity,
        unit_price: ql.unit_price,
        line_total: ql.line_total
      }))

      await supabase.from('job_lines').insert(jobLines)
      await fetchJobData()
    }

    setSaving(false)
  }

  const updateJobStatus = async (newStatus) => {
    setSaving(true)
    const updateData = {
      status: newStatus,
      updated_at: new Date().toISOString()
    }

    if (newStatus === 'In Progress' && !job.start_date) {
      updateData.start_date = new Date().toISOString()
    }
    if (newStatus === 'Completed') {
      updateData.end_date = new Date().toISOString()
    }

    await supabase.from('jobs').update(updateData).eq('id', id)
    await fetchJobData()
    await fetchJobs()
    setSaving(false)
  }

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('jobs').update({
      job_title: formData.job_title,
      job_address: formData.job_address,
      start_date: formData.start_date,
      end_date: formData.end_date,
      assigned_team: formData.assigned_team,
      allotted_time_hours: formData.allotted_time_hours,
      details: formData.details,
      notes: formData.notes,
      updated_at: new Date().toISOString()
    }).eq('id', id)
    await fetchJobData()
    await fetchJobs()
    setEditMode(false)
    setSaving(false)
  }

  const generateInvoice = async () => {
    if (!confirm('Generate invoice from this job?')) return

    setSaving(true)

    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`
    const subtotal = lineItems.reduce((sum, line) => sum + (parseFloat(line.line_total) || 0), 0)
    const discount = parseFloat(job.discount) || 0
    const total = subtotal - discount

    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert([{
        company_id: companyId,
        invoice_id: invoiceNumber,
        job_id: parseInt(id),
        customer_id: job.customer_id,
        amount: total,
        discount_applied: discount,
        payment_status: 'Pending',
        job_description: job.job_title,
        notes: job.notes
      }])
      .select()
      .single()

    if (!error && invoice) {
      await supabase.from('jobs').update({
        invoice_status: 'Invoiced',
        updated_at: new Date().toISOString()
      }).eq('id', id)

      await fetchJobData()
      navigate(`/invoices/${invoice.id}`)
    }

    setSaving(false)
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

  const formatDateTime = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleString()
  }

  const openMap = (address) => {
    if (address) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank')
    }
  }

  // Styles
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: theme.text,
    backgroundColor: theme.bgCard,
    outline: 'none'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: '6px'
  }

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: theme.textMuted }}>Loading job...</p>
      </div>
    )
  }

  if (!job) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: '#dc2626', marginBottom: '16px' }}>Job not found</p>
        <button onClick={() => navigate('/jobs')} style={{ color: theme.accent, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
          Back to Jobs
        </button>
      </div>
    )
  }

  const subtotal = lineItems.reduce((sum, line) => sum + (parseFloat(line.line_total) || 0), 0)
  const discount = parseFloat(job.discount) || 0
  const incentive = parseFloat(job.utility_incentive) || 0
  const total = subtotal - discount
  const outOfPocket = total - incentive

  const totalHoursWorked = jobTimeLogs.reduce((sum, t) => sum + (parseFloat(t.hours) || 0), 0)
  const allottedHours = parseFloat(job.allotted_time_hours) || 0
  const progressPercent = allottedHours > 0 ? Math.min(100, (totalHoursWorked / allottedHours) * 100) : 0

  const statusStyle = statusColors[job.status] || statusColors['Scheduled']

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button
          onClick={() => navigate('/jobs')}
          style={{
            padding: '10px',
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            cursor: 'pointer',
            color: theme.textSecondary
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '13px', color: theme.accent, fontWeight: '600' }}>{job.job_id}</p>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
            {job.job_title || 'Untitled Job'}
          </h1>
        </div>
        <span style={{
          padding: '6px 14px',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: '500',
          backgroundColor: statusStyle.bg,
          color: statusStyle.text
        }}>
          {job.status}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '24px' }}>
        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Customer Info */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>Job Details</h3>
              <button
                onClick={() => setEditMode(!editMode)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px'
                }}
              >
                <Pencil size={14} />
                {editMode ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {editMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Job Title</label>
                  <input type="text" value={formData.job_title || ''} onChange={(e) => setFormData(prev => ({ ...prev, job_title: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Address</label>
                  <input type="text" value={formData.job_address || ''} onChange={(e) => setFormData(prev => ({ ...prev, job_address: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Start Date</label>
                    <input type="datetime-local" value={formData.start_date ? formData.start_date.slice(0, 16) : ''} onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Allotted Hours</label>
                    <input type="number" value={formData.allotted_time_hours || ''} onChange={(e) => setFormData(prev => ({ ...prev, allotted_time_hours: e.target.value }))} step="0.25" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Details</label>
                  <textarea value={formData.details || ''} onChange={(e) => setFormData(prev => ({ ...prev, details: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <button onClick={handleSave} disabled={saving} style={{
                  padding: '10px 16px', backgroundColor: theme.accent, color: '#ffffff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1
                }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Customer</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{job.customer?.name || '-'}</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Phone</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{job.customer?.phone || '-'}</p>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Address</p>
                  {job.job_address ? (
                    <button
                      onClick={() => openMap(job.job_address)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '500'
                      }}
                    >
                      <MapPin size={14} />
                      {job.job_address}
                      <ExternalLink size={12} />
                    </button>
                  ) : (
                    <p style={{ fontSize: '14px', color: theme.text }}>-</p>
                  )}
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Start Date</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{formatDateTime(job.start_date)}</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Assigned Team</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{job.assigned_team || '-'}</p>
                </div>
                {job.details && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Details</p>
                    <p style={{ fontSize: '14px', color: theme.text }}>{job.details}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Line Items */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: `1px solid ${theme.border}`
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>Job Lines</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {job.quote_id && lineItems.length === 0 && (
                  <button onClick={copyFromQuote} disabled={saving} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 12px', backgroundColor: theme.accentBg, color: theme.accent,
                    border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer'
                  }}>
                    <FileText size={16} />
                    Copy from Quote
                  </button>
                )}
                <button onClick={() => setShowAddLine(true)} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 12px', backgroundColor: theme.accent, color: '#ffffff',
                  border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer'
                }}>
                  <Plus size={16} />
                  Add Item
                </button>
              </div>
            </div>

            {lineItems.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: theme.textMuted }}>
                No line items yet.
              </div>
            ) : (
              <>
                <div style={{
                  display: 'grid', gridTemplateColumns: '2fr 80px 100px 100px 40px', gap: '12px',
                  padding: '12px 20px', backgroundColor: theme.accentBg,
                  fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px'
                }}>
                  <div>Item</div>
                  <div style={{ textAlign: 'right' }}>Qty</div>
                  <div style={{ textAlign: 'right' }}>Price</div>
                  <div style={{ textAlign: 'right' }}>Total</div>
                  <div></div>
                </div>
                {lineItems.map((line) => (
                  <div key={line.id} style={{
                    display: 'grid', gridTemplateColumns: '2fr 80px 100px 100px 40px', gap: '12px',
                    padding: '14px 20px', borderBottom: `1px solid ${theme.border}`, alignItems: 'center'
                  }}>
                    <div>
                      <p style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>{line.item?.name || 'Unknown'}</p>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '14px', color: theme.textSecondary }}>{line.quantity}</div>
                    <div style={{ textAlign: 'right', fontSize: '14px', color: theme.textSecondary }}>{formatCurrency(line.unit_price)}</div>
                    <div style={{ textAlign: 'right', fontSize: '14px', fontWeight: '500', color: theme.text }}>{formatCurrency(line.line_total)}</div>
                    <div style={{ textAlign: 'right' }}>
                      <button onClick={() => removeLineItem(line.id)} style={{ padding: '6px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: theme.textMuted }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ padding: '16px 20px', backgroundColor: theme.accentBg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: theme.textSecondary }}>Subtotal</span>
                    <span style={{ fontWeight: '500', color: theme.text }}>{formatCurrency(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: theme.textSecondary }}>Discount</span>
                      <span style={{ color: '#dc2626' }}>-{formatCurrency(discount)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: `1px solid ${theme.border}` }}>
                    <span style={{ fontWeight: '600', color: theme.text }}>Total</span>
                    <span style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>{formatCurrency(total)}</span>
                  </div>
                  {incentive > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', color: '#4a7c59' }}>
                      <span>Out of Pocket</span>
                      <span style={{ fontWeight: '500' }}>{formatCurrency(outOfPocket)}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Time Tracking */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: `1px solid ${theme.border}`
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>Time Tracking</h3>
              <button onClick={() => setShowAddTime(true)} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 12px', backgroundColor: theme.accent, color: '#ffffff',
                border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer'
              }}>
                <Plus size={16} />
                Add Time
              </button>
            </div>

            {/* Progress Bar */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: theme.textSecondary }}>{totalHoursWorked.toFixed(1)}h worked</span>
                <span style={{ fontSize: '13px', color: theme.textMuted }}>{allottedHours}h allotted</span>
              </div>
              <div style={{ height: '8px', backgroundColor: theme.accentBg, borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  backgroundColor: progressPercent > 100 ? '#dc2626' : theme.accent,
                  borderRadius: '4px',
                  transition: 'width 0.3s'
                }} />
              </div>
            </div>

            {jobTimeLogs.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: theme.textMuted }}>
                No time entries yet.
              </div>
            ) : (
              <div>
                {jobTimeLogs.map((entry) => (
                  <div key={entry.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 20px', borderBottom: `1px solid ${theme.border}`
                  }}>
                    <div>
                      <p style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>{entry.employee?.name || 'Unknown'}</p>
                      <p style={{ fontSize: '12px', color: theme.textMuted }}>{formatDate(entry.date)} - {entry.category}</p>
                    </div>
                    <span style={{ fontSize: '15px', fontWeight: '500', color: theme.text }}>{entry.hours}h</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Actions */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>Actions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {job.status === 'Scheduled' && (
                <button onClick={() => updateJobStatus('In Progress')} disabled={saving} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '12px 16px', backgroundColor: '#c28b38', color: '#ffffff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  <Play size={18} />
                  Start Job
                </button>
              )}
              {job.status === 'In Progress' && (
                <button onClick={() => updateJobStatus('Completed')} disabled={saving} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '12px 16px', backgroundColor: '#4a7c59', color: '#ffffff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  <CheckCircle size={18} />
                  Mark Completed
                </button>
              )}
              {job.status === 'Completed' && job.invoice_status !== 'Invoiced' && job.invoice_status !== 'Paid' && (
                <button onClick={generateInvoice} disabled={saving} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '12px 16px', backgroundColor: theme.accent, color: '#ffffff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  <DollarSign size={18} />
                  Generate Invoice
                </button>
              )}
              <button style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px 16px', backgroundColor: theme.accentBg, color: theme.accent,
                border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
              }}>
                <FileText size={18} />
                Generate Work Order
              </button>
            </div>
          </div>

          {/* Linked Quote */}
          {job.quote && (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '20px'
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Linked Quote</h3>
              <button onClick={() => navigate(`/quotes/${job.quote_id}`)} style={{
                color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', textDecoration: 'underline'
              }}>
                {job.quote.quote_id}
              </button>
            </div>
          )}

          {/* Notes */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Notes</h3>
            <textarea
              value={job.notes || ''}
              onChange={(e) => {
                supabase.from('jobs').update({ notes: e.target.value, updated_at: new Date().toISOString() }).eq('id', id)
                setJob(prev => ({ ...prev, notes: e.target.value }))
              }}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Add notes..."
            />
          </div>
        </div>
      </div>

      {/* Add Line Item Modal */}
      {showAddLine && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 50
        }}>
          <div style={{
            backgroundColor: theme.bgCard, borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            width: '100%', maxWidth: '400px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>Add Line Item</h2>
              <button onClick={() => setShowAddLine(false)} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Product/Service</label>
                <select value={newLine.item_id} onChange={(e) => setNewLine(prev => ({ ...prev, item_id: e.target.value }))} style={inputStyle}>
                  <option value="">-- Select --</option>
                  {products.filter(p => p.active).map(product => (
                    <option key={product.id} value={product.id}>{product.name} - {formatCurrency(product.unit_price)}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>Quantity</label>
                <input type="number" value={newLine.quantity} onChange={(e) => setNewLine(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))} min="1" style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowAddLine(false)} style={{ flex: 1, padding: '10px 16px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.text, borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={addLineItem} disabled={saving || !newLine.item_id} style={{ flex: 1, padding: '10px 16px', backgroundColor: theme.accent, color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', opacity: saving || !newLine.item_id ? 0.6 : 1 }}>{saving ? 'Adding...' : 'Add Item'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Time Entry Modal */}
      {showAddTime && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 50
        }}>
          <div style={{
            backgroundColor: theme.bgCard, borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            width: '100%', maxWidth: '400px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>Add Time Entry</h2>
              <button onClick={() => setShowAddTime(false)} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Employee</label>
                <select value={newTime.employee_id} onChange={(e) => setNewTime(prev => ({ ...prev, employee_id: e.target.value }))} style={inputStyle}>
                  <option value="">-- Select --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>Hours</label>
                  <input type="number" value={newTime.hours} onChange={(e) => setNewTime(prev => ({ ...prev, hours: e.target.value }))} step="0.25" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Category</label>
                  <select value={newTime.category} onChange={(e) => setNewTime(prev => ({ ...prev, category: e.target.value }))} style={inputStyle}>
                    <option value="Regular">Regular</option>
                    <option value="Overtime">Overtime</option>
                    <option value="Travel">Travel</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>Notes</label>
                <textarea value={newTime.notes} onChange={(e) => setNewTime(prev => ({ ...prev, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowAddTime(false)} style={{ flex: 1, padding: '10px 16px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.text, borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={addTimeEntry} disabled={saving || !newTime.employee_id || !newTime.hours} style={{ flex: 1, padding: '10px 16px', backgroundColor: theme.accent, color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', opacity: saving || !newTime.employee_id || !newTime.hours ? 0.6 : 1 }}>{saving ? 'Adding...' : 'Add Time'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
