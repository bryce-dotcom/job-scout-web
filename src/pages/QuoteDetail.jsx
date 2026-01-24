import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { ArrowLeft, Plus, Trash2, Send, CheckCircle, XCircle, Briefcase, X, DollarSign } from 'lucide-react'

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
  const fetchQuotes = useStore((state) => state.fetchQuotes)

  const [quote, setQuote] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddLine, setShowAddLine] = useState(false)
  const [newLine, setNewLine] = useState({ item_id: '', quantity: 1 })

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
    }

    setLoading(false)
  }

  const addLineItem = async () => {
    if (!newLine.item_id) return

    const product = products.find(p => p.id === parseInt(newLine.item_id))
    if (!product) return

    setSaving(true)

    const lineTotal = (product.unit_price || 0) * newLine.quantity

    await supabase.from('quote_lines').insert([{
      company_id: companyId,
      quote_id: parseInt(id),
      item_id: product.id,
      quantity: newLine.quantity,
      unit_price: product.unit_price,
      line_total: lineTotal
    }])

    await updateQuoteTotal()
    await fetchQuoteData()

    setNewLine({ item_id: '', quantity: 1 })
    setShowAddLine(false)
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
                onClick={() => setShowAddLine(true)}
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
                      {formatCurrency(line.unit_price)}
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
                <span style={{ color: theme.textSecondary }}>Utility Incentive</span>
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

      {/* Add Line Item Modal */}
      {showAddLine && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 50
        }}>
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            width: '100%',
            maxWidth: '400px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: theme.text
              }}>
                Add Line Item
              </h2>
              <button
                onClick={() => setShowAddLine(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '8px',
                  cursor: 'pointer',
                  color: theme.textMuted,
                  borderRadius: '8px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Product/Service</label>
                  <select
                    value={newLine.item_id}
                    onChange={(e) => setNewLine(prev => ({ ...prev, item_id: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">-- Select --</option>
                    {products.filter(p => p.active).map(product => (
                      <option key={product.id} value={product.id}>
                        {product.name} - {formatCurrency(product.unit_price)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Quantity</label>
                  <input
                    type="number"
                    value={newLine.quantity}
                    onChange={(e) => setNewLine(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                    min="1"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: '24px'
              }}>
                <button
                  onClick={() => setShowAddLine(false)}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
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
                  onClick={addLineItem}
                  disabled={saving || !newLine.item_id}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: theme.accent,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: (saving || !newLine.item_id) ? 'not-allowed' : 'pointer',
                    opacity: (saving || !newLine.item_id) ? 0.6 : 1
                  }}
                >
                  {saving ? 'Adding...' : 'Add Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
