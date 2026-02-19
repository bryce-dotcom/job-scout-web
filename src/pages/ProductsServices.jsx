// ALWAYS READ JOBSCOUT_PROJECT_RULES.md BEFORE MAKING CHANGES
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  Plus, ArrowLeft, Settings, X, Save, Trash2, Package, Boxes,
  Upload, Clock, DollarSign, Pencil, ChevronRight, Archive, Search,
  FileSpreadsheet, CheckCircle, AlertCircle, ArrowRight, Loader
} from 'lucide-react'
import Tooltip from '../components/Tooltip'
import * as XLSX from 'xlsx'

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

// Reusable Product Card component
function ProductCard({ product, theme, isMobile, formatCurrency, openProductForm, handleDeleteProduct, buttonStyle, inventoryCount, laborCost }) {
  return (
    <div
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
        height: '100px',
        backgroundColor: theme.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: `1px solid ${theme.border}`,
        position: 'relative'
      }}>
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Package size={32} style={{ color: theme.textMuted, opacity: 0.4 }} />
        )}
        {/* Inventory badge */}
        {inventoryCount !== undefined && (
          <div style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            backgroundColor: inventoryCount > 0 ? '#22c55e' : '#ef4444',
            color: '#fff',
            padding: '3px 8px',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <Archive size={10} />
            {inventoryCount}
          </div>
        )}
      </div>

      {/* Product Info */}
      <div style={{ padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: 0, lineHeight: '1.3' }}>
            {product.name}
          </h3>
          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '10px',
            backgroundColor: product.active ? 'rgba(74,124,89,0.12)' : 'rgba(0,0,0,0.06)',
            color: product.active ? '#4a7c59' : theme.textMuted,
            flexShrink: 0,
            marginLeft: '8px'
          }}>
            {product.active ? 'Active' : 'Inactive'}
          </span>
        </div>

        {product.type && (
          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>
            {product.type}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <div style={{ fontSize: '16px', fontWeight: '600', color: theme.accent }}>
            {formatCurrency(product.unit_price)}
          </div>
          {product.allotted_time_hours && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: theme.textMuted }}>
              <Clock size={11} />
              {product.allotted_time_hours}h
            </div>
          )}
        </div>
        {laborCost > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#8b5cf6', marginBottom: '10px' }}>
            <DollarSign size={11} />
            Labor: {formatCurrency(laborCost)}
          </div>
        )}

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => openProductForm(product)}
            style={{
              flex: 1,
              ...buttonStyle,
              backgroundColor: theme.accentBg,
              color: theme.accent,
              padding: '8px',
              fontSize: '12px'
            }}
          >
            <Pencil size={12} />
            Edit
          </button>
          <button
            onClick={() => handleDeleteProduct(product)}
            style={{
              ...buttonStyle,
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              padding: '8px 10px'
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ProductsServices() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const isDeveloper = useStore((state) => state.isDeveloper)
  const serviceTypes = useStore((state) => state.serviceTypes)
  const products = useStore((state) => state.products)
  const inventory = useStore((state) => state.inventory)
  const laborRates = useStore((state) => state.laborRates)
  const fetchProducts = useStore((state) => state.fetchProducts)
  const fetchLaborRates = useStore((state) => state.fetchLaborRates)
  const fetchInventory = useStore((state) => state.fetchInventory)

  // Helper to get inventory count for a product
  const getInventoryCount = (productId) => {
    return inventory
      .filter(item => item.product_id === productId)
      .reduce((sum, item) => sum + (item.quantity || 0), 0)
  }

  // Get default labor rate
  const defaultLaborRate = laborRates.find(r => r.is_default) || laborRates[0]

  // Calculate labor cost for a product
  const getLaborCost = (product) => {
    if (!product.allotted_time_hours) return 0
    // Use product's selected rate or fall back to default
    const rate = product.labor_rate_id
      ? laborRates.find(r => r.id === product.labor_rate_id)
      : defaultLaborRate
    if (!rate) return 0
    return product.allotted_time_hours * rate.rate_per_hour * (rate.multiplier || 1)
  }

  // Sync a single product to inventory (create record if active and doesn't exist)
  const syncProductToInventory = async (productId, productName, isActive) => {
    if (!isActive) return // Don't create inventory for inactive products

    // Check if inventory record exists
    const { data: existing } = await supabase
      .from('inventory')
      .select('id')
      .eq('company_id', companyId)
      .eq('product_id', productId)
      .single()

    if (!existing) {
      // Create inventory record
      await supabase.from('inventory').insert({
        company_id: companyId,
        product_id: productId,
        name: productName,
        item_id: `PRD-${productId}`,
        inventory_type: 'Material',
        quantity: 0,
        min_quantity: 0,
        location: null,
        last_updated: new Date().toISOString()
      })
    }
  }

  // Sync all active products to inventory on page load
  const syncAllProductsToInventory = async () => {
    if (!products.length) return

    const activeProducts = products.filter(p => p.active)
    const productIds = activeProducts.map(p => p.id)

    // Get all inventory records for these products
    const { data: existingInventory } = await supabase
      .from('inventory')
      .select('product_id')
      .eq('company_id', companyId)
      .in('product_id', productIds)

    const existingProductIds = new Set((existingInventory || []).map(i => i.product_id))

    // Find products without inventory
    const productsNeedingInventory = activeProducts.filter(p => !existingProductIds.has(p.id))

    if (productsNeedingInventory.length > 0) {
      // Bulk insert inventory records
      const inventoryRecords = productsNeedingInventory.map(p => ({
        company_id: companyId,
        product_id: p.id,
        name: p.name,
        item_id: `PRD-${p.id}`,
        inventory_type: 'Material',
        quantity: 0,
        min_quantity: 0,
        location: null,
        last_updated: new Date().toISOString()
      }))

      await supabase.from('inventory').insert(inventoryRecords)
      await fetchInventory()
    }
  }

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
    taxable: true, active: true, image_url: '', allotted_time_hours: '', group_id: null, type: '', labor_rate_id: ''
  })

  // Labor rates panel state
  const [showLaborRates, setShowLaborRates] = useState(false)
  const [editingRate, setEditingRate] = useState(null)
  const [rateForm, setRateForm] = useState({
    name: '', rate_per_hour: '', description: '', multiplier: '1.0', active: true, is_default: false
  })

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)

  // Import state
  const [showImport, setShowImport] = useState(false)
  const [importStep, setImportStep] = useState('upload') // upload | mapping | preview | importing | done
  const [importFile, setImportFile] = useState(null)
  const [importHeaders, setImportHeaders] = useState([])
  const [importRows, setImportRows] = useState([])
  const [importMapping, setImportMapping] = useState({})
  const [importDefaults, setImportDefaults] = useState({})
  const [importNotes, setImportNotes] = useState('')
  const [importMappingLoading, setImportMappingLoading] = useState(false)
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, errors: [] })

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

  // Fetch product groups and data
  useEffect(() => {
    if (companyId) {
      fetchProductGroups()
      fetchProducts()
      fetchLaborRates()
    }
  }, [companyId])

  // Sync active products to inventory after products are loaded
  useEffect(() => {
    if (companyId && products.length > 0 && inventory.length >= 0) {
      syncAllProductsToInventory()
    }
  }, [companyId, products.length])

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

  // Filter products by service type + search query
  const filteredProducts = products.filter(p => {
    if (activeServiceType !== 'all' && p.type !== activeServiceType) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const haystack = `${p.name || ''} ${p.description || ''} ${p.type || ''}`.toLowerCase()
      return haystack.includes(q)
    }
    return true
  })

  // Filter groups by service type
  const filteredGroups = productGroups.filter(g =>
    g.active && (activeServiceType === 'all' || g.service_type === activeServiceType)
  )

  // Get products for selected group (with search filter)
  const groupProducts = selectedGroup
    ? products.filter(p => {
        if (p.group_id !== selectedGroup.id) return false
        if (searchQuery) {
          const q = searchQuery.toLowerCase()
          const haystack = `${p.name || ''} ${p.description || ''} ${p.type || ''}`.toLowerCase()
          return haystack.includes(q)
        }
        return true
      })
    : []

  // Get ungrouped products (products with no group_id or group_id not in current groups)
  const groupIds = new Set(productGroups.map(g => g.id))
  const ungroupedProducts = filteredProducts.filter(p => !p.group_id || !groupIds.has(p.group_id))

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
        group_id: product.group_id,
        type: product.type || '',
        labor_rate_id: product.labor_rate_id || ''
      })
    } else {
      setEditingProduct(null)
      setProductForm({
        name: '', description: '', unit_price: '', cost: '', markup_percent: '',
        taxable: true, active: true, image_url: '', allotted_time_hours: '',
        group_id: selectedGroup?.id || null,
        type: selectedGroup?.service_type || (activeServiceType !== 'all' ? activeServiceType : (serviceTypes[0] || '')),
        labor_rate_id: ''
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
      type: productForm.type || null,
      unit_price: productForm.unit_price || null,
      cost: productForm.cost || null,
      markup_percent: productForm.markup_percent || null,
      taxable: productForm.taxable,
      active: productForm.active,
      image_url: productForm.image_url || null,
      allotted_time_hours: productForm.allotted_time_hours || null,
      group_id: productForm.group_id,
      labor_rate_id: productForm.labor_rate_id || null,
      updated_at: new Date().toISOString()
    }

    let result
    let productId = editingProduct?.id
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
        .select('id')
        .single()
      if (result.data) {
        productId = result.data.id
      }
    }

    if (result.error) {
      alert('Error saving product: ' + result.error.message)
    } else {
      // Auto-sync to inventory if product is active
      if (productForm.active && productId) {
        await syncProductToInventory(productId, productForm.name, true)
        await fetchInventory()
      }
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

  // ============ LABOR RATE CRUD ============
  const openRateForm = (rate = null) => {
    if (rate) {
      setEditingRate(rate)
      setRateForm({
        name: rate.name || '',
        rate_per_hour: rate.rate_per_hour || '',
        description: rate.description || '',
        multiplier: rate.multiplier || '1.0',
        active: rate.active ?? true,
        is_default: rate.is_default ?? false
      })
    } else {
      setEditingRate(null)
      setRateForm({
        name: '',
        rate_per_hour: '',
        description: '',
        multiplier: '1.0',
        active: true,
        is_default: laborRates.length === 0 // First rate is default
      })
    }
  }

  const handleRateChange = (e) => {
    const { name, value, type, checked } = e.target
    setRateForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSaveRate = async () => {
    if (!rateForm.name || !rateForm.rate_per_hour) {
      alert('Name and Rate per Hour are required')
      return
    }

    setSaving(true)

    // If setting this as default, unset existing default first
    if (rateForm.is_default && !editingRate?.is_default) {
      await supabase
        .from('labor_rates')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .eq('is_default', true)
    }

    const payload = {
      company_id: companyId,
      name: rateForm.name,
      rate_per_hour: parseFloat(rateForm.rate_per_hour),
      description: rateForm.description || null,
      multiplier: parseFloat(rateForm.multiplier) || 1.0,
      active: rateForm.active,
      is_default: rateForm.is_default,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingRate) {
      result = await supabase
        .from('labor_rates')
        .update(payload)
        .eq('id', editingRate.id)
        .eq('company_id', companyId)
    } else {
      result = await supabase
        .from('labor_rates')
        .insert([payload])
    }

    if (result.error) {
      alert('Error saving rate: ' + result.error.message)
    } else {
      await fetchLaborRates()
      setEditingRate(null)
      setRateForm({ name: '', rate_per_hour: '', description: '', multiplier: '1.0', active: true, is_default: false })
    }
    setSaving(false)
  }

  const handleDeleteRate = async (rate) => {
    // Don't allow deleting the only rate or the default rate without setting another
    if (laborRates.length === 1) {
      alert('Cannot delete the only labor rate. Create another rate first.')
      return
    }
    if (rate.is_default) {
      alert('Cannot delete the default rate. Set another rate as default first.')
      return
    }
    if (!confirm(`Delete rate "${rate.name}"?`)) return

    await supabase.from('labor_rates').delete().eq('id', rate.id).eq('company_id', companyId)
    await fetchLaborRates()
  }

  const handleSetDefault = async (rate) => {
    if (rate.is_default) return

    setSaving(true)
    // Unset existing default
    await supabase
      .from('labor_rates')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('is_default', true)

    // Set new default
    await supabase
      .from('labor_rates')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', rate.id)
      .eq('company_id', companyId)

    await fetchLaborRates()
    setSaving(false)
  }

  // ============ DELETE ALL PRODUCTS (super admin only) ============
  const handleDeleteAllProducts = async () => {
    setDeletingAll(true)
    // Delete linked inventory records first (foreign key constraint)
    await supabase
      .from('inventory')
      .delete()
      .eq('company_id', companyId)
      .in('product_id', products.map(p => p.id))
    // Now delete all products
    const { error } = await supabase
      .from('products_services')
      .delete()
      .eq('company_id', companyId)
    if (error) {
      alert('Error deleting products: ' + error.message)
    } else {
      await fetchProducts()
      await fetchInventory()
      setShowDeleteAll(false)
    }
    setDeletingAll(false)
  }

  // ============ IMPORT FUNCTIONS ============
  const TARGET_FIELDS = [
    { field: 'name', label: 'Product Name', required: true },
    { field: 'description', label: 'Description' },
    { field: 'type', label: 'Service Type' },
    { field: 'unit_price', label: 'Unit Price' },
    { field: 'cost', label: 'Cost' },
    { field: 'markup_percent', label: 'Markup %' },
    { field: 'taxable', label: 'Taxable' },
    { field: 'active', label: 'Active' },
    { field: 'allotted_time_hours', label: 'Labor Hours' },
  ]

  const resetImport = () => {
    setShowImport(false)
    setImportStep('upload')
    setImportFile(null)
    setImportHeaders([])
    setImportRows([])
    setImportMapping({})
    setImportDefaults({})
    setImportNotes('')
    setImportProgress({ done: 0, total: 0, errors: [] })
  }

  const handleImportFile = async (file) => {
    setImportFile(file)
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

      if (json.length < 2) {
        alert('File must have at least a header row and one data row')
        return
      }

      const headers = json[0].map(h => String(h).trim())
      const rows = json.slice(1).filter(row => row.some(cell => cell !== ''))

      setImportHeaders(headers)
      setImportRows(rows)
      setImportStep('mapping')
      setImportMappingLoading(true)

      // Call AI to map columns
      try {
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-map-columns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
          body: JSON.stringify({
            headers,
            sampleRows: rows.slice(0, 5),
            serviceTypes,
          }),
        })
        const result = await resp.json()
        if (result.mapping) {
          setImportMapping(result.mapping)
          setImportDefaults(result.defaults || {})
          setImportNotes(result.notes || '')
        }
      } catch (_) {
        // AI mapping failed — user can map manually
        setImportNotes('AI mapping unavailable — please map columns manually')
      }
      setImportMappingLoading(false)
    } catch (err) {
      alert('Could not read file: ' + err.message)
    }
  }

  const updateMapping = (targetField, sourceIdx) => {
    setImportMapping(prev => {
      const next = { ...prev }
      if (sourceIdx === '' || sourceIdx === null) {
        delete next[targetField]
      } else {
        next[targetField] = parseInt(sourceIdx)
      }
      return next
    })
  }

  const getMappedValue = (row, field) => {
    const idx = importMapping[field]
    if (idx === undefined || idx === null) return importDefaults[field] ?? ''
    const raw = row[idx]
    if (raw === undefined || raw === null || raw === '') return importDefaults[field] ?? ''
    return raw
  }

  const getPreviewRows = () => {
    return importRows.slice(0, 10).map(row => {
      const mapped = {}
      TARGET_FIELDS.forEach(f => {
        mapped[f.field] = getMappedValue(row, f.field)
      })
      return mapped
    })
  }

  const executeImport = async () => {
    if (!importMapping.name && importMapping.name !== 0) {
      alert('Product Name mapping is required')
      return
    }

    setImportStep('importing')
    const total = importRows.length
    setImportProgress({ done: 0, total, errors: [] })
    const errors = []
    const BATCH_SIZE = 25

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = importRows.slice(i, i + BATCH_SIZE)
      const records = batch.map((row, ri) => {
        const name = String(getMappedValue(row, 'name')).trim()
        if (!name) return null

        const price = parseFloat(getMappedValue(row, 'unit_price')) || 0
        const cost = parseFloat(getMappedValue(row, 'cost')) || 0
        const markup = parseFloat(getMappedValue(row, 'markup_percent')) || 0
        const hours = parseFloat(getMappedValue(row, 'allotted_time_hours')) || 0

        let taxable = getMappedValue(row, 'taxable')
        if (typeof taxable === 'string') taxable = !['false', 'no', '0', 'n'].includes(taxable.toLowerCase())
        else taxable = taxable !== false

        let active = getMappedValue(row, 'active')
        if (typeof active === 'string') active = !['false', 'no', '0', 'n', 'inactive'].includes(active.toLowerCase())
        else active = active !== false

        return {
          company_id: companyId,
          name,
          description: String(getMappedValue(row, 'description') || '').trim() || null,
          type: String(getMappedValue(row, 'type') || '').trim() || null,
          unit_price: price || null,
          cost: cost || null,
          markup_percent: markup || null,
          taxable,
          active,
          allotted_time_hours: hours || null,
        }
      }).filter(Boolean)

      if (records.length > 0) {
        const { error } = await supabase.from('products_services').insert(records)
        if (error) {
          errors.push(`Rows ${i + 1}-${i + batch.length}: ${error.message}`)
        }
      }
      setImportProgress({ done: Math.min(i + BATCH_SIZE, total), total, errors: [...errors] })
    }

    await fetchProducts()
    setImportStep('done')
    setImportProgress(prev => ({ ...prev, done: total, errors }))
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
          <button
            onClick={() => openProductForm()}
            style={{ ...buttonStyle, backgroundColor: theme.accent, color: '#fff' }}
          >
            <Plus size={18} />
            Add Product
          </button>
          <Tooltip text="Import from CSV or Excel">
            <button
              onClick={() => { resetImport(); setShowImport(true) }}
              style={{ ...buttonStyle, backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}
            >
              <FileSpreadsheet size={18} />
              {!isMobile && 'Import'}
            </button>
          </Tooltip>
          {isDeveloper && (
            <Tooltip text="Delete all products">
              <button
                onClick={() => setShowDeleteAll(true)}
                style={{ ...buttonStyle, backgroundColor: '#fef2f2', color: '#dc2626' }}
              >
                <Trash2 size={18} />
                {!isMobile && 'Delete All'}
              </button>
            </Tooltip>
          )}
          {!selectedGroup && (
            <>
              <Tooltip text="Manage labor rates">
                <button
                  onClick={() => { setShowLaborRates(!showLaborRates); setShowSettings(false) }}
                  style={{
                    ...buttonStyle,
                    backgroundColor: showLaborRates ? '#8b5cf6' : 'rgba(139,92,246,0.12)',
                    color: showLaborRates ? '#fff' : '#8b5cf6'
                  }}
                >
                  <DollarSign size={18} />
                  {!isMobile && 'Rates'}
                </button>
              </Tooltip>
              <Tooltip text="Manage product groups">
                <button
                  onClick={() => { setShowSettings(!showSettings); setShowLaborRates(false) }}
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
            </>
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

      {/* Search Bar */}
      <div style={{
        position: 'relative',
        marginBottom: '20px'
      }}>
        <Search size={18} style={{
          position: 'absolute',
          left: '14px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: searchQuery ? theme.accent : theme.textMuted,
          pointerEvents: 'none'
        }} />
        <input
          type="text"
          placeholder="Search products by name, description, or type..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: isMobile ? '14px 42px 14px 42px' : '12px 42px 12px 42px',
            fontSize: '15px',
            border: `1px solid ${searchQuery ? theme.accent : theme.border}`,
            borderRadius: '12px',
            backgroundColor: theme.bgCard,
            color: theme.text,
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s'
          }}
          onFocus={e => e.target.style.borderColor = theme.accent}
          onBlur={e => { if (!searchQuery) e.target.style.borderColor = theme.border }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: theme.textMuted,
              padding: '4px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={16} />
          </button>
        )}
        {searchQuery && (
          <div style={{
            position: 'absolute',
            right: '36px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '12px',
            color: theme.textMuted
          }}>
            {filteredProducts.length} result{filteredProducts.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Groups/Products Grid */}
        <div style={{ flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px', color: theme.textMuted }}>
              Loading...
            </div>
          ) : selectedGroup ? (
            // ============ DRILL-DOWN: PRODUCTS IN SELECTED GROUP ============
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
                  <ProductCard key={product.id} product={product} theme={theme} isMobile={isMobile} formatCurrency={formatCurrency} openProductForm={openProductForm} handleDeleteProduct={handleDeleteProduct} buttonStyle={buttonStyle} inventoryCount={getInventoryCount(product.id)} laborCost={getLaborCost(product)} />
                ))}
              </div>
            )
          ) : (
            // ============ MAIN VIEW: GROUPS + UNGROUPED PRODUCTS ============
            <div>
              {/* Product Groups (if any exist for this service type) */}
              {filteredGroups.length > 0 && (
                <div style={{ marginBottom: '32px' }}>
                  <h2 style={{ fontSize: '14px', fontWeight: '600', color: theme.textMuted, marginBottom: '16px', textTransform: 'uppercase' }}>
                    Product Groups
                  </h2>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '16px'
                  }}>
                    {filteredGroups.map(group => (
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
                          height: isMobile ? '80px' : '100px',
                          backgroundColor: theme.accentBg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {group.image_url ? (
                            <img src={group.image_url} alt={group.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <Boxes size={isMobile ? 32 : 40} style={{ color: theme.accent, opacity: 0.6 }} />
                          )}
                        </div>

                        {/* Group Info */}
                        <div style={{ padding: isMobile ? '10px' : '12px' }}>
                          <h3 style={{
                            fontSize: isMobile ? '13px' : '14px',
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
                            <span style={{ fontSize: '12px', color: theme.textMuted }}>
                              {getProductCount(group.id)} items
                            </span>
                            <ChevronRight size={14} style={{ color: theme.textMuted }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ungrouped Products (always show if there are any) */}
              {ungroupedProducts.length > 0 && (
                <div>
                  {filteredGroups.length > 0 && (
                    <h2 style={{ fontSize: '14px', fontWeight: '600', color: theme.textMuted, marginBottom: '16px', textTransform: 'uppercase' }}>
                      {activeServiceType === 'all' ? 'All Products' : `${activeServiceType} Products`}
                    </h2>
                  )}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))',
                    gap: '16px'
                  }}>
                    {ungroupedProducts.map(product => (
                      <ProductCard key={product.id} product={product} theme={theme} isMobile={isMobile} formatCurrency={formatCurrency} openProductForm={openProductForm} handleDeleteProduct={handleDeleteProduct} buttonStyle={buttonStyle} inventoryCount={getInventoryCount(product.id)} laborCost={getLaborCost(product)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state - only show when NO groups AND NO ungrouped products */}
              {filteredGroups.length === 0 && ungroupedProducts.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '48px',
                  backgroundColor: theme.bgCard,
                  borderRadius: '12px',
                  border: `1px solid ${theme.border}`
                }}>
                  <Package size={48} style={{ color: theme.textMuted, opacity: 0.5, marginBottom: '16px' }} />
                  <p style={{ color: theme.textSecondary, margin: 0 }}>
                    No products yet. Click "Add Product" to create your first product.
                  </p>
                </div>
              )}
            </div>
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

        {/* Labor Rates Panel (inline) */}
        {showLaborRates && !selectedGroup && (
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
                {editingRate ? 'Edit Rate' : 'Labor Rates'}
              </h2>
              {isMobile && (
                <button onClick={() => setShowLaborRates(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Rate Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input
                  type="text"
                  name="name"
                  value={rateForm.name}
                  onChange={handleRateChange}
                  style={inputStyle}
                  placeholder="e.g., Standard Rate"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Rate/Hour *</label>
                  <input
                    type="number"
                    name="rate_per_hour"
                    value={rateForm.rate_per_hour}
                    onChange={handleRateChange}
                    step="0.01"
                    style={inputStyle}
                    placeholder="75.00"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Multiplier</label>
                  <input
                    type="number"
                    name="multiplier"
                    value={rateForm.multiplier}
                    onChange={handleRateChange}
                    step="0.1"
                    style={inputStyle}
                    placeholder="1.0"
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Description</label>
                <input
                  type="text"
                  name="description"
                  value={rateForm.description}
                  onChange={handleRateChange}
                  style={inputStyle}
                  placeholder="e.g., Standard labor rate"
                />
              </div>

              <div style={{ display: 'flex', gap: '24px', padding: '8px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    name="active"
                    checked={rateForm.active}
                    onChange={handleRateChange}
                    style={{ width: '18px', height: '18px', accentColor: theme.accent }}
                  />
                  <span style={{ fontSize: '14px', color: theme.text }}>Active</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    name="is_default"
                    checked={rateForm.is_default}
                    onChange={handleRateChange}
                    style={{ width: '18px', height: '18px', accentColor: '#8b5cf6' }}
                  />
                  <span style={{ fontSize: '14px', color: theme.text }}>Default</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {editingRate && (
                  <button
                    onClick={() => { setEditingRate(null); setRateForm({ name: '', rate_per_hour: '', description: '', multiplier: '1.0', active: true, is_default: false }) }}
                    style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSaveRate}
                  disabled={saving}
                  style={{ ...buttonStyle, flex: 1, backgroundColor: '#8b5cf6', color: '#fff', opacity: saving ? 0.7 : 1 }}
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : (editingRate ? 'Update' : 'Add Rate')}
                </button>
              </div>
            </div>

            {/* Existing Rates List */}
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: theme.textMuted, marginBottom: '12px', textTransform: 'uppercase' }}>
                Existing Rates
              </h3>
              {laborRates.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
                  No labor rates yet. Add your first rate above.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {laborRates.map(rate => (
                    <div
                      key={rate.id}
                      style={{
                        padding: '12px',
                        backgroundColor: theme.bg,
                        borderRadius: '8px',
                        border: rate.is_default ? '2px solid #8b5cf6' : 'none',
                        opacity: rate.active ? 1 : 0.6
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>{rate.name}</span>
                            {rate.is_default && (
                              <span style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '8px',
                                backgroundColor: '#8b5cf6',
                                color: '#fff',
                                fontWeight: '600'
                              }}>
                                DEFAULT
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: '#8b5cf6', marginTop: '4px' }}>
                            ${parseFloat(rate.rate_per_hour).toFixed(2)}/hr
                            {rate.multiplier && rate.multiplier !== 1 && (
                              <span style={{ fontSize: '12px', color: theme.textMuted, marginLeft: '6px' }}>
                                x{rate.multiplier}
                              </span>
                            )}
                          </div>
                          {rate.description && (
                            <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>{rate.description}</div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                        {!rate.is_default && (
                          <button
                            onClick={() => handleSetDefault(rate)}
                            style={{
                              flex: 1,
                              ...buttonStyle,
                              backgroundColor: 'rgba(139,92,246,0.12)',
                              color: '#8b5cf6',
                              padding: '6px',
                              fontSize: '11px'
                            }}
                          >
                            Set Default
                          </button>
                        )}
                        <button
                          onClick={() => openRateForm(rate)}
                          style={{ ...buttonStyle, backgroundColor: theme.accentBg, color: theme.accent, padding: '6px 10px' }}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteRate(rate)}
                          style={{ ...buttonStyle, backgroundColor: '#fef2f2', color: '#dc2626', padding: '6px 10px' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Service Type</label>
                    <select name="type" value={productForm.type || ''} onChange={handleProductChange} style={inputStyle}>
                      <option value="">-- Select --</option>
                      {serviceTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Product Group</label>
                    <select
                      name="group_id"
                      value={productForm.group_id || ''}
                      onChange={(e) => setProductForm(prev => ({ ...prev, group_id: e.target.value ? parseInt(e.target.value) : null }))}
                      style={inputStyle}
                    >
                      <option value="">None (Ungrouped)</option>
                      {productGroups.filter(g => g.active).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Allotted Time (hours)</label>
                    <input type="number" name="allotted_time_hours" value={productForm.allotted_time_hours} onChange={handleProductChange} step="0.25" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Labor Rate</label>
                    <select
                      name="labor_rate_id"
                      value={productForm.labor_rate_id || ''}
                      onChange={(e) => setProductForm(prev => ({ ...prev, labor_rate_id: e.target.value ? parseInt(e.target.value) : null }))}
                      style={inputStyle}
                    >
                      <option value="">Use Default Rate</option>
                      {laborRates.filter(r => r.active).map(rate => (
                        <option key={rate.id} value={rate.id}>
                          {rate.name} (${parseFloat(rate.rate_per_hour).toFixed(2)}/hr){rate.is_default ? ' - Default' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
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

      {/* ============ DELETE ALL CONFIRMATION ============ */}
      {showDeleteAll && (
        <>
          <div onClick={() => setShowDeleteAll(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`,
            width: '100%', maxWidth: '400px', padding: '24px', zIndex: 51, textAlign: 'center'
          }}>
            <Trash2 size={36} style={{ color: '#dc2626', marginBottom: '12px' }} />
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '700', color: theme.text }}>Delete All Products?</h3>
            <p style={{ margin: '0 0 6px', fontSize: '14px', color: theme.textSecondary }}>
              This will permanently delete <strong>{products.length}</strong> product{products.length !== 1 ? 's' : ''} from your company.
            </p>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#dc2626', fontWeight: '500' }}>
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowDeleteAll(false)} style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
                Cancel
              </button>
              <button
                onClick={handleDeleteAllProducts}
                disabled={deletingAll}
                style={{ ...buttonStyle, flex: 1, backgroundColor: '#dc2626', color: '#fff', opacity: deletingAll ? 0.7 : 1 }}
              >
                <Trash2 size={16} />
                {deletingAll ? 'Deleting...' : `Delete All ${products.length}`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ============ IMPORT MODAL ============ */}
      {showImport && (
        <>
          <div onClick={resetImport} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 }} />
          <div style={{
            position: 'fixed',
            top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            border: `1px solid ${theme.border}`,
            width: '100%',
            maxWidth: importStep === 'preview' ? '800px' : '560px',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 51
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: `1px solid ${theme.border}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileSpreadsheet size={20} style={{ color: '#3b82f6' }} />
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: theme.text }}>
                  {importStep === 'upload' && 'Import Products'}
                  {importStep === 'mapping' && 'Map Columns'}
                  {importStep === 'preview' && 'Preview Import'}
                  {importStep === 'importing' && 'Importing...'}
                  {importStep === 'done' && 'Import Complete'}
                </h2>
              </div>
              <button onClick={resetImport} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px' }}>
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', overflow: 'auto', flex: 1 }}>

              {/* STEP 1: UPLOAD */}
              {importStep === 'upload' && (
                <div>
                  <div
                    onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#3b82f6' }}
                    onDragLeave={e => { e.currentTarget.style.borderColor = theme.border }}
                    onDrop={e => {
                      e.preventDefault()
                      e.currentTarget.style.borderColor = theme.border
                      const file = e.dataTransfer.files[0]
                      if (file) handleImportFile(file)
                    }}
                    style={{
                      border: `2px dashed ${theme.border}`,
                      borderRadius: '12px',
                      padding: '40px 20px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s'
                    }}
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = '.csv,.xlsx,.xls,.tsv'
                      input.onchange = e => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }
                      input.click()
                    }}
                  >
                    <Upload size={36} style={{ color: '#3b82f6', marginBottom: '12px' }} />
                    <div style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '6px' }}>
                      Drop a file here or click to browse
                    </div>
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>
                      CSV, Excel (.xlsx, .xls), or TSV — any column format
                    </div>
                    <div style={{
                      marginTop: '16px', padding: '10px 16px',
                      backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: '8px',
                      fontSize: '12px', color: '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: '6px'
                    }}>
                      <AlertCircle size={14} />
                      AI will automatically map your columns to the right fields
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: MAPPING */}
              {importStep === 'mapping' && (
                <div>
                  {importMappingLoading ? (
                    <div style={{ textAlign: 'center', padding: '32px' }}>
                      <Loader size={28} style={{ color: '#3b82f6', animation: 'spin 1s linear infinite' }} />
                      <div style={{ fontSize: '14px', color: theme.textSecondary, marginTop: '12px' }}>AI is analyzing your columns...</div>
                      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
                        {importFile?.name} — {importRows.length} rows found
                      </div>
                      {importNotes && (
                        <div style={{
                          padding: '8px 12px', marginBottom: '16px', borderRadius: '8px',
                          backgroundColor: 'rgba(59,130,246,0.08)', fontSize: '12px', color: '#3b82f6'
                        }}>
                          {importNotes}
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {TARGET_FIELDS.map(f => (
                          <div key={f.field} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '130px', flexShrink: 0, fontSize: '13px', fontWeight: '500',
                              color: f.required ? theme.text : theme.textSecondary
                            }}>
                              {f.label} {f.required && <span style={{ color: '#ef4444' }}>*</span>}
                            </div>
                            <ArrowRight size={14} style={{ color: theme.textMuted, flexShrink: 0 }} />
                            <select
                              value={importMapping[f.field] ?? ''}
                              onChange={e => updateMapping(f.field, e.target.value)}
                              style={{
                                flex: 1, padding: '8px 10px', borderRadius: '8px',
                                border: `1px solid ${importMapping[f.field] !== undefined ? '#3b82f6' : theme.border}`,
                                backgroundColor: importMapping[f.field] !== undefined ? 'rgba(59,130,246,0.04)' : theme.bgCard,
                                fontSize: '13px', color: theme.text
                              }}
                            >
                              <option value="">— skip —</option>
                              {importHeaders.map((h, i) => (
                                <option key={i} value={i}>{h} {importRows[0]?.[i] !== undefined ? `(e.g. "${String(importRows[0][i]).substring(0, 30)}")` : ''}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>

                      {/* Defaults section */}
                      {Object.keys(importDefaults).length > 0 && (
                        <div style={{ marginTop: '16px', padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px' }}>Default Values</div>
                          {Object.entries(importDefaults).map(([field, val]) => (
                            <div key={field} style={{ fontSize: '12px', color: theme.textSecondary }}>
                              {TARGET_FIELDS.find(f => f.field === field)?.label || field}: <strong>{String(val)}</strong>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                        <button onClick={() => setImportStep('upload')} style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
                          Back
                        </button>
                        <button
                          onClick={() => setImportStep('preview')}
                          disabled={importMapping.name === undefined && importMapping.name !== 0}
                          style={{
                            ...buttonStyle, flex: 2, backgroundColor: '#3b82f6', color: '#fff',
                            opacity: (importMapping.name === undefined && importMapping.name !== 0) ? 0.5 : 1
                          }}
                        >
                          Preview Import
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* STEP 3: PREVIEW */}
              {importStep === 'preview' && (
                <div>
                  <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>
                    Showing first {Math.min(10, importRows.length)} of {importRows.length} products to import
                  </div>
                  <div style={{ overflow: 'auto', maxHeight: '400px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ backgroundColor: theme.bg, position: 'sticky', top: 0 }}>
                          {TARGET_FIELDS.filter(f => importMapping[f.field] !== undefined || importDefaults[f.field] !== undefined).map(f => (
                            <th key={f.field} style={{
                              padding: '8px 10px', textAlign: 'left', fontWeight: '600',
                              color: theme.textSecondary, borderBottom: `1px solid ${theme.border}`,
                              whiteSpace: 'nowrap'
                            }}>
                              {f.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {getPreviewRows().map((row, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            {TARGET_FIELDS.filter(f => importMapping[f.field] !== undefined || importDefaults[f.field] !== undefined).map(f => (
                              <td key={f.field} style={{
                                padding: '6px 10px', color: theme.text,
                                maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                              }}>
                                {String(row[f.field] || '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                    <button onClick={() => setImportStep('mapping')} style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
                      Back
                    </button>
                    <button onClick={executeImport} style={{ ...buttonStyle, flex: 2, backgroundColor: '#22c55e', color: '#fff' }}>
                      <CheckCircle size={16} />
                      Import {importRows.length} Products
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: IMPORTING */}
              {importStep === 'importing' && (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <Loader size={28} style={{ color: '#3b82f6', animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>
                    Importing products...
                  </div>
                  <div style={{
                    width: '100%', height: '8px', backgroundColor: theme.bg,
                    borderRadius: '4px', overflow: 'hidden', marginBottom: '8px'
                  }}>
                    <div style={{
                      width: `${importProgress.total > 0 ? (importProgress.done / importProgress.total) * 100 : 0}%`,
                      height: '100%', backgroundColor: '#3b82f6', borderRadius: '4px', transition: 'width 0.3s'
                    }} />
                  </div>
                  <div style={{ fontSize: '13px', color: theme.textMuted }}>
                    {importProgress.done} of {importProgress.total} rows processed
                  </div>
                </div>
              )}

              {/* STEP 5: DONE */}
              {importStep === 'done' && (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <CheckCircle size={40} style={{ color: '#22c55e', marginBottom: '12px' }} />
                  <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '6px' }}>
                    Import Complete
                  </div>
                  <div style={{ fontSize: '14px', color: theme.textSecondary, marginBottom: '16px' }}>
                    {importProgress.total - importProgress.errors.length} products imported successfully
                  </div>
                  {importProgress.errors.length > 0 && (
                    <div style={{
                      textAlign: 'left', padding: '10px 14px', backgroundColor: '#fef2f2',
                      borderRadius: '8px', marginBottom: '16px'
                    }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#dc2626', marginBottom: '4px' }}>
                        {importProgress.errors.length} error{importProgress.errors.length > 1 ? 's' : ''}:
                      </div>
                      {importProgress.errors.map((err, i) => (
                        <div key={i} style={{ fontSize: '12px', color: '#991b1b' }}>{err}</div>
                      ))}
                    </div>
                  )}
                  <button onClick={resetImport} style={{ ...buttonStyle, backgroundColor: theme.accent, color: '#fff', width: '100%' }}>
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
