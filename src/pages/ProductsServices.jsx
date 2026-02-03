// ALWAYS READ JOBSCOUT_PROJECT_RULES.md BEFORE MAKING CHANGES
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  Plus, ArrowLeft, Settings, X, Save, Trash2, Package, Boxes,
  Upload, Clock, DollarSign, Pencil, ChevronRight
} from 'lucide-react'
import Tooltip from '../components/Tooltip'

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

export default function ProductsServices() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const serviceTypes = useStore((state) => state.serviceTypes)
  const products = useStore((state) => state.products)
  const fetchProducts = useStore((state) => state.fetchProducts)

  const [activeServiceType, setActiveServiceType] = useState('all')
  const [productGroups, setProductGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [groupForm, setGroupForm] = useState({
    name: '', service_type: '', description: '', image_url: '', icon: 'Package', sort_order: 0, active: true
  })

  // Product modal state
  const [showProductModal, setShowProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [productForm, setProductForm] = useState({
    name: '', description: '', unit_price: '', cost: '', markup_percent: '',
    taxable: true, active: true, image_url: '', allotted_time_hours: '', group_id: null
  })

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Guard clause
  if (!companyId) return null

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Fetch product groups
  useEffect(() => {
    if (companyId) {
      fetchProductGroups()
      fetchProducts()
    }
  }, [companyId])

  const fetchProductGroups = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('product_groups')
      .select('*')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true })

    if (!error) setProductGroups(data || [])
    setLoading(false)
  }

  // Filter groups by service type
  const filteredGroups = productGroups.filter(g =>
    activeServiceType === 'all' || g.service_type === activeServiceType
  )

  // Get products for selected group
  const groupProducts = selectedGroup
    ? products.filter(p => p.group_id === selectedGroup.id)
    : []

  // Count products per group
  const getProductCount = (groupId) => products.filter(p => p.group_id === groupId).length

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  // ============ GROUP CRUD ============
  const openGroupForm = (group = null) => {
    if (group) {
      setEditingGroup(group)
      setGroupForm({
        name: group.name || '',
        service_type: group.service_type || '',
        description: group.description || '',
        image_url: group.image_url || '',
        icon: group.icon || 'Package',
        sort_order: group.sort_order || 0,
        active: group.active ?? true
      })
    } else {
      setEditingGroup(null)
      setGroupForm({
        name: '', service_type: serviceTypes[0] || '', description: '', image_url: '', icon: 'Package', sort_order: 0, active: true
      })
    }
  }

  const handleGroupChange = (e) => {
    const { name, value, type, checked } = e.target
    setGroupForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSaveGroup = async () => {
    if (!groupForm.name || !groupForm.service_type) {
      alert('Name and Service Type are required')
      return
    }

    setSaving(true)
    const payload = {
      company_id: companyId,
      ...groupForm,
      sort_order: parseInt(groupForm.sort_order) || 0,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingGroup) {
      result = await supabase
        .from('product_groups')
        .update(payload)
        .eq('id', editingGroup.id)
        .eq('company_id', companyId)
    } else {
      result = await supabase
        .from('product_groups')
        .insert([payload])
    }

    if (result.error) {
      alert('Error saving group: ' + result.error.message)
    } else {
      await fetchProductGroups()
      setEditingGroup(null)
      setGroupForm({ name: '', service_type: '', description: '', image_url: '', icon: 'Package', sort_order: 0, active: true })
    }
    setSaving(false)
  }

  const handleDeleteGroup = async (group) => {
    if (!confirm(`Delete group "${group.name}"? Products in this group will be ungrouped.`)) return

    await supabase.from('product_groups').delete().eq('id', group.id).eq('company_id', companyId)
    await fetchProductGroups()
    if (selectedGroup?.id === group.id) setSelectedGroup(null)
  }

  // ============ PRODUCT CRUD ============
  const openProductForm = (product = null) => {
    if (product) {
      setEditingProduct(product)
      setProductForm({
        name: product.name || '',
        description: product.description || '',
        unit_price: product.unit_price || '',
        cost: product.cost || '',
        markup_percent: product.markup_percent || '',
        taxable: product.taxable ?? true,
        active: product.active ?? true,
        image_url: product.image_url || '',
        allotted_time_hours: product.allotted_time_hours || '',
        group_id: product.group_id
      })
    } else {
      setEditingProduct(null)
      setProductForm({
        name: '', description: '', unit_price: '', cost: '', markup_percent: '',
        taxable: true, active: true, image_url: '', allotted_time_hours: '',
        group_id: selectedGroup?.id || null
      })
    }
    setShowProductModal(true)
  }

  const handleProductChange = (e) => {
    const { name, value, type, checked } = e.target
    setProductForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSaveProduct = async () => {
    if (!productForm.name) {
      alert('Product name is required')
      return
    }

    setSaving(true)
    const payload = {
      company_id: companyId,
      name: productForm.name,
      description: productForm.description || null,
      type: selectedGroup?.service_type || null,
      unit_price: productForm.unit_price || null,
      cost: productForm.cost || null,
      markup_percent: productForm.markup_percent || null,
      taxable: productForm.taxable,
      active: productForm.active,
      image_url: productForm.image_url || null,
      allotted_time_hours: productForm.allotted_time_hours || null,
      group_id: productForm.group_id,
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
      alert('Error saving product: ' + result.error.message)
    } else {
      await fetchProducts()
      setShowProductModal(false)
      setEditingProduct(null)
    }
    setSaving(false)
  }

  const handleDeleteProduct = async (product) => {
    if (!confirm(`Delete "${product.name}"?`)) return
    await supabase.from('products_services').delete().eq('id', product.id).eq('company_id', companyId)
    await fetchProducts()
  }

  // Image upload
  const handleImageUpload = async (e, isGroup = false) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${companyId}/${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
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

    if (isGroup) {
      setGroupForm(prev => ({ ...prev, image_url: publicUrl }))
    } else {
      setProductForm(prev => ({ ...prev, image_url: publicUrl }))
    }
    setUploading(false)
  }

  // Styles
  const inputStyle = {
    width: '100%',
    padding: isMobile ? '12px' : '10px 12px',
    minHeight: isMobile ? '44px' : 'auto',
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: theme.text,
    backgroundColor: theme.bgCard
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: '6px'
  }

  const buttonStyle = {
    padding: isMobile ? '12px 16px' : '10px 16px',
    minHeight: isMobile ? '44px' : 'auto',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px'
  }

  // ============ RENDER ============
  return (
    <div style={{ padding: isMobile ? '16px' : '24px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {selectedGroup && (
            <button
              onClick={() => setSelectedGroup(null)}
              style={{
                ...buttonStyle,
                backgroundColor: 'transparent',
                border: `1px solid ${theme.border}`,
                color: theme.textSecondary,
                padding: isMobile ? '12px' : '8px'
              }}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
              {selectedGroup ? selectedGroup.name : 'Products & Services'}
            </h1>
            {selectedGroup && (
              <p style={{ fontSize: '13px', color: theme.textMuted, margin: '4px 0 0' }}>
                {selectedGroup.service_type} • {groupProducts.length} products
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {selectedGroup ? (
            <button
              onClick={() => openProductForm()}
              style={{ ...buttonStyle, backgroundColor: theme.accent, color: '#fff' }}
            >
              <Plus size={18} />
              Add Product
            </button>
          ) : (
            <Tooltip text="Manage product groups">
              <button
                onClick={() => setShowSettings(!showSettings)}
                style={{
                  ...buttonStyle,
                  backgroundColor: showSettings ? theme.accent : theme.accentBg,
                  color: showSettings ? '#fff' : theme.accent
                }}
              >
                <Settings size={18} />
                {!isMobile && 'Groups'}
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Service Type Tabs (only when viewing groups) */}
      {!selectedGroup && (
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: '8px'
        }}>
          <button
            onClick={() => setActiveServiceType('all')}
            style={{
              ...buttonStyle,
              backgroundColor: activeServiceType === 'all' ? theme.accent : 'transparent',
              color: activeServiceType === 'all' ? '#fff' : theme.textSecondary,
              border: activeServiceType === 'all' ? 'none' : `1px solid ${theme.border}`,
              whiteSpace: 'nowrap'
            }}
          >
            All
          </button>
          {serviceTypes.map(type => (
            <button
              key={type}
              onClick={() => setActiveServiceType(type)}
              style={{
                ...buttonStyle,
                backgroundColor: activeServiceType === type ? theme.accent : 'transparent',
                color: activeServiceType === type ? '#fff' : theme.textSecondary,
                border: activeServiceType === type ? 'none' : `1px solid ${theme.border}`,
                whiteSpace: 'nowrap'
              }}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {/* Main Content Area */}
      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Groups/Products Grid */}
        <div style={{ flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px', color: theme.textMuted }}>
              Loading...
            </div>
          ) : selectedGroup ? (
            // ============ PRODUCTS VIEW ============
            groupProducts.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '48px',
                backgroundColor: theme.bgCard,
                borderRadius: '12px',
                border: `1px solid ${theme.border}`
              }}>
                <Package size={48} style={{ color: theme.textMuted, opacity: 0.5, marginBottom: '16px' }} />
                <p style={{ color: theme.textSecondary, margin: 0 }}>
                  No products in this group. Add your first product.
                </p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: '16px'
              }}>
                {groupProducts.map(product => (
                  <div
                    key={product.id}
                    style={{
                      backgroundColor: theme.bgCard,
                      borderRadius: '12px',
                      border: `1px solid ${theme.border}`,
                      overflow: 'hidden',
                      opacity: product.active ? 1 : 0.6
                    }}
                  >
                    {/* Product Image */}
                    <div style={{
                      height: '120px',
                      backgroundColor: theme.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderBottom: `1px solid ${theme.border}`
                    }}>
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <Package size={40} style={{ color: theme.textMuted, opacity: 0.4 }} />
                      )}
                    </div>

                    {/* Product Info */}
                    <div style={{ padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: 0 }}>
                          {product.name}
                        </h3>
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '10px',
                          backgroundColor: product.active ? 'rgba(74,124,89,0.12)' : 'rgba(0,0,0,0.06)',
                          color: product.active ? '#4a7c59' : theme.textMuted
                        }}>
                          {product.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: theme.accent }}>
                          {formatCurrency(product.unit_price)}
                        </div>
                        {product.allotted_time_hours && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: theme.textMuted }}>
                            <Clock size={12} />
                            {product.allotted_time_hours}h
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => openProductForm(product)}
                          style={{
                            flex: 1,
                            ...buttonStyle,
                            backgroundColor: theme.accentBg,
                            color: theme.accent,
                            padding: '8px'
                          }}
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(product)}
                          style={{
                            ...buttonStyle,
                            backgroundColor: '#fef2f2',
                            color: '#dc2626',
                            padding: '8px 12px'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            // ============ GROUPS VIEW ============
            filteredGroups.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '48px',
                backgroundColor: theme.bgCard,
                borderRadius: '12px',
                border: `1px solid ${theme.border}`
              }}>
                <Boxes size={48} style={{ color: theme.textMuted, opacity: 0.5, marginBottom: '16px' }} />
                <p style={{ color: theme.textSecondary, margin: 0 }}>
                  No product groups yet. Click the Groups button to create one.
                </p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '16px'
              }}>
                {filteredGroups.filter(g => g.active).map(group => (
                  <div
                    key={group.id}
                    onClick={() => setSelectedGroup(group)}
                    style={{
                      backgroundColor: theme.bgCard,
                      borderRadius: '16px',
                      border: `1px solid ${theme.border}`,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'
                      e.currentTarget.style.borderColor = theme.accent
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = 'none'
                      e.currentTarget.style.borderColor = theme.border
                    }}
                  >
                    {/* Group Image/Icon */}
                    <div style={{
                      height: isMobile ? '100px' : '140px',
                      backgroundColor: theme.accentBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {group.image_url ? (
                        <img src={group.image_url} alt={group.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <Boxes size={isMobile ? 40 : 56} style={{ color: theme.accent, opacity: 0.6 }} />
                      )}
                    </div>

                    {/* Group Info */}
                    <div style={{ padding: isMobile ? '12px' : '16px' }}>
                      <h3 style={{
                        fontSize: isMobile ? '14px' : '16px',
                        fontWeight: '600',
                        color: theme.text,
                        margin: '0 0 4px 0'
                      }}>
                        {group.name}
                      </h3>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <span style={{ fontSize: '13px', color: theme.textMuted }}>
                          {getProductCount(group.id)} items
                        </span>
                        <ChevronRight size={16} style={{ color: theme.textMuted }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Settings Panel (inline) */}
        {showSettings && !selectedGroup && (
          <div style={{
            width: isMobile ? '100%' : '360px',
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px',
            position: isMobile ? 'fixed' : 'relative',
            inset: isMobile ? '0' : 'auto',
            zIndex: isMobile ? 50 : 'auto',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
                {editingGroup ? 'Edit Group' : 'Product Groups'}
              </h2>
              {isMobile && (
                <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Group Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input
                  type="text"
                  name="name"
                  value={groupForm.name}
                  onChange={handleGroupChange}
                  style={inputStyle}
                  placeholder="e.g., Window Cleaning Services"
                />
              </div>

              <div>
                <label style={labelStyle}>Service Type *</label>
                <select name="service_type" value={groupForm.service_type} onChange={handleGroupChange} style={inputStyle}>
                  <option value="">-- Select --</option>
                  {serviceTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Description</label>
                <textarea
                  name="description"
                  value={groupForm.description}
                  onChange={handleGroupChange}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={labelStyle}>Image</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {groupForm.image_url ? (
                    <div style={{ position: 'relative' }}>
                      <img src={groupForm.image_url} alt="" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px' }} />
                      <button
                        type="button"
                        onClick={() => setGroupForm(prev => ({ ...prev, image_url: '' }))}
                        style={{
                          position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px',
                          borderRadius: '50%', backgroundColor: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ) : (
                    <label style={{
                      width: '60px', height: '60px', borderRadius: '8px', border: `2px dashed ${theme.border}`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: theme.textMuted, backgroundColor: theme.bg
                    }}>
                      <Upload size={16} />
                      <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, true)} style={{ display: 'none' }} />
                    </label>
                  )}
                  <input
                    type="url"
                    name="image_url"
                    value={groupForm.image_url}
                    onChange={handleGroupChange}
                    placeholder="Or paste URL..."
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Sort Order</label>
                  <input type="number" name="sort_order" value={groupForm.sort_order} onChange={handleGroupChange} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      name="active"
                      checked={groupForm.active}
                      onChange={handleGroupChange}
                      style={{ width: '18px', height: '18px', accentColor: theme.accent }}
                    />
                    <span style={{ fontSize: '14px', color: theme.text }}>Active</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {editingGroup && (
                  <button
                    onClick={() => { setEditingGroup(null); setGroupForm({ name: '', service_type: '', description: '', image_url: '', icon: 'Package', sort_order: 0, active: true }) }}
                    style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSaveGroup}
                  disabled={saving}
                  style={{ ...buttonStyle, flex: 1, backgroundColor: theme.accent, color: '#fff', opacity: saving ? 0.7 : 1 }}
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : (editingGroup ? 'Update' : 'Create Group')}
                </button>
              </div>
            </div>

            {/* Existing Groups List */}
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: theme.textMuted, marginBottom: '12px', textTransform: 'uppercase' }}>
                Existing Groups
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {productGroups.map(group => (
                  <div
                    key={group.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      backgroundColor: theme.bg,
                      borderRadius: '8px',
                      opacity: group.active ? 1 : 0.6
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{group.name}</div>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>{group.service_type}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => openGroupForm(group)}
                        style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, borderRadius: '4px' }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(group)}
                        style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', borderRadius: '4px' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Product Modal */}
      {showProductModal && (
        <>
          <div
            onClick={() => setShowProductModal(false)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 }}
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
            maxWidth: isMobile ? '95%' : '480px',
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
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h2>
              <button onClick={() => setShowProductModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Name *</label>
                  <input type="text" name="name" value={productForm.name} onChange={handleProductChange} style={inputStyle} />
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea name="description" value={productForm.description} onChange={handleProductChange} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Price</label>
                    <input type="number" name="unit_price" value={productForm.unit_price} onChange={handleProductChange} step="0.01" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Cost</label>
                    <input type="number" name="cost" value={productForm.cost} onChange={handleProductChange} step="0.01" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Markup %</label>
                    <input type="number" name="markup_percent" value={productForm.markup_percent} onChange={handleProductChange} style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Allotted Time (hours)</label>
                  <input type="number" name="allotted_time_hours" value={productForm.allotted_time_hours} onChange={handleProductChange} step="0.25" style={inputStyle} />
                </div>

                <div>
                  <label style={labelStyle}>Image</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {productForm.image_url ? (
                      <div style={{ position: 'relative' }}>
                        <img src={productForm.image_url} alt="" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px' }} />
                        <button
                          type="button"
                          onClick={() => setProductForm(prev => ({ ...prev, image_url: '' }))}
                          style={{
                            position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px',
                            borderRadius: '50%', backgroundColor: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ) : (
                      <label style={{
                        width: '60px', height: '60px', borderRadius: '8px', border: `2px dashed ${theme.border}`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: theme.textMuted, backgroundColor: theme.bg
                      }}>
                        <Upload size={16} />
                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, false)} style={{ display: 'none' }} />
                      </label>
                    )}
                    <input
                      type="url"
                      name="image_url"
                      value={productForm.image_url}
                      onChange={handleProductChange}
                      placeholder="Or paste URL..."
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '24px', padding: '8px 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" name="taxable" checked={productForm.taxable} onChange={handleProductChange} style={{ width: '18px', height: '18px', accentColor: theme.accent }} />
                    <span style={{ fontSize: '14px', color: theme.text }}>Taxable</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" name="active" checked={productForm.active} onChange={handleProductChange} style={{ width: '18px', height: '18px', accentColor: theme.accent }} />
                    <span style={{ fontSize: '14px', color: theme.text }}>Active</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', gap: '12px', padding: '16px 20px', borderTop: `1px solid ${theme.border}` }}>
              <button
                onClick={() => setShowProductModal(false)}
                style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProduct}
                disabled={saving}
                style={{ ...buttonStyle, flex: 1, backgroundColor: theme.accent, color: '#fff', opacity: saving ? 0.7 : 1 }}
              >
                <Save size={16} />
                {saving ? 'Saving...' : (editingProduct ? 'Update' : 'Add Product')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
