import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from './Layout'
import {
  X, Search, ChevronLeft, Grid3X3, Wrench, Zap, Droplets, Leaf, ShoppingBag, Box, Package
} from 'lucide-react'

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

/**
 * ProductPickerModal - Visual product catalog picker for quote line items
 *
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Callback when modal is closed
 * @param {function} onSelect - Callback when a product is selected, receives (product, laborCost, totalPrice)
 */
export default function ProductPickerModal({ isOpen, onClose, onSelect }) {
  const companyId = useStore((state) => state.companyId)
  const products = useStore((state) => state.products)
  const serviceTypes = useStore((state) => state.serviceTypes)
  const laborRates = useStore((state) => state.laborRates)
  const inventory = useStore((state) => state.inventory)

  const [productGroups, setProductGroups] = useState([])
  const [catalogServiceType, setCatalogServiceType] = useState('')
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Fetch product groups when modal opens
  useEffect(() => {
    if (isOpen && companyId) {
      fetchProductGroups()
      setCatalogServiceType(serviceTypes[0] || '')
      setSelectedGroup(null)
      setCatalogSearch('')
    }
  }, [isOpen, companyId, serviceTypes])

  const fetchProductGroups = async () => {
    const { data } = await supabase
      .from('product_groups')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    setProductGroups(data || [])
  }

  // Get service type icon
  const getServiceTypeIcon = (type) => {
    const iconMap = {
      'Energy Efficiency': Zap,
      'Electrical': Zap,
      'Exterior Cleaning': Droplets,
      'Landscaping': Leaf,
      'Retail': ShoppingBag,
      'General': Grid3X3
    }
    return iconMap[type] || Wrench
  }

  // Calculate labor cost for product
  const calculateLaborCost = (product) => {
    if (!product.allotted_time_hours) return 0

    let rate = null
    if (product.labor_rate_id) {
      rate = laborRates.find(r => r.id === product.labor_rate_id)
    }
    if (!rate) {
      rate = laborRates.find(r => r.is_default)
    }

    if (!rate) return 0
    return product.allotted_time_hours * (rate.rate_per_hour || 0) * (rate.multiplier || 1)
  }

  // Get inventory count for product
  const getInventoryCount = (productId) => {
    const inv = inventory.find(i => i.product_id === productId)
    return inv?.quantity || 0
  }

  // Handle product selection
  const handleSelectProduct = (product) => {
    const laborCost = calculateLaborCost(product)
    const totalPrice = (product.unit_price || 0) + laborCost
    onSelect(product, laborCost, totalPrice)
    setSelectedGroup(null)
    setCatalogSearch('')
  }

  // Handle back button
  const handleBack = () => {
    if (catalogSearch) {
      setCatalogSearch('')
    } else if (selectedGroup) {
      setSelectedGroup(null)
    } else {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 50
        }}
      />

      {/* Modal */}
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
        maxWidth: isMobile ? '100%' : '900px',
        height: isMobile ? '100%' : 'auto',
        maxHeight: isMobile ? '100%' : '85vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 51
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '16px' : '20px',
          borderBottom: `1px solid ${theme.border}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleBack}
              style={{
                padding: isMobile ? '10px' : '8px',
                minWidth: isMobile ? '44px' : 'auto',
                minHeight: isMobile ? '44px' : 'auto',
                backgroundColor: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                cursor: 'pointer',
                color: theme.textSecondary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ChevronLeft size={20} />
            </button>
            <h2 style={{
              fontSize: isMobile ? '16px' : '18px',
              fontWeight: '600',
              color: theme.text,
              margin: 0
            }}>
              {selectedGroup ? selectedGroup.name : 'Select Product'}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: isMobile ? '10px' : '8px',
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

        {/* Body */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: isMobile ? '16px' : '20px'
        }}>
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
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search products..."
              style={{
                width: '100%',
                padding: isMobile ? '12px 12px 12px 40px' : '10px 12px 10px 40px',
                minHeight: isMobile ? '44px' : 'auto',
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                fontSize: '14px',
                color: theme.text,
                backgroundColor: theme.bgCard
              }}
            />
          </div>

          {/* Service Type Tabs */}
          {!catalogSearch && !selectedGroup && (
            <div style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              paddingBottom: '8px',
              marginBottom: '16px'
            }}>
              {serviceTypes.map(type => (
                <button
                  key={type}
                  onClick={() => setCatalogServiceType(type)}
                  style={{
                    padding: isMobile ? '10px 16px' : '8px 14px',
                    minHeight: isMobile ? '44px' : 'auto',
                    backgroundColor: catalogServiceType === type ? theme.accent : theme.bg,
                    color: catalogServiceType === type ? '#fff' : theme.textSecondary,
                    border: `1px solid ${catalogServiceType === type ? theme.accent : theme.border}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {(() => {
                    const Icon = getServiceTypeIcon(type)
                    return <Icon size={16} />
                  })()}
                  {type}
                </button>
              ))}
            </div>
          )}

          {/* Search Results */}
          {catalogSearch && (
            <div>
              <div style={{
                fontSize: '13px',
                color: theme.textMuted,
                marginBottom: '12px'
              }}>
                Search results for "{catalogSearch}"
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '12px'
              }}>
                {products
                  .filter(p => p.active !== false && p.name.toLowerCase().includes(catalogSearch.toLowerCase()))
                  .slice(0, 20)
                  .map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      theme={theme}
                      isMobile={isMobile}
                      calculateLaborCost={calculateLaborCost}
                      getInventoryCount={getInventoryCount}
                      onSelect={handleSelectProduct}
                    />
                  ))}
              </div>
              {products.filter(p => p.active !== false && p.name.toLowerCase().includes(catalogSearch.toLowerCase())).length === 0 && (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: theme.textMuted
                }}>
                  No products found matching "{catalogSearch}"
                </div>
              )}
            </div>
          )}

          {/* Product Groups */}
          {!catalogSearch && !selectedGroup && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '12px'
            }}>
              {/* Show groups for selected service type */}
              {productGroups
                .filter(g => g.service_type === catalogServiceType)
                .map(group => (
                  <GroupTile
                    key={group.id}
                    group={group}
                    theme={theme}
                    isMobile={isMobile}
                    productCount={products.filter(p => p.group_id === group.id && p.active !== false).length}
                    onSelect={() => setSelectedGroup(group)}
                  />
                ))}

              {/* Show ungrouped products tile */}
              {products.filter(p =>
                p.service_type === catalogServiceType &&
                !p.group_id &&
                p.active !== false
              ).length > 0 && (
                <GroupTile
                  group={{ id: null, name: 'Other Products', service_type: catalogServiceType }}
                  theme={theme}
                  isMobile={isMobile}
                  productCount={products.filter(p => p.service_type === catalogServiceType && !p.group_id && p.active !== false).length}
                  onSelect={() => setSelectedGroup({ id: null, name: 'Other Products', service_type: catalogServiceType })}
                  isOther
                />
              )}

              {productGroups.filter(g => g.service_type === catalogServiceType).length === 0 &&
               products.filter(p => p.service_type === catalogServiceType && !p.group_id && p.active !== false).length === 0 && (
                <div style={{
                  gridColumn: '1 / -1',
                  padding: '40px',
                  textAlign: 'center',
                  color: theme.textMuted
                }}>
                  No product groups for {catalogServiceType}
                </div>
              )}
            </div>
          )}

          {/* Products in selected group */}
          {!catalogSearch && selectedGroup && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '12px'
            }}>
              {products
                .filter(p => {
                  if (selectedGroup.id === null) {
                    return p.service_type === selectedGroup.service_type && !p.group_id && p.active !== false
                  }
                  return p.group_id === selectedGroup.id && p.active !== false
                })
                .map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    theme={theme}
                    isMobile={isMobile}
                    calculateLaborCost={calculateLaborCost}
                    getInventoryCount={getInventoryCount}
                    onSelect={handleSelectProduct}
                  />
                ))}
              {products.filter(p => {
                if (selectedGroup.id === null) {
                  return p.service_type === selectedGroup.service_type && !p.group_id && p.active !== false
                }
                return p.group_id === selectedGroup.id && p.active !== false
              }).length === 0 && (
                <div style={{
                  gridColumn: '1 / -1',
                  padding: '40px',
                  textAlign: 'center',
                  color: theme.textMuted
                }}>
                  No products in this group
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// Group tile component
function GroupTile({ group, theme, isMobile, productCount, onSelect, isOther }) {
  return (
    <button
      onClick={onSelect}
      style={{
        padding: '20px 16px',
        backgroundColor: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'border-color 0.2s, transform 0.2s',
        minHeight: isMobile ? '100px' : '120px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = theme.accent
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.border
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '12px',
        backgroundColor: theme.accentBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {group.image_url ? (
          <img
            src={group.image_url}
            alt={group.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '12px'
            }}
          />
        ) : isOther ? (
          <Box size={24} color={theme.accent} />
        ) : (
          <Grid3X3 size={24} color={theme.accent} />
        )}
      </div>
      <div style={{
        fontSize: '13px',
        fontWeight: '600',
        color: theme.text
      }}>
        {group.name}
      </div>
      <div style={{
        fontSize: '11px',
        color: theme.textMuted
      }}>
        {productCount} items
      </div>
    </button>
  )
}

// Product card component
function ProductCard({ product, theme, isMobile, calculateLaborCost, getInventoryCount, onSelect }) {
  const laborCost = calculateLaborCost(product)
  const totalPrice = (product.unit_price || 0) + laborCost

  return (
    <button
      onClick={() => onSelect(product)}
      style={{
        padding: '16px',
        backgroundColor: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 0.2s',
        minHeight: isMobile ? '80px' : 'auto'
      }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = theme.accent}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = theme.border}
    >
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '8px',
          backgroundColor: theme.accentBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: '8px'
              }}
            />
          ) : (
            <Package size={24} color={theme.accent} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: theme.text,
            marginBottom: '4px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {product.name}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px'
          }}>
            <span style={{ fontWeight: '600', color: theme.accent }}>
              ${totalPrice.toFixed(2)}
            </span>
            <span style={{ color: theme.textMuted }}>
              {getInventoryCount(product.id)} in stock
            </span>
          </div>
          {laborCost > 0 && (
            <div style={{
              fontSize: '11px',
              color: theme.textMuted,
              marginTop: '2px'
            }}>
              +${laborCost.toFixed(2)} labor
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
