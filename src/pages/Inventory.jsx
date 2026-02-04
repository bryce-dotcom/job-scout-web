// ALWAYS READ JOBSCOUT_PROJECT_RULES.md BEFORE MAKING CHANGES
import { useState, useEffect, useRef } from 'react'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import {
  Package, Search, Plus, AlertTriangle, Minus, Check, X, Camera,
  Wrench, Droplets, Boxes, User, Hash, MapPin, ScanBarcode, Image as ImageIcon,
  Pencil, Trash2, Settings, ChevronRight, Upload
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

const TAB_CONFIG = {
  Material: { icon: Boxes, label: 'Materials', color: '#3b82f6' },
  Tool: { icon: Wrench, label: 'Tools & Equipment', color: '#8b5cf6' },
  Consumable: { icon: Droplets, label: 'Consumables', color: '#f59e0b' }
}

const CONDITION_COLORS = {
  'Good': { bg: '#d1fae5', text: '#059669' },
  'Fair': { bg: '#fef3c7', text: '#d97706' },
  'Poor': { bg: '#fee2e2', text: '#dc2626' },
  'Out of Service': { bg: '#f3f4f6', text: '#6b7280' }
}

export default function Inventory() {
  const companyId = useStore((state) => state.companyId)
  const inventory = useStore((state) => state.inventory)
  const products = useStore((state) => state.products)
  const employees = useStore((state) => state.employees)
  const inventoryLocations = useStore((state) => state.inventoryLocations)
  const fetchInventory = useStore((state) => state.fetchInventory)

  const [activeTab, setActiveTab] = useState('Material')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterLocation, setFilterLocation] = useState('all')
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(false)

  // Modal states
  const [showModal, setShowModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [showCameraModal, setShowCameraModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [adjustAmount, setAdjustAmount] = useState(0)
  const [adjustReason, setAdjustReason] = useState('')
  const [saving, setSaving] = useState(false)

  // Camera states
  const [cameraMode, setCameraMode] = useState('barcode') // 'barcode' or 'photo'
  const [cameraStream, setCameraStream] = useState(null)
  const [scannedBarcode, setScannedBarcode] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  // Form state
  const [formData, setFormData] = useState({
    item_id: '',
    name: '',
    inventory_type: 'Material',
    product_id: '',
    quantity: 0,
    min_quantity: 0,
    location: '',
    condition: 'Good',
    assigned_to: '',
    serial_number: '',
    barcode: '',
    image_url: '',
    ordering_trigger: '',
    group_id: ''
  })

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Audio context for click sound
  const audioContextRef = useRef(null)

  // Play click sound and haptic feedback
  const playClick = () => {
    // Haptic feedback (vibrate on mobile)
    if (navigator.vibrate) {
      navigator.vibrate(10)
    }

    // Audio click using Web Audio API
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }
      const ctx = audioContextRef.current
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.frequency.value = 1800
      oscillator.type = 'sine'
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)

      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.05)
    } catch (e) {
      // Silent fail if audio not supported
    }
  }

  // Guard clause
  if (!companyId) return null

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Fetch data on mount
  useEffect(() => {
    fetchInventory()
  }, [companyId])

  // Filter inventory by type and search
  const filteredInventory = inventory.filter(item => {
    // Type filter
    if ((item.inventory_type || 'Material') !== activeTab) return false

    // Search filter
    const searchLower = searchTerm.toLowerCase()
    if (searchTerm) {
      const matchName = item.name?.toLowerCase().includes(searchLower)
      const matchBarcode = item.barcode?.toLowerCase().includes(searchLower)
      const matchSerial = item.serial_number?.toLowerCase().includes(searchLower)
      if (!matchName && !matchBarcode && !matchSerial) return false
    }

    // Location filter
    if (filterLocation !== 'all' && item.location !== filterLocation) return false

    return true
  })

  // Get product groups for materials
  const productGroups = useStore((state) => state.products)
    .reduce((acc, p) => {
      if (p.group_id && !acc.find(g => g.id === p.group_id)) {
        acc.push({ id: p.group_id, name: p.product_group?.name || 'Unknown' })
      }
      return acc
    }, [])

  // Get low stock items
  const lowStockItems = inventory.filter(item =>
    item.quantity <= (item.min_quantity || 0) && item.min_quantity > 0
  )

  // Calculate total value for materials
  const totalMaterialValue = inventory
    .filter(item => (item.inventory_type || 'Material') === 'Material')
    .reduce((sum, item) => {
      const unitPrice = item.product?.unit_price || 0
      return sum + (item.quantity * unitPrice)
    }, 0)

  // Get stock color based on quantity vs min_quantity
  const getStockColor = (quantity, minQuantity) => {
    if (!minQuantity || minQuantity === 0) return '#22c55e' // green
    const ratio = quantity / minQuantity
    if (ratio <= 1) return '#ef4444' // red
    if (ratio <= 1.2) return '#eab308' // yellow
    return '#22c55e' // green
  }

  // Get unique locations from inventory + settings
  const allLocations = [...new Set([
    ...inventoryLocations,
    ...inventory.map(item => item.location).filter(Boolean)
  ])]

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0)
  }

  // Generate item ID
  const generateItemId = () => {
    const prefix = activeTab === 'Tool' ? 'TL' : activeTab === 'Consumable' ? 'CS' : 'MT'
    return `${prefix}-${Date.now().toString(36).toUpperCase()}`
  }

  // Open form for add/edit
  const openForm = (item = null) => {
    if (item) {
      setEditingItem(item)
      setFormData({
        item_id: item.item_id || '',
        name: item.name || '',
        inventory_type: item.inventory_type || 'Material',
        product_id: item.product_id || '',
        quantity: item.quantity || 0,
        min_quantity: item.min_quantity || 0,
        location: item.location || '',
        condition: item.condition || 'Good',
        assigned_to: item.assigned_to || '',
        serial_number: item.serial_number || '',
        barcode: item.barcode || '',
        image_url: item.image_url || '',
        ordering_trigger: item.ordering_trigger || '',
        group_id: item.group_id || ''
      })
    } else {
      setEditingItem(null)
      setFormData({
        item_id: '',
        name: '',
        inventory_type: activeTab,
        product_id: '',
        quantity: 0,
        min_quantity: 0,
        location: inventoryLocations[0] || '',
        condition: 'Good',
        assigned_to: '',
        serial_number: '',
        barcode: '',
        image_url: '',
        ordering_trigger: '',
        group_id: ''
      })
    }
    setShowModal(true)
  }

  // Handle form submit
  const handleSubmit = async () => {
    if (!formData.name) {
      alert('Item name is required')
      return
    }

    setSaving(true)
    const payload = {
      company_id: companyId,
      item_id: formData.item_id || generateItemId(),
      name: formData.name,
      inventory_type: formData.inventory_type,
      product_id: formData.product_id || null,
      quantity: parseInt(formData.quantity) || 0,
      min_quantity: parseInt(formData.min_quantity) || 0,
      location: formData.location || null,
      condition: formData.condition || 'Good',
      assigned_to: formData.assigned_to || null,
      serial_number: formData.serial_number || null,
      barcode: formData.barcode || null,
      image_url: formData.image_url || null,
      ordering_trigger: formData.ordering_trigger || null,
      group_id: formData.group_id || null,
      last_updated: new Date().toISOString()
    }

    let result
    if (editingItem) {
      result = await supabase
        .from('inventory')
        .update(payload)
        .eq('id', editingItem.id)
        .eq('company_id', companyId)
    } else {
      result = await supabase
        .from('inventory')
        .insert([payload])
    }

    if (result.error) {
      alert('Error: ' + result.error.message)
    } else {
      setShowModal(false)
      setEditingItem(null)
      fetchInventory()
    }
    setSaving(false)
  }

  // Handle delete
  const handleDelete = async (item) => {
    if (!confirm(`Delete "${item.name}"?`)) return
    await supabase.from('inventory').delete().eq('id', item.id).eq('company_id', companyId)
    fetchInventory()
  }

  // Handle quantity adjustment
  const handleAdjust = async () => {
    if (!selectedItem || adjustAmount === 0) return

    setSaving(true)
    const newQuantity = Math.max(0, selectedItem.quantity + adjustAmount)

    const { error } = await supabase
      .from('inventory')
      .update({
        quantity: newQuantity,
        last_updated: new Date().toISOString()
      })
      .eq('id', selectedItem.id)

    if (error) {
      alert('Error: ' + error.message)
    } else {
      // TODO: Log adjustment reason
      setShowAdjustModal(false)
      setSelectedItem(null)
      setAdjustAmount(0)
      setAdjustReason('')
      fetchInventory()
    }
    setSaving(false)
  }

  // Camera functions
  const startCamera = async (mode) => {
    setCameraMode(mode)
    setShowCameraModal(true)
    setScannedBarcode(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
      setCameraStream(stream)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      if (mode === 'barcode') {
        startBarcodeDetection(stream)
      }
    } catch (err) {
      console.error('Camera error:', err)
      alert('Could not access camera')
      setShowCameraModal(false)
    }
  }

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop())
      setCameraStream(null)
    }
    setShowCameraModal(false)
  }

  const startBarcodeDetection = async (stream) => {
    if (!('BarcodeDetector' in window)) {
      alert('Barcode detection is not supported in this browser')
      return
    }

    const barcodeDetector = new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e']
    })

    const detectBarcode = async () => {
      if (!videoRef.current || !cameraStream) return

      try {
        const barcodes = await barcodeDetector.detect(videoRef.current)
        if (barcodes.length > 0) {
          setScannedBarcode(barcodes[0].rawValue)
          stopCamera()

          // Look up item by barcode
          const existingItem = inventory.find(i => i.barcode === barcodes[0].rawValue)
          if (existingItem) {
            openForm(existingItem)
          } else {
            setFormData(prev => ({ ...prev, barcode: barcodes[0].rawValue }))
            setShowModal(true)
          }
          return
        }
      } catch (err) {
        // Silent error
      }

      if (cameraStream) {
        requestAnimationFrame(detectBarcode)
      }
    }

    detectBarcode()
  }

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)

    const imageData = canvas.toDataURL('image/jpeg', 0.8)
    stopCamera()

    // TODO: Send to Claude API for identification
    alert('Photo captured! Claude API integration coming soon for item identification.')
  }

  // Image upload
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const fileExt = file.name.split('.').pop()
    const fileName = `inventory/${companyId}/${Date.now()}.${fileExt}`

    const { error } = await supabase.storage
      .from('product-images')
      .upload(fileName, file)

    if (error) {
      console.error('Upload error:', error)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName)

    setFormData(prev => ({ ...prev, image_url: publicUrl }))
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

  // Render inventory card based on type
  const renderCard = (item) => {
    const stockColor = getStockColor(item.quantity, item.min_quantity)

    if (activeTab === 'Tool') {
      return (
        <div
          key={item.id}
          style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            overflow: 'hidden'
          }}
        >
          {/* Image */}
          <div style={{
            height: '120px',
            backgroundColor: theme.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {item.image_url ? (
              <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Wrench size={40} style={{ color: theme.textMuted, opacity: 0.4 }} />
            )}
          </div>

          <div style={{ padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: 0 }}>{item.name}</h3>
              <span style={{
                fontSize: '10px',
                padding: '3px 8px',
                borderRadius: '10px',
                ...CONDITION_COLORS[item.condition || 'Good']
              }}>
                {item.condition || 'Good'}
              </span>
            </div>

            {item.serial_number && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: theme.textMuted, marginBottom: '6px' }}>
                <Hash size={12} />
                {item.serial_number}
              </div>
            )}

            {item.assigned_employee && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: theme.textSecondary, marginBottom: '8px' }}>
                <User size={12} />
                {item.assigned_employee.name}
              </div>
            )}

            {item.location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: theme.textMuted }}>
                <MapPin size={11} />
                {item.location}
              </div>
            )}

            <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
              <button onClick={() => openForm(item)} style={{ ...buttonStyle, flex: 1, backgroundColor: theme.accentBg, color: theme.accent, padding: '8px' }}>
                <Pencil size={12} /> Edit
              </button>
              <button onClick={() => handleDelete(item)} style={{ ...buttonStyle, backgroundColor: '#fef2f2', color: '#dc2626', padding: '8px 10px' }}>
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>
      )
    }

    if (activeTab === 'Consumable') {
      const needsReorder = item.quantity <= (item.min_quantity || 0) && item.min_quantity > 0
      return (
        <div
          key={item.id}
          style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `2px solid ${needsReorder ? '#ef4444' : theme.border}`,
            overflow: 'hidden'
          }}
        >
          {/* Image */}
          <div style={{
            height: '100px',
            backgroundColor: theme.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}>
            {item.image_url ? (
              <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Droplets size={36} style={{ color: theme.textMuted, opacity: 0.4 }} />
            )}
            {needsReorder && (
              <div style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                backgroundColor: '#ef4444',
                color: '#fff',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '10px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <AlertTriangle size={10} /> REORDER
              </div>
            )}
          </div>

          <div style={{ padding: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '0 0 8px 0' }}>{item.name}</h3>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px',
              backgroundColor: theme.accentBg,
              borderRadius: '8px',
              marginBottom: '8px'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>Qty</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: stockColor }}>{item.quantity}</div>
              </div>
              <div style={{ borderLeft: `1px solid ${theme.border}`, paddingLeft: '8px' }}>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>Min</div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: theme.textSecondary }}>{item.min_quantity || 0}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => { setSelectedItem(item); setAdjustAmount(0); setShowAdjustModal(true) }}
                style={{ ...buttonStyle, flex: 1, backgroundColor: theme.accent, color: '#fff', padding: '8px' }}
              >
                Adjust
              </button>
              <button onClick={() => openForm(item)} style={{ ...buttonStyle, backgroundColor: theme.accentBg, color: theme.accent, padding: '8px 10px' }}>
                <Pencil size={12} />
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Material card (default)
    return (
      <div
        key={item.id}
        style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          overflow: 'hidden'
        }}
      >
        {/* Image */}
        <div style={{
          height: '100px',
          backgroundColor: theme.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}>
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Package size={36} style={{ color: theme.textMuted, opacity: 0.4 }} />
          )}
          {/* Stock badge */}
          <div style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            backgroundColor: stockColor,
            color: '#fff',
            padding: '4px 10px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600'
          }}>
            {item.quantity}
          </div>
        </div>

        <div style={{ padding: '12px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '0 0 4px 0' }}>{item.name}</h3>

          {item.product && (
            <div style={{ fontSize: '12px', color: theme.accent, marginBottom: '6px' }}>
              {formatCurrency(item.product.unit_price)} each
            </div>
          )}

          {item.location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>
              <MapPin size={11} />
              {item.location}
            </div>
          )}

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => { setSelectedItem(item); setAdjustAmount(0); setShowAdjustModal(true) }}
              style={{ ...buttonStyle, flex: 1, backgroundColor: theme.accent, color: '#fff', padding: '8px', fontSize: '12px' }}
            >
              <Plus size={12} /> <Minus size={12} />
            </button>
            <button onClick={() => openForm(item)} style={{ ...buttonStyle, backgroundColor: theme.accentBg, color: theme.accent, padding: '8px 10px' }}>
              <Pencil size={12} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', minHeight: '100vh' }}>
      {/* Low Stock Alert Banner */}
      {lowStockItems.length > 0 && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <AlertTriangle size={20} style={{ color: '#dc2626', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#dc2626' }}>
              {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''} low on stock
            </div>
            <div style={{ fontSize: '12px', color: '#991b1b' }}>
              {lowStockItems.slice(0, 3).map(i => i.name).join(', ')}{lowStockItems.length > 3 ? ` +${lowStockItems.length - 3} more` : ''}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Package size={28} style={{ color: theme.accent }} />
          <div>
            <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
              Inventory
            </h1>
            {activeTab === 'Material' && (
              <div style={{ fontSize: '13px', color: theme.textMuted }}>
                Total Value: {formatCurrency(totalMaterialValue)}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <Tooltip text="Scan barcode">
            <button
              onClick={() => startCamera('barcode')}
              style={{ ...buttonStyle, backgroundColor: theme.accentBg, color: theme.accent }}
            >
              <ScanBarcode size={18} />
            </button>
          </Tooltip>
          <Tooltip text="Take photo">
            <button
              onClick={() => startCamera('photo')}
              style={{ ...buttonStyle, backgroundColor: theme.accentBg, color: theme.accent }}
            >
              <Camera size={18} />
            </button>
          </Tooltip>
          <button
            onClick={() => openForm()}
            style={{ ...buttonStyle, backgroundColor: theme.accent, color: '#fff' }}
          >
            <Plus size={18} />
            Add Item
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '20px',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: '4px'
      }}>
        {Object.entries(TAB_CONFIG).map(([type, config]) => {
          const Icon = config.icon
          const count = inventory.filter(i => (i.inventory_type || 'Material') === type).length
          return (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              style={{
                ...buttonStyle,
                backgroundColor: activeTab === type ? config.color : 'transparent',
                color: activeTab === type ? '#fff' : theme.textSecondary,
                border: activeTab === type ? 'none' : `1px solid ${theme.border}`,
                whiteSpace: 'nowrap',
                gap: '6px'
              }}
            >
              <Icon size={16} />
              {config.label}
              <span style={{
                backgroundColor: activeTab === type ? 'rgba(255,255,255,0.2)' : theme.accentBg,
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '12px'
              }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '20px',
        flexWrap: 'wrap'
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
            placeholder="Search by name, barcode, serial..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, paddingLeft: '40px' }}
          />
        </div>

        <select
          value={filterLocation}
          onChange={(e) => setFilterLocation(e.target.value)}
          style={{ ...inputStyle, minWidth: '150px', flex: 'none' }}
        >
          <option value="all">All Locations</option>
          {allLocations.map(loc => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>
      </div>

      {/* Inventory Grid */}
      {filteredInventory.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          {TAB_CONFIG[activeTab] && (
            <>
              {(() => { const Icon = TAB_CONFIG[activeTab].icon; return <Icon size={48} style={{ color: theme.textMuted, opacity: 0.5, marginBottom: '16px' }} /> })()}
            </>
          )}
          <p style={{ color: theme.textSecondary, margin: 0 }}>
            No {TAB_CONFIG[activeTab]?.label.toLowerCase()} found. Click "Add Item" to get started.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '16px'
        }}>
          {filteredInventory.map(renderCard)}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <>
          <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 }} />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            width: '100%',
            maxWidth: isMobile ? '95%' : '500px',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 51
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
                {editingItem ? 'Edit Item' : 'Add Item'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Item Type */}
                <div>
                  <label style={labelStyle}>Item Type</label>
                  <select
                    value={formData.inventory_type}
                    onChange={(e) => setFormData({ ...formData, inventory_type: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="Material">Material</option>
                    <option value="Tool">Tool / Equipment</option>
                    <option value="Consumable">Consumable</option>
                  </select>
                </div>

                {/* Name */}
                <div>
                  <label style={labelStyle}>Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                {/* ID and Location */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Item ID</label>
                    <input
                      type="text"
                      value={formData.item_id}
                      onChange={(e) => setFormData({ ...formData, item_id: e.target.value })}
                      placeholder={generateItemId()}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Location</label>
                    <select
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="">-- Select --</option>
                      {allLocations.map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Quantity fields (for Material and Consumable) */}
                {formData.inventory_type !== 'Tool' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Quantity</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Min Quantity</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.min_quantity}
                        onChange={(e) => setFormData({ ...formData, min_quantity: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                )}

                {/* Tool-specific fields */}
                {formData.inventory_type === 'Tool' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={labelStyle}>Condition</label>
                        <select
                          value={formData.condition}
                          onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                          style={inputStyle}
                        >
                          <option value="Good">Good</option>
                          <option value="Fair">Fair</option>
                          <option value="Poor">Poor</option>
                          <option value="Out of Service">Out of Service</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Assigned To</label>
                        <select
                          value={formData.assigned_to}
                          onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                          style={inputStyle}
                        >
                          <option value="">Unassigned</option>
                          {employees.filter(e => e.active).map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Serial Number</label>
                      <input
                        type="text"
                        value={formData.serial_number}
                        onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                  </>
                )}

                {/* Barcode */}
                <div>
                  <label style={labelStyle}>Barcode</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => startCamera('barcode')}
                      style={{ ...buttonStyle, backgroundColor: theme.accentBg, color: theme.accent }}
                    >
                      <ScanBarcode size={18} />
                    </button>
                  </div>
                </div>

                {/* Image */}
                <div>
                  <label style={labelStyle}>Image</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {formData.image_url ? (
                      <div style={{ position: 'relative' }}>
                        <img src={formData.image_url} alt="" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px' }} />
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, image_url: '' })}
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
                        <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                      </label>
                    )}
                    <input
                      type="url"
                      value={formData.image_url}
                      onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                      placeholder="Or paste image URL..."
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  </div>
                </div>

                {/* Link to Product (Material only) */}
                {formData.inventory_type === 'Material' && (
                  <div>
                    <label style={labelStyle}>Link to Product</label>
                    <select
                      value={formData.product_id}
                      onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                      style={inputStyle}
                    >
                      <option value="">No linked product</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.unit_price)})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Reorder Note */}
                {formData.inventory_type !== 'Tool' && (
                  <div>
                    <label style={labelStyle}>Reorder Note</label>
                    <input
                      type="text"
                      value={formData.ordering_trigger}
                      onChange={(e) => setFormData({ ...formData, ordering_trigger: e.target.value })}
                      placeholder="e.g., Contact supplier ABC"
                      style={inputStyle}
                    />
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', padding: '16px 20px', borderTop: `1px solid ${theme.border}` }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                style={{ ...buttonStyle, flex: 1, backgroundColor: theme.accent, color: '#fff', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Saving...' : (editingItem ? 'Update' : 'Add Item')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Quantity Adjust Modal */}
      {showAdjustModal && selectedItem && (
        <>
          <div onClick={() => { setShowAdjustModal(false); setSelectedItem(null) }} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 }} />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: isMobile ? '95%' : '400px',
            zIndex: 51
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: '0 0 8px 0' }}>
              Adjust Quantity
            </h2>
            <p style={{ fontSize: '14px', color: theme.textSecondary, margin: '0 0 20px 0' }}>
              {selectedItem.name}
            </p>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              padding: '20px',
              backgroundColor: theme.accentBg,
              borderRadius: '12px',
              marginBottom: '16px'
            }}>
              <button
                onClick={() => { playClick(); setAdjustAmount(adjustAmount - 1) }}
                style={{
                  width: '52px', height: '52px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '10px',
                  fontSize: '20px', cursor: 'pointer'
                }}
              >
                <Minus size={24} />
              </button>

              <div style={{ textAlign: 'center', minWidth: '120px' }}>
                <div style={{ fontSize: '12px', color: theme.textMuted }}>Current: {selectedItem.quantity}</div>
                <div style={{
                  fontSize: '36px', fontWeight: '700',
                  color: adjustAmount >= 0 ? '#22c55e' : '#ef4444'
                }}>
                  {adjustAmount >= 0 ? '+' : ''}{adjustAmount}
                </div>
                <div style={{ fontSize: '14px', color: theme.textSecondary }}>
                  New: {Math.max(0, selectedItem.quantity + adjustAmount)}
                </div>
              </div>

              <button
                onClick={() => { playClick(); setAdjustAmount(adjustAmount + 1) }}
                style={{
                  width: '52px', height: '52px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '10px',
                  fontSize: '20px', cursor: 'pointer'
                }}
              >
                <Plus size={24} />
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Reason (optional)</label>
              <input
                type="text"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="e.g., Used on job, Restocked, Damaged"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { setShowAdjustModal(false); setSelectedItem(null); setAdjustAmount(0); setAdjustReason('') }}
                style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}
              >
                Cancel
              </button>
              <button
                onClick={handleAdjust}
                disabled={adjustAmount === 0 || saving}
                style={{
                  ...buttonStyle, flex: 1,
                  backgroundColor: adjustAmount === 0 ? theme.border : theme.accent,
                  color: '#fff',
                  cursor: adjustAmount === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Camera Modal */}
      {showCameraModal && (
        <>
          <div onClick={stopCamera} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 50 }} />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '100%',
            maxWidth: '500px',
            zIndex: 51
          }}>
            <div style={{
              backgroundColor: '#000',
              borderRadius: '16px',
              overflow: 'hidden'
            }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{ width: '100%', display: 'block' }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              <div style={{
                padding: '16px',
                display: 'flex',
                justifyContent: 'center',
                gap: '16px',
                backgroundColor: 'rgba(0,0,0,0.8)'
              }}>
                {cameraMode === 'barcode' ? (
                  <div style={{ color: '#fff', textAlign: 'center' }}>
                    <ScanBarcode size={24} style={{ marginBottom: '8px' }} />
                    <div style={{ fontSize: '14px' }}>Point camera at barcode</div>
                  </div>
                ) : (
                  <button
                    onClick={capturePhoto}
                    style={{
                      width: '64px', height: '64px',
                      borderRadius: '50%',
                      backgroundColor: '#fff',
                      border: '4px solid #ccc',
                      cursor: 'pointer'
                    }}
                  />
                )}
              </div>
            </div>

            <button
              onClick={stopCamera}
              style={{
                position: 'absolute', top: '-50px', right: '0',
                backgroundColor: 'transparent', border: 'none', color: '#fff', cursor: 'pointer'
              }}
            >
              <X size={32} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
