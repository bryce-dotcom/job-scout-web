import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { Plus, Pencil, Trash2, X, Package, Search, ToggleLeft, ToggleRight } from 'lucide-react'

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

const emptyProduct = {
  name: '',
  description: '',
  type: 'Service',
  business_unit: '',
  sku: '',
  category: '',
  subcategory: '',
  manufacturer: '',
  model_number: '',
  unit_price: '',
  cost: '',
  markup_percent: '',
  taxable: true,
  active: true,
  allotted_time_hours: '',
  image_url: '',
  inventory_tracked: false,
  reorder_level: ''
}

export default function Products() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const products = useStore((state) => state.products)
  const businessUnits = useStore((state) => state.businessUnits)
  const fetchProducts = useStore((state) => state.fetchProducts)

  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [formData, setFormData] = useState(emptyProduct)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchProducts()
  }, [companyId, navigate, fetchProducts])

  const filteredProducts = products.filter(product => {
    const matchesSearch = searchTerm === '' ||
      product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesActive = showInactive || product.active
    const matchesType = typeFilter === 'all' || product.type === typeFilter

    return matchesSearch && matchesActive && matchesType
  })

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
      type: product.type || 'Service',
      business_unit: product.business_unit || '',
      sku: product.sku || '',
      category: product.category || '',
      subcategory: product.subcategory || '',
      manufacturer: product.manufacturer || '',
      model_number: product.model_number || '',
      unit_price: product.unit_price || '',
      cost: product.cost || '',
      markup_percent: product.markup_percent || '',
      taxable: product.taxable ?? true,
      active: product.active ?? true,
      allotted_time_hours: product.allotted_time_hours || '',
      image_url: product.image_url || '',
      inventory_tracked: product.inventory_tracked ?? false,
      reorder_level: product.reorder_level || ''
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      company_id: companyId,
      name: formData.name,
      description: formData.description || null,
      type: formData.type,
      business_unit: formData.business_unit || null,
      sku: formData.sku || null,
      category: formData.category || null,
      subcategory: formData.subcategory || null,
      manufacturer: formData.manufacturer || null,
      model_number: formData.model_number || null,
      unit_price: formData.unit_price || null,
      cost: formData.cost || null,
      markup_percent: formData.markup_percent || null,
      taxable: formData.taxable,
      active: formData.active,
      allotted_time_hours: formData.allotted_time_hours || null,
      image_url: formData.image_url || null,
      inventory_tracked: formData.inventory_tracked,
      reorder_level: formData.reorder_level || null,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingProduct) {
      result = await supabase
        .from('products_services')
        .update(payload)
        .eq('id', editingProduct.id)
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

    await supabase.from('products_services').delete().eq('id', product.id)
    await fetchProducts()
  }

  const toggleActive = async (product) => {
    await supabase
      .from('products_services')
      .update({ active: !product.active, updated_at: new Date().toISOString() })
      .eq('id', product.id)
    await fetchProducts()
  }

  const formatCurrency = (amount) => {
    if (!amount) return '-'
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

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: '700',
          color: theme.text
        }}>
          Products & Services
        </h1>
        <button
          onClick={openAddModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            backgroundColor: theme.accent,
            color: '#ffffff',
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

      {/* Search and Filter */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
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

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}
        >
          <option value="all">All Types</option>
          <option value="Service">Service</option>
          <option value="Product">Product</option>
          <option value="Labor">Labor</option>
          <option value="Material">Material</option>
        </select>

        <label style={{
          display: 'flex',
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
          Show inactive
        </label>
      </div>

      {filteredProducts.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <Package size={48} style={{ color: theme.textMuted, marginBottom: '16px', opacity: 0.5 }} />
          <p style={{ color: theme.textSecondary, fontSize: '15px' }}>
            No products yet. Add your first product or service.
          </p>
        </div>
      ) : (
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          overflow: 'hidden'
        }}>
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px 2fr 100px 1fr 1fr 1fr 100px 80px',
            gap: '16px',
            padding: '14px 20px',
            backgroundColor: theme.accentBg,
            borderBottom: `1px solid ${theme.border}`,
            fontSize: '12px',
            fontWeight: '600',
            color: theme.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            <div>SKU</div>
            <div>Name</div>
            <div>Type</div>
            <div>Category</div>
            <div style={{ textAlign: 'right' }}>Price</div>
            <div style={{ textAlign: 'right' }}>Cost</div>
            <div style={{ textAlign: 'center' }}>Status</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {/* Table Body */}
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 2fr 100px 1fr 1fr 1fr 100px 80px',
                gap: '16px',
                padding: '16px 20px',
                borderBottom: `1px solid ${theme.border}`,
                alignItems: 'center',
                opacity: product.active ? 1 : 0.5,
                transition: 'background-color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.bgCardHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <div style={{ fontSize: '13px', color: theme.textMuted, fontFamily: 'monospace' }}>
                {product.sku || '-'}
              </div>

              <div>
                <p style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>
                  {product.name}
                </p>
                {product.description && (
                  <p style={{
                    fontSize: '13px',
                    color: theme.textMuted,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '300px'
                  }}>
                    {product.description}
                  </p>
                )}
              </div>

              <div style={{ fontSize: '14px', color: theme.textSecondary }}>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  backgroundColor: theme.accentBg,
                  borderRadius: '6px',
                  fontSize: '12px'
                }}>
                  {product.type}
                </span>
              </div>

              <div style={{ fontSize: '13px', color: theme.textSecondary }}>
                {product.category || '-'}
              </div>

              <div style={{
                textAlign: 'right',
                fontSize: '14px',
                fontWeight: '500',
                color: theme.text
              }}>
                {formatCurrency(product.unit_price)}
              </div>

              <div style={{
                textAlign: 'right',
                fontSize: '14px',
                color: theme.textSecondary
              }}>
                {formatCurrency(product.cost)}
              </div>

              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={() => toggleActive(product)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    backgroundColor: product.active ? 'rgba(74,124,89,0.12)' : 'rgba(0,0,0,0.06)',
                    color: product.active ? '#4a7c59' : theme.textMuted
                  }}
                >
                  {product.active ? (
                    <>
                      <ToggleRight size={14} />
                      Active
                    </>
                  ) : (
                    <>
                      <ToggleLeft size={14} />
                      Inactive
                    </>
                  )}
                </button>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '4px'
              }}>
                <button
                  onClick={() => openEditModal(product)}
                  style={{
                    padding: '8px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: theme.textMuted,
                    transition: 'background-color 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme.accentBg
                    e.currentTarget.style.color = theme.accent
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = theme.textMuted
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(product)}
                  style={{
                    padding: '8px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: theme.textMuted,
                    transition: 'background-color 0.15s'
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
        </div>
      )}

      {/* Modal */}
      {showModal && (
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
            maxWidth: '500px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`,
              position: 'sticky',
              top: 0,
              backgroundColor: theme.bgCard,
              borderRadius: '16px 16px 0 0'
            }}>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: theme.text
              }}>
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h2>
              <button
                onClick={closeModal}
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

            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Type</label>
                    <select
                      name="type"
                      value={formData.type}
                      onChange={handleChange}
                      style={inputStyle}
                    >
                      <option value="Service">Service</option>
                      <option value="Product">Product</option>
                      <option value="Labor">Labor</option>
                      <option value="Material">Material</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>SKU / Item ID</label>
                    <input
                      type="text"
                      name="sku"
                      value={formData.sku}
                      onChange={handleChange}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Category</label>
                    <input
                      type="text"
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Subcategory</label>
                    <input
                      type="text"
                      name="subcategory"
                      value={formData.subcategory}
                      onChange={handleChange}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Manufacturer</label>
                    <input
                      type="text"
                      name="manufacturer"
                      value={formData.manufacturer}
                      onChange={handleChange}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Model Number</label>
                    <input
                      type="text"
                      name="model_number"
                      value={formData.model_number}
                      onChange={handleChange}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Business Unit</label>
                  <select
                    name="business_unit"
                    value={formData.business_unit}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="">-- Select --</option>
                    {businessUnits.map(bu => <option key={bu} value={bu}>{bu}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
                  <div>
                    <label style={labelStyle}>Reorder Level</label>
                    <input
                      type="number"
                      name="reorder_level"
                      value={formData.reorder_level}
                      onChange={handleChange}
                      style={inputStyle}
                      disabled={!formData.inventory_tracked}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Image URL</label>
                  <input
                    type="url"
                    name="image_url"
                    value={formData.image_url}
                    onChange={handleChange}
                    placeholder="https://..."
                    style={inputStyle}
                  />
                  {formData.image_url && (
                    <div style={{ marginTop: '8px' }}>
                      <img
                        src={formData.image_url}
                        alt="Product preview"
                        style={{
                          maxWidth: '100px',
                          maxHeight: '100px',
                          borderRadius: '8px',
                          border: `1px solid ${theme.border}`
                        }}
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
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
                      style={{ width: '16px', height: '16px', accentColor: theme.accent }}
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
                      style={{ width: '16px', height: '16px', accentColor: theme.accent }}
                    />
                    <span style={{ fontSize: '14px', color: theme.text }}>Active</span>
                  </label>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      name="inventory_tracked"
                      checked={formData.inventory_tracked}
                      onChange={handleChange}
                      style={{ width: '16px', height: '16px', accentColor: theme.accent }}
                    />
                    <span style={{ fontSize: '14px', color: theme.text }}>Track Inventory</span>
                  </label>
                </div>
              </div>

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
                  type="submit"
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: theme.accent,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.6 : 1
                  }}
                >
                  {loading ? 'Saving...' : (editingProduct ? 'Update' : 'Add Product')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
