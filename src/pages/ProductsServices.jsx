// ALWAYS READ JOBSCOUT_PROJECT_RULES.md BEFORE MAKING CHANGES
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  Plus, ArrowLeft, Settings, X, Save, Trash2, Package, Boxes,
  Upload, Download, Clock, DollarSign, Pencil, ChevronRight, Archive, Search,
  FileSpreadsheet, CheckCircle, AlertCircle, ArrowRight, Loader,
  ExternalLink, FileText, ShieldCheck, Award, PlusCircle, MinusCircle,
  Wrench, GripHorizontal
} from 'lucide-react'
import Tooltip from '../components/Tooltip'
import ImportExportModal, { exportToCSV } from '../components/ImportExportModal'
import { productsServicesFields } from '../lib/importExportFields'

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

const PRODUCT_CATEGORIES = [
  'LED Panel', 'High Bay', 'Exterior', 'Strip Light', 'Driver',
  'Controls', 'Dimmer', 'Sensor', 'Emergency', 'Retrofit Kit', 'Other'
]

// ============ DRAGGABLE MODAL WRAPPER ============
function DraggableModal({ children, theme, isMobile, maxWidth = '600px', onClose }) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })

  const onMouseDown = useCallback((e) => {
    if (isMobile) return
    setDragging(true)
    dragStart.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }, [pos, isMobile])

  useEffect(() => {
    if (!dragging) return
    const onMouseMove = (e) => {
      setPos({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y })
    }
    const onMouseUp = () => setDragging(false)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragging])

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 }} />
      <div style={{
        position: 'fixed',
        top: `calc(50% + ${pos.y}px)`,
        left: `calc(50% + ${pos.x}px)`,
        transform: 'translate(-50%, -50%)',
        backgroundColor: theme.bgCard,
        borderRadius: '16px',
        border: `1px solid ${theme.border}`,
        width: '100%',
        maxWidth: isMobile ? '95%' : maxWidth,
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 51,
        boxShadow: '0 25px 50px rgba(0,0,0,0.15)'
      }}>
        {/* Drag handle bar */}
        {!isMobile && (
          <div
            onMouseDown={onMouseDown}
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '6px 0 0',
              cursor: dragging ? 'grabbing' : 'grab',
              userSelect: 'none'
            }}
          >
            <GripHorizontal size={16} style={{ color: theme.textMuted, opacity: 0.4 }} />
          </div>
        )}
        {children}
      </div>
    </>
  )
}

