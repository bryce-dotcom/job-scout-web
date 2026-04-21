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
  Wrench, GripHorizontal, GripVertical, Eye
} from 'lucide-react'
import Tooltip from '../components/Tooltip'
import ImportExportModal, { exportToCSV } from '../components/ImportExportModal'
import { isManager as checkManager, isAdmin as checkAdmin, canAccessDevTools } from '../lib/accessControl'
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
function ProductCard({ product, theme, isMobile, formatCurrency, openProductForm, handleDeleteProduct, buttonStyle, inventoryCount, laborData, draggable, isAdmin, isManagerPlus, onView, productComponents, products }) {
  const laborCost = laborData?.price || 0
  const components = (productComponents || []).filter(pc => pc.parent_product_id === product.id)
  const isBundle = components.length > 0
  return (
    <div
      draggable={!!draggable}
      onDragStart={draggable ? (e) => {
        e.dataTransfer.setData('application/product-id', product.id.toString())
        e.dataTransfer.effectAllowed = 'move'
        e.currentTarget.style.opacity = '0.5'
      } : undefined}
      onDragEnd={draggable ? (e) => { e.currentTarget.style.opacity = product.active ? '1' : '0.6' } : undefined}
      onClick={() => onView && onView(product)}
      style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        overflow: 'hidden',
        opacity: product.active ? 1 : 0.6,
        cursor: 'pointer',
        transition: 'border-color 0.2s, box-shadow 0.2s'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = theme.accent
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.border
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
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
        {draggable && (
          <div style={{
            position: 'absolute', bottom: '6px', right: '6px',
            backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: '4px',
            padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <GripVertical size={12} style={{ color: theme.textMuted }} />
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
        {product.allotted_time_hours > 0 && (
          <div style={{
            position: 'absolute', top: product.dlc_listed ? '30px' : '8px', left: '8px',
            backgroundColor: '#8b5cf6', color: '#fff', padding: '3px 8px',
            borderRadius: '10px', fontSize: '10px', fontWeight: '700',
            display: 'flex', alignItems: 'center', gap: '3px', letterSpacing: '0.3px'
          }}>
            <Wrench size={10} />
            Service
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#8b5cf6', marginBottom: isBundle ? '6px' : '10px' }}>
            <DollarSign size={11} />
            Labor: {formatCurrency(laborCost)}
          </div>
        )}
        {isBundle && (
          <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '6px' }}>
              <Boxes size={10} />
              Bundle ({components.length})
            </div>
            {components.map(comp => {
              const p = (products || []).find(pr => pr.id === comp.component_product_id)
              if (!p) return null
              return (
                <div key={comp.component_product_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '2px 0' }}>
                  <span style={{ color: theme.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '8px' }}>
                    {comp.quantity > 1 ? `${comp.quantity}x ` : ''}{p.name}
                  </span>
                  <span style={{ color: theme.accent, fontWeight: '500', flexShrink: 0 }}>
                    {formatCurrency((parseFloat(p.unit_price) || parseFloat(p.cost) || 0) * comp.quantity)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {isManagerPlus && (
          <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => openProductForm(product)} style={{
              flex: 1, ...buttonStyle, backgroundColor: theme.accentBg,
              color: theme.accent, padding: '8px', fontSize: '12px'
            }}>
              <Pencil size={12} /> Edit
            </button>
            {isAdmin && (
              <button onClick={() => handleDeleteProduct(product)} style={{
                ...buttonStyle, backgroundColor: '#fef2f2', color: '#dc2626', padding: '8px 10px'
              }}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ============ PRODUCT DETAIL MODAL (read-only) ============
function ProductDetailModal({ product, theme, isMobile, formatCurrency, laborData, laborRates, productComponents, products, onClose, onEdit, isManagerPlus }) {
  if (!product) return null

  const laborPrice = laborData?.price || 0
  const laborActualCost = laborData?.cost || 0
  const cost = parseFloat(product.cost) || 0
  const markup = parseFloat(product.markup_percent) || 0
  const components = productComponents.filter(pc => pc.parent_product_id === product.id)
  const compValue = components.reduce((sum, c) => {
    const p = products.find(pr => pr.id === c.component_product_id)
    return sum + ((parseFloat(p?.unit_price) || parseFloat(p?.cost) || 0) * c.quantity)
  }, 0)
  const compCost = components.reduce((sum, c) => {
    const p = products.find(pr => pr.id === c.component_product_id)
    return sum + ((parseFloat(p?.cost) || 0) * c.quantity)
  }, 0)
  const markedUpDirectCost = cost * (1 + markup / 100)
  const productSubtotal = markedUpDirectCost + compValue
  const totalCost = cost + compCost + laborActualCost
  const totalPrice = parseFloat(product.unit_price) || 0
  const profit = totalPrice - totalCost
  const profitMargin = totalPrice > 0 ? (profit / totalPrice * 100) : 0
  const datasheet = product.datasheet_json || {}
  const hasSpecs = product.manufacturer || product.model_number || product.product_category || Object.keys(datasheet).length > 0

  const sectionStyle = { padding: '14px 16px', backgroundColor: theme.bg, borderRadius: '10px', border: `1px solid ${theme.border}` }
  const sectionTitleStyle = { fontSize: '11px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }
  const detailRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '13px' }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 }} />
      <div style={{
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
        maxWidth: isMobile ? '100%' : '560px',
        maxHeight: isMobile ? '100%' : '85vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 51,
        boxShadow: '0 25px 50px rgba(0,0,0,0.15)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {product.name}
              </h2>
              {product.allotted_time_hours > 0 && (
                <span style={{ backgroundColor: '#8b5cf6', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '700', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Wrench size={10} /> Service
                </span>
              )}
              {product.dlc_listed && (
                <span style={{ backgroundColor: '#22c55e', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '700', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <ShieldCheck size={10} /> DLC
                </span>
              )}
            </div>
            {product.type && <div style={{ fontSize: '12px', color: theme.textMuted }}>{product.type}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {isManagerPlus && (
              <button onClick={() => { onClose(); onEdit(product) }} style={{
                padding: '8px 12px', backgroundColor: theme.accentBg, color: theme.accent,
                border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}>
                <Pencil size={14} /> Edit
              </button>
            )}
            <button onClick={onClose} style={{ padding: '8px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Image + Description */}
          {(product.image_url || product.description) && (
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              {product.image_url && (
                <img src={product.image_url} alt={product.name} style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '10px', border: `1px solid ${theme.border}`, flexShrink: 0 }} />
              )}
              {product.description && (
                <p style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: '1.5', margin: 0 }}>{product.description}</p>
              )}
            </div>
          )}

          {/* Pricing */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Pricing</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: '700', color: theme.accent }}>
                {formatCurrency(product.unit_price)}
              </div>
              {totalCost > 0 && (
                <div style={{ fontSize: '13px', color: theme.textMuted }}>
                  sells for
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {cost > 0 && (
                <div style={detailRow}>
                  <span style={{ color: theme.textMuted }}>Material cost</span>
                  <span style={{ color: theme.text }}>{formatCurrency(cost)}</span>
                </div>
              )}
              {cost > 0 && markup > 0 && (
                <div style={detailRow}>
                  <span style={{ color: theme.textMuted }}>Markup ({markup}%)</span>
                  <span style={{ color: theme.text }}>+{formatCurrency(markedUpDirectCost - cost)}</span>
                </div>
              )}
              {compValue > 0 && (
                <div style={detailRow}>
                  <span style={{ color: theme.textMuted }}>Components (sell)</span>
                  <span style={{ color: theme.text }}>{formatCurrency(compValue)}</span>
                </div>
              )}
              {laborPrice > 0 && (
                <div style={detailRow}>
                  <span style={{ color: theme.textMuted }}>Labor ({product.allotted_time_hours}h)</span>
                  <span style={{ color: '#8b5cf6', fontWeight: '500' }}>{formatCurrency(laborPrice)}</span>
                </div>
              )}
            </div>

            {/* Cost Breakdown */}
            {totalCost > 0 && (
              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: `1px solid ${theme.border}` }}>
                <div style={{ ...sectionTitleStyle, marginBottom: '6px', fontSize: '10px' }}>Cost Breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {cost > 0 && (
                    <div style={detailRow}>
                      <span style={{ color: theme.textMuted }}>Material cost</span>
                      <span style={{ color: theme.text }}>{formatCurrency(cost)}</span>
                    </div>
                  )}
                  {compCost > 0 && (
                    <div style={detailRow}>
                      <span style={{ color: theme.textMuted }}>Components cost</span>
                      <span style={{ color: theme.text }}>{formatCurrency(compCost)}</span>
                    </div>
                  )}
                  {laborActualCost > 0 ? (
                    <div style={detailRow}>
                      <span style={{ color: theme.textMuted }}>Labor cost ({product.allotted_time_hours}h)</span>
                      <span style={{ color: '#8b5cf6' }}>{formatCurrency(laborActualCost)}</span>
                    </div>
                  ) : laborPrice > 0 ? (
                    <div style={detailRow}>
                      <span style={{ color: '#eab308', fontSize: '12px' }}>Labor cost not set — update labor rate</span>
                      <span />
                    </div>
                  ) : null}
                  <div style={{ ...detailRow, paddingTop: '6px', borderTop: `1px solid ${theme.border}`, marginTop: '4px' }}>
                    <span style={{ color: theme.text, fontWeight: '600' }}>Total cost</span>
                    <span style={{ color: theme.text, fontWeight: '600' }}>{formatCurrency(totalCost)}</span>
                  </div>
                  <div style={detailRow}>
                    <span style={{ color: profit >= 0 ? '#4a7c59' : '#ef4444', fontWeight: '600' }}>Profit</span>
                    <span style={{ color: profit >= 0 ? '#4a7c59' : '#ef4444', fontWeight: '600' }}>
                      {formatCurrency(profit)} ({profitMargin.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              {product.taxable && <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '8px', backgroundColor: theme.accentBg, color: theme.accent }}>Taxable</span>}
              <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '8px', backgroundColor: product.active ? 'rgba(74,124,89,0.12)' : 'rgba(0,0,0,0.06)', color: product.active ? '#4a7c59' : theme.textMuted }}>
                {product.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          {/* Components */}
          {components.length > 0 && (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>
                <Boxes size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Components ({components.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {components.map(comp => {
                  const p = products.find(pr => pr.id === comp.component_product_id)
                  if (!p) return null
                  return (
                    <div key={comp.component_product_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${theme.border}` }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text }}>{p.name}</div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>{formatCurrency(parseFloat(p.unit_price) || parseFloat(p.cost) || 0)} each</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: theme.accent }}>{formatCurrency((parseFloat(p.unit_price) || parseFloat(p.cost) || 0) * comp.quantity)}</div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>x{comp.quantity}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Specs & Product Info */}
          {hasSpecs && (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Specifications</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                {product.manufacturer && (
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Manufacturer</div>
                    <div style={{ fontSize: '13px', color: theme.text, fontWeight: '500' }}>{product.manufacturer}</div>
                  </div>
                )}
                {product.model_number && (
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Model Number</div>
                    <div style={{ fontSize: '13px', color: theme.text, fontWeight: '500' }}>{product.model_number}</div>
                  </div>
                )}
                {product.product_category && (
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Category</div>
                    <div style={{ fontSize: '13px', color: theme.text, fontWeight: '500' }}>{product.product_category}</div>
                  </div>
                )}
                {product.warranty_years && (
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Warranty</div>
                    <div style={{ fontSize: '13px', color: theme.text, fontWeight: '500' }}>{product.warranty_years} years</div>
                  </div>
                )}
              </div>
              {Object.keys(datasheet).length > 0 && (
                <div style={{ marginTop: '12px', borderTop: `1px solid ${theme.border}`, paddingTop: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px' }}>Datasheet</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                    {Object.entries(datasheet).map(([key, value]) => (
                      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '2px 0' }}>
                        <span style={{ fontSize: '12px', color: theme.textMuted }}>{key}</span>
                        <span style={{ fontSize: '12px', color: theme.text, fontWeight: '500', textAlign: 'right' }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Certifications */}
          {product.dlc_listed && (
            <div style={{ ...sectionStyle, borderLeft: '3px solid #22c55e' }}>
              <div style={{ ...sectionTitleStyle, color: '#22c55e' }}>
                <ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                DLC Certification
              </div>
              {product.dlc_listing_number && (
                <div style={{ fontSize: '13px', color: theme.text, marginBottom: '8px' }}>
                  Listing: <strong>{product.dlc_listing_number}</strong>
                </div>
              )}
              {product.dlc_document_url && (
                <a href={product.dlc_document_url} target="_blank" rel="noopener noreferrer" style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                  backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: '8px',
                  fontSize: '12px', fontWeight: '500', textDecoration: 'none'
                }}>
                  <ExternalLink size={12} /> View DLC Document
                </a>
              )}
            </div>
          )}

          {/* Documents */}
          {(product.spec_sheet_url || product.install_guide_url) && (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>
                <FileText size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Documents
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {product.spec_sheet_url && (
                  <a href={product.spec_sheet_url} target="_blank" rel="noopener noreferrer" style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                    backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px',
                    textDecoration: 'none', color: theme.text
                  }}>
                    <FileText size={18} style={{ color: theme.accent, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '500' }}>Spec Sheet</div>
                      <div style={{ fontSize: '11px', color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {product.spec_sheet_url.split('/').pop()}
                      </div>
                    </div>
                    <ExternalLink size={14} style={{ color: theme.textMuted, flexShrink: 0 }} />
                  </a>
                )}
                {product.install_guide_url && (
                  <a href={product.install_guide_url} target="_blank" rel="noopener noreferrer" style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                    backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px',
                    textDecoration: 'none', color: theme.text
                  }}>
                    <FileSpreadsheet size={18} style={{ color: '#3b82f6', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '500' }}>Install Guide</div>
                      <div style={{ fontSize: '11px', color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {product.install_guide_url.split('/').pop()}
                      </div>
                    </div>
                    <ExternalLink size={14} style={{ color: theme.textMuted, flexShrink: 0 }} />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ============ MAIN COMPONENT ============
export default function ProductsServices() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const serviceTypes = useStore((state) => state.serviceTypes)
  const products = useStore((state) => state.products)
  const inventory = useStore((state) => state.inventory)
  const laborRates = useStore((state) => state.laborRates)
  const productComponents = useStore((state) => state.productComponents)
  const fetchProducts = useStore((state) => state.fetchProducts)
  const fetchProductComponents = useStore((state) => state.fetchProductComponents)
  const saveProductComponents = useStore((state) => state.saveProductComponents)
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

  // Product detail (read-only) modal state
  const [viewingProduct, setViewingProduct] = useState(null)

  // Product modal state
  const [showProductModal, setShowProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [productModalTab, setProductModalTab] = useState('overview')
  const [productForm, setProductForm] = useState({
    name: '', description: '', unit_price: '', cost: '', markup_percent: '',
    taxable: true, active: true, image_url: '', allotted_time_hours: '', group_id: null, type: '', labor_rate_id: '',
    manufacturer: '', model_number: '', product_category: '',
    dlc_listed: false, dlc_listing_number: '', warranty_years: '',
    spec_sheet_url: '', install_guide_url: '', dlc_document_url: '', datasheet_json: {}
  })
  const [uploadingDoc, setUploadingDoc] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Components (bundle) state for product modal
  const [modalComponents, setModalComponents] = useState([]) // [{component_product_id, quantity}]
  const [componentSearch, setComponentSearch] = useState('')

  // Labor rates panel state
  const [showLaborRates, setShowLaborRates] = useState(false)
  const [editingRate, setEditingRate] = useState(null)
  const [rateForm, setRateForm] = useState({
    name: '', rate_per_hour: '', cost_per_hour: '', description: '', multiplier: '1.0', active: true, is_default: false
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

  const isAdmin = checkAdmin(user)
  const isDeveloper = canAccessDevTools(user)
  const isManagerPlus = checkManager(user)

  // Helpers
  const getInventoryCount = (productId) => {
    return inventory.filter(item => item.product_id === productId).reduce((sum, item) => sum + (item.quantity || 0), 0)
  }

  const defaultLaborRate = laborRates.find(r => r.is_default) || laborRates[0]

  const getLaborCost = (product) => {
    if (!product.allotted_time_hours) return { price: 0, cost: 0 }
    const rate = product.labor_rate_id ? laborRates.find(r => r.id === product.labor_rate_id) : defaultLaborRate
    if (!rate) return { price: 0, cost: 0 }
    const mult = rate.multiplier || 1
    return {
      price: product.allotted_time_hours * rate.rate_per_hour * mult,
      cost: product.allotted_time_hours * (parseFloat(rate.cost_per_hour) || 0) * mult
    }
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
      fetchProductComponents()
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
      .maybeSingle()
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
    const { data: existing } = await supabase.from('settings').select('id').eq('company_id', companyId).eq('key', 'product_sections').maybeSingle()
    if (existing) {
      await supabase.from('settings').update({ value: JSON.stringify(newSections), updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('settings').insert({ company_id: companyId, key: 'product_sections', value: JSON.stringify(newSections) })
    }
  }

  const openSectionForm = async (indexOrName = null) => {
    if (typeof indexOrName === 'string') {
      // Orphan section — add it to stored sections first so it becomes editable
      const newSection = { name: indexOrName, image_url: '' }
      const updated = [...sections, newSection]
      await saveSections(updated)
      setEditingSectionIndex(updated.length - 1)
      setSectionForm({ ...newSection })
    } else if (indexOrName !== null && sections[indexOrName]) {
      setEditingSectionIndex(indexOrName)
      setSectionForm({ name: sections[indexOrName].name, image_url: sections[indexOrName].image_url || '' })
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

  const handleDeleteSection = async (indexOrName) => {
    const sectionName = typeof indexOrName === 'string' ? indexOrName : sections[indexOrName]?.name
    if (!sectionName) return
    if (!confirm(`Delete section "${sectionName}"? Groups and items in this section will still exist but won't be in a section.`)) return
    const updated = typeof indexOrName === 'string'
      ? sections.filter(s => s.name !== indexOrName)
      : sections.filter((_, i) => i !== indexOrName)
    await saveSections(updated)
    if (activeSection === sectionName) { setActiveSection(null) }
  }

  const sectionFileRef = useRef(null)
  const handleSectionImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${companyId}/sections/${Date.now()}.${fileExt}`
      const { error } = await supabase.storage.from('product-images').upload(fileName, file)
      if (error) { alert('Image upload failed: ' + error.message); return }
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName)
      setSectionForm(prev => ({ ...prev, image_url: publicUrl }))
    } catch (err) {
      alert('Image upload failed: ' + (err.message || 'Unknown error'))
    } finally {
      setUploading(false)
      if (sectionFileRef.current) sectionFileRef.current.value = ''
    }
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
        spec_sheet_url: product.spec_sheet_url || '', install_guide_url: product.install_guide_url || '', dlc_document_url: product.dlc_document_url || '',
        datasheet_json: product.datasheet_json || {}
      })
      // Load existing components for this product
      const existing = productComponents
        .filter(pc => pc.parent_product_id === product.id)
        .map(pc => ({ component_product_id: pc.component_product_id, quantity: pc.quantity }))
      setModalComponents(existing)
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
        spec_sheet_url: '', install_guide_url: '', dlc_document_url: '', datasheet_json: {}
      })
      setModalComponents([])
    }
    setComponentSearch('')
    setProductModalTab('overview')
    setShowProductModal(true)
  }

  // Helper: compute component value from modalComponents using each component's own unit_price
  const getComponentValue = (components) => {
    return components.reduce((sum, c) => {
      const p = products.find(pr => pr.id === c.component_product_id)
      if (!p) return sum
      return sum + ((parseFloat(p.unit_price) || parseFloat(p.cost) || 0) * c.quantity)
    }, 0)
  }

  // Helper: recalculate unit_price from cost + markup + components + labor
  // Components use their own unit_price (their markup is already baked in).
  // The parent's markup only applies to the parent's direct cost.
  const recalcUnitPrice = (form, components) => {
    const cost = parseFloat(form.cost) || 0
    const compValue = getComponentValue(components)
    if (cost === 0 && compValue === 0) return form // no cost basis — keep manual
    const markup = parseFloat(form.markup_percent) || 0
    const markedUpDirectCost = cost * (1 + markup / 100)
    const hours = parseFloat(form.allotted_time_hours) || 0
    const rate = form.labor_rate_id
      ? laborRates.find(r => r.id === (typeof form.labor_rate_id === 'string' ? parseInt(form.labor_rate_id) : form.labor_rate_id))
      : defaultLaborRate
    const laborCost = hours > 0 && rate ? hours * (rate.rate_per_hour || 0) * (rate.multiplier || 1) : 0
    const calculatedPrice = markedUpDirectCost + compValue + laborCost
    return { ...form, unit_price: calculatedPrice.toFixed(2) }
  }

  const handleProductChange = (e) => {
    const { name, value, type, checked } = e.target
    setProductForm(prev => {
      const updated = { ...prev, [name]: type === 'checkbox' ? checked : value }
      // Auto-recalc unit_price when pricing fields change
      if (['cost', 'markup_percent', 'allotted_time_hours'].includes(name)) {
        return recalcUnitPrice(updated, modalComponents)
      }
      return updated
    })
  }

  // Update components and recalc unit_price in one go
  const updateComponentsAndRecalc = (updater) => {
    setModalComponents(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      setProductForm(form => recalcUnitPrice(form, next))
      return next
    })
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
      spec_sheet_url: productForm.spec_sheet_url || null, install_guide_url: productForm.install_guide_url || null, dlc_document_url: productForm.dlc_document_url || null,
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
      // Save components (bundle)
      if (productId) {
        await saveProductComponents(productId, modalComponents)
      }
      await fetchProducts()
      await fetchProductComponents()
      setShowProductModal(false)
      setEditingProduct(null)
      // Re-open the detail view with the updated product so user stays in context
      if (productId) {
        const updated = useStore.getState().products.find(p => p.id === productId)
        if (updated) setViewingProduct(updated)
      }
    }
    setSaving(false)
  }

  const handleDeleteProduct = async (product) => {
    if (!confirm(`Delete "${product.name}"?`)) return
    await supabase.from('products_services').delete().eq('id', product.id).eq('company_id', companyId)
    await fetchProducts()
  }

  // Drag & drop product to group
  const [dragOverGroupId, setDragOverGroupId] = useState(null)

  const handleDropProduct = async (e, targetGroupId) => {
    e.preventDefault()
    setDragOverGroupId(null)
    const productId = parseInt(e.dataTransfer.getData('application/product-id'))
    if (!productId) return
    const product = products.find(p => p.id === productId)
    if (!product || product.group_id === targetGroupId) return
    await supabase.from('products_services')
      .update({ group_id: targetGroupId, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .eq('company_id', companyId)
    await fetchProducts()
  }

  const onDragOver = (e, groupId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverGroupId !== groupId) setDragOverGroupId(groupId)
  }

  const onDragLeave = (e, groupId) => {
    // Only clear if leaving the container, not entering a child
    if (!e.currentTarget.contains(e.relatedTarget)) {
      if (dragOverGroupId === groupId) setDragOverGroupId(null)
    }
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
        name: rate.name || '', rate_per_hour: rate.rate_per_hour || '', cost_per_hour: rate.cost_per_hour || '',
        description: rate.description || '', multiplier: rate.multiplier || '1.0',
        active: rate.active ?? true, is_default: rate.is_default ?? false
      })
    } else {
      setEditingRate(null)
      setRateForm({ name: '', rate_per_hour: '', cost_per_hour: '', description: '', multiplier: '1.0', active: true, is_default: laborRates.length === 0 })
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
      rate_per_hour: parseFloat(rateForm.rate_per_hour),
      cost_per_hour: parseFloat(rateForm.cost_per_hour) || 0,
      description: rateForm.description || null,
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
      // Cascade: recalculate unit_price on every product that uses this
      // labor rate, then bubble the new prices up through bundles that
      // contain those products. Previously a rate change updated just the
      // labor_rates row — products kept their stale unit_price, so the
      // bundle price didn't move either.
      if (editingRate) {
        try { await cascadeLaborRateChange(editingRate.id) } catch (e) { console.warn('Cascade failed:', e) }
      }
      setEditingRate(null)
      setRateForm({ name: '', rate_per_hour: '', cost_per_hour: '', description: '', multiplier: '1.0', active: true, is_default: false })
    }
    setSaving(false)
  }

  // Recalculate unit_price for products that EXPLICITLY use this labor
  // rate (strict labor_rate_id === laborRateId match — no implicit default
  // fallback, so changing one rate never touches products using a different
  // rate). Then walk the bundle tree upward so parent bundles containing
  // those products pick up the new child prices.
  const cascadeLaborRateChange = async (laborRateId) => {
    const [ratesRes, prodsRes, compsRes] = await Promise.all([
      supabase.from('labor_rates').select('*').eq('company_id', companyId),
      supabase.from('products_services').select('*').eq('company_id', companyId),
      supabase.from('product_components').select('*').eq('company_id', companyId),
    ])
    const rates = ratesRes.data || []
    const prods = prodsRes.data || []
    const comps = compsRes.data || []

    // Resolve the rate for a product: explicit labor_rate_id only. No
    // implicit default fallback — a product with labor_rate_id=null is not
    // tied to any specific rate and should not be rewritten from a rate
    // edit (user was explicit about not wanting data mass-touched).
    const rateFor = (p) => p.labor_rate_id ? rates.find(r => r.id === p.labor_rate_id) : null

    const priceOf = (p) => {
      const cost = parseFloat(p.cost) || 0
      const childComps = comps.filter(c => c.parent_product_id === p.id)
      const compValue = childComps.reduce((s, c) => {
        const child = prods.find(x => x.id === c.component_product_id)
        if (!child) return s
        return s + ((parseFloat(child.unit_price) || parseFloat(child.cost) || 0) * (c.quantity || 1))
      }, 0)
      const markup = parseFloat(p.markup_percent) || 0
      const hours = parseFloat(p.allotted_time_hours) || 0
      const rate = rateFor(p)
      const laborCost = (hours > 0 && rate)
        ? hours * (parseFloat(rate.rate_per_hour) || 0) * (parseFloat(rate.multiplier) || 1)
        : 0
      // Only skip if the product has NO derived cost basis at all — cost,
      // components, AND labor are all zero. Products whose price is built
      // from labor alone (cost=null, no components, hours>0) must NOT be
      // skipped; they are exactly the ones a rate change should move.
      if (cost === 0 && compValue === 0 && laborCost === 0) return null
      return +(cost * (1 + markup / 100) + compValue + laborCost).toFixed(2)
    }

    // Pass 1 — ONLY products whose labor_rate_id strictly matches the edited rate
    const direct = prods.filter(p => p.labor_rate_id === laborRateId)
    const changed = new Set()
    for (const p of direct) {
      const newPrice = priceOf(p)
      if (newPrice == null) continue
      if (Math.abs(newPrice - (parseFloat(p.unit_price) || 0)) < 0.005) continue
      await supabase.from('products_services').update({ unit_price: newPrice, updated_at: new Date().toISOString() }).eq('id', p.id)
      p.unit_price = newPrice
      changed.add(p.id)
    }

    // Pass 2..N — bubble up to bundles ONLY through their component chain.
    // Never touches products that don't contain a changed child, so a
    // sibling product on a different rate is never rewritten.
    for (let depth = 0; depth < 5; depth++) {
      const parentIds = new Set(
        comps.filter(c => changed.has(c.component_product_id)).map(c => c.parent_product_id)
      )
      let iterChanged = 0
      for (const parentId of parentIds) {
        if (changed.has(parentId)) continue
        const parent = prods.find(p => p.id === parentId)
        if (!parent) continue
        const newPrice = priceOf(parent)
        if (newPrice == null) continue
        if (Math.abs(newPrice - (parseFloat(parent.unit_price) || 0)) < 0.005) continue
        await supabase.from('products_services').update({ unit_price: newPrice, updated_at: new Date().toISOString() }).eq('id', parentId)
        parent.unit_price = newPrice
        changed.add(parentId)
        iterChanged++
      }
      if (iterChanged === 0) break
    }

    await fetchProducts()
    const changedCount = changed.size
    if (changedCount > 0) {
      import('../lib/toast').then(({ toast }) => {
        toast.success(`Rate change cascaded to ${changedCount} product${changedCount === 1 ? '' : 's'}.`)
      }).catch(() => {})
    } else {
      import('../lib/toast').then(({ toast }) => {
        toast.success('Rate saved. No products needed a price update.')
      }).catch(() => {})
    }
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
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
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
          {isManagerPlus && !activeSection && (
            <button onClick={() => openSectionForm()} style={{ ...buttonStyle, backgroundColor: theme.accent, color: '#fff' }}>
              <Plus size={18} />
              Add Section
            </button>
          )}
          {isManagerPlus && activeSection && (
            <button onClick={() => openProductForm()} style={{ ...buttonStyle, backgroundColor: theme.accent, color: '#fff' }}>
              <Plus size={18} />
              Add {'Item'}
            </button>
          )}
          {isManagerPlus && activeSection && !selectedGroup && (
            <button onClick={() => openGroupForm()} style={{ ...buttonStyle, backgroundColor: theme.accentBg, color: theme.accent }}>
              <Plus size={18} />
              Add Group
            </button>
          )}
          {activeSection && (
            <>
              {isManagerPlus && (
                <Tooltip text="Import from CSV or Excel">
                  <button onClick={() => setShowImport(true)} style={{ ...buttonStyle, backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
                    <FileSpreadsheet size={18} />
                    {!isMobile && 'Import'}
                  </button>
                </Tooltip>
              )}
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
          {isManagerPlus && activeSection && !selectedGroup && (
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
                    {isManagerPlus && (
                      <div style={{
                        position: 'absolute', top: '8px', right: '8px',
                        display: 'flex', gap: '4px'
                      }}>
                        <button onClick={(e) => { e.stopPropagation(); openSectionForm(storedIndex !== -1 ? storedIndex : section) }} style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          backgroundColor: 'rgba(255,255,255,0.9)', border: 'none',
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', color: theme.textMuted,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteSection(storedIndex !== -1 ? storedIndex : section) }} style={{
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
            <div>
              {/* Drop targets bar: move products to other groups or ungrouped */}
              {isManagerPlus && <div style={{
                display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap',
                padding: '10px 14px', backgroundColor: theme.bg, borderRadius: '10px',
                border: `1px solid ${theme.border}`, alignItems: 'center'
              }}>
                <span style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '600', marginRight: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <GripVertical size={12} /> Drop to move:
                </span>
                <div
                  onDragOver={(e) => onDragOver(e, 'ungrouped')}
                  onDragLeave={(e) => onDragLeave(e, 'ungrouped')}
                  onDrop={(e) => handleDropProduct(e, null)}
                  style={{
                    padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '500',
                    border: `2px solid ${dragOverGroupId === 'ungrouped' ? theme.accent : theme.border}`,
                    backgroundColor: dragOverGroupId === 'ungrouped' ? theme.accentBg : theme.bgCard,
                    color: dragOverGroupId === 'ungrouped' ? theme.accent : theme.textSecondary,
                    transition: 'all 0.15s ease', transform: dragOverGroupId === 'ungrouped' ? 'scale(1.05)' : 'none'
                  }}
                >
                  Ungrouped
                </div>
                {sectionGroups.filter(g => g.id !== selectedGroup.id).map(g => (
                  <div
                    key={g.id}
                    onDragOver={(e) => onDragOver(e, g.id)}
                    onDragLeave={(e) => onDragLeave(e, g.id)}
                    onDrop={(e) => handleDropProduct(e, g.id)}
                    style={{
                      padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '500',
                      border: `2px solid ${dragOverGroupId === g.id ? theme.accent : theme.border}`,
                      backgroundColor: dragOverGroupId === g.id ? theme.accentBg : theme.bgCard,
                      color: dragOverGroupId === g.id ? theme.accent : theme.textSecondary,
                      transition: 'all 0.15s ease', transform: dragOverGroupId === g.id ? 'scale(1.05)' : 'none'
                    }}
                  >
                    {g.name}
                  </div>
                ))}
              </div>}

              {groupProducts.length === 0 ? (
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
                      inventoryCount={getInventoryCount(product.id)} laborData={getLaborCost(product)}
                      draggable={isManagerPlus} isAdmin={isAdmin} isManagerPlus={isManagerPlus}
                      onView={setViewingProduct} productComponents={productComponents} products={products} />
                  ))}
                </div>
              )}
            </div>
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
                        onDragOver={(e) => onDragOver(e, group.id)}
                        onDragLeave={(e) => onDragLeave(e, group.id)}
                        onDrop={(e) => handleDropProduct(e, group.id)}
                        style={{
                          backgroundColor: theme.bgCard, borderRadius: '16px',
                          border: `2px solid ${dragOverGroupId === group.id ? theme.accent : theme.border}`,
                          overflow: 'hidden',
                          cursor: 'pointer', transition: 'all 0.15s ease', position: 'relative',
                          boxShadow: dragOverGroupId === group.id ? `0 0 0 3px ${theme.accentBg}` : 'none',
                          transform: dragOverGroupId === group.id ? 'scale(1.03)' : 'none'
                        }}
                        onMouseEnter={(e) => {
                          if (dragOverGroupId !== group.id) {
                            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'
                            e.currentTarget.style.borderColor = theme.accent
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (dragOverGroupId !== group.id) {
                            e.currentTarget.style.boxShadow = 'none'
                            e.currentTarget.style.borderColor = theme.border
                          }
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
                        {isManagerPlus && <div style={{
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
                        </div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ungrouped Items — also a drop target */}
              {(ungroupedProducts.length > 0 || sectionGroups.length > 0) && (
                <div
                  onDragOver={(e) => onDragOver(e, 'ungrouped')}
                  onDragLeave={(e) => onDragLeave(e, 'ungrouped')}
                  onDrop={(e) => handleDropProduct(e, null)}
                  style={{
                    borderRadius: '12px',
                    border: dragOverGroupId === 'ungrouped' ? `2px dashed ${theme.accent}` : '2px dashed transparent',
                    backgroundColor: dragOverGroupId === 'ungrouped' ? theme.accentBg : 'transparent',
                    padding: dragOverGroupId === 'ungrouped' ? '12px' : '0',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {sectionGroups.length > 0 && (
                    <h2 style={{ fontSize: '14px', fontWeight: '600', color: theme.textMuted, marginBottom: '16px', textTransform: 'uppercase' }}>
                      Ungrouped {dragOverGroupId === 'ungrouped' && '— Drop here'}
                    </h2>
                  )}
                  {ungroupedProducts.length > 0 ? (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))',
                      gap: '16px'
                    }}>
                      {ungroupedProducts.map(product => (
                        <ProductCard key={product.id} product={product} theme={theme} isMobile={isMobile}
                          formatCurrency={formatCurrency} openProductForm={openProductForm}
                          handleDeleteProduct={handleDeleteProduct} buttonStyle={buttonStyle}
                          inventoryCount={getInventoryCount(product.id)} laborData={getLaborCost(product)}
                          draggable={isManagerPlus} isAdmin={isAdmin} isManagerPlus={isManagerPlus}
                          onView={setViewingProduct} productComponents={productComponents} products={products} />
                      ))}
                    </div>
                  ) : isAdmin && sectionGroups.length > 0 ? (
                    <div style={{
                      textAlign: 'center', padding: '20px', color: theme.textMuted,
                      fontSize: '13px', border: `1px dashed ${theme.border}`, borderRadius: '8px'
                    }}>
                      Drag items here to ungroup them
                    </div>
                  ) : null}
                </div>
              )}

              {/* Empty state */}
              {sectionGroups.length === 0 && ungroupedProducts.length === 0 && (
                <div style={{
                  textAlign: 'center', padding: '48px', backgroundColor: theme.bgCard,
                  borderRadius: '12px', border: `1px solid ${theme.border}`
                }}>
                  <Package size={48} style={{ color: theme.textMuted, opacity: 0.5, marginBottom: '16px' }} />
                  <p style={{ color: theme.textSecondary, margin: isManagerPlus ? '0 0 16px' : 0 }}>
                    No {activeSection.toLowerCase()} yet.{isManagerPlus ? ' Start by creating a group or adding items directly.' : ''}
                  </p>
                  {isManagerPlus && (
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                      <button onClick={() => openGroupForm()} style={{ ...buttonStyle, backgroundColor: theme.accentBg, color: theme.accent }}>
                        <Plus size={16} /> Create Group
                      </button>
                      <button onClick={() => openProductForm()} style={{ ...buttonStyle, backgroundColor: theme.accent, color: '#fff' }}>
                        <Plus size={16} /> Add {'Item'}
                      </button>
                    </div>
                  )}
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
                  <label style={labelStyle}>Sell Rate/Hour *</label>
                  <input type="number" name="rate_per_hour" value={rateForm.rate_per_hour} onChange={handleRateChange} step="0.01" style={inputStyle} placeholder="75.00" />
                </div>
                <div>
                  <label style={labelStyle}>Cost/Hour</label>
                  <input type="number" name="cost_per_hour" value={rateForm.cost_per_hour} onChange={handleRateChange} step="0.01" style={inputStyle} placeholder="35.00" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Multiplier</label>
                  <input type="number" name="multiplier" value={rateForm.multiplier} onChange={handleRateChange} step="0.1" style={inputStyle} placeholder="1.0" />
                </div>
                <div />
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
                  <button onClick={() => { setEditingRate(null); setRateForm({ name: '', rate_per_hour: '', cost_per_hour: '', description: '', multiplier: '1.0', active: true, is_default: false }) }} style={{ ...buttonStyle, flex: 1, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
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
                      {parseFloat(rate.cost_per_hour) > 0 && (
                        <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                          Cost: ${parseFloat(rate.cost_per_hour).toFixed(2)}/hr
                          <span style={{ marginLeft: '8px', color: '#4a7c59', fontWeight: '500' }}>
                            ({((1 - parseFloat(rate.cost_per_hour) / parseFloat(rate.rate_per_hour)) * 100).toFixed(0)}% margin)
                          </span>
                        </div>
                      )}
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
                  <input ref={sectionFileRef} type="file" accept="image/*" onChange={handleSectionImageUpload} style={{ display: 'none' }} />
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
                    <div
                      onClick={() => sectionFileRef.current?.click()}
                      style={{
                        width: '60px', height: '60px', borderRadius: '8px', border: `2px dashed ${theme.border}`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        cursor: uploading ? 'wait' : 'pointer', color: theme.textMuted, backgroundColor: theme.bg
                      }}
                    >
                      {uploading ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={16} />}
                    </div>
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
            <button onClick={handleSaveSection} disabled={saving || uploading} style={{ ...buttonStyle, flex: 1, backgroundColor: theme.accent, color: '#fff', opacity: (saving || uploading) ? 0.7 : 1 }}>
              <Save size={16} /> {uploading ? 'Uploading...' : saving ? 'Saving...' : (editingSectionIndex !== null ? 'Update' : 'Create Section')}
            </button>
          </div>
        </DraggableModal>
      )}

      {/* ============ PRODUCT DETAIL MODAL (read-only) ============ */}
      {viewingProduct && (
        <ProductDetailModal
          product={viewingProduct}
          theme={theme}
          isMobile={isMobile}
          formatCurrency={formatCurrency}
          laborData={getLaborCost(viewingProduct)}
          laborRates={laborRates}
          productComponents={productComponents}
          products={products}
          onClose={() => setViewingProduct(null)}
          onEdit={openProductForm}
          isManagerPlus={isManagerPlus}
        />
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
              { key: 'documents', label: 'Documents', icon: FileSpreadsheet },
              { key: 'components', label: 'Components', icon: Boxes, badge: modalComponents.length }
            ].map(tab => (
              <button key={tab.key} onClick={() => setProductModalTab(tab.key)} style={{
                padding: '10px 16px', fontSize: '13px', fontWeight: '500',
                color: productModalTab === tab.key ? theme.accent : theme.textMuted,
                backgroundColor: 'transparent', border: 'none',
                borderBottom: productModalTab === tab.key ? `2px solid ${theme.accent}` : '2px solid transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '-1px'
              }}>
                <tab.icon size={14} /> {tab.label}
                {tab.badge > 0 && (
                  <span style={{
                    backgroundColor: theme.accent, color: '#fff', fontSize: '10px', fontWeight: '700',
                    borderRadius: '10px', padding: '1px 6px', minWidth: '18px', textAlign: 'center'
                  }}>{tab.badge}</span>
                )}
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
                {/* ── Pricing Section ── */}
                <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '10px', border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Pricing</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Direct Cost</label>
                      <input type="number" name="cost" value={productForm.cost} onChange={handleProductChange} step="0.01" placeholder="0.00" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Markup %</label>
                      <input type="number" name="markup_percent" value={productForm.markup_percent} onChange={handleProductChange} step="0.01" placeholder="0" style={inputStyle} />
                    </div>
                  </div>
                  {/* Price breakdown */}
                  {(() => {
                    const cost = parseFloat(productForm.cost) || 0
                    const markup = parseFloat(productForm.markup_percent) || 0
                    const markedUpDirectCost = cost * (1 + markup / 100)
                    return cost > 0 ? (
                      <div style={{ marginTop: '8px', fontSize: '12px', color: theme.textMuted, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {markup > 0 && (
                          <span>${cost.toFixed(2)} + {markup}% = <strong style={{ color: theme.text }}>${markedUpDirectCost.toFixed(2)}</strong></span>
                        )}
                      </div>
                    ) : null
                  })()}
                </div>

                {/* ── Labor / Install Section ── */}
                <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '10px', border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>Labor / Install</div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '12px' }}>Set install time and rate. When added to a job, user can choose product only or product + install.</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Install Time (hours)</label>
                      <input type="number" name="allotted_time_hours" value={productForm.allotted_time_hours} onChange={handleProductChange} step="0.25" placeholder="0" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Labor Rate</label>
                      <select name="labor_rate_id" value={productForm.labor_rate_id || ''} onChange={(e) => setProductForm(prev => recalcUnitPrice({ ...prev, labor_rate_id: e.target.value ? parseInt(e.target.value) : null }, modalComponents))} style={inputStyle}>
                        <option value="">Use Default Rate</option>
                        {laborRates.filter(r => r.active).map(rate => (
                          <option key={rate.id} value={rate.id}>{rate.name} (${parseFloat(rate.rate_per_hour).toFixed(2)}/hr){rate.is_default ? ' - Default' : ''}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {/* Labor cost breakdown */}
                  {(() => {
                    const hours = parseFloat(productForm.allotted_time_hours) || 0
                    const rate = productForm.labor_rate_id
                      ? laborRates.find(r => r.id === productForm.labor_rate_id)
                      : defaultLaborRate
                    const laborSell = hours > 0 && rate ? hours * (rate.rate_per_hour || 0) * (rate.multiplier || 1) : 0
                    const laborCostAmt = hours > 0 && rate ? hours * (parseFloat(rate.cost_per_hour) || 0) * (rate.multiplier || 1) : 0
                    return hours > 0 && rate ? (
                      <div style={{ marginTop: '8px', fontSize: '12px', color: theme.textMuted, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span>{hours}h x ${parseFloat(rate.rate_per_hour).toFixed(2)}/hr{rate.multiplier && rate.multiplier !== 1 ? ` x ${rate.multiplier}` : ''} = <strong style={{ color: theme.text }}>${laborSell.toFixed(2)}</strong> sell</span>
                        {laborCostAmt > 0 ? (
                          <span>{hours}h x ${parseFloat(rate.cost_per_hour).toFixed(2)}/hr{rate.multiplier && rate.multiplier !== 1 ? ` x ${rate.multiplier}` : ''} = <strong style={{ color: theme.text }}>${laborCostAmt.toFixed(2)}</strong> cost</span>
                        ) : (
                          <span style={{ color: '#eab308' }}>Set cost/hour on labor rate to track labor cost</span>
                        )}
                      </div>
                    ) : null
                  })()}
                </div>

                {/* ── Sell Price (auto-calculated or manual) ── */}
                {(() => {
                  const cost = parseFloat(productForm.cost) || 0
                  const compValue = getComponentValue(modalComponents)
                  const markup = parseFloat(productForm.markup_percent) || 0
                  const markedUpDirectCost = cost * (1 + markup / 100)
                  const hours = parseFloat(productForm.allotted_time_hours) || 0
                  const rate = productForm.labor_rate_id
                    ? laborRates.find(r => r.id === productForm.labor_rate_id)
                    : defaultLaborRate
                  const laborCost = hours > 0 && rate ? hours * (rate.rate_per_hour || 0) * (rate.multiplier || 1) : 0
                  const productSubtotal = markedUpDirectCost + compValue
                  const calculatedPrice = productSubtotal + laborCost
                  const hasCostBasis = cost > 0 || compValue > 0

                  return (
                    <div style={{ padding: '16px', backgroundColor: hasCostBasis ? 'rgba(90,99,73,0.08)' : theme.bg, borderRadius: '10px', border: `1px solid ${hasCostBasis ? theme.accent : theme.border}` }}>
                      <label style={{ ...labelStyle, marginBottom: '8px' }}>Sell Price (Installed)</label>
                      {hasCostBasis ? (
                        <>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: theme.accent, marginBottom: '8px' }}>
                            ${calculatedPrice.toFixed(2)}
                          </div>
                          <div style={{ fontSize: '12px', color: theme.textMuted, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {cost > 0 && <span>Direct cost: ${cost.toFixed(2)}</span>}
                            {cost > 0 && markup > 0 && <span>Markup ({markup}%): +${(markedUpDirectCost - cost).toFixed(2)}</span>}
                            {compValue > 0 && <span>Components: ${compValue.toFixed(2)} (at their own prices)</span>}
                            <span style={{ fontWeight: '500', color: theme.text }}>Product subtotal: ${productSubtotal.toFixed(2)}</span>
                            {laborCost > 0 && <span>Labor: +${laborCost.toFixed(2)}</span>}
                            {laborCost > 0 && <span style={{ marginTop: '4px', color: theme.textMuted }}>Product only: ${productSubtotal.toFixed(2)}</span>}
                          </div>
                        </>
                      ) : (
                        <input type="number" name="unit_price" value={productForm.unit_price} onChange={handleProductChange} step="0.01" placeholder="0.00" style={inputStyle} />
                      )}
                    </div>
                  )
                })()}
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
                {/* Spec Sheet Upload */}
                <div style={{ padding: '12px 16px', backgroundColor: theme.bg, borderRadius: '8px', borderLeft: `3px solid ${theme.accent}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <FileText size={16} style={{ color: theme.accent }} />
                    <div style={{ fontSize: '12px', fontWeight: '600', color: theme.accent, textTransform: 'uppercase' }}>Spec Sheet</div>
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

                {/* Certifications & DLC */}
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
                    <>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={labelStyle}>DLC Listing Number</label>
                        <input type="text" name="dlc_listing_number" value={productForm.dlc_listing_number} onChange={handleProductChange} style={inputStyle} placeholder="e.g., QUQH-43D4LBU4" />
                      </div>
                      {/* DLC Supporting Document */}
                      <div style={{ padding: '12px', backgroundColor: theme.bgCard, borderRadius: '8px', border: `1px solid ${theme.border}`, marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                          <ShieldCheck size={14} style={{ color: '#22c55e' }} />
                          <span style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>DLC Supporting Document</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                          <label style={{
                            ...buttonStyle, padding: '7px 12px', fontSize: '12px',
                            backgroundColor: uploadingDoc === 'dlc_document_url' ? 'rgba(34,197,94,0.12)' : '#22c55e',
                            color: uploadingDoc === 'dlc_document_url' ? '#22c55e' : '#fff',
                            cursor: uploadingDoc ? 'wait' : 'pointer'
                          }}>
                            <Upload size={14} /> {uploadingDoc === 'dlc_document_url' ? 'Uploading...' : 'Upload'}
                            <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={(e) => handleDocUpload(e, 'dlc_document_url')} disabled={!!uploadingDoc} style={{ display: 'none' }} />
                          </label>
                          <span style={{ fontSize: '12px', color: theme.textMuted }}>or</span>
                          <input type="url" name="dlc_document_url" value={productForm.dlc_document_url} onChange={handleProductChange} placeholder="Paste URL..." style={{ ...inputStyle, flex: 1, fontSize: '13px' }} />
                        </div>
                        {uploadingDoc === 'dlc_document_url' && (
                          <div style={{ height: '4px', backgroundColor: theme.border, borderRadius: '2px', overflow: 'hidden', marginBottom: '8px' }}>
                            <div style={{ height: '100%', width: `${uploadProgress}%`, backgroundColor: '#22c55e', borderRadius: '2px', transition: 'width 0.3s ease' }} />
                          </div>
                        )}
                        {productForm.dlc_document_url && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: theme.bg, borderRadius: '6px', border: `1px solid ${theme.border}` }}>
                            <ShieldCheck size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
                            <span style={{ fontSize: '12px', color: theme.textSecondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {productForm.dlc_document_url.split('/').pop()}
                            </span>
                            <a href={productForm.dlc_document_url} target="_blank" rel="noopener noreferrer" style={{ ...buttonStyle, padding: '4px 10px', fontSize: '12px', backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e', textDecoration: 'none' }}>
                              <ExternalLink size={12} /> Open
                            </a>
                            <button onClick={() => setProductForm(prev => ({ ...prev, dlc_document_url: '' }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px' }}>
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </>
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

            {/* COMPONENTS TAB */}
            {productModalTab === 'components' && (() => {
              const currentProductId = editingProduct?.id
              const componentProductIds = modalComponents.map(c => c.component_product_id)
              const searchResults = componentSearch.trim()
                ? products.filter(p => {
                    if (p.active === false) return false
                    if (p.id === currentProductId) return false
                    if (componentProductIds.includes(p.id)) return false
                    const term = componentSearch.toLowerCase()
                    const searchable = [p.name, p.type, p.category, p.description, p.item_id, p.product_category, p.manufacturer].filter(Boolean).join(' ').toLowerCase()
                    return searchable.includes(term)
                  }).slice(0, 20)
                : []

              // Calculate totals — use each component's own unit_price (their markup is baked in)
              const componentTotal = modalComponents.reduce((sum, c) => {
                const p = products.find(pr => pr.id === c.component_product_id)
                if (!p) return sum
                const price = parseFloat(p.unit_price) || parseFloat(p.cost) || 0
                return sum + (price * c.quantity)
              }, 0)

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Add Component Search */}
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Search size={16} style={{ color: theme.textMuted, position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 1 }} />
                      <input
                        type="text"
                        value={componentSearch}
                        onChange={(e) => setComponentSearch(e.target.value)}
                        placeholder="Search products to add as component..."
                        style={{ ...inputStyle, paddingLeft: '36px', width: '100%' }}
                      />
                    </div>
                    {searchResults.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                        backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
                        borderRadius: '8px', marginTop: '4px', maxHeight: '200px', overflow: 'auto',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}>
                        {searchResults.map(p => (
                          <button key={p.id} onClick={() => {
                            updateComponentsAndRecalc(prev => [...prev, { component_product_id: p.id, quantity: 1 }])
                            setComponentSearch('')
                          }} style={{
                            display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                            padding: '10px 14px', border: 'none', backgroundColor: 'transparent',
                            cursor: 'pointer', textAlign: 'left', fontSize: '13px', color: theme.text
                          }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.bg}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <Package size={14} style={{ color: theme.textMuted, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                              {(p.type || p.product_category) && (
                                <div style={{ fontSize: '11px', color: theme.textMuted }}>{p.type}{p.product_category ? ` · ${p.product_category}` : ''}</div>
                              )}
                            </div>
                            <span style={{ color: theme.textMuted, fontSize: '12px', flexShrink: 0 }}>
                              ${(parseFloat(p.unit_price) || parseFloat(p.cost) || 0).toFixed(2)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Component List */}
                  {modalComponents.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
                      <Boxes size={28} style={{ color: theme.border, marginBottom: '8px' }} />
                      <div>No components yet. Search above to add products to this bundle.</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {modalComponents.map((comp, idx) => {
                        const p = products.find(pr => pr.id === comp.component_product_id)
                        if (!p) return null
                        const unitPrice = parseFloat(p.unit_price) || parseFloat(p.cost) || 0
                        const subtotal = unitPrice * comp.quantity
                        return (
                          <div key={comp.component_product_id} style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '10px 14px', backgroundColor: theme.bg, borderRadius: '8px',
                            border: `1px solid ${theme.border}`
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.name}
                              </div>
                              <div style={{ fontSize: '11px', color: theme.textMuted }}>
                                ${unitPrice.toFixed(2)} each
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <button onClick={() => {
                                updateComponentsAndRecalc(prev => prev.map((c, i) => i === idx ? { ...c, quantity: Math.max(1, c.quantity - 1) } : c))
                              }} style={{
                                width: '28px', height: '28px', borderRadius: '6px', border: `1px solid ${theme.border}`,
                                backgroundColor: theme.bgCard, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: theme.textSecondary, fontSize: '16px', fontWeight: '700'
                              }}>-</button>
                              <span style={{ width: '28px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: theme.text }}>{comp.quantity}</span>
                              <button onClick={() => {
                                updateComponentsAndRecalc(prev => prev.map((c, i) => i === idx ? { ...c, quantity: c.quantity + 1 } : c))
                              }} style={{
                                width: '28px', height: '28px', borderRadius: '6px', border: `1px solid ${theme.border}`,
                                backgroundColor: theme.bgCard, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: theme.textSecondary, fontSize: '16px', fontWeight: '700'
                              }}>+</button>
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: '600', color: theme.accent, minWidth: '60px', textAlign: 'right' }}>
                              ${subtotal.toFixed(2)}
                            </span>
                            <button onClick={() => {
                              updateComponentsAndRecalc(prev => prev.filter((_, i) => i !== idx))
                            }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '4px' }}>
                              <X size={14} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Summary Footer */}
                  {modalComponents.length > 0 && (
                    <div style={{
                      padding: '14px 16px', backgroundColor: 'rgba(90,99,73,0.08)', borderRadius: '10px',
                      border: `1px solid ${theme.accent}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', color: theme.textMuted }}>Components Total</span>
                        <span style={{ fontSize: '15px', fontWeight: '600', color: theme.accent }}>${componentTotal.toFixed(2)}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: theme.textMuted, textAlign: 'center' }}>
                        Each component uses its own price. Automatically included in the sell price.
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
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
