import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import ProductPickerModal from '../components/ProductPickerModal'
import { ArrowLeft, Plus, Trash2, Send, CheckCircle, XCircle, Briefcase, Calculator, FileText } from 'lucide-react'
import { fillPdfForm, downloadPdf } from '../lib/pdfFormFiller'
import { resolveAllMappings } from '../lib/dataPathResolver'

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
  'Draft': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' },
  'Sent': { bg: 'rgba(90,99,73,0.12)', text: '#5a6349' },
  'Approved': { bg: 'rgba(74,124,89,0.12)', text: '#4a7c59' },
  'Rejected': { bg: 'rgba(139,90,90,0.12)', text: '#8b5a5a' }
}

export default function QuoteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const products = useStore((state) => state.products)
  const prescriptiveMeasures = useStore((state) => state.prescriptiveMeasures)
  const fetchQuotes = useStore((state) => state.fetchQuotes)

  const [quote, setQuote] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [calculatingIncentive, setCalculatingIncentive] = useState(false)
  const [rebateForms, setRebateForms] = useState([])
  const [fillingForm, setFillingForm] = useState(false)

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchQuoteData()
  }, [companyId, id, navigate])

  const fetchQuoteData = async () => {
    setLoading(true)

    const { data: quoteData } = await supabase
      .from('quotes')
      .select('*, lead:leads(id, customer_name, phone, email, address), customer:customers(id, name, email, phone, address), salesperson:employees(id, name)')
      .eq('id', id)
      .single()

    if (quoteData) {
      setQuote(quoteData)

      const { data: lines } = await supabase
        .from('quote_lines')
        .select('*, item:products_services(id, name, description)')
        .eq('quote_id', id)
        .order('id')

      setLineItems(lines || [])

      // Load mapped rebate forms if quote has an audit
      if (quoteData.audit_id) {
        const { data: audit } = await supabase
          .from('lighting_audits')
          .select('utility_provider_id')
          .eq('id', quoteData.audit_id)
          .single()
        if (audit?.utility_provider_id) {
          const { data: mappedForms } = await supabase
            .from('utility_forms')
            .select('*')
            .eq('provider_id', audit.utility_provider_id)
            .not('field_mapping', 'is', null)
          setRebateForms(mappedForms || [])
        }
      }
    }

    setLoading(false)
  }

  const handleFillRebateForm = async (form) => {
    setFillingForm(true)
    try {
      // Load full data context
      const { data: audit } = await supabase
        .from('lighting_audits')
        .select('*')
        .eq('id', quote.audit_id)
        .single()

      const { data: areas } = await supabase
        .from('audit_areas')
        .select('*')
        .eq('audit_id', quote.audit_id)

      const { data: provider } = audit?.utility_provider_id
        ? await supabase.from('utility_providers').select('*').eq('id', audit.utility_provider_id).single()
        : { data: null }

      const customer = quote.customer || quote.lead
      const salesperson = quote.salesperson

      const dataContext = {
        customer: {
          name: customer?.name || customer?.customer_name || '',
          email: customer?.email || '',
          phone: customer?.phone || '',
          address: customer?.address || '',
        },
        audit: audit || {},
        quote: quote || {},
        provider: provider || {},
        salesperson: salesperson || {},
        audit_areas: areas || [],
        lines: [],
      }

      // Resolve all mappings
      const fieldValues = resolveAllMappings(form.field_mapping, dataContext)

      // Fetch PDF
      let pdfBytes = null
      if (form.form_file) {
        const { data } = supabase.storage.from('utility-pdfs').getPublicUrl(form.form_file)
        if (data?.publicUrl) {
          const res = await fetch(data.publicUrl)
          if (res.ok) pdfBytes = new Uint8Array(await res.arrayBuffer())
        }
      }
      if (!pdfBytes && form.form_url) {
        const res = await fetch(form.form_url)
        if (res.ok) pdfBytes = new Uint8Array(await res.arrayBuffer())
      }

      if (!pdfBytes) {
        alert('Could not fetch the PDF form. The file may need to be re-uploaded in the Data Console.')
        setFillingForm(false)
        return
      }

      // Fill and download
      const filledBytes = await fillPdfForm(pdfBytes, fieldValues)
      const providerSlug = (provider?.provider_name || 'form').replace(/[^a-zA-Z0-9]/g, '_')
      const customerSlug = (customer?.name || customer?.customer_name || 'customer').replace(/[^a-zA-Z0-9]/g, '_')
      const date = new Date().toISOString().slice(0, 10)
      downloadPdf(filledBytes, `${providerSlug}_${form.form_name.replace(/[^a-zA-Z0-9]/g, '_')}_${customerSlug}_${date}.pdf`)
    } catch (err) {
      alert('Error filling form: ' + err.message)
    }
    setFillingForm(false)
  }

  const handleProductSelect = async (product, laborCost, totalPrice) => {
    setSaving(true)
    setShowProductPicker(false)

    await supabase.from('quote_lines').insert([{
      company_id: companyId,
      quote_id: parseInt(id),
      item_id: product.id,
      quantity: 1,
      price: totalPrice,
      line_total: totalPrice
    }])

    await updateQuoteTotal()
    await fetchQuoteData()
    setSaving(false)
  }

  const removeLineItem = async (lineId) => {
    setSaving(true)
    await supabase.from('quote_lines').delete().eq('id', lineId)
    await updateQuoteTotal()
    await fetchQuoteData()
    setSaving(false)
  }

  const updateQuoteTotal = async () => {
    const { data: lines } = await supabase
      .from('quote_lines')
      .select('line_total')
      .eq('quote_id', id)

    const total = (lines || []).reduce((sum, line) => sum + (parseFloat(line.line_total) || 0), 0)

    await supabase.from('quotes').update({
      quote_amount: total,
      updated_at: new Date().toISOString()
    }).eq('id', id)
  }

  const updateQuoteField = async (field, value) => {
    setSaving(true)
    await supabase.from('quotes').update({
      [field]: value,
      updated_at: new Date().toISOString()
    }).eq('id', id)
    await fetchQuoteData()
    setSaving(false)
  }

  const sendQuote = async () => {
    await updateQuoteField('status', 'Sent')
    await supabase.from('quotes').update({
      sent_date: new Date().toISOString()
    }).eq('id', id)
    await fetchQuoteData()
    await fetchQuotes()
  }

  const approveQuote = async () => {
    await updateQuoteField('status', 'Approved')
    await fetchQuotes()
  }

  const rejectQuote = async () => {
    await updateQuoteField('status', 'Rejected')
    await fetchQuotes()
  }

  const convertToJob = async () => {
    if (!confirm('Convert this quote to a job?')) return
    await approveQuote()
    alert('Quote approved! Jobs module ready for conversion.')
  }

  const calculateIncentive = async () => {
    if (!quote.audit_id) {
      alert('This quote is not linked to a lighting audit. Link an audit first to auto-calculate incentives.')
      return
    }
    if (!prescriptiveMeasures || prescriptiveMeasures.length === 0) {
      alert('No prescriptive measures data available. Enrich utility PDFs in the Data Console first.')
      return
    }

    setCalculatingIncentive(true)
    try {
      // Load audit and its areas
      const { data: audit } = await supabase
        .from('lighting_audits')
        .select('*')
        .eq('id', quote.audit_id)
        .single()

      if (!audit) {
        alert('Linked audit not found.')
        setCalculatingIncentive(false)
        return
      }

      const { data: areas } = await supabase
        .from('audit_areas')
        .select('*')
        .eq('audit_id', quote.audit_id)

      if (!areas || areas.length === 0) {
        alert('No audit areas found for the linked audit.')
        setCalculatingIncentive(false)
        return
      }

      let totalIncentive = 0

      for (const area of areas) {
        const areaWattsReduced = (area.fixture_count || 0) * ((area.existing_wattage || 0) - (area.led_wattage || 0))

        // Match prescriptive measures by category/wattage/provider
        const match = prescriptiveMeasures.find(pm => {
          if (pm.measure_category !== 'Lighting') return false
          const subcatMatch = pm.measure_subcategory?.toLowerCase() === area.fixture_category?.toLowerCase()
          const wattageClose = pm.baseline_wattage && area.existing_wattage
            ? Math.abs(pm.baseline_wattage - area.existing_wattage) / area.existing_wattage < 0.2
            : false
          const providerMatch = !audit.utility_provider_id || pm.program?.provider_id === audit.utility_provider_id
          return (subcatMatch || wattageClose) && providerMatch
        })

        if (match) {
          const amount = match.incentive_amount || 0
          const unit = match.incentive_unit || 'per_fixture'
          if (unit === 'per_watt_reduced') {
            totalIncentive += areaWattsReduced * amount
          } else if (unit === 'per_fixture' || unit === 'per_lamp') {
            totalIncentive += (area.fixture_count || 0) * amount
          } else if (unit === 'per_kw') {
            totalIncentive += (areaWattsReduced / 1000) * amount
          } else {
            totalIncentive += amount
          }
        }
      }

      if (totalIncentive > 0) {
        await updateQuoteField('utility_incentive', Math.round(totalIncentive * 100) / 100)
      } else {
        alert('No matching prescriptive measures found for the audit fixture types. Check that utility PDFs have been enriched for this provider.')
      }
    } catch (err) {
      alert('Error calculating incentive: ' + err.message)
    }
    setCalculatingIncentive(false)
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
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
        <p style={{ color: theme.textMuted }}>Loading quote...</p>
      </div>
    )
  }

  if (!quote) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: '#dc2626', marginBottom: '16px' }}>Quote not found</p>
        <button
          onClick={() => navigate('/quotes')}
          style={{
            color: theme.accent,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textDecoration: 'underline'
          }}
        >
          Back to Quotes
        </button>
      </div>
    )
  }

  const subtotal = lineItems.reduce((sum, line) => sum + (parseFloat(line.line_total) || 0), 0)
  const discount = parseFloat(quote.discount) || 0
  const incentive = parseFloat(quote.utility_incentive) || 0
  const total = subtotal - discount
  const outOfPocket = total - incentive

  const customerInfo = quote.customer || quote.lead
  const statusStyle = statusColors[quote.status] || statusColors['Draft']

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <button
          onClick={() => navigate('/quotes')}
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
          <h1 style={{
            fontSize: '24px',
            fontWeight: '700',
            color: theme.text
          }}>
            Quote {quote.quote_id || `#${quote.id}`}
          </h1>
          <p style={{ fontSize: '14px', color: theme.textSecondary }}>
            {customerInfo?.name || customerInfo?.customer_name || 'No customer'}
          </p>
        </div>
        <span style={{
          padding: '6px 14px',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: '500',
          backgroundColor: statusStyle.bg,
          color: statusStyle.text
        }}>
          {quote.status}
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 360px',
        gap: '24px'
      }}>
        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Customer Info */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{
              fontSize: '15px',
              fontWeight: '600',
              color: theme.text,
              marginBottom: '16px'
            }}>
              Customer Information
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px'
            }}>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Name</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                  {customerInfo?.name || customerInfo?.customer_name || '-'}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Email</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                  {customerInfo?.email || '-'}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Phone</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                  {customerInfo?.phone || '-'}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Address</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                  {customerInfo?.address || '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h3 style={{
                fontSize: '15px',
                fontWeight: '600',
                color: theme.text
              }}>
                Line Items
              </h3>
              <button
                onClick={() => setShowProductPicker(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  backgroundColor: theme.accent,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} />
                Add Item
              </button>
            </div>

            {lineItems.length === 0 ? (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: theme.textMuted
              }}>
                No line items yet. Add products or services to this quote.
              </div>
            ) : (
              <>
                {/* Table Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 80px 100px 100px 40px',
                  gap: '12px',
                  padding: '12px 20px',
                  backgroundColor: theme.accentBg,
                  fontSize: '12px',
                  fontWeight: '600',
                  color: theme.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  <div>Item</div>
                  <div style={{ textAlign: 'right' }}>Qty</div>
                  <div style={{ textAlign: 'right' }}>Price</div>
                  <div style={{ textAlign: 'right' }}>Total</div>
                  <div></div>
                </div>

                {/* Table Body */}
                {lineItems.map((line) => (
                  <div
                    key={line.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 80px 100px 100px 40px',
                      gap: '12px',
                      padding: '14px 20px',
                      borderBottom: `1px solid ${theme.border}`,
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <p style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>
                        {line.item?.name || 'Unknown'}
                      </p>
                      {line.item?.description && (
                        <p style={{
                          fontSize: '12px',
                          color: theme.textMuted,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {line.item.description}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '14px', color: theme.textSecondary }}>
                      {line.quantity}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '14px', color: theme.textSecondary }}>
                      {formatCurrency(line.price)}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '14px', fontWeight: '500', color: theme.text }}>
                      {formatCurrency(line.line_total)}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => removeLineItem(line.id)}
                        style={{
                          padding: '6px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          color: theme.textMuted
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#fef2f2'
                          e.currentTarget.style.color = '#dc2626'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.style.color = theme.textMuted
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Notes */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{
              fontSize: '15px',
              fontWeight: '600',
              color: theme.text,
              marginBottom: '12px'
            }}>
              Notes
            </h3>
            <textarea
              value={quote.notes || ''}
              onChange={(e) => updateQuoteField('notes', e.target.value)}
              rows={3}
              style={{
                ...inputStyle,
                resize: 'vertical'
              }}
              placeholder="Add notes..."
            />
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Totals */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{
              fontSize: '15px',
              fontWeight: '600',
              color: theme.text,
              marginBottom: '16px'
            }}>
              Quote Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '14px'
              }}>
                <span style={{ color: theme.textSecondary }}>Subtotal</span>
                <span style={{ fontWeight: '500', color: theme.text }}>{formatCurrency(subtotal)}</span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '14px'
              }}>
                <span style={{ color: theme.textSecondary }}>Discount</span>
                <input
                  type="number"
                  value={quote.discount || ''}
                  onChange={(e) => updateQuoteField('discount', e.target.value || 0)}
                  style={{
                    width: '100px',
                    padding: '6px 10px',
                    textAlign: 'right',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: theme.text,
                    backgroundColor: theme.bgCard
                  }}
                  step="0.01"
                />
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: theme.textSecondary }}>Utility Incentive</span>
                  {quote.audit_id && (
                    <button
                      onClick={calculateIncentive}
                      disabled={calculatingIncentive || saving}
                      title="Auto-calculate from audit prescriptive measures"
                      style={{
                        padding: '3px 6px',
                        backgroundColor: '#4a7c59',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#fff',
                        fontSize: '11px',
                        cursor: (calculatingIncentive || saving) ? 'not-allowed' : 'pointer',
                        opacity: (calculatingIncentive || saving) ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                    >
                      <Calculator size={12} />
                      {calculatingIncentive ? '...' : 'Calc'}
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  value={quote.utility_incentive || ''}
                  onChange={(e) => updateQuoteField('utility_incentive', e.target.value || 0)}
                  style={{
                    width: '100px',
                    padding: '6px 10px',
                    textAlign: 'right',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: theme.text,
                    backgroundColor: theme.bgCard
                  }}
                  step="0.01"
                />
              </div>

              <div style={{
                borderTop: `1px solid ${theme.border}`,
                paddingTop: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: '600', color: theme.text }}>Total</span>
                <span style={{ fontSize: '20px', fontWeight: '600', color: theme.text }}>
                  {formatCurrency(total)}
                </span>
              </div>

              {incentive > 0 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '14px',
                  color: '#4a7c59'
                }}>
                  <span>Out of Pocket</span>
                  <span style={{ fontWeight: '500' }}>{formatCurrency(outOfPocket)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{
              fontSize: '15px',
              fontWeight: '600',
              color: theme.text,
              marginBottom: '16px'
            }}>
              Actions
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {quote.status === 'Draft' && (
                <button
                  onClick={sendQuote}
                  disabled={saving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
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
                  <Send size={18} />
                  Send Quote
                </button>
              )}

              {quote.status === 'Sent' && (
                <>
                  <button
                    onClick={approveQuote}
                    disabled={saving}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px 16px',
                      backgroundColor: '#4a7c59',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1
                    }}
                  >
                    <CheckCircle size={18} />
                    Mark Approved
                  </button>
                  <button
                    onClick={rejectQuote}
                    disabled={saving}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px 16px',
                      backgroundColor: '#8b5a5a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1
                    }}
                  >
                    <XCircle size={18} />
                    Mark Rejected
                  </button>
                </>
              )}

              {quote.status === 'Approved' && (
                <button
                  onClick={convertToJob}
                  disabled={saving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px 16px',
                    backgroundColor: '#7c6f4a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1
                  }}
                >
                  <Briefcase size={18} />
                  Convert to Job
                </button>
              )}

              {rebateForms.length > 0 && (
                <>
                  <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '10px', marginTop: '4px' }}>
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '8px' }}>Rebate Forms</div>
                  </div>
                  {rebateForms.map(form => (
                    <button
                      key={form.id}
                      onClick={() => handleFillRebateForm(form)}
                      disabled={fillingForm || saving}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '10px 16px',
                        backgroundColor: '#4a6b7c',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: (fillingForm || saving) ? 'not-allowed' : 'pointer',
                        opacity: (fillingForm || saving) ? 0.6 : 1
                      }}
                    >
                      <FileText size={16} />
                      {fillingForm ? 'Filling...' : `Fill ${form.form_name}`}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Contract */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{
              fontSize: '15px',
              fontWeight: '600',
              color: theme.text,
              marginBottom: '12px'
            }}>
              Contract
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={quote.contract_required || false}
                  onChange={(e) => updateQuoteField('contract_required', e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: theme.accent }}
                />
                <span style={{ fontSize: '14px', color: theme.text }}>Contract Required</span>
              </label>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={quote.contract_signed || false}
                  onChange={(e) => updateQuoteField('contract_signed', e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: theme.accent }}
                />
                <span style={{ fontSize: '14px', color: theme.text }}>Contract Signed</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Product Picker Modal */}
      <ProductPickerModal
        isOpen={showProductPicker}
        onClose={() => setShowProductPicker(false)}
        onSelect={handleProductSelect}
      />
    </div>
  )
}