// ============ PRODUCT CARD ============
function ProductCard({ product, theme, isMobile, formatCurrency, openProductForm, handleDeleteProduct, buttonStyle, inventoryCount, laborCost }) {
  return (
    <div style={{
      backgroundColor: theme.bgCard,
      borderRadius: '12px',
      border: `1px solid ${theme.border}`,
      overflow: 'hidden',
      opacity: product.active ? 1 : 0.6
    }}>
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
        {inventoryCount !== undefined && (
          <div style={{
            position: 'absolute', top: '8px', right: '8px',
            backgroundColor: inventoryCount > 0 ? '#22c55e' : '#ef4444',
            color: '#fff', padding: '3px 8px', borderRadius: '10px',
            fontSize: '11px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px'
          }}>
            <Archive size={10} />
            {inventoryCount}
          </div>
        )}
        {product.dlc_listed && (
          <div style={{
            position: 'absolute', top: '8px', left: '8px',
            backgroundColor: '#22c55e', color: '#fff', padding: '3px 8px',
            borderRadius: '10px', fontSize: '10px', fontWeight: '700',
            display: 'flex', alignItems: 'center', gap: '3px', letterSpacing: '0.3px'
          }}>
            <ShieldCheck size={10} />
            DLC Listed
          </div>
        )}
      </div>
      <div style={{ padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: 0, lineHeight: '1.3' }}>
            {product.name}
          </h3>
          <span style={{
            fontSize: '10px', padding: '2px 6px', borderRadius: '10px',
            backgroundColor: product.active ? 'rgba(74,124,89,0.12)' : 'rgba(0,0,0,0.06)',
            color: product.active ? '#4a7c59' : theme.textMuted, flexShrink: 0, marginLeft: '8px'
          }}>
            {product.active ? 'Active' : 'Inactive'}
          </span>
        </div>
        {product.type && (
          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>{product.type}</div>
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
          <button onClick={() => openProductForm(product)} style={{
            flex: 1, ...buttonStyle, backgroundColor: theme.accentBg,
            color: theme.accent, padding: '8px', fontSize: '12px'
          }}>
            <Pencil size={12} /> Edit
          </button>
          <button onClick={() => handleDeleteProduct(product)} style={{
            ...buttonStyle, backgroundColor: '#fef2f2', color: '#dc2626', padding: '8px 10px'
          }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ============ MAIN COMPONENT ============
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

  // Navigation state
  const [activeSection, setActiveSection] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [productGroups, setProductGroups] = useState([])
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)

  // Sections (stored in settings as product_sections JSON)
  const [sections, setSections] = useState([]) // [{name, image_url}]
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [editingSectionIndex, setEditingSectionIndex] = useState(null)
  const [sectionForm, setSectionForm] = useState({ name: '', image_url: '' })

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [groupForm, setGroupForm] = useState({
    name: '', service_type: '', description: '', image_url: '', icon: 'Package', sort_order: 0, active: true
  })

  // Product modal state
  const [showProductModal, setShowProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [productModalTab, setProductModalTab] = useState('overview')
  const [productForm, setProductForm] = useState({
    name: '', description: '', unit_price: '', cost: '', markup_percent: '',
    taxable: true, active: true, image_url: '', allotted_time_hours: '', group_id: null, type: '', labor_rate_id: '',
    manufacturer: '', model_number: '', product_category: '',
    dlc_listed: false, dlc_listing_number: '', warranty_years: '',
    spec_sheet_url: '', install_guide_url: '', datasheet_json: {}
  })
  const [uploadingDoc, setUploadingDoc] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)

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
  const [showImport, setShowImport] = useState(false)

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  if (!companyId) return null

  // Helpers
  const getInventoryCount = (productId) => {
    return inventory.filter(item => item.product_id === productId).reduce((sum, item) => sum + (item.quantity || 0), 0)
  }

  const defaultLaborRate = laborRates.find(r => r.is_default) || laborRates[0]

  const getLaborCost = (product) => {
    if (!product.allotted_time_hours) return 0
    const rate = product.labor_rate_id ? laborRates.find(r => r.id === product.labor_rate_id) : defaultLaborRate
    if (!rate) return 0
    return product.allotted_time_hours * rate.rate_per_hour * (rate.multiplier || 1)
  }

  const syncProductToInventory = async (productId, productName, isActive) => {
    if (!isActive) return
    const { data: existing } = await supabase.from('inventory').select('id').eq('company_id', companyId).eq('product_id', productId).single()
    if (!existing) {
      await supabase.from('inventory').insert({
        company_id: companyId, product_id: productId, name: productName,
        item_id: `PRD-${productId}`, inventory_type: 'Material', quantity: 0,
        min_quantity: 0, location: null, last_updated: new Date().toISOString()
      })
    }
  }

  const syncAllProductsToInventory = async () => {
    if (!products.length) return
    const activeProducts = products.filter(p => p.active)
    const productIds = activeProducts.map(p => p.id)
    const { data: existingInventory } = await supabase.from('inventory').select('product_id').eq('company_id', companyId).in('product_id', productIds)
    const existingProductIds = new Set((existingInventory || []).map(i => i.product_id))
    const productsNeedingInventory = activeProducts.filter(p => !existingProductIds.has(p.id))
    if (productsNeedingInventory.length > 0) {
      const inventoryRecords = productsNeedingInventory.map(p => ({
        company_id: companyId, product_id: p.id, name: p.name, item_id: `PRD-${p.id}`,
        inventory_type: 'Material', quantity: 0, min_quantity: 0, location: null,
        last_updated: new Date().toISOString()
      }))
      await supabase.from('inventory').insert(inventoryRecords)
      await fetchInventory()
    }
  }

  const formatCurrency = (amount) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Fetch data
  useEffect(() => {
    if (companyId) {
      fetchProductGroups()
      fetchSections()
      fetchProducts()
      fetchLaborRates()
    }
  }, [companyId])

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

  // ============ SECTION CRUD (stored in settings table) ============
  const fetchSections = async () => {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('company_id', companyId)
      .eq('key', 'product_sections')
      .single()
    if (data?.value) {
      try { setSections(JSON.parse(data.value)) } catch { setSections([]) }
    } else {
      // Bootstrap from existing service_types + group service_types
      const initial = []
      const seen = new Set()
      serviceTypes.forEach(t => { if (!seen.has(t)) { initial.push({ name: t, image_url: '' }); seen.add(t) } })
      productGroups.forEach(g => { if (g.service_type && !seen.has(g.service_type)) { initial.push({ name: g.service_type, image_url: '' }); seen.add(g.service_type) } })
      if (initial.length > 0) {
        await supabase.from('settings').insert({ company_id: companyId, key: 'product_sections', value: JSON.stringify(initial) })
        setSections(initial)
      }
    }
  }

  const saveSections = async (newSections) => {
    setSections(newSections)
    const { data: existing } = await supabase.from('settings').select('id').eq('company_id', companyId).eq('key', 'product_sections').single()
    if (existing) {
      await supabase.from('settings').update({ value: JSON.stringify(newSections), updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('settings').insert({ company_id: companyId, key: 'product_sections', value: JSON.stringify(newSections) })
    }
  }

  const openSectionForm = (index = null) => {
    if (index !== null && sections[index]) {
      setEditingSectionIndex(index)
      setSectionForm({ name: sections[index].name, image_url: sections[index].image_url || '' })
    } else {
      setEditingSectionIndex(null)
      setSectionForm({ name: '', image_url: '' })
    }
    setShowSectionModal(true)
  }

  const handleSaveSection = async () => {
    if (!sectionForm.name) { alert('Name is required'); return }
    setSaving(true)
    let updated
    if (editingSectionIndex !== null) {
      const oldName = sections[editingSectionIndex].name
      updated = sections.map((s, i) => i === editingSectionIndex ? { ...sectionForm } : s)
      // Update groups and products that referenced the old name
      if (oldName !== sectionForm.name) {
        await supabase.from('product_groups').update({ service_type: sectionForm.name }).eq('company_id', companyId).eq('service_type', oldName)
        await fetchProductGroups()
      }
    } else {
      updated = [...sections, { ...sectionForm }]
    }
    await saveSections(updated)
    setShowSectionModal(false)
    setEditingSectionIndex(null)
    setSaving(false)
  }

  const handleDeleteSection = async (index) => {
    const section = sections[index]
    if (!confirm(`Delete section "${section.name}"? Groups and items in this section will still exist but won't be in a section.`)) return
    const updated = sections.filter((_, i) => i !== index)
    await saveSections(updated)
    if (activeSection === section.name) { setActiveSection(null) }
  }

  const handleSectionImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${companyId}/sections/${Date.now()}.${fileExt}`
    const { error } = await supabase.storage.from('product-images').upload(fileName, file)
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName)
      setSectionForm(prev => ({ ...prev, image_url: publicUrl }))
    }
    setUploading(false)
  }

  // Build section names list from stored sections + any orphan groups
  const allSectionNames = (() => {
    const names = sections.map(s => s.name)
    const nameSet = new Set(names)
    // Include orphan group service_types not in stored sections
    productGroups.forEach(g => { if (g.service_type && !nameSet.has(g.service_type)) { names.push(g.service_type); nameSet.add(g.service_type) } })
    // Add "Other" if any products don't fuzzy-match any section
    const hasOrphans = products.some(p => {
      if (!p.type) return true
      return !names.some(s => productMatchesSection(p.type, s))
    })
    if (hasOrphans && products.length > 0 && !nameSet.has('Other')) names.push('Other')
    return names
  })()

  // Get section metadata (image) by name
  const getSectionMeta = (name) => sections.find(s => s.name === name) || { name, image_url: '' }

  // Fuzzy match: product type belongs to section if it contains the section name or vice versa
  function productMatchesSection(productType, section) {
    if (!productType || !section) return false
    if (section === 'Other') return false
    const pt = productType.toLowerCase()
    const st = section.toLowerCase()
    return pt === st || pt.includes(st) || st.includes(pt)
  }

  // Check if product belongs to a section (via group or fuzzy type match)
  function productInSection(p, section, grpIds) {
    if (p.group_id && grpIds.has(p.group_id)) return true
    if (section === 'Other') {
      // "Other" catches products whose type doesn't match any real section
      const realSections = allSectionNames.filter(s => s !== 'Other')
      return !realSections.some(s => {
        const sGrpIds = new Set(productGroups.filter(g => g.service_type === s).map(g => g.id))
        if (p.group_id && sGrpIds.has(p.group_id)) return true
        return productMatchesSection(p.type, s)
      })
    }
    return productMatchesSection(p.type, section)
  }

  // Derived data
  const sectionGroups = activeSection
    ? productGroups.filter(g => g.active && g.service_type === activeSection)
    : []

  const sectionGroupIds = new Set(sectionGroups.map(g => g.id))

  const sectionProducts = activeSection
    ? products.filter(p => productInSection(p, activeSection, sectionGroupIds))
    : products

  const filteredProducts = sectionProducts.filter(p => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    const haystack = `${p.name || ''} ${p.description || ''} ${p.type || ''} ${p.manufacturer || ''} ${p.model_number || ''}`.toLowerCase()
    return haystack.includes(q)
  })

  const groupProducts = selectedGroup
    ? products.filter(p => {
        if (p.group_id !== selectedGroup.id) return false
        if (searchQuery) {
          const q = searchQuery.toLowerCase()
          const haystack = `${p.name || ''} ${p.description || ''} ${p.type || ''} ${p.manufacturer || ''} ${p.model_number || ''}`.toLowerCase()
          return haystack.includes(q)
        }
        return true
      })
    : []

  const ungroupedProducts = filteredProducts.filter(p => !p.group_id || !sectionGroupIds.has(p.group_id))

  const getProductCount = (groupId) => products.filter(p => p.group_id === groupId).length
  const getSectionCount = (section) => {
    const grpIds = new Set(productGroups.filter(g => g.service_type === section).map(g => g.id))
    return products.filter(p => productInSection(p, section, grpIds)).length
  }

  // ============ GROUP CRUD ============
  const openGroupForm = (group = null) => {
    if (group) {
      setEditingGroup(group)
      setGroupForm({
        name: group.name || '', service_type: group.service_type || activeSection || serviceTypes[0] || '',
        description: group.description || '', image_url: group.image_url || '',
        icon: group.icon || 'Package', sort_order: group.sort_order || 0, active: group.active ?? true
      })
    } else {
      setEditingGroup(null)
      setGroupForm({
        name: '', service_type: activeSection || serviceTypes[0] || '', description: '',
        image_url: '', icon: 'Package', sort_order: 0, active: true
      })
    }
    setShowSettings(true)
  }

  const handleGroupChange = (e) => {
    const { name, value, type, checked } = e.target
    setGroupForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSaveGroup = async () => {
    if (!groupForm.name || !groupForm.service_type) {
      alert('Name and Service Type are required')
      return
    }
    setSaving(true)
    const payload = {
      company_id: companyId, ...groupForm,
      sort_order: parseInt(groupForm.sort_order) || 0,
      updated_at: new Date().toISOString()
    }
    let result
    if (editingGroup) {
      result = await supabase.from('product_groups').update(payload).eq('id', editingGroup.id).eq('company_id', companyId)
    } else {
      result = await supabase.from('product_groups').insert([payload])
    }
    if (result.error) {
      alert('Error saving group: ' + result.error.message)
    } else {
      await fetchProductGroups()
      setEditingGroup(null)
      setGroupForm({ name: '', service_type: activeSection || serviceTypes[0] || '', description: '', image_url: '', icon: 'Package', sort_order: 0, active: true })
    }
    setSaving(false)
  }

  const handleDeleteGroup = async (group) => {
    if (!confirm(`Delete group "${group.name}"? Items in this group will be ungrouped.`)) return
    await supabase.from('product_groups').delete().eq('id', group.id).eq('company_id', companyId)
    await fetchProductGroups()
    if (selectedGroup?.id === group.id) setSelectedGroup(null)
  }

  // ============ PRODUCT CRUD ============
  const openProductForm = (product = null) => {
    if (product) {
      setEditingProduct(product)
      setProductForm({
        name: product.name || '', description: product.description || '',
        unit_price: product.unit_price || '', cost: product.cost || '',
        markup_percent: product.markup_percent || '', taxable: product.taxable ?? true,
        active: product.active ?? true, image_url: product.image_url || '',
        allotted_time_hours: product.allotted_time_hours || '', group_id: product.group_id,
        type: product.type || activeSection || serviceTypes[0] || '', labor_rate_id: product.labor_rate_id || '',
        manufacturer: product.manufacturer || '', model_number: product.model_number || '',
        product_category: product.product_category || '', dlc_listed: product.dlc_listed ?? false,
        dlc_listing_number: product.dlc_listing_number || '', warranty_years: product.warranty_years || '',
        spec_sheet_url: product.spec_sheet_url || '', install_guide_url: product.install_guide_url || '',
        datasheet_json: product.datasheet_json || {}
      })
    } else {
      setEditingProduct(null)
      setProductForm({
        name: '', description: '', unit_price: '', cost: '', markup_percent: '',
        taxable: true, active: true, image_url: '', allotted_time_hours: '',
        group_id: selectedGroup?.id || null,
        type: activeSection || serviceTypes[0] || '',
        labor_rate_id: '',
        manufacturer: '', model_number: '', product_category: '',
        dlc_listed: false, dlc_listing_number: '', warranty_years: '',
        spec_sheet_url: '', install_guide_url: '', datasheet_json: {}
      })
    }
    setProductModalTab('overview')
    setShowProductModal(true)
  }

  const handleProductChange = (e) => {
    const { name, value, type, checked } = e.target
    setProductForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSaveProduct = async () => {
    if (!productForm.name) { alert('Product name is required'); return }
    setSaving(true)
    const payload = {
      company_id: companyId, name: productForm.name,
      description: productForm.description || null, type: productForm.type || null,
      unit_price: productForm.unit_price || null, cost: productForm.cost || null,
      markup_percent: productForm.markup_percent || null, taxable: productForm.taxable,
      active: productForm.active, image_url: productForm.image_url || null,
      allotted_time_hours: productForm.allotted_time_hours || null,
      group_id: productForm.group_id, labor_rate_id: productForm.labor_rate_id || null,
      manufacturer: productForm.manufacturer || null, model_number: productForm.model_number || null,
      product_category: productForm.product_category || null, dlc_listed: productForm.dlc_listed,
      dlc_listing_number: productForm.dlc_listing_number || null, warranty_years: productForm.warranty_years || null,
      spec_sheet_url: productForm.spec_sheet_url || null, install_guide_url: productForm.install_guide_url || null,
      datasheet_json: productForm.datasheet_json || {}, updated_at: new Date().toISOString()
    }
    let result, productId = editingProduct?.id
    if (editingProduct) {
      result = await supabase.from('products_services').update(payload).eq('id', editingProduct.id).eq('company_id', companyId)
    } else {
      result = await supabase.from('products_services').insert([payload]).select('id').single()
      if (result.data) productId = result.data.id
    }
    if (result.error) {
      alert('Error saving product: ' + result.error.message)
    } else {
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
    const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, file)
    if (uploadError) { console.error('Upload error:', uploadError); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName)
    if (isGroup) { setGroupForm(prev => ({ ...prev, image_url: publicUrl })) }
    else { setProductForm(prev => ({ ...prev, image_url: publicUrl })) }
    setUploading(false)
  }

  // Document upload
  const handleDocUpload = async (e, field) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingDoc(field)
    setUploadProgress(0)
    const itemId = editingProduct?.id || 'new'
    const fileName = `${companyId}/${itemId}/${Date.now()}-${file.name}`
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + 15, 85))
    }, 200)
    const { error: uploadError } = await supabase.storage.from('product-documents').upload(fileName, file, { upsert: true })
    clearInterval(progressInterval)
    if (uploadError) { console.error('Doc upload error:', uploadError); setUploadingDoc(null); setUploadProgress(0); return }
    setUploadProgress(100)
    const { data: { publicUrl } } = supabase.storage.from('product-documents').getPublicUrl(fileName)
    setProductForm(prev => ({ ...prev, [field]: publicUrl }))
    setTimeout(() => { setUploadingDoc(null); setUploadProgress(0) }, 500)
  }

  // Datasheet JSON helpers
  const addDatasheetEntry = () => {
    setProductForm(prev => ({ ...prev, datasheet_json: { ...prev.datasheet_json, '': '' } }))
  }
  const updateDatasheetKey = (oldKey, newKey) => {
    setProductForm(prev => {
      const updated = {}
      Object.entries(prev.datasheet_json).forEach(([k, v]) => { updated[k === oldKey ? newKey : k] = v })
      return { ...prev, datasheet_json: updated }
    })
  }
  const updateDatasheetValue = (key, newValue) => {
    setProductForm(prev => ({ ...prev, datasheet_json: { ...prev.datasheet_json, [key]: newValue } }))
  }
  const removeDatasheetEntry = (key) => {
    setProductForm(prev => {
      const copy = { ...prev.datasheet_json }
      delete copy[key]
      return { ...prev, datasheet_json: copy }
    })
  }

  // ============ LABOR RATE CRUD ============
  const openRateForm = (rate = null) => {
    if (rate) {
      setEditingRate(rate)
      setRateForm({
        name: rate.name || '', rate_per_hour: rate.rate_per_hour || '',
        description: rate.description || '', multiplier: rate.multiplier || '1.0',
        active: rate.active ?? true, is_default: rate.is_default ?? false
      })
    } else {
      setEditingRate(null)
      setRateForm({ name: '', rate_per_hour: '', description: '', multiplier: '1.0', active: true, is_default: laborRates.length === 0 })
    }
  }

  const handleRateChange = (e) => {
    const { name, value, type, checked } = e.target
    setRateForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSaveRate = async () => {
    if (!rateForm.name || !rateForm.rate_per_hour) { alert('Name and Rate per Hour are required'); return }
    setSaving(true)
    if (rateForm.is_default && !editingRate?.is_default) {
      await supabase.from('labor_rates').update({ is_default: false, updated_at: new Date().toISOString() }).eq('company_id', companyId).eq('is_default', true)
    }
    const payload = {
      company_id: companyId, name: rateForm.name,
      rate_per_hour: parseFloat(rateForm.rate_per_hour), description: rateForm.description || null,
      multiplier: parseFloat(rateForm.multiplier) || 1.0, active: rateForm.active,
      is_default: rateForm.is_default, updated_at: new Date().toISOString()
    }
    let result
    if (editingRate) {
      result = await supabase.from('labor_rates').update(payload).eq('id', editingRate.id).eq('company_id', companyId)
    } else {
      result = await supabase.from('labor_rates').insert([payload])
    }
    if (result.error) { alert('Error saving rate: ' + result.error.message) }
    else {
      await fetchLaborRates()
      setEditingRate(null)
      setRateForm({ name: '', rate_per_hour: '', description: '', multiplier: '1.0', active: true, is_default: false })
    }
    setSaving(false)
  }

  const handleDeleteRate = async (rate) => {
    if (laborRates.length === 1) { alert('Cannot delete the only labor rate.'); return }
    if (rate.is_default) { alert('Cannot delete the default rate. Set another as default first.'); return }
    if (!confirm(`Delete rate "${rate.name}"?`)) return
    await supabase.from('labor_rates').delete().eq('id', rate.id).eq('company_id', companyId)
    await fetchLaborRates()
  }

  const handleSetDefault = async (rate) => {
    if (rate.is_default) return
    setSaving(true)
    await supabase.from('labor_rates').update({ is_default: false, updated_at: new Date().toISOString() }).eq('company_id', companyId).eq('is_default', true)
    await supabase.from('labor_rates').update({ is_default: true, updated_at: new Date().toISOString() }).eq('id', rate.id).eq('company_id', companyId)
    await fetchLaborRates()
    setSaving(false)
  }

  const handleDeleteAllProducts = async () => {
    setDeletingAll(true)
    await supabase.from('inventory').delete().eq('company_id', companyId).in('product_id', products.map(p => p.id))
    const { error } = await supabase.from('products_services').delete().eq('company_id', companyId)
    if (error) { alert('Error deleting products: ' + error.message) }
    else { await fetchProducts(); await fetchInventory(); setShowDeleteAll(false) }
    setDeletingAll(false)
  }

  // Navigation helpers
  const goBack = () => {
    if (selectedGroup) { setSelectedGroup(null) }
    else if (activeSection) { setActiveSection(null); setSearchQuery('') }
  }

  const breadcrumb = () => {
    const parts = ['Products & Services']
    if (activeSection) parts.push(activeSection)
    if (selectedGroup) parts.push(selectedGroup.name)
    return parts
  }

  // Styles
  const inputStyle = {
    width: '100%', padding: isMobile ? '12px' : '10px 12px',
    minHeight: isMobile ? '44px' : 'auto', border: `1px solid ${theme.border}`,
    borderRadius: '8px', fontSize: '14px', color: theme.text, backgroundColor: theme.bgCard
  }
  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }
  const buttonStyle = {
    padding: isMobile ? '12px 16px' : '10px 16px', minHeight: isMobile ? '44px' : 'auto',
    border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
  }

  // ============ RENDER ============
  return (
    <div style={{ padding: isMobile ? '16px' : '24px', minHeight: '100vh', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between',
        gap: '16px', marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {(activeSection || selectedGroup) && (
            <button onClick={goBack} style={{
              ...buttonStyle, backgroundColor: 'transparent',
              border: `1px solid ${theme.border}`, color: theme.textSecondary,
              padding: isMobile ? '12px' : '8px'
            }}>
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {breadcrumb().map((part, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {i > 0 && <ChevronRight size={14} style={{ color: theme.textMuted }} />}
                  <span
                    style={{
                      fontSize: i === breadcrumb().length - 1 ? (isMobile ? '20px' : '24px') : '14px',
                      fontWeight: i === breadcrumb().length - 1 ? '700' : '500',
                      color: i === breadcrumb().length - 1 ? theme.text : theme.textMuted,
                      cursor: i < breadcrumb().length - 1 ? 'pointer' : 'default'
                    }}
                    onClick={() => {
                      if (i === 0) { setActiveSection(null); setSelectedGroup(null); setSearchQuery('') }
                      else if (i === 1 && selectedGroup) { setSelectedGroup(null) }
                    }}
                  >
                    {part}
                  </span>
                </span>
              ))}
            </div>
            {selectedGroup && (
              <p style={{ fontSize: '13px', color: theme.textMuted, margin: '4px 0 0' }}>
                {groupProducts.length} item{groupProducts.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {!activeSection && (
            <button onClick={() => openSectionForm()} style={{ ...buttonStyle, backgroundColor: theme.accent, color: '#fff' }}>
              <Plus size={18} />
              Add Section
            </button>
          )}
          {activeSection && (
            <button onClick={() => openProductForm()} style={{ ...buttonStyle, backgroundColor: theme.accent, color: '#fff' }}>
              <Plus size={18} />
              Add {'Item'}
            </button>
          )}
          {activeSection && !selectedGroup && (
            <button onClick={() => openGroupForm()} style={{ ...buttonStyle, backgroundColor: theme.accentBg, color: theme.accent }}>
              <Plus size={18} />
              Add Group
            </button>
          )}
          {activeSection && (
            <>
              <Tooltip text="Import from CSV or Excel">
                <button onClick={() => setShowImport(true)} style={{ ...buttonStyle, backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                  <FileSpreadsheet size={18} />
                  {!isMobile && 'Import'}
                </button>
              </Tooltip>
              <Tooltip text="Export to CSV">
                <button onClick={() => exportToCSV(filteredProducts, productsServicesFields, 'products_services_export')} style={{ ...buttonStyle, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
                  <Download size={18} />
                  {!isMobile && 'Export'}
                </button>
              </Tooltip>
            </>
          )}
          {isDeveloper && activeSection && (
            <Tooltip text="Delete all products">
              <button onClick={() => setShowDeleteAll(true)} style={{ ...buttonStyle, backgroundColor: '#fef2f2', color: '#dc2626' }}>
                <Trash2 size={18} />
              </button>
            </Tooltip>
          )}
          {activeSection && !selectedGroup && (
            <Tooltip text="Manage labor rates">
              <button onClick={() => { setShowLaborRates(!showLaborRates); setShowSettings(false) }} style={{
                ...buttonStyle,
                backgroundColor: showLaborRates ? '#8b5cf6' : 'rgba(139,92,246,0.12)',
                color: showLaborRates ? '#fff' : '#8b5cf6'
              }}>
                <DollarSign size={18} />
                {!isMobile && 'Rates'}
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Search Bar (only when inside a section) */}
      {activeSection && (
        <div style={{ position: 'relative', marginBottom: '20px' }}>
          <Search size={18} style={{
            position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
            color: searchQuery ? theme.accent : theme.textMuted, pointerEvents: 'none'
          }} />
          <input
            type="text"
            placeholder={`Search ${activeSection.toLowerCase()}...`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: isMobile ? '14px 42px' : '12px 42px',
              fontSize: '15px', border: `1px solid ${searchQuery ? theme.accent : theme.border}`,
              borderRadius: '12px', backgroundColor: theme.bgCard, color: theme.text,
              outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s'
            }}
            onFocus={e => e.target.style.borderColor = theme.accent}
            onBlur={e => { if (!searchQuery) e.target.style.borderColor = theme.border }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{
              position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px',
              display: 'flex', alignItems: 'center'
            }}>
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* ============ MAIN CONTENT ============ */}
      <div style={{ display: 'flex', gap: '24px' }}>
        <div style={{ flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px', color: theme.textMuted }}>Loading...</div>
          ) : !activeSection ? (
            // ============ SECTION TILES: Products & Services ============
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '20px'
            }}>
              {allSectionNames.map((section, sIdx) => {
                const count = getSectionCount(section)
                const groupCount = productGroups.filter(g => g.service_type === section && g.active).length
                const meta = getSectionMeta(section)
                const storedIndex = sections.findIndex(s => s.name === section)
                return (
                  <div
                    key={section}
                    style={{
                      backgroundColor: theme.bgCard,
                      borderRadius: '20px',
                      border: `1px solid ${theme.border}`,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.1)'
                      e.currentTarget.style.borderColor = theme.accent
                      e.currentTarget.style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = 'none'
                      e.currentTarget.style.borderColor = theme.border
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}
                  >
                    <div onClick={() => setActiveSection(section)} style={{ cursor: 'pointer' }}>
                      <div style={{
                        height: '140px',
                        backgroundColor: theme.accentBg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {meta.image_url ? (
                          <img src={meta.image_url} alt={section} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <Package size={56} style={{ color: theme.accent, opacity: 0.6 }} />
                        )}
                      </div>
                      <div style={{ padding: '20px' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: '700', color: theme.text, margin: '0 0 8px' }}>
                          {section}
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <span style={{ fontSize: '14px', color: theme.textSecondary }}>
                              {count} item{count !== 1 ? 's' : ''}
                            </span>
                            {groupCount > 0 && (
                              <span style={{ fontSize: '13px', color: theme.textMuted, marginLeft: '8px' }}>
                                • {groupCount} group{groupCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <ChevronRight size={20} style={{ color: theme.textMuted }} />
                        </div>
                      </div>
                    </div>
                    {/* Edit/Delete buttons on section card */}
                    {storedIndex !== -1 && (
                      <div style={{
                        position: 'absolute', top: '8px', right: '8px',
                        display: 'flex', gap: '4px'
                      }}>
                        <button onClick={(e) => { e.stopPropagation(); openSectionForm(storedIndex) }} style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          backgroundColor: 'rgba(255,255,255,0.9)', border: 'none',
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', color: theme.textMuted,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteSection(storedIndex) }} style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          backgroundColor: 'rgba(255,255,255,0.9)', border: 'none',
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', color: '#dc2626',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : selectedGroup ? (
            // ============ DRILL-DOWN: Items in selected group ============
            groupProducts.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '48px', backgroundColor: theme.bgCard,
                borderRadius: '12px', border: `1px solid ${theme.border}`
              }}>
                <Package size={48} style={{ color: theme.textMuted, opacity: 0.5, marginBottom: '16px' }} />
                <p style={{ color: theme.textSecondary, margin: 0 }}>
                  No items in this group yet. Add your first {activeSection === 'Services' ? 'service' : 'product'}.
                </p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: '16px'
              }}>
                {groupProducts.map(product => (
                  <ProductCard key={product.id} product={product} theme={theme} isMobile={isMobile}
                    formatCurrency={formatCurrency} openProductForm={openProductForm}
                    handleDeleteProduct={handleDeleteProduct} buttonStyle={buttonStyle}
                    inventoryCount={getInventoryCount(product.id)} laborCost={getLaborCost(product)} />
                ))}
              </div>
            )
          ) : (
            // ============ SECTION VIEW: Groups + Ungrouped items ============
            <div>
              {/* Groups */}
              {sectionGroups.length > 0 && (
                <div style={{ marginBottom: '32px' }}>
                  <h2 style={{ fontSize: '14px', fontWeight: '600', color: theme.textMuted, marginBottom: '16px', textTransform: 'uppercase' }}>
                    Groups
                  </h2>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '16px'
                  }}>
                    {sectionGroups.map(group => (
                      <div
                        key={group.id}
                        style={{
                          backgroundColor: theme.bgCard, borderRadius: '16px',
                          border: `1px solid ${theme.border}`, overflow: 'hidden',
                          cursor: 'pointer', transition: 'all 0.15s ease', position: 'relative'
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
                        <div onClick={() => setSelectedGroup(group)} style={{ cursor: 'pointer' }}>
                          <div style={{
                            height: isMobile ? '80px' : '100px',
                            backgroundColor: theme.accentBg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            {group.image_url ? (
                              <img src={group.image_url} alt={group.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <Boxes size={isMobile ? 32 : 40} style={{ color: theme.accent, opacity: 0.6 }} />
                            )}
                          </div>
                          <div style={{ padding: isMobile ? '10px' : '12px' }}>
                            <h3 style={{ fontSize: isMobile ? '13px' : '14px', fontWeight: '600', color: theme.text, margin: '0 0 4px 0' }}>
                              {group.name}
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '12px', color: theme.textMuted }}>
                                {getProductCount(group.id)} items
                              </span>
                              <ChevronRight size={14} style={{ color: theme.textMuted }} />
                            </div>
                          </div>
                        </div>
                        {/* Edit/Delete buttons on group card */}
                        <div style={{
                          position: 'absolute', top: '6px', right: '6px',
                          display: 'flex', gap: '4px'
                        }}>
                          <button onClick={(e) => { e.stopPropagation(); openGroupForm(group) }} style={{
                            width: '28px', height: '28px', borderRadius: '6px',
                            backgroundColor: 'rgba(255,255,255,0.9)', border: 'none',
                            cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', color: theme.textMuted
                          }}>
                            <Pencil size={12} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group) }} style={{
                            width: '28px', height: '28px', borderRadius: '6px',
                            backgroundColor: 'rgba(255,255,255,0.9)', border: 'none',
                            cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', color: '#dc2626'
                          }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ungrouped Items */}
              {ungroupedProducts.length > 0 && (
                <div>
                  {sectionGroups.length > 0 && (
                    <h2 style={{ fontSize: '14px', fontWeight: '600', color: theme.textMuted, marginBottom: '16px', textTransform: 'uppercase' }}>
                      Ungrouped
                    </h2>
                  )}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))',
                    gap: '16px'
                  }}>
                    {ungroupedProducts.map(product => (
                      <ProductCard key={product.id} product={product} theme={theme} isMobile={isMobile}
                        formatCurrency={formatCurrency} openProductForm={openProductForm}
                        handleDeleteProduct={handleDeleteProduct} buttonStyle={buttonStyle}
                        inventoryCount={getInventoryCount(product.id)} laborCost={getLaborCost(product)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {sectionGroups.length === 0 && ungroupedProducts.length === 0 && (
                <div style={{
                  textAlign: 'center', padding: '48px', backgroundColor: theme.bgCard,
                  borderRadius: '12px', border: `1px solid ${theme.border}`
                }}>
                  <Package size={48} style={{ color: theme.textMuted, opacity: 0.5, marginBottom: '16px' }} />
                  <p style={{ color: theme.textSecondary, margin: '0 0 16px' }}>
                    No {activeSection.toLowerCase()} yet. Start by creating a group or adding items directly.
                  </p>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button onClick={() => openGroupForm()} style={{ ...buttonStyle, backgroundColor: theme.accentBg, color: theme.accent }}>
                      <Plus size={16} /> Create Group
                    </button>
                    <button onClick={() => openProductForm()} style={{ ...buttonStyle, backgroundColor: theme.accent, color: '#fff' }}>
                      <Plus size={16} /> Add {'Item'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Labor Rates Panel (inline) */}
        {showLaborRates && activeSection && !selectedGroup && (
          <div style={{
            width: isMobile ? '100%' : '360px', backgroundColor: theme.bgCard,
            borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px',
            position: isMobile ? 'fixed' : 'relative', inset: isMobile ? '0' : 'auto',
            zIndex: isMobile ? 50 : 'auto', overflow: 'auto'
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input type="text" name="name" value={rateForm.name} onChange={handleRateChange} style={inputStyle} placeholder="e.g., Standard Rate" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Rate/Hour *</label>
                  <input type="number" name="rate_per_hour" value={rateForm.rate_per_hour} onChange={handleRateChange} step="0.01" style={inputStyle} placeholder="75.00" />
                </div>
                <div>
                  <label style={labelStyle}>Multiplier</label>
                  <input type="number" name="multiplier" value={rateForm.multiplier} onChange={handleRateChange} step="0.1" style={inputStyle} placeholder="1.0" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <input type="text" name="description" value={rateForm.description} onChange={handleRateChange} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '24px', padding: '8px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" name="active" checked={rateForm.active} onChange={handleRateChange} style={{ width: '18px', height: '18px', accentColor: theme.accent }} />
                  <span style={{ fontSize: '14px', color: theme.text }}>Active</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" name="is_default" checked={rateForm.is_default} onChange={handleRateChange} style={{ width: '18px', height: '18px', accentColor: '#8b5cf6' }} />
                  <span style={{ fontSize: '14px', color: theme.text }}>Default</span>
                </label>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {editingRate && (
                  <button onClick={() => { setEditingRate(null); setRateForm({ name: '', rate_per_hour: '', description: '', multiplier: '1.0', active: true, is_default: false }) }} style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
                    Cancel
                  </button>
                )}
                <button onClick={handleSaveRate} disabled={saving} style={{ ...buttonStyle, flex: 1, backgroundColor: '#8b5cf6', color: '#fff', opacity: saving ? 0.7 : 1 }}>
                  <Save size={16} /> {saving ? 'Saving...' : (editingRate ? 'Update' : 'Add Rate')}
                </button>
              </div>
            </div>
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: theme.textMuted, marginBottom: '12px', textTransform: 'uppercase' }}>Existing Rates</h3>
              {laborRates.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>No rates yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {laborRates.map(rate => (
                    <div key={rate.id} style={{
                      padding: '12px', backgroundColor: theme.bg, borderRadius: '8px',
                      border: rate.is_default ? '2px solid #8b5cf6' : 'none', opacity: rate.active ? 1 : 0.6
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>{rate.name}</span>
                        {rate.is_default && (
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px', backgroundColor: '#8b5cf6', color: '#fff', fontWeight: '600' }}>DEFAULT</span>
                        )}
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: '#8b5cf6' }}>
                        ${parseFloat(rate.rate_per_hour).toFixed(2)}/hr
                        {rate.multiplier && rate.multiplier !== 1 && <span style={{ fontSize: '12px', color: theme.textMuted, marginLeft: '6px' }}>x{rate.multiplier}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                        {!rate.is_default && (
                          <button onClick={() => handleSetDefault(rate)} style={{ flex: 1, ...buttonStyle, backgroundColor: 'rgba(139,92,246,0.12)', color: '#8b5cf6', padding: '6px', fontSize: '11px' }}>
                            Set Default
                          </button>
                        )}
                        <button onClick={() => openRateForm(rate)} style={{ ...buttonStyle, backgroundColor: theme.accentBg, color: theme.accent, padding: '6px 10px' }}>
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => handleDeleteRate(rate)} style={{ ...buttonStyle, backgroundColor: '#fef2f2', color: '#dc2626', padding: '6px 10px' }}>
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

      {/* ============ GROUP MODAL (draggable) ============ */}
      {showSettings && (
        <DraggableModal theme={theme} isMobile={isMobile} maxWidth="480px" onClose={() => { setShowSettings(false); setEditingGroup(null) }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: `1px solid ${theme.border}` }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
              {editingGroup ? 'Edit Group' : 'New Group'}
            </h2>
            <button onClick={() => { setShowSettings(false); setEditingGroup(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
              <X size={20} />
            </button>
          </div>
          <div style={{ padding: '20px', overflow: 'auto', maxHeight: '60vh' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input type="text" name="name" value={groupForm.name} onChange={handleGroupChange} style={inputStyle} placeholder="e.g., LED Panels" />
              </div>
              <div>
                <label style={labelStyle}>Service Type *</label>
                <select name="service_type" value={groupForm.service_type} onChange={handleGroupChange} style={inputStyle}>
                  {allSectionNames.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea name="description" value={groupForm.description} onChange={handleGroupChange} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div>
                <label style={labelStyle}>Image</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {groupForm.image_url ? (
                    <div style={{ position: 'relative' }}>
                      <img src={groupForm.image_url} alt="" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px' }} />
                      <button type="button" onClick={() => setGroupForm(prev => ({ ...prev, image_url: '' }))} style={{
                        position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px',
                        borderRadius: '50%', backgroundColor: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
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
                  <input type="url" name="image_url" value={groupForm.image_url} onChange={handleGroupChange} placeholder="Or paste URL..." style={{ ...inputStyle, flex: 1 }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Sort Order</label>
                  <input type="number" name="sort_order" value={groupForm.sort_order} onChange={handleGroupChange} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" name="active" checked={groupForm.active} onChange={handleGroupChange} style={{ width: '18px', height: '18px', accentColor: theme.accent }} />
                    <span style={{ fontSize: '14px', color: theme.text }}>Active</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', padding: '16px 20px', borderTop: `1px solid ${theme.border}` }}>
            <button onClick={() => { setShowSettings(false); setEditingGroup(null) }} style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
              Cancel
            </button>
            <button onClick={handleSaveGroup} disabled={saving} style={{ ...buttonStyle, flex: 1, backgroundColor: theme.accent, color: '#fff', opacity: saving ? 0.7 : 1 }}>
              <Save size={16} /> {saving ? 'Saving...' : (editingGroup ? 'Update' : 'Create Group')}
            </button>
          </div>
        </DraggableModal>
      )}

      {/* ============ SECTION MODAL (draggable) ============ */}
      {showSectionModal && (
        <DraggableModal theme={theme} isMobile={isMobile} maxWidth="420px" onClose={() => { setShowSectionModal(false); setEditingSectionIndex(null) }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: `1px solid ${theme.border}` }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
              {editingSectionIndex !== null ? 'Edit Section' : 'New Section'}
            </h2>
            <button onClick={() => { setShowSectionModal(false); setEditingSectionIndex(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
              <X size={20} />
            </button>
          </div>
          <div style={{ padding: '20px', overflow: 'auto', maxHeight: '60vh' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input
                  type="text"
                  value={sectionForm.name}
                  onChange={e => setSectionForm(prev => ({ ...prev, name: e.target.value }))}
                  style={inputStyle}
                  placeholder="e.g., Electrical, Plumbing"
                />
              </div>
              <div>
                <label style={labelStyle}>Image</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {sectionForm.image_url ? (
                    <div style={{ position: 'relative' }}>
                      <img src={sectionForm.image_url} alt="" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px' }} />
                      <button type="button" onClick={() => setSectionForm(prev => ({ ...prev, image_url: '' }))} style={{
                        position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px',
                        borderRadius: '50%', backgroundColor: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
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
                      <input type="file" accept="image/*" onChange={handleSectionImageUpload} style={{ display: 'none' }} />
                    </label>
                  )}
                  <input
                    type="url"
                    value={sectionForm.image_url}
                    onChange={e => setSectionForm(prev => ({ ...prev, image_url: e.target.value }))}
                    placeholder="Or paste URL..."
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', padding: '16px 20px', borderTop: `1px solid ${theme.border}` }}>
            <button onClick={() => { setShowSectionModal(false); setEditingSectionIndex(null) }} style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
              Cancel
            </button>
            <button onClick={handleSaveSection} disabled={saving} style={{ ...buttonStyle, flex: 1, backgroundColor: theme.accent, color: '#fff', opacity: saving ? 0.7 : 1 }}>
              <Save size={16} /> {saving ? 'Saving...' : (editingSectionIndex !== null ? 'Update' : 'Create Section')}
            </button>
          </div>
        </DraggableModal>
      )}

      {/* ============ PRODUCT MODAL (draggable, tabbed) ============ */}
      {showProductModal && (
        <DraggableModal theme={theme} isMobile={isMobile} maxWidth="600px" onClose={() => setShowProductModal(false)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: `1px solid ${theme.border}` }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
              {editingProduct ? 'Edit Product' : `Add ${'Item'}`}
            </h2>
            <button onClick={() => setShowProductModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
              <X size={20} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0', borderBottom: `1px solid ${theme.border}`, padding: '0 20px' }}>
            {[
              { key: 'overview', label: 'Overview', icon: Package },
              { key: 'specs', label: 'Specs', icon: FileText },
              { key: 'documents', label: 'Documents', icon: FileSpreadsheet }
            ].map(tab => (
              <button key={tab.key} onClick={() => setProductModalTab(tab.key)} style={{
                padding: '10px 16px', fontSize: '13px', fontWeight: '500',
                color: productModalTab === tab.key ? theme.accent : theme.textMuted,
                backgroundColor: 'transparent', border: 'none',
                borderBottom: productModalTab === tab.key ? `2px solid ${theme.accent}` : '2px solid transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '-1px'
              }}>
                <tab.icon size={14} /> {tab.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '20px', maxHeight: '55vh' }}>
            {/* OVERVIEW TAB */}
            {productModalTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Name *</label>
                  <input type="text" name="name" value={productForm.name} onChange={handleProductChange} style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Service Type</label>
                    <select name="type" value={productForm.type || ''} onChange={handleProductChange} style={inputStyle}>
                      {allSectionNames.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Group</label>
                    <select name="group_id" value={productForm.group_id || ''} onChange={(e) => setProductForm(prev => ({ ...prev, group_id: e.target.value ? parseInt(e.target.value) : null }))} style={inputStyle}>
                      <option value="">None (Ungrouped)</option>
                      {productGroups.filter(g => g.active && g.service_type === productForm.type).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
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
                    <select name="labor_rate_id" value={productForm.labor_rate_id || ''} onChange={(e) => setProductForm(prev => ({ ...prev, labor_rate_id: e.target.value ? parseInt(e.target.value) : null }))} style={inputStyle}>
                      <option value="">Use Default Rate</option>
                      {laborRates.filter(r => r.active).map(rate => (
                        <option key={rate.id} value={rate.id}>{rate.name} (${parseFloat(rate.rate_per_hour).toFixed(2)}/hr){rate.is_default ? ' - Default' : ''}</option>
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
                        <button type="button" onClick={() => setProductForm(prev => ({ ...prev, image_url: '' }))} style={{
                          position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px',
                          borderRadius: '50%', backgroundColor: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
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
                    <input type="url" name="image_url" value={productForm.image_url} onChange={handleProductChange} placeholder="Or paste URL..." style={{ ...inputStyle, flex: 1 }} />
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
            )}

            {/* SPECS TAB */}
            {productModalTab === 'specs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ padding: '12px 16px', backgroundColor: theme.bg, borderRadius: '8px', borderLeft: `3px solid ${theme.accent}` }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: theme.accent, textTransform: 'uppercase', marginBottom: '12px' }}>Product Info</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Manufacturer</label>
                      <input type="text" name="manufacturer" value={productForm.manufacturer} onChange={handleProductChange} style={inputStyle} placeholder="e.g., Philips" />
                    </div>
                    <div>
                      <label style={labelStyle}>Model Number</label>
                      <input type="text" name="model_number" value={productForm.model_number} onChange={handleProductChange} style={inputStyle} placeholder="e.g., PL-LED-4x2" />
                    </div>
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <label style={labelStyle}>Product Category</label>
                    <select name="product_category" value={productForm.product_category || ''} onChange={handleProductChange} style={inputStyle}>
                      <option value="">-- Select --</option>
                      {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ padding: '12px 16px', backgroundColor: theme.bg, borderRadius: '8px', borderLeft: '3px solid #22c55e' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e', textTransform: 'uppercase', marginBottom: '12px' }}>Certifications</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" name="dlc_listed" checked={productForm.dlc_listed} onChange={handleProductChange} style={{ width: '18px', height: '18px', accentColor: '#22c55e' }} />
                      <span style={{ fontSize: '14px', color: theme.text, fontWeight: '500' }}>DLC Listed</span>
                    </label>
                    {productForm.dlc_listed && <ShieldCheck size={18} style={{ color: '#22c55e' }} />}
                  </div>
                  {productForm.dlc_listed && (
                    <div style={{ marginBottom: '12px' }}>
                      <label style={labelStyle}>DLC Listing Number</label>
                      <input type="text" name="dlc_listing_number" value={productForm.dlc_listing_number} onChange={handleProductChange} style={inputStyle} placeholder="e.g., QUQH-43D4LBU4" />
                    </div>
                  )}
                  <div>
                    <label style={labelStyle}>Warranty (years)</label>
                    <input type="number" name="warranty_years" value={productForm.warranty_years} onChange={handleProductChange} step="1" min="0" style={{ ...inputStyle, maxWidth: '120px' }} placeholder="e.g., 5" />
                  </div>
                </div>
                <div style={{ padding: '12px 16px', backgroundColor: theme.bg, borderRadius: '8px', borderLeft: '3px solid #3b82f6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#3b82f6', textTransform: 'uppercase' }}>Datasheet Specs</div>
                    <button onClick={addDatasheetEntry} style={{ ...buttonStyle, padding: '4px 10px', fontSize: '12px', backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                      <PlusCircle size={14} /> Add
                    </button>
                  </div>
                  {Object.keys(productForm.datasheet_json || {}).length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>No datasheet specs yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {Object.entries(productForm.datasheet_json || {}).map(([key, value], idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input type="text" value={key} onChange={(e) => updateDatasheetKey(key, e.target.value)} placeholder="Key" style={{ ...inputStyle, flex: 1, fontSize: '13px', padding: '8px 10px' }} />
                          <input type="text" value={value} onChange={(e) => updateDatasheetValue(key, e.target.value)} placeholder="Value" style={{ ...inputStyle, flex: 1, fontSize: '13px', padding: '8px 10px' }} />
                          <button onClick={() => removeDatasheetEntry(key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px', flexShrink: 0 }}>
                            <MinusCircle size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DOCUMENTS TAB */}
            {productModalTab === 'documents' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Spec Sheet */}
                <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <FileText size={16} style={{ color: theme.accent }} />
                    <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Spec Sheet</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{
                      ...buttonStyle, padding: '8px 14px', fontSize: '13px',
                      backgroundColor: uploadingDoc === 'spec_sheet_url' ? theme.accentBg : theme.accent,
                      color: uploadingDoc === 'spec_sheet_url' ? theme.accent : '#fff',
                      cursor: uploadingDoc ? 'wait' : 'pointer'
                    }}>
                      <Upload size={14} /> {uploadingDoc === 'spec_sheet_url' ? 'Uploading...' : 'Upload'}
                      <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={(e) => handleDocUpload(e, 'spec_sheet_url')} disabled={!!uploadingDoc} style={{ display: 'none' }} />
                    </label>
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>or</span>
                    <input type="url" name="spec_sheet_url" value={productForm.spec_sheet_url} onChange={handleProductChange} placeholder="Paste URL..." style={{ ...inputStyle, flex: 1, fontSize: '13px' }} />
                  </div>
                  {uploadingDoc === 'spec_sheet_url' && (
                    <div style={{ height: '4px', backgroundColor: theme.border, borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
                      <div style={{ height: '100%', width: `${uploadProgress}%`, backgroundColor: theme.accent, borderRadius: '2px', transition: 'width 0.3s ease' }} />
                    </div>
                  )}
                  {productForm.spec_sheet_url && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: theme.bgCard, borderRadius: '6px', border: `1px solid ${theme.border}` }}>
                      <FileText size={14} style={{ color: theme.accent, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: theme.textSecondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {productForm.spec_sheet_url.split('/').pop()}
                      </span>
                      <a href={productForm.spec_sheet_url} target="_blank" rel="noopener noreferrer" style={{ ...buttonStyle, padding: '4px 10px', fontSize: '12px', backgroundColor: theme.accentBg, color: theme.accent, textDecoration: 'none' }}>
                        <ExternalLink size={12} /> Open
                      </a>
                      <button onClick={() => setProductForm(prev => ({ ...prev, spec_sheet_url: '' }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px' }}>
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
                {/* Install Guide */}
                <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <FileSpreadsheet size={16} style={{ color: '#3b82f6' }} />
                    <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Install Guide</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{
                      ...buttonStyle, padding: '8px 14px', fontSize: '13px',
                      backgroundColor: uploadingDoc === 'install_guide_url' ? 'rgba(59,130,246,0.12)' : '#3b82f6',
                      color: uploadingDoc === 'install_guide_url' ? '#3b82f6' : '#fff',
                      cursor: uploadingDoc ? 'wait' : 'pointer'
                    }}>
                      <Upload size={14} /> {uploadingDoc === 'install_guide_url' ? 'Uploading...' : 'Upload'}
                      <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={(e) => handleDocUpload(e, 'install_guide_url')} disabled={!!uploadingDoc} style={{ display: 'none' }} />
                    </label>
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>or</span>
                    <input type="url" name="install_guide_url" value={productForm.install_guide_url} onChange={handleProductChange} placeholder="Paste URL..." style={{ ...inputStyle, flex: 1, fontSize: '13px' }} />
                  </div>
                  {uploadingDoc === 'install_guide_url' && (
                    <div style={{ height: '4px', backgroundColor: theme.border, borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
                      <div style={{ height: '100%', width: `${uploadProgress}%`, backgroundColor: '#3b82f6', borderRadius: '2px', transition: 'width 0.3s ease' }} />
                    </div>
                  )}
                  {productForm.install_guide_url && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: theme.bgCard, borderRadius: '6px', border: `1px solid ${theme.border}` }}>
                      <FileSpreadsheet size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: theme.textSecondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {productForm.install_guide_url.split('/').pop()}
                      </span>
                      <a href={productForm.install_guide_url} target="_blank" rel="noopener noreferrer" style={{ ...buttonStyle, padding: '4px 10px', fontSize: '12px', backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6', textDecoration: 'none' }}>
                        <ExternalLink size={12} /> Open
                      </a>
                      <button onClick={() => setProductForm(prev => ({ ...prev, install_guide_url: '' }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px' }}>
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', padding: '16px 20px', borderTop: `1px solid ${theme.border}` }}>
            <button onClick={() => setShowProductModal(false)} style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
              Cancel
            </button>
            <button onClick={handleSaveProduct} disabled={saving} style={{ ...buttonStyle, flex: 1, backgroundColor: theme.accent, color: '#fff', opacity: saving ? 0.7 : 1 }}>
              <Save size={16} /> {saving ? 'Saving...' : (editingProduct ? 'Update' : 'Add')}
            </button>
          </div>
        </DraggableModal>
      )}

      {/* Delete All Confirmation */}
      {showDeleteAll && (
        <DraggableModal theme={theme} isMobile={isMobile} maxWidth="400px" onClose={() => setShowDeleteAll(false)}>
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <Trash2 size={36} style={{ color: '#dc2626', marginBottom: '12px' }} />
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '700', color: theme.text }}>Delete All?</h3>
            <p style={{ margin: '0 0 6px', fontSize: '14px', color: theme.textSecondary }}>
              This will permanently delete <strong>{products.length}</strong> item{products.length !== 1 ? 's' : ''}.
            </p>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#dc2626', fontWeight: '500' }}>This cannot be undone.</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowDeleteAll(false)} style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}>Cancel</button>
              <button onClick={handleDeleteAllProducts} disabled={deletingAll} style={{ ...buttonStyle, flex: 1, backgroundColor: '#dc2626', color: '#fff', opacity: deletingAll ? 0.7 : 1 }}>
                <Trash2 size={16} /> {deletingAll ? 'Deleting...' : `Delete All ${products.length}`}
              </button>
            </div>
          </div>
        </DraggableModal>
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportExportModal
          tableName="products_services"
          entityName="Products"
          fields={productsServicesFields}
          companyId={companyId}
          requiredField="name"
          defaultValues={{ company_id: companyId, taxable: true, active: true }}
          extraContext={serviceTypes?.length ? `Known service types: ${serviceTypes.join(', ')}` : ''}
          onImportComplete={() => fetchProducts()}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
