import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { Plus, Pencil, Trash2, X, Package, Search, DollarSign, Clock, Image, Upload } from 'lucide-react'

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

const emptyProduct = {
  name: '',
  description: '',
  type: '',
  unit_price: '',
  cost: '',
  markup_percent: '',
  taxable: true,
  active: true,
  allotted_time_hours: '',
  image_url: ''
}

export default function Products() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const products = useStore((state) => state.products)
  const serviceTypes = useStore((state) => state.serviceTypes)
  const fetchProducts = useStore((state) => state.fetchProducts)

  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [formData, setFormData] = useState(emptyProduct)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [activeTypeTab, setActiveTypeTab] = useState('all')
  const [isMobile, setIsMobile] = useState(false)
  const [uploading, setUploading] = useState(false)

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchProducts()
  }, [companyId, navigate, fetchProducts])

  // Filter products
  const filteredProducts = products.filter(product => {
    const matchesSearch = searchTerm === '' ||
      product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesActive = showInactive || product.active
    const matchesType = activeTypeTab === 'all' || product.type === activeTypeTab
    return matchesSearch && matchesActive && matchesType
  })

  // Group products by type
  const groupedProducts = {}
  if (activeTypeTab === 'all') {
    serviceTypes.forEach(type => {
      const typeProducts = filteredProducts.filter(p => p.type === type)
      if (typeProducts.length > 0) {
        groupedProducts[type] = typeProducts
      }
    })
    // Add uncategorized products
    const uncategorized = filteredProducts.filter(p => !p.type || !serviceTypes.includes(p.type))
    if (uncategorized.length > 0) {
      groupedProducts['Other'] = uncategorized
    }
  } else {
    groupedProducts[activeTypeTab] = filteredProducts
  }

  const openAddModal = () => {
    setEditingProduct(null)
    setFormData(emptyProduct)
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name || '',
      description: product.description || '',
      type: product.type || '',
      unit_price: product.unit_price || '',
      cost: product.cost || '',
      markup_percent: product.markup_percent || '',
      taxable: product.taxable ?? true,
      active: product.active ?? true,
      allotted_time_hours: product.allotted_time_hours || '',
      image_url: product.image_url || ''
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingProduct(null)
    setFormData(emptyProduct)
    setError(null)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${companyId}/${Date.now()}.${fileExt}`

    const { data, error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, file)

    if (uploadError) {
      console.error('Upload error:', uploadError)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName)

    setFormData(prev => ({ ...prev, image_url: publicUrl }))
    setUploading(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      company_id: companyId,
      name: formData.name,
      description: formData.description || null,
      type: formData.type || null,
      unit_price: formData.unit_price || null,
      cost: formData.cost || null,
      markup_percent: formData.markup_percent || null,
      taxable: formData.taxable,
      active: formData.active,
      allotted_time_hours: formData.allotted_time_hours || null,
      image_url: formData.image_url || null,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingProduct) {
      result = await supabase
        .from('products_services')
        .update(payload)
        .eq('id', editingProduct.id)
        .eq('company_id', companyId)
    } else {
      result = await supabase
        .from('products_services')
        .insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchProducts()
    closeModal()
    setLoading(false)
  }

  const handleDelete = async (product) => {
    if (!confirm(`Delete ${product.name}?`)) return
    await supabase.from('products_services').delete().eq('id', product.id).eq('company_id', companyId)
    await fetchProducts()
  }

  const formatCurrency = (amount) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const inputStyle = {
    width: '100%',
    padding: isMobile ? '12px' : '10px 12px',
    minHeight: isMobile ? '44px' : 'auto',
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

  return (
    <div style={{ padding: isMobile ? '16px' : '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
          Products & Services
        </h1>
        <button
          onClick={openAddModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: isMobile ? '12px 16px' : '10px 16px',
            minHeight: isMobile ? '44px' : 'auto',
            backgroundColor: theme.accent,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          <Plus size={18} />
          Add Product
        </button>
      </div>

      {/* Search Bar */}
      <div style={{
        position: 'relative',
        marginBottom: '16px'
      }}>
        <Search size={18} style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: theme.textMuted
        }} />
        <input
          type="text"
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            ...inputStyle,
            paddingLeft: '40px'
          }}
        />
      </div>

      {/* Service Type Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: '8px'
      }}>
        <button
          onClick={() => setActiveTypeTab('all')}
          style={{
            padding: isMobile ? '10px 16px' : '8px 16px',
            minHeight: isMobile ? '44px' : 'auto',
            backgroundColor: activeTypeTab === 'all' ? theme.accent : 'transparent',
            color: activeTypeTab === 'all' ? '#fff' : theme.textSecondary,
            border: activeTypeTab === 'all' ? 'none' : `1px solid ${theme.border}`,
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          All
        </button>
        {serviceTypes.map(type => {
          const count = products.filter(p => p.type === type && (showInactive || p.active)).length
          return (
            <button
              key={type}
              onClick={() => setActiveTypeTab(type)}
              style={{
                padding: isMobile ? '10px 16px' : '8px 16px',
                minHeight: isMobile ? '44px' : 'auto',
                backgroundColor: activeTypeTab === type ? theme.accent : 'transparent',
                color: activeTypeTab === type ? '#fff' : theme.textSecondary,
                border: activeTypeTab === type ? 'none' : `1px solid ${theme.border}`,
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {type}
              {count > 0 && (
                <span style={{
                  backgroundColor: activeTypeTab === type ? 'rgba(255,255,255,0.2)' : theme.accentBg,
                  padding: '2px 6px',
                  borderRadius: '10px',
                  fontSize: '11px'
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Show Inactive Toggle */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px',
          color: theme.textSecondary,
          cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: theme.accent }}
          />
          Show inactive products
        </label>
      </div>

      {/* Products Grouped by Type */}
      {Object.keys(groupedProducts).length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <Package size={48} style={{ color: theme.textMuted, marginBottom: '16px', opacity: 0.5 }} />
          <p style={{ color: theme.textSecondary, fontSize: '15px', margin: 0 }}>
            {searchTerm ? 'No products match your search.' : 'No products yet. Add your first product or service.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {Object.entries(groupedProducts).map(([type, typeProducts]) => (
            <div key={type}>
              {/* Group Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px',
                paddingBottom: '12px',
                borderBottom: `2px solid ${theme.accent}`
              }}>
                <h2 style={{
                  fontSize: isMobile ? '16px' : '18px',
                  fontWeight: '600',
                  color: theme.text,
                  margin: 0
                }}>
                  {type}
                </h2>
                <span style={{
                  backgroundColor: theme.accentBg,
                  color: theme.accent,
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: '500'
                }}>
                  {typeProducts.length} {typeProducts.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              {/* Products Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px'
              }}>
                {typeProducts.map(product => (
                  <div
                    key={product.id}
                    style={{
                      backgroundColor: theme.bgCard,
                      borderRadius: '12px',
                      border: `1px solid ${theme.border}`,
                      overflow: 'hidden',
                      opacity: product.active ? 1 : 0.6,
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
                      e.currentTarget.style.borderColor = theme.textMuted
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = 'none'
                      e.currentTarget.style.borderColor = theme.border
                    }}
                  >
                    {/* Product Image */}
                    <div style={{
                      height: '140px',
                      backgroundColor: theme.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderBottom: `1px solid ${theme.border}`
                    }}>
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none'
                            e.target.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7d8a7f" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>'
                          }}
                        />
                      ) : (
                        <Package size={48} style={{ color: theme.textMuted, opacity: 0.4 }} />
                      )}
                    </div>

                    {/* Product Info */}
                    <div style={{ padding: '16px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '8px',
                        marginBottom: '8px'
                      }}>
                        <h3 style={{
                          fontSize: '15px',
                          fontWeight: '600',
                          color: theme.text,
                          margin: 0,
                          lineHeight: 1.3
                        }}>
                          {product.name}
                        </h3>
                        <span style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          backgroundColor: product.active ? 'rgba(74,124,89,0.12)' : 'rgba(0,0,0,0.06)',
                          color: product.active ? '#4a7c59' : theme.textMuted,
                          fontWeight: '500',
                          whiteSpace: 'nowrap'
                        }}>
                          {product.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      {product.description && (
                        <p style={{
                          fontSize: '13px',
                          color: theme.textMuted,
                          margin: '0 0 12px 0',
                          lineHeight: 1.4,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {product.description}
                        </p>
                      )}

                      {/* Price & Cost */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        marginBottom: '12px'
                      }}>
                        <div>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Price</div>
                          <div style={{ fontSize: '16px', fontWeight: '600', color: theme.accent }}>
                            {formatCurrency(product.unit_price)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Cost</div>
                          <div style={{ fontSize: '14px', color: theme.textSecondary }}>
                            {formatCurrency(product.cost)}
                          </div>
                        </div>
                        {product.allotted_time_hours && (
                          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', color: theme.textMuted, fontSize: '12px' }}>
                            <Clock size={12} />
                            {product.allotted_time_hours}h
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{
                        display: 'flex',
                        gap: '8px',
                        paddingTop: '12px',
                        borderTop: `1px solid ${theme.border}`
                      }}>
                        <button
                          onClick={() => openEditModal(product)}
                          style={{
                            flex: 1,
                            padding: isMobile ? '10px' : '8px',
                            minHeight: isMobile ? '44px' : 'auto',
                            backgroundColor: theme.accentBg,
                            color: theme.accent,
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            fontSize: '13px',
                            fontWeight: '500'
                          }}
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(product)}
                          style={{
                            padding: isMobile ? '10px 14px' : '8px 12px',
                            minHeight: isMobile ? '44px' : 'auto',
                            backgroundColor: '#fef2f2',
                            color: '#dc2626',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <>
          <div
            onClick={closeModal}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 50
            }}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            border: `1px solid ${theme.border}`,
            width: '100%',
            maxWidth: isMobile ? '95%' : '500px',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 51
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: isMobile ? '16px' : '20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: '600', color: theme.text, margin: 0 }}>
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h2>
              <button
                onClick={closeModal}
                style={{
                  padding: isMobile ? '12px' : '8px',
                  minWidth: isMobile ? '44px' : 'auto',
                  minHeight: isMobile ? '44px' : 'auto',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: theme.textMuted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px' : '20px' }}>
              {error && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  color: '#dc2626',
                  fontSize: '14px'
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Name */}
                <div>
                  <label style={labelStyle}>Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    style={inputStyle}
                  />
                </div>

                {/* Description */}
                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                {/* Type */}
                <div>
                  <label style={labelStyle}>Service Type</label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="">-- Select --</option>
                    {serviceTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Price, Cost, Markup */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Unit Price</label>
                    <input
                      type="number"
                      name="unit_price"
                      value={formData.unit_price}
                      onChange={handleChange}
                      step="0.01"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Cost</label>
                    <input
                      type="number"
                      name="cost"
                      value={formData.cost}
                      onChange={handleChange}
                      step="0.01"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Markup %</label>
                    <input
                      type="number"
                      name="markup_percent"
                      value={formData.markup_percent}
                      onChange={handleChange}
                      step="0.01"
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Allotted Time */}
                <div>
                  <label style={labelStyle}>Allotted Time (hours)</label>
                  <input
                    type="number"
                    name="allotted_time_hours"
                    value={formData.allotted_time_hours}
                    onChange={handleChange}
                    step="0.25"
                    style={inputStyle}
                  />
                </div>

                {/* Image Upload */}
                <div>
                  <label style={labelStyle}>Product Image</label>
                  <div style={{
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start'
                  }}>
                    {formData.image_url ? (
                      <div style={{ position: 'relative' }}>
                        <img
                          src={formData.image_url}
                          alt="Product"
                          style={{
                            width: '80px',
                            height: '80px',
                            objectFit: 'cover',
                            borderRadius: '8px',
                            border: `1px solid ${theme.border}`
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                          style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            backgroundColor: '#dc2626',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px'
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <label style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '8px',
                        border: `2px dashed ${theme.border}`,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: theme.textMuted,
                        backgroundColor: theme.bg
                      }}>
                        <Upload size={20} />
                        <span style={{ fontSize: '10px', marginTop: '4px' }}>
                          {uploading ? 'Uploading...' : 'Upload'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          style={{ display: 'none' }}
                          disabled={uploading}
                        />
                      </label>
                    )}
                    <div style={{ flex: 1 }}>
                      <input
                        type="url"
                        name="image_url"
                        value={formData.image_url}
                        onChange={handleChange}
                        placeholder="Or paste image URL..."
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>

                {/* Toggles */}
                <div style={{
                  display: 'flex',
                  gap: '24px',
                  flexWrap: 'wrap',
                  padding: '12px 0'
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      name="taxable"
                      checked={formData.taxable}
                      onChange={handleChange}
                      style={{ width: '18px', height: '18px', accentColor: theme.accent }}
                    />
                    <span style={{ fontSize: '14px', color: theme.text }}>Taxable</span>
                  </label>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      name="active"
                      checked={formData.active}
                      onChange={handleChange}
                      style={{ width: '18px', height: '18px', accentColor: theme.accent }}
                    />
                    <span style={{ fontSize: '14px', color: theme.text }}>Active</span>
                  </label>
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: '24px'
              }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    flex: 1,
                    padding: isMobile ? '14px' : '12px',
                    minHeight: isMobile ? '44px' : 'auto',
                    backgroundColor: 'transparent',
                    color: theme.textSecondary,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: isMobile ? '14px' : '12px',
                    minHeight: isMobile ? '44px' : 'auto',
                    backgroundColor: theme.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    opacity: loading ? 0.7 : 1
                  }}
                >
                  {loading ? 'Saving...' : (editingProduct ? 'Update' : 'Add Product')}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
