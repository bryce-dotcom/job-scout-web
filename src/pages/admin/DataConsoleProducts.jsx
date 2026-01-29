import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { adminTheme } from './components/adminTheme'
import AdminStats from './components/AdminStats'
import AdminModal, { FormField, FormInput, FormSelect, FormTextarea, FormToggle, ModalFooter } from './components/AdminModal'
import { Badge } from './components/AdminStats'
import { Package, Plus, Search, Edit2, Trash2, Grid, List, Upload, Download } from 'lucide-react'

const PRODUCT_CATEGORIES = [
  'Linear LED', 'High Bay LED', 'Low Bay LED', 'Outdoor LED', 'Retrofit Kit',
  'Panel LED', 'Troffer LED', 'Wall Pack LED', 'Flood LED', 'Other'
]

const COLOR_TEMPS = ['2700K', '3000K', '3500K', '4000K', '5000K', '6500K']

export default function DataConsoleProducts() {
  const [products, setProducts] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [viewMode, setViewMode] = useState('table') // table or grid
  const [editingProduct, setEditingProduct] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [productsRes, companiesRes] = await Promise.all([
        supabase.from('products_services').select('*').eq('type', 'Product').order('name'),
        supabase.from('companies').select('id, name').order('name')
      ])
      setProducts(productsRes.data || [])
      setCompanies(companiesRes.data || [])
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = { ...editingProduct, type: 'Product' }
      if (editingProduct.id) {
        await supabase.from('products_services').update(data).eq('id', editingProduct.id)
      } else {
        await supabase.from('products_services').insert(data)
      }
      await fetchData()
      setEditingProduct(null)
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  const handleDelete = async (product) => {
    if (!confirm(`Delete ${product.name}?`)) return
    await supabase.from('products_services').delete().eq('id', product.id)
    await fetchData()
  }

  const filtered = products.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !filterCategory || p.category === filterCategory
    return matchesSearch && matchesCategory
  })

  const uniqueCategories = [...new Set(products.map(p => p.category).filter(Boolean))]

  const stats = [
    { icon: Package, label: 'Total Products', value: products.length },
    { icon: Package, label: 'Categories', value: uniqueCategories.length },
    { icon: Package, label: 'Active', value: products.filter(p => p.active !== false).length, color: adminTheme.success }
  ]

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ color: adminTheme.text, fontSize: '24px', fontWeight: '700' }}>
          Products Library
        </h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => alert('Coming in Bulk Ops phase')}
            style={{
              padding: '8px 16px',
              backgroundColor: adminTheme.bgHover,
              border: `1px solid ${adminTheme.border}`,
              borderRadius: '8px',
              color: adminTheme.textMuted,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Upload size={16} /> Import
          </button>
          <button
            onClick={() => setEditingProduct({ name: '', category: 'Linear LED', active: true })}
            style={{
              padding: '8px 16px',
              backgroundColor: adminTheme.accent,
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Plus size={16} /> Add Product
          </button>
        </div>
      </div>

      <AdminStats stats={stats} />

      {/* Filters */}
      <div style={{
        backgroundColor: adminTheme.bgCard,
        border: `1px solid ${adminTheme.border}`,
        borderRadius: '10px',
        padding: '16px',
        marginBottom: '16px',
        display: 'flex',
        gap: '16px',
        alignItems: 'center'
      }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={18} style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: adminTheme.textMuted
          }} />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 40px',
              backgroundColor: adminTheme.bgInput,
              border: `1px solid ${adminTheme.border}`,
              borderRadius: '8px',
              color: adminTheme.text,
              fontSize: '14px'
            }}
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{
            padding: '10px 12px',
            backgroundColor: adminTheme.bgInput,
            border: `1px solid ${adminTheme.border}`,
            borderRadius: '8px',
            color: adminTheme.text,
            fontSize: '14px',
            minWidth: '160px'
          }}
        >
          <option value="">All Categories</option>
          {PRODUCT_CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setViewMode('table')}
            style={{
              padding: '8px 12px',
              backgroundColor: viewMode === 'table' ? adminTheme.accentBg : adminTheme.bgHover,
              border: `1px solid ${viewMode === 'table' ? adminTheme.accent : adminTheme.border}`,
              borderRadius: '6px',
              color: viewMode === 'table' ? adminTheme.accent : adminTheme.textMuted,
              cursor: 'pointer'
            }}
          >
            <List size={18} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            style={{
              padding: '8px 12px',
              backgroundColor: viewMode === 'grid' ? adminTheme.accentBg : adminTheme.bgHover,
              border: `1px solid ${viewMode === 'grid' ? adminTheme.accent : adminTheme.border}`,
              borderRadius: '6px',
              color: viewMode === 'grid' ? adminTheme.accent : adminTheme.textMuted,
              cursor: 'pointer'
            }}
          >
            <Grid size={18} />
          </button>
        </div>
      </div>

      {/* Products Display */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: adminTheme.textMuted }}>Loading...</div>
      ) : viewMode === 'table' ? (
        <div style={{
          backgroundColor: adminTheme.bgCard,
          border: `1px solid ${adminTheme.border}`,
          borderRadius: '10px',
          overflow: 'hidden'
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: adminTheme.textMuted }}>No products found</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${adminTheme.border}` }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Product</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Category</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: adminTheme.textMuted, fontSize: '12px' }}>Wattage</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Replaces</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', color: adminTheme.textMuted, fontSize: '12px' }}>Price</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: adminTheme.textMuted, fontSize: '12px' }}>Active</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', color: adminTheme.textMuted, fontSize: '12px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(product => (
                  <tr
                    key={product.id}
                    style={{ borderBottom: `1px solid ${adminTheme.border}` }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = adminTheme.bgHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px' }}
                          />
                        ) : (
                          <div style={{
                            width: '40px',
                            height: '40px',
                            backgroundColor: adminTheme.bgHover,
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Package size={20} style={{ color: adminTheme.textMuted }} />
                          </div>
                        )}
                        <div>
                          <div style={{ color: adminTheme.text, fontSize: '14px', fontWeight: '500' }}>{product.name}</div>
                          {product.dlc_listed && <Badge color="success">DLC</Badge>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge color="accent">{product.category}</Badge>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: adminTheme.text, fontSize: '14px' }}>
                      {product.wattage}W
                    </td>
                    <td style={{ padding: '12px 16px', color: adminTheme.textMuted, fontSize: '13px' }}>
                      {product.replaces_fixture_type || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: adminTheme.text, fontSize: '14px', fontWeight: '500' }}>
                      ${product.unit_price?.toFixed(2) || '0.00'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <Badge color={product.active !== false ? 'success' : 'default'}>
                        {product.active !== false ? 'Yes' : 'No'}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setEditingProduct(product)}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: adminTheme.bgHover,
                            border: `1px solid ${adminTheme.border}`,
                            borderRadius: '6px',
                            color: adminTheme.textMuted,
                            cursor: 'pointer'
                          }}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(product)}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: adminTheme.errorBg,
                            border: 'none',
                            borderRadius: '6px',
                            color: adminTheme.error,
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '16px'
        }}>
          {filtered.map(product => (
            <div
              key={product.id}
              style={{
                backgroundColor: adminTheme.bgCard,
                border: `1px solid ${adminTheme.border}`,
                borderRadius: '10px',
                overflow: 'hidden'
              }}
            >
              <div style={{
                height: '120px',
                backgroundColor: adminTheme.bgHover,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Package size={40} style={{ color: adminTheme.textMuted }} />
                )}
              </div>
              <div style={{ padding: '16px' }}>
                <div style={{ color: adminTheme.text, fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                  {product.name}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <Badge color="accent">{product.category}</Badge>
                  <Badge>{product.wattage}W</Badge>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: adminTheme.accent, fontSize: '18px', fontWeight: '600' }}>
                    ${product.unit_price?.toFixed(2) || '0.00'}
                  </span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => setEditingProduct(product)} style={{ padding: '6px', background: 'none', border: 'none', color: adminTheme.textMuted, cursor: 'pointer' }}>
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(product)} style={{ padding: '6px', background: 'none', border: 'none', color: adminTheme.error, cursor: 'pointer' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Product Modal */}
      <AdminModal isOpen={!!editingProduct} onClose={() => setEditingProduct(null)} title={editingProduct?.id ? 'Edit Product' : 'Add Product'} width="600px">
        {editingProduct && (
          <>
            <FormField label="Product Name" required>
              <FormInput value={editingProduct.name} onChange={(v) => setEditingProduct({ ...editingProduct, name: v })} />
            </FormField>

            <FormField label="Description">
              <FormTextarea value={editingProduct.description} onChange={(v) => setEditingProduct({ ...editingProduct, description: v })} />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Category" required>
                <FormSelect
                  value={editingProduct.category}
                  onChange={(v) => setEditingProduct({ ...editingProduct, category: v })}
                  options={PRODUCT_CATEGORIES.map(c => ({ value: c, label: c }))}
                />
              </FormField>
              <FormField label="Wattage" required>
                <FormInput type="number" value={editingProduct.wattage} onChange={(v) => setEditingProduct({ ...editingProduct, wattage: parseInt(v) })} />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Replaces Fixture Type">
                <FormInput value={editingProduct.replaces_fixture_type} onChange={(v) => setEditingProduct({ ...editingProduct, replaces_fixture_type: v })} placeholder="e.g., 4ft 4-lamp T8" />
              </FormField>
              <FormField label="Replaces Wattage">
                <FormInput type="number" value={editingProduct.replaces_wattage} onChange={(v) => setEditingProduct({ ...editingProduct, replaces_wattage: parseInt(v) })} />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <FormField label="Lumens">
                <FormInput type="number" value={editingProduct.lumens} onChange={(v) => setEditingProduct({ ...editingProduct, lumens: parseInt(v) })} />
              </FormField>
              <FormField label="Color Temp">
                <FormSelect
                  value={editingProduct.color_temp}
                  onChange={(v) => setEditingProduct({ ...editingProduct, color_temp: v })}
                  options={COLOR_TEMPS.map(c => ({ value: c, label: c }))}
                  placeholder="Select"
                />
              </FormField>
              <FormField label="CRI">
                <FormInput type="number" value={editingProduct.cri} onChange={(v) => setEditingProduct({ ...editingProduct, cri: parseInt(v) })} />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Unit Price ($)">
                <FormInput type="number" step="0.01" value={editingProduct.unit_price} onChange={(v) => setEditingProduct({ ...editingProduct, unit_price: parseFloat(v) })} />
              </FormField>
              <FormField label="Cost ($)">
                <FormInput type="number" step="0.01" value={editingProduct.cost} onChange={(v) => setEditingProduct({ ...editingProduct, cost: parseFloat(v) })} />
              </FormField>
            </div>

            <FormField label="Image URL">
              <FormInput value={editingProduct.image_url} onChange={(v) => setEditingProduct({ ...editingProduct, image_url: v })} />
            </FormField>

            <FormField label="Spec Sheet URL">
              <FormInput value={editingProduct.spec_sheet_url} onChange={(v) => setEditingProduct({ ...editingProduct, spec_sheet_url: v })} />
            </FormField>

            <div style={{ display: 'flex', gap: '24px', margin: '16px 0' }}>
              <FormToggle checked={editingProduct.dlc_listed} onChange={(v) => setEditingProduct({ ...editingProduct, dlc_listed: v })} label="DLC Listed" />
              <FormToggle checked={editingProduct.active !== false} onChange={(v) => setEditingProduct({ ...editingProduct, active: v })} label="Active" />
            </div>

            {editingProduct.dlc_listed && (
              <FormField label="DLC Product ID">
                <FormInput value={editingProduct.dlc_product_id} onChange={(v) => setEditingProduct({ ...editingProduct, dlc_product_id: v })} />
              </FormField>
            )}

            <ModalFooter onCancel={() => setEditingProduct(null)} onSave={handleSave} saving={saving} />
          </>
        )}
      </AdminModal>
    </div>
  )
}
