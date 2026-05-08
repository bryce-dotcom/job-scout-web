import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from './Layout'
import {
  X, Search, Package, Boxes, Wrench, Zap, Droplets, Leaf, ShoppingBag, Grid3X3, Clock
} from 'lucide-react'
import { matchAllTokens, buildBlob } from '../lib/searchUtils'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
}

const SERVICE_ICONS = {
  'Energy Efficiency': Zap,
  'Electrical': Zap,
  'Exterior Cleaning': Droplets,
  'Exterior Cleaning & Maint': Droplets,
  'Window Cleaning': Droplets,
  'Landscaping': Leaf,
  'Lawn Care': Leaf,
  'Retail': ShoppingBag,
  'General': Grid3X3,
}

const ROW_LIMIT = 200

/**
 * ProductPickerModal — search + filter product catalog
 *
 * @param {boolean} isOpen
 * @param {function} onClose
 * @param {function} onSelect — receives (product, laborCost, totalPrice)
 * @param {number[]} [recentProductIds] — product ids already on this estimate; surface as "Recents"
 */
export default function ProductPickerModal({ isOpen, onClose, onSelect, recentProductIds = [] }) {
  const companyId = useStore((s) => s.companyId)
  const products = useStore((s) => s.products)
  const serviceTypes = useStore((s) => s.serviceTypes)
  const laborRates = useStore((s) => s.laborRates)
  const inventory = useStore((s) => s.inventory)
  const productComponents = useStore((s) => s.productComponents)

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const [productGroups, setProductGroups] = useState([])
  const [search, setSearch] = useState('')
  const [serviceFilter, setServiceFilter] = useState(null)   // null = all
  const [groupFilter, setGroupFilter] = useState(null)       // null = all
  const [confirmProduct, setConfirmProduct] = useState(null)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)

  const searchRef = useRef(null)
  const listRef = useRef(null)
  const rowRefs = useRef({})

  // Mobile detect
  useEffect(() => {
    const cb = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', cb)
    return () => window.removeEventListener('resize', cb)
  }, [])

  // On open: reset state, autofocus search
  useEffect(() => {
    if (isOpen && companyId) {
      fetchGroups()
      setSearch('')
      setServiceFilter(null)
      setGroupFilter(null)
      setHighlightIdx(0)
      setConfirmProduct(null)
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [isOpen, companyId])

  const fetchGroups = async () => {
    const { data } = await supabase.from('product_groups').select('*').eq('company_id', companyId).order('name')
    setProductGroups(data || [])
  }

  const calculateLaborCost = (product) => {
    if (!product.allotted_time_hours) return 0
    let rate = product.labor_rate_id ? laborRates.find((r) => r.id === product.labor_rate_id) : null
    if (!rate) rate = laborRates.find((r) => r.is_default)
    return rate ? product.allotted_time_hours * (rate.rate_per_hour || 0) * (rate.multiplier || 1) : 0
  }

  // null = product doesn't track inventory; number = stock count
  const getInventoryCount = (productId) => {
    const inv = inventory.find((i) => i.product_id === productId)
    return inv ? (inv.quantity ?? 0) : null
  }

  const getComponentCount = (productId) =>
    productComponents.filter((pc) => pc.parent_product_id === productId).length

  const activeProducts = useMemo(() => products.filter((p) => p.active !== false), [products])

  // Service type lives on product_groups, not on products. Derive each
  // product's service type via its group_id.
  const groupServiceById = useMemo(() => {
    const m = {}
    productGroups.forEach((g) => { m[g.id] = g.service_type })
    return m
  }, [productGroups])

  const productServiceType = (p) => groupServiceById[p.group_id] || null

  const serviceTypeCounts = useMemo(() => {
    const m = {}
    activeProducts.forEach((p) => {
      const k = productServiceType(p)
      if (k) m[k] = (m[k] || 0) + 1
    })
    return m
  }, [activeProducts, groupServiceById])

  // Build the list of service-type chips from what's actually on groups,
  // plus any names declared in the company's settings list.
  const chipServiceTypes = useMemo(() => {
    const seen = new Set()
    const out = []
    serviceTypes.forEach((t) => { if (!seen.has(t)) { seen.add(t); out.push(t) } })
    productGroups.forEach((g) => {
      if (g.service_type && !seen.has(g.service_type)) { seen.add(g.service_type); out.push(g.service_type) }
    })
    return out
  }, [serviceTypes, productGroups])

  const groupsForFilter = useMemo(() => {
    if (!serviceFilter) return []
    return productGroups.filter((g) => g.service_type === serviceFilter)
  }, [productGroups, serviceFilter])

  const filteredProducts = useMemo(() => {
    let list = activeProducts
    if (serviceFilter) list = list.filter((p) => productServiceType(p) === serviceFilter)
    if (groupFilter !== null) list = list.filter((p) => p.group_id === groupFilter)
    if (search.trim()) {
      list = list.filter((p) =>
        matchAllTokens(buildBlob(p.name, p.description, p.sku, p.product_category, productServiceType(p)), search)
      )
    }
    return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [activeProducts, serviceFilter, groupFilter, search, groupServiceById])

  // Recents — surface above results when there's no active search
  const recents = useMemo(() => {
    if (search.trim() || !recentProductIds?.length) return []
    const seen = new Set()
    return recentProductIds
      .filter((id) => {
        if (!id || seen.has(id)) return false
        seen.add(id)
        return true
      })
      .map((id) => activeProducts.find((p) => p.id === id))
      .filter(Boolean)
      .slice(0, 5)
  }, [search, recentProductIds, activeProducts])

  // Reset highlight when filter pipeline changes
  useEffect(() => { setHighlightIdx(0) }, [search, serviceFilter, groupFilter])

  // Keep highlight row scrolled into view
  useEffect(() => {
    const row = rowRefs.current[highlightIdx]
    if (row) row.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  const handleSelect = (product) => {
    const labor = calculateLaborCost(product)
    if (labor > 0) {
      setConfirmProduct(product)
    } else {
      onSelect(product, 0, product.unit_price || 0)
    }
  }

  const handleConfirm = (withInstall) => {
    if (!confirmProduct) return
    const p = confirmProduct
    const fullLabor = calculateLaborCost(p)
    const installed = p.unit_price || 0
    const productOnly = Math.max(0, installed - fullLabor)
    onSelect(p, withInstall ? fullLabor : 0, withInstall ? installed : productOnly)
    setConfirmProduct(null)
  }

  // Keyboard: Esc / Arrow keys / Enter
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => {
      if (confirmProduct) return // let the install overlay take precedence
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIdx((i) => Math.min(i + 1, Math.max(0, filteredProducts.slice(0, ROW_LIMIT).length - 1)))
      }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx((i) => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter') {
        const p = filteredProducts[highlightIdx]
        if (p) { e.preventDefault(); handleSelect(p) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, filteredProducts, highlightIdx, confirmProduct])

  if (!isOpen) return null

  const visibleProducts = filteredProducts.slice(0, ROW_LIMIT)
  const truncated = filteredProducts.length > ROW_LIMIT

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: isMobile ? 0 : '50%',
          left: isMobile ? 0 : '50%',
          right: isMobile ? 0 : 'auto',
          bottom: isMobile ? 0 : 'auto',
          transform: isMobile ? 'none' : 'translate(-50%, -50%)',
          backgroundColor: theme.bgCard,
          borderRadius: isMobile ? 0 : '16px',
          border: isMobile ? 'none' : `1px solid ${theme.border}`,
          width: isMobile ? '100%' : '90%',
          maxWidth: isMobile ? '100%' : '780px',
          height: isMobile ? '100%' : 'auto',
          maxHeight: isMobile ? '100%' : '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 51,
        }}
      >
        {/* Header: title + close */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${theme.border}` }}>
          <h2 style={{ margin: 0, fontSize: isMobile ? '15px' : '17px', fontWeight: 600, color: theme.text }}>Select Product</h2>
          <button
            onClick={onClose}
            style={{ padding: 8, minWidth: isMobile ? 44 : 'auto', minHeight: isMobile ? 44 : 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: theme.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Sticky filter bar */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, background: theme.bgCard }}>
          {/* Search input */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products by name, SKU, description…"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              style={{
                width: '100%',
                padding: isMobile ? '12px 36px 12px 38px' : '10px 36px 10px 38px',
                minHeight: isMobile ? 44 : 'auto',
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                // 16px on mobile prevents iOS Safari from auto-zooming the
                // viewport when the input gains focus — that zoom was what
                // made it look like Doug "couldn't see what he was typing".
                fontSize: isMobile ? 16 : 14,
                color: theme.text,
                // Some iOS WebKit builds ignore `color` on inputs unless
                // -webkit-text-fill-color is set explicitly. Belt + suspenders.
                WebkitTextFillColor: theme.text,
                caretColor: theme.accent,
                backgroundColor: theme.bgCard,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); searchRef.current?.focus() }}
                title="Clear search"
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  padding: 6, background: 'transparent', border: 'none', cursor: 'pointer',
                  color: theme.textMuted, display: 'flex', alignItems: 'center'
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Service-type chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <FilterChip
              theme={theme} active={!serviceFilter}
              onClick={() => { setServiceFilter(null); setGroupFilter(null) }}
            >
              All <span style={{ opacity: 0.7, marginLeft: 4 }}>{activeProducts.length}</span>
            </FilterChip>
            {chipServiceTypes
              .filter((t) => (serviceTypeCounts[t] || 0) > 0)
              .map((t) => {
                const Icon = SERVICE_ICONS[t] || Wrench
                return (
                  <FilterChip
                    key={t} theme={theme} active={serviceFilter === t}
                    onClick={() => { setServiceFilter(t); setGroupFilter(null) }}
                  >
                    <Icon size={12} />
                    {t} <span style={{ opacity: 0.7, marginLeft: 4 }}>{serviceTypeCounts[t] || 0}</span>
                  </FilterChip>
                )
              })}
          </div>

          {/* Group sub-filter chips (only when service is selected and groups exist) */}
          {serviceFilter && groupsForFilter.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <FilterChip theme={theme} small active={groupFilter === null} onClick={() => setGroupFilter(null)}>
                All groups
              </FilterChip>
              {groupsForFilter.map((g) => (
                <FilterChip key={g.id} theme={theme} small active={groupFilter === g.id} onClick={() => setGroupFilter(g.id)}>
                  {g.name} <span style={{ opacity: 0.7, marginLeft: 4 }}>{activeProducts.filter((p) => p.group_id === g.id).length}</span>
                </FilterChip>
              ))}
            </div>
          )}
        </div>

        {/* Result list */}
        <div ref={listRef} style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {/* Result count */}
          <div style={{ padding: '4px 16px 8px', fontSize: 12, color: theme.textMuted }}>
            {filteredProducts.length === 0
              ? `No matches${search ? ` for "${search}"` : ''}`
              : `${filteredProducts.length} ${filteredProducts.length === 1 ? 'product' : 'products'}${truncated ? ` (showing first ${ROW_LIMIT}, refine search to narrow)` : ''}`}
          </div>

          {/* Recents strip */}
          {recents.length > 0 && (
            <>
              <SectionHeader theme={theme} icon={Clock}>Recently used on this estimate</SectionHeader>
              {recents.map((p) => (
                <ProductRow
                  key={`recent-${p.id}`}
                  product={p}
                  highlighted={false}
                  onClick={() => handleSelect(p)}
                  theme={theme}
                  isMobile={isMobile}
                  laborCost={calculateLaborCost(p)}
                  stock={getInventoryCount(p.id)}
                  componentCount={getComponentCount(p.id)}
                />
              ))}
              <div style={{ borderBottom: `1px solid ${theme.border}`, margin: '6px 0' }} />
              <SectionHeader theme={theme}>All products</SectionHeader>
            </>
          )}

          {/* Main list */}
          {visibleProducts.map((p, i) => (
            <ProductRow
              key={p.id}
              product={p}
              highlighted={highlightIdx === i}
              onClick={() => { setHighlightIdx(i); handleSelect(p) }}
              onMouseEnter={() => setHighlightIdx(i)}
              rowRef={(el) => { rowRefs.current[i] = el }}
              theme={theme}
              isMobile={isMobile}
              laborCost={calculateLaborCost(p)}
              stock={getInventoryCount(p.id)}
              componentCount={getComponentCount(p.id)}
            />
          ))}

          {filteredProducts.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: theme.textMuted, fontSize: 13 }}>
              {search
                ? `No products match "${search}". Try a different term${serviceFilter ? ` or clear the ${serviceFilter} filter` : ''}.`
                : 'No products in this filter. Try another service type.'}
            </div>
          )}
        </div>
      </div>

      {/* Install choice overlay (unchanged behavior) */}
      {confirmProduct && (() => {
        const p = confirmProduct
        const labor = calculateLaborCost(p)
        const installed = p.unit_price || 0
        const productOnly = Math.max(0, installed - labor)
        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
            <div style={{ backgroundColor: theme.bgCard, borderRadius: 14, padding: 24, maxWidth: 380, width: '90%', border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 20 }}>Choose how to add this product</div>
              <button
                onClick={() => handleConfirm(true)}
                style={{ width: '100%', padding: '14px 16px', marginBottom: 10, backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontSize: 14 }}
              >
                <div style={{ fontWeight: 600 }}>Product + Install</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                  ${installed.toFixed(2)} — includes ${labor.toFixed(2)} labor ({p.allotted_time_hours}h)
                </div>
              </button>
              <button
                onClick={() => handleConfirm(false)}
                style={{ width: '100%', padding: '14px 16px', marginBottom: 12, backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontSize: 14 }}
              >
                <div style={{ fontWeight: 600 }}>Product Only</div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                  ${productOnly.toFixed(2)} — no labor included
                </div>
              </button>
              <button
                onClick={() => setConfirmProduct(null)}
                style={{ width: '100%', padding: 10, backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 13 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )
      })()}
    </>
  )
}

function FilterChip({ children, active, onClick, theme, small }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: small ? '5px 10px' : '7px 12px',
        backgroundColor: active ? theme.accent : theme.bg,
        color: active ? '#fff' : theme.textSecondary,
        border: `1px solid ${active ? theme.accent : theme.border}`,
        borderRadius: 999,
        cursor: 'pointer',
        fontSize: small ? 12 : 13,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function SectionHeader({ children, theme, icon: Icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px 4px', fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {Icon && <Icon size={11} />}
      {children}
    </div>
  )
}

function ProductRow({ product, highlighted, onClick, onMouseEnter, rowRef, theme, isMobile, laborCost, stock, componentCount }) {
  const price = product.unit_price || 0
  return (
    <button
      ref={rowRef}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: 'flex',
        // Top-align so multi-line description doesn't push the price out of frame
        alignItems: 'flex-start',
        gap: 12,
        width: '100%',
        padding: isMobile ? '10px 16px' : '8px 16px',
        background: highlighted ? theme.accentBg : 'transparent',
        border: 'none',
        borderBottom: `1px solid ${theme.border}`,
        cursor: 'pointer',
        textAlign: 'left',
        minHeight: isMobile ? 64 : 'auto',
      }}
    >
      {/* Thumbnail */}
      <div style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
        {product.image_url
          ? <img src={product.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Package size={18} color={theme.accent} />}
      </div>

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={product.name}>{product.name}</span>
          {componentCount > 0 && <Boxes size={12} color={theme.textMuted} title={`Bundle: ${componentCount} components`} />}
          {laborCost > 0 && (
            <span style={{ fontSize: 10, fontWeight: 600, color: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', padding: '1px 6px', borderRadius: 8, whiteSpace: 'nowrap' }}>
              + install
            </span>
          )}
        </div>
        {product.description && (
          // Show up to 2 lines of description on mobile / 1 on desktop
          // so reps can actually tell similar SKUs apart at a glance —
          // Doug's feedback: "the descriptions are not enough".
          <div
            style={{
              fontSize: isMobile ? 13 : 12,
              color: theme.textMuted,
              marginTop: 2,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: isMobile ? 2 : 1,
              WebkitBoxOrient: 'vertical',
              lineHeight: 1.35,
            }}
            title={product.description}
          >
            {product.description}
          </div>
        )}
        {/* Useful at-a-glance meta: SKU + category */}
        {(product.sku || product.product_category) && (
          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2, opacity: 0.85 }}>
            {product.sku ? <span>SKU: {product.sku}</span> : null}
            {product.sku && product.product_category ? <span style={{ margin: '0 6px' }}>·</span> : null}
            {product.product_category ? <span>{product.product_category}</span> : null}
          </div>
        )}
      </div>

      {/* Price + stock */}
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: theme.accent, fontVariantNumeric: 'tabular-nums' }}>
          ${price.toFixed(2)}
        </div>
        {stock !== null && (
          <div style={{ fontSize: 11, color: stock === 0 ? '#ef4444' : theme.textMuted, marginTop: 1 }}>
            {stock === 0 ? 'out of stock' : `${stock} in stock`}
          </div>
        )}
      </div>
    </button>
  )
}
