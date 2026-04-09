import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { ArrowLeft, CheckCircle, Pencil, Trash2, Download, Send, FileText } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'
import { invoiceStatusColors as statusColors } from '../lib/statusColors'
import { jsPDF } from 'jspdf'
import { toast } from '../lib/toast'

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

export default function UtilityInvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const companyId = useStore((state) => state.companyId)
  const company = useStore((state) => state.company)
  const fetchUtilityInvoices = useStore((state) => state.fetchUtilityInvoices)

  const [invoice, setInvoice] = useState(null)
  const [jobLines, setJobLines] = useState([])
  const [jobData, setJobData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    amount: '',
    utility_name: '',
    customer_name: '',
    notes: '',
    project_cost: '',
    incentive_amount: '',
    net_cost: ''
  })

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchInvoiceData()
  }, [companyId, id, navigate])

  const fetchInvoiceData = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('utility_invoices')
      .select('*')
      .eq('id', id)
      .single()

    if (data) {
      setInvoice(data)

      // Fetch linked job and its line items for product/labor breakdown
      if (data.job_id) {
        const { data: jd } = await supabase
          .from('jobs')
          .select('*, customer:customers!customer_id(id, name, email, phone, address, business_name)')
          .eq('id', data.job_id)
          .single()
        if (jd) setJobData(jd)

        const { data: lines } = await supabase
          .from('job_lines')
          .select('*, item:products_services(id, name, description, unit_price, cost)')
          .eq('job_id', data.job_id)
          .order('id')
        setJobLines(lines || [])
      }
    }
    setLoading(false)
  }

  const markAsPaid = async () => {
    setSaving(true)
    await supabase.from('utility_invoices').update({
      payment_status: 'Paid',
      updated_at: new Date().toISOString()
    }).eq('id', id)
    await fetchInvoiceData()
    await fetchUtilityInvoices()
    setSaving(false)
  }

  const startEditing = () => {
    const pc = parseFloat(invoice.project_cost) || parseFloat(invoice.amount) || 0
    const matP = parseFloat(invoice.material_pct) || 70
    const labP = parseFloat(invoice.labor_pct) || 30
    setEditForm({
      amount: invoice.amount || '',
      utility_name: invoice.utility_name || '',
      customer_name: invoice.customer_name || '',
      notes: invoice.notes || '',
      project_cost: invoice.project_cost || '',
      incentive_amount: invoice.incentive_amount || '',
      net_cost: invoice.net_cost || '',
      material_pct: matP,
      labor_pct: labP,
      material_amount: Math.round(pc * matP / 100 * 100) / 100 || '',
      labor_amount: Math.round(pc * labP / 100 * 100) / 100 || '',
    })
    setIsEditing(true)
  }

  // Auto-recalc helpers — keeps all numbers in sync when one changes.
  // Rules:
  //   project_cost = material_amount + labor_amount
  //   net_cost = project_cost - incentive_amount
  //   amount = incentive_amount (always synced for payment tracking)
  //   material_amount = project_cost * material_pct / 100
  //   labor_amount = project_cost * labor_pct / 100
  const recalcFromProjectCost = (form, newPC) => {
    const pc = parseFloat(newPC) || 0
    const inc = parseFloat(form.incentive_amount) || 0
    const matP = parseFloat(form.material_pct) || 70
    const labP = parseFloat(form.labor_pct) || 30
    return {
      ...form,
      project_cost: newPC,
      material_amount: Math.round(pc * matP / 100 * 100) / 100,
      labor_amount: Math.round(pc * labP / 100 * 100) / 100,
      net_cost: Math.round((pc - inc) * 100) / 100,
    }
  }

  const recalcFromIncentive = (form, newInc) => {
    const pc = parseFloat(form.project_cost) || 0
    const inc = parseFloat(newInc) || 0
    return {
      ...form,
      incentive_amount: newInc,
      amount: newInc,
      net_cost: Math.round((pc - inc) * 100) / 100,
    }
  }

  const recalcFromNetCost = (form, newNet) => {
    const pc = parseFloat(form.project_cost) || 0
    const net = parseFloat(newNet) || 0
    const newInc = Math.round((pc - net) * 100) / 100
    return {
      ...form,
      net_cost: newNet,
      incentive_amount: newInc,
      amount: newInc,
    }
  }

  const recalcFromPct = (form, field, newVal) => {
    const pc = parseFloat(form.project_cost) || 0
    const updated = { ...form, [field]: newVal }
    const matP = parseFloat(field === 'material_pct' ? newVal : form.material_pct) || 0
    const labP = parseFloat(field === 'labor_pct' ? newVal : form.labor_pct) || 0
    updated.material_amount = Math.round(pc * matP / 100 * 100) / 100
    updated.labor_amount = Math.round(pc * labP / 100 * 100) / 100
    return updated
  }

  const recalcFromMaterialAmount = (form, newMat) => {
    const lab = parseFloat(form.labor_amount) || 0
    const mat = parseFloat(newMat) || 0
    const newPC = Math.round((mat + lab) * 100) / 100
    const inc = parseFloat(form.incentive_amount) || 0
    const matP = newPC > 0 ? Math.round(mat / newPC * 100 * 10) / 10 : form.material_pct
    return {
      ...form,
      material_amount: newMat,
      material_pct: matP,
      project_cost: newPC,
      net_cost: Math.round((newPC - inc) * 100) / 100,
    }
  }

  const recalcFromLaborAmount = (form, newLab) => {
    const mat = parseFloat(form.material_amount) || 0
    const lab = parseFloat(newLab) || 0
    const newPC = Math.round((mat + lab) * 100) / 100
    const inc = parseFloat(form.incentive_amount) || 0
    const labP = newPC > 0 ? Math.round(lab / newPC * 100 * 10) / 10 : form.labor_pct
    return {
      ...form,
      labor_amount: newLab,
      labor_pct: labP,
      project_cost: newPC,
      net_cost: Math.round((newPC - inc) * 100) / 100,
    }
  }

  const cancelEditing = () => {
    setIsEditing(false)
  }

  const saveEdits = async () => {
    setSaving(true)
    // amount always equals incentive_amount — it's what drives payment
    // tracking ("how much the utility owes us").
    const incAmt = parseFloat(editForm.incentive_amount) || 0
    const { error } = await supabase.from('utility_invoices').update({
      amount: incAmt,
      utility_name: editForm.utility_name || null,
      customer_name: editForm.customer_name || null,
      notes: editForm.notes || null,
      project_cost: parseFloat(editForm.project_cost) || null,
      incentive_amount: incAmt,
      net_cost: parseFloat(editForm.net_cost) || null,
      material_pct: parseFloat(editForm.material_pct) || 70,
      labor_pct: parseFloat(editForm.labor_pct) || 30,
      updated_at: new Date().toISOString()
    }).eq('id', id)

    const { toast } = await import('../lib/toast')
    if (error) {
      toast.error('Failed to save: ' + error.message)
    } else {
      toast.success('Utility incentive updated')
      setIsEditing(false)
      await fetchInvoiceData()
      await fetchUtilityInvoices()
    }
    setSaving(false)
  }

  const handleDeleteInvoice = async () => {
    if (!confirm('Are you sure you want to delete this utility incentive? This cannot be undone.')) return

    setSaving(true)
    const { toast } = await import('../lib/toast')
    const { error } = await supabase.from('utility_invoices').delete().eq('id', id)

    if (error) {
      toast.error('Failed to delete bill: ' + error.message)
      setSaving(false)
    } else {
      toast.success('Utility incentive deleted')
      await fetchUtilityInvoices()
      navigate('/invoices?type=utility')
    }
  }

  // Computed totals — just Material and Labor, no line item detail.
  // Uses the per-invoice split percentages stored on the row (editable
  // by the PM). Falls back to 70/30 for invoices created before the
  // migration or when the columns are null.
  const projectCost = parseFloat(invoice?.project_cost) || parseFloat(invoice?.amount) || 0
  const rawProductTotal = jobLines.reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0)
  const rawLaborTotal = jobLines.reduce((sum, l) => sum + (parseFloat(l.labor_cost) || 0), 0)
  const hasLaborData = rawLaborTotal > 0
  const matPct = (parseFloat(isEditing ? editForm.material_pct : invoice?.material_pct) || 70) / 100
  const labPct = (parseFloat(isEditing ? editForm.labor_pct : invoice?.labor_pct) || 30) / 100
  const totalBase = rawProductTotal > 0 ? rawProductTotal + rawLaborTotal : projectCost
  const materialTotal = hasLaborData ? rawProductTotal : Math.round(totalBase * matPct * 100) / 100
  const laborTotal = hasLaborData ? rawLaborTotal : Math.round(totalBase * labPct * 100) / 100

  const generateUtilityPDF = () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    const rightEdge = pageWidth - margin
    const contentWidth = pageWidth - margin * 2
    let y = 20

    // Company header
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text(company?.name || 'Company', margin, y)
    y += 8

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    if (company?.address) { doc.text(company.address, margin, y); y += 5 }
    if (company?.phone) { doc.text(company.phone, margin, y); y += 5 }
    if (company?.owner_email || company?.email) { doc.text(company.owner_email || company.email, margin, y); y += 5 }
    y += 5

    // Title
    doc.setTextColor(90, 99, 73)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('UTILITY INVOICE', rightEdge, 20, { align: 'right' })
    doc.setTextColor(80)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    let iy = 30
    doc.text(`Invoice #: UTL-${invoice.id}`, rightEdge, iy, { align: 'right' }); iy += 5
    doc.text(`Date: ${formatDate(invoice.created_at)}`, rightEdge, iy, { align: 'right' }); iy += 5
    doc.text(`Utility: ${invoice.utility_name || '-'}`, rightEdge, iy, { align: 'right' })

    // Divider
    doc.setDrawColor(214, 205, 184)
    doc.line(margin, y, rightEdge, y)
    y += 10

    // Customer info
    doc.setTextColor(0)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Customer:', margin, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const custName = invoice.customer_name || jobData?.customer?.name || '-'
    doc.text(custName, margin, y); y += 5
    if (jobData?.customer?.address) { doc.text(jobData.customer.address, margin, y); y += 5 }
    if (jobData?.customer?.phone) { doc.text(jobData.customer.phone, margin, y); y += 5 }
    y += 8

    // Cost breakdown table — Material and Labor only
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Cost Breakdown', margin, y)
    y += 8

    // Table header
    doc.setFillColor(247, 245, 239)
    doc.rect(margin, y - 4, contentWidth, 8, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(80)
    doc.text('Description', margin + 2, y)
    doc.text('Amount', rightEdge - 2, y, { align: 'right' })
    y += 8

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0)
    doc.setFontSize(10)
    const pdfMatPct = invoice.material_pct ?? 70
    const pdfLabPct = invoice.labor_pct ?? 30
    doc.text(`Material (${pdfMatPct}%)`, margin + 2, y)
    doc.text(formatCurrency(materialTotal), rightEdge - 2, y, { align: 'right' })
    y += 7
    doc.text(`Labor (${pdfLabPct}%)`, margin + 2, y)
    doc.text(formatCurrency(laborTotal), rightEdge - 2, y, { align: 'right' })
    y += 4

    // Divider
    doc.setDrawColor(214, 205, 184)
    doc.line(margin, y, rightEdge, y)
    y += 10

    // Financial summary — shows full project context for the utility,
    // but the bottom-line "Amount Due" is only the utility incentive.
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0)

    const summaryX = margin + 80
    const valX = rightEdge

    doc.setFont('helvetica', 'bold')
    doc.text('Total Project Cost:', summaryX, y)
    doc.text(formatCurrency(invoice.project_cost || invoice.amount || (materialTotal + laborTotal)), valX, y, { align: 'right' }); y += 6

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text('Customer Portion:', summaryX, y)
    doc.text(formatCurrency(invoice.net_cost), valX, y, { align: 'right' }); y += 8

    doc.setDrawColor(214, 205, 184)
    doc.line(summaryX, y - 2, rightEdge, y - 2)

    doc.setTextColor(212, 148, 10)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Utility Incentive Due:', summaryX, y + 5)
    doc.text(formatCurrency(invoice.incentive_amount || invoice.amount), valX, y + 5, { align: 'right' })
    y += 18

    // Notes
    if (invoice.notes) {
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100)
      doc.text('Notes:', margin, y); y += 5
      const noteLines = doc.splitTextToSize(invoice.notes, contentWidth)
      for (const line of noteLines) {
        doc.text(line, margin, y); y += 5
      }
    }

    return doc
  }

  const handleDownloadPDF = () => {
    setGeneratingPdf(true)
    try {
      const doc = generateUtilityPDF()
      doc.save(`UTL-${invoice.id}_${invoice.customer_name || 'utility'}.pdf`)
      toast.success('PDF downloaded')
    } catch (err) {
      toast.error('Failed to generate PDF: ' + err.message)
    }
    setGeneratingPdf(false)
  }

  const handlePreviewPDF = () => {
    try {
      const doc = generateUtilityPDF()
      const blob = doc.output('blob')
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) {
      toast.error('Failed to preview PDF: ' + err.message)
    }
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

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

  const actionBtnStyle = (bg, color) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: bg,
    color: color,
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    width: '100%'
  })

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: theme.textMuted }}>Loading utility incentive...</p>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: '#dc2626', marginBottom: '16px' }}>Utility incentive not found</p>
        <button onClick={() => navigate('/invoices?type=utility')} style={{ color: theme.accent, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
          Back to Utility Incentives
        </button>
      </div>
    )
  }

  const statusStyle = statusColors[invoice.payment_status] || statusColors['Pending']

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate('/invoices?type=utility')}
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
          <p style={{ fontSize: '13px', color: theme.accent, fontWeight: '600' }}>
            UTL-{invoice.id}
          </p>
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text }}>
            {invoice.customer_name || 'Utility Incentive'}
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
          {invoice.payment_status}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 360px', gap: isMobile ? '16px' : '24px' }}>
        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Utility Info */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
              Utility Info
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Utility Name</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm.utility_name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, utility_name: e.target.value }))}
                    style={inputStyle}
                    placeholder="Utility name"
                  />
                ) : (
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.utility_name || '-'}</p>
                )}
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Customer Name</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm.customer_name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, customer_name: e.target.value }))}
                    style={inputStyle}
                    placeholder="Customer name"
                  />
                ) : (
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.customer_name || '-'}</p>
                )}
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Date Created</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{formatDate(invoice.created_at)}</p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Last Updated</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{formatDate(invoice.updated_at)}</p>
              </div>
            </div>
          </div>

          {/* Job Link */}
          {invoice.job_id && (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '20px'
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
                Linked Job
              </h3>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Job ID</p>
                <button
                  onClick={() => navigate(`/jobs/${invoice.job_id}`)}
                  style={{ fontSize: '14px', fontWeight: '500', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {invoice.job_id}
                </button>
              </div>
            </div>
          )}

          {/* Cost Breakdown — Material & Labor */}
          {(materialTotal > 0 || laborTotal > 0) && (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '20px'
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
                Cost Breakdown
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                  <span style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Material</span>
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.material_amount}
                      onChange={(e) => setEditForm(prev => recalcFromMaterialAmount(prev, e.target.value))}
                      style={{ ...inputStyle, width: '140px', textAlign: 'right', fontWeight: '600' }}
                    />
                  ) : (
                    <span style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>{formatCurrency(materialTotal)}</span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                  <span style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Labor</span>
                  {isEditing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.labor_amount}
                      onChange={(e) => setEditForm(prev => recalcFromLaborAmount(prev, e.target.value))}
                      style={{ ...inputStyle, width: '140px', textAlign: 'right', fontWeight: '600' }}
                    />
                  ) : (
                    <span style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>{formatCurrency(laborTotal)}</span>
                  )}
                </div>
                {isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>Split:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={editForm.material_pct}
                        onChange={(e) => setEditForm(prev => recalcFromPct(prev, 'material_pct', e.target.value))}
                        style={{
                          width: '60px', padding: '6px 8px',
                          border: `1px solid ${theme.border}`, borderRadius: '6px',
                          fontSize: '13px', backgroundColor: theme.bg, color: theme.text,
                          textAlign: 'center',
                        }}
                      />
                      <span style={{ fontSize: '12px', color: theme.textMuted }}>%</span>
                    </div>
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>/</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={editForm.labor_pct}
                        onChange={(e) => setEditForm(prev => recalcFromPct(prev, 'labor_pct', e.target.value))}
                        style={{
                          width: '60px', padding: '6px 8px',
                          border: `1px solid ${theme.border}`, borderRadius: '6px',
                          fontSize: '13px', backgroundColor: theme.bg, color: theme.text,
                          textAlign: 'center',
                        }}
                      />
                      <span style={{ fontSize: '12px', color: theme.textMuted }}>%</span>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: '11px', color: theme.textMuted, fontStyle: 'italic', margin: 0 }}>
                    {invoice?.material_pct ?? 70}% material / {invoice?.labor_pct ?? 30}% labor
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
              Notes
            </h3>
            {isEditing ? (
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Invoice notes..."
              />
            ) : (
              <p style={{ fontSize: '14px', color: theme.textSecondary }}>
                {invoice.notes || <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>No notes</span>}
              </p>
            )}
          </div>

          {/* Edit Save/Cancel buttons */}
          {isEditing && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={cancelEditing}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveEdits}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  backgroundColor: theme.accent,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Financial Summary */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
              Financial Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Full project context — the utility sees these numbers
                  but they're informational, not what's owed. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                <span style={{ color: theme.textSecondary }}>Project Cost</span>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.project_cost}
                    onChange={(e) => setEditForm(prev => recalcFromProjectCost(prev, e.target.value))}
                    style={{ ...inputStyle, width: '140px', textAlign: 'right' }}
                  />
                ) : (
                  <span style={{ fontWeight: '500', color: theme.text }}>{formatCurrency(invoice.project_cost || invoice.amount)}</span>
                )}
              </div>

              {(materialTotal > 0 || laborTotal > 0 || isEditing) && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', alignItems: 'center', paddingLeft: '12px' }}>
                    <span style={{ color: theme.textMuted }}>Material ({isEditing ? editForm.material_pct : (invoice?.material_pct ?? 70)}%)</span>
                    <span style={{ color: theme.textSecondary }}>{formatCurrency(isEditing ? editForm.material_amount : materialTotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', alignItems: 'center', paddingLeft: '12px' }}>
                    <span style={{ color: theme.textMuted }}>Labor ({isEditing ? editForm.labor_pct : (invoice?.labor_pct ?? 30)}%)</span>
                    <span style={{ color: theme.textSecondary }}>{formatCurrency(isEditing ? editForm.labor_amount : laborTotal)}</span>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', alignItems: 'center' }}>
                <span style={{ color: theme.textMuted }}>Customer Portion</span>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.net_cost}
                    onChange={(e) => setEditForm(prev => recalcFromNetCost(prev, e.target.value))}
                    style={{ ...inputStyle, width: '140px', textAlign: 'right', fontSize: '13px' }}
                  />
                ) : (
                  <span style={{ color: theme.textSecondary }}>{formatCurrency(invoice.net_cost)}</span>
                )}
              </div>

              <div style={{ height: '1px', backgroundColor: theme.border }} />

              {/* This is what the utility owes — the primary number */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '14px',
                backgroundColor: 'rgba(212,148,10,0.08)',
                borderRadius: '10px',
                border: '1px solid rgba(212,148,10,0.3)',
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: '700', color: '#a88527', fontSize: '14px' }}>Utility Owes</span>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.incentive_amount}
                    onChange={(e) => setEditForm(prev => recalcFromIncentive(prev, e.target.value))}
                    style={{ ...inputStyle, width: '140px', textAlign: 'right', fontWeight: '700', fontSize: '18px' }}
                  />
                ) : (
                  <span style={{ fontSize: '22px', fontWeight: '700', color: '#a88527' }}>
                    {formatCurrency(invoice.incentive_amount || invoice.amount)}
                  </span>
                )}
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ color: theme.textSecondary, fontSize: '14px' }}>Payment Status</span>
                <span style={{
                  padding: '2px 10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '500',
                  backgroundColor: statusStyle.bg,
                  color: statusStyle.text
                }}>
                  {invoice.payment_status}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
              Actions
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={handlePreviewPDF}
                style={actionBtnStyle(theme.accentBg, theme.accent)}
              >
                <FileText size={18} />
                Preview PDF
              </button>

              <button
                onClick={handleDownloadPDF}
                disabled={generatingPdf}
                style={actionBtnStyle(theme.accentBg, theme.accent)}
              >
                <Download size={18} />
                {generatingPdf ? 'Generating...' : 'Download PDF'}
              </button>

              <div style={{ borderTop: `1px solid ${theme.border}`, margin: '2px 0' }} />

              {invoice.payment_status !== 'Paid' && (
                <button
                  onClick={markAsPaid}
                  disabled={saving}
                  style={actionBtnStyle('#4a7c59', '#ffffff')}
                >
                  <CheckCircle size={18} />
                  Mark as Paid
                </button>
              )}

              {!isEditing && (
                <button onClick={startEditing} style={actionBtnStyle(theme.accentBg, theme.accent)}>
                  <Pencil size={18} />
                  Edit Rebate
                </button>
              )}

              <div style={{ borderTop: `1px solid ${theme.border}`, margin: '6px 0' }} />
              <button
                onClick={handleDeleteInvoice}
                disabled={saving}
                style={actionBtnStyle('rgba(220,38,38,0.10)', '#dc2626')}
              >
                <Trash2 size={18} />
                Delete Rebate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
