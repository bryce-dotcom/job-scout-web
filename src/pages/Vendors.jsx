import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { Plus, Pencil, X, Search, Building2, Mail, Phone, MapPin } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'
import PageHeader from '../components/PageHeader'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', bgCardHover: '#eef2eb',
  border: '#d6cdb8', text: '#2c3530', textSecondary: '#4d5a52',
  textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)'
}

const emptyVendor = {
  name: '',
  business_name: '',
  contact_name: '',
  email: '',
  phone: '',
  billing_address: '',
  default_payment_terms: 'Net 30',
  default_tax_rate: '',
  notes: '',
  active: true,
  is_internal: false,
}

export default function Vendors() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const companyId = useStore((s) => s.companyId)
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingVendor, setEditingVendor] = useState(null)
  const [formData, setFormData] = useState(emptyVendor)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!companyId) { navigate('/'); return }
    fetchVendors()
  }, [companyId])

  const fetchVendors = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('company_id', companyId)
      .order('name', { ascending: true })
    if (error) toast.error('Failed to load vendors: ' + error.message)
    setVendors(data || [])
    setLoading(false)
  }

  const openCreate = () => {
    setEditingVendor(null)
    setFormData(emptyVendor)
    setShowModal(true)
  }

  const openEdit = (v) => {
    setEditingVendor(v)
    setFormData({
      name: v.name || '',
      business_name: v.business_name || '',
      contact_name: v.contact_name || '',
      email: v.email || '',
      phone: v.phone || '',
      billing_address: v.billing_address || '',
      default_payment_terms: v.default_payment_terms || 'Net 30',
      default_tax_rate: v.default_tax_rate ?? '',
      notes: v.notes || '',
      active: v.active !== false,
      is_internal: v.is_internal || false,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Vendor name is required')
      return
    }
    setSaving(true)
    const payload = {
      company_id: companyId,
      name: formData.name.trim(),
      business_name: formData.business_name || null,
      contact_name: formData.contact_name || null,
      email: formData.email || null,
      phone: formData.phone || null,
      billing_address: formData.billing_address || null,
      default_payment_terms: formData.default_payment_terms || 'Net 30',
      default_tax_rate: formData.default_tax_rate === '' ? null : parseFloat(formData.default_tax_rate) || 0,
      notes: formData.notes || null,
      active: formData.active !== false,
      is_internal: formData.is_internal || false,
      updated_at: new Date().toISOString(),
    }
    const op = editingVendor
      ? supabase.from('vendors').update(payload).eq('id', editingVendor.id)
      : supabase.from('vendors').insert(payload)
    const { error } = await op
    if (error) {
      toast.error('Save failed: ' + error.message)
    } else {
      toast.success(editingVendor ? 'Vendor updated' : 'Vendor created')
      setShowModal(false)
      await fetchVendors()
    }
    setSaving(false)
  }

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return (vendors || []).filter(v => {
      if (!showInactive && v.active === false) return false
      if (!term) return true
      return [v.name, v.business_name, v.contact_name, v.email, v.phone]
        .filter(Boolean).some(s => String(s).toLowerCase().includes(term))
    })
  }, [vendors, searchTerm, showInactive])

  if (loading) {
    return <div style={{ padding: 24, color: theme.textMuted }}>Loading vendors…</div>
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px' }}>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers you order parts and materials from"
        icon={Building2}
      />

      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap',
        alignItems: 'center', marginBottom: 16,
      }}>
        <div style={{
          position: 'relative', flex: 1, minWidth: 220,
        }}>
          <Search size={16} style={{
            position: 'absolute', left: 12, top: '50%',
            transform: 'translateY(-50%)', color: theme.textMuted,
          }} />
          <input
            type="text"
            placeholder="Search by name, contact, email, phone…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px 10px 36px',
              border: `1px solid ${theme.border}`, borderRadius: 8,
              backgroundColor: theme.bgCard, color: theme.text, fontSize: 14,
              outline: 'none',
            }}
          />
        </div>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 13, color: theme.textSecondary, cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
        <button
          onClick={openCreate}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', backgroundColor: theme.accent,
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={16} />
          Add Vendor
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{
          padding: 32, textAlign: 'center',
          backgroundColor: theme.bgCard,
          border: `1px dashed ${theme.border}`, borderRadius: 12,
          color: theme.textMuted,
        }}>
          {vendors.length === 0
            ? 'No vendors yet. Click "Add Vendor" to create your first supplier.'
            : 'No vendors match this search.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(v => (
            <div
              key={v.id}
              onClick={() => navigate(`/vendors/${v.id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '14px 18px',
                backgroundColor: theme.bgCard,
                border: `1px solid ${theme.border}`, borderRadius: 12,
                cursor: 'pointer',
                opacity: v.active === false ? 0.6 : 1,
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.bgCardHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.bgCard}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                backgroundColor: theme.accentBg, color: theme.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 16, flexShrink: 0,
              }}>
                {v.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>
                  {v.name}
                  {v.is_internal && (
                    <span style={{
                      marginLeft: 8, fontSize: 11, padding: '2px 8px',
                      borderRadius: 10, backgroundColor: 'rgba(124,58,237,0.12)',
                      color: '#7c3aed', fontWeight: 600,
                    }}>In-house</span>
                  )}
                  {v.active === false && (
                    <span style={{
                      marginLeft: 8, fontSize: 11, padding: '2px 8px',
                      borderRadius: 10, backgroundColor: 'rgba(125,138,127,0.15)',
                      color: theme.textMuted, fontWeight: 500,
                    }}>Inactive</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4, fontSize: 12, color: theme.textMuted }}>
                  {v.contact_name && <span>{v.contact_name}</span>}
                  {v.email && <span><Mail size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{v.email}</span>}
                  {v.phone && <span><Phone size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{v.phone}</span>}
                  {v.default_payment_terms && <span>{v.default_payment_terms}</span>}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); openEdit(v) }}
                style={{
                  padding: 8, backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`, borderRadius: 6,
                  cursor: 'pointer', color: theme.textSecondary,
                }}
                title="Edit vendor"
              >
                <Pencil size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          onClick={() => !saving && setShowModal(false)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.bgCard, borderRadius: 12,
              border: `1px solid ${theme.border}`, padding: 24,
              width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
            }}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 20,
            }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: theme.text, margin: 0 }}>
                {editingVendor ? 'Edit Vendor' : 'New Vendor'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: theme.textMuted, padding: 4,
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Vendor name *" value={formData.name}
                onChange={(v) => setFormData(p => ({ ...p, name: v }))} theme={theme} required />
              <Field label="Business name (DBA)" value={formData.business_name}
                onChange={(v) => setFormData(p => ({ ...p, business_name: v }))} theme={theme}
                hint="If different from the vendor name above" />
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                <Field label="Contact name" value={formData.contact_name}
                  onChange={(v) => setFormData(p => ({ ...p, contact_name: v }))} theme={theme} />
                <Field label="Phone" value={formData.phone}
                  onChange={(v) => setFormData(p => ({ ...p, phone: v }))} theme={theme} />
              </div>
              <Field label="Email" value={formData.email} type="email"
                onChange={(v) => setFormData(p => ({ ...p, email: v }))} theme={theme}
                hint="Used for emailing POs directly to the vendor" />
              <Field label="Billing address" value={formData.billing_address} multiline
                onChange={(v) => setFormData(p => ({ ...p, billing_address: v }))} theme={theme} />
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                <Field label="Default payment terms" value={formData.default_payment_terms}
                  onChange={(v) => setFormData(p => ({ ...p, default_payment_terms: v }))} theme={theme}
                  hint="e.g. Net 30, COD, Due on receipt" />
                <Field label="Default tax rate (%)" value={formData.default_tax_rate} type="number"
                  onChange={(v) => setFormData(p => ({ ...p, default_tax_rate: v }))} theme={theme} />
              </div>
              <Field label="Notes" value={formData.notes} multiline
                onChange={(v) => setFormData(p => ({ ...p, notes: v }))} theme={theme} />
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 13, color: theme.textSecondary, cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={formData.active !== false}
                  onChange={(e) => setFormData(p => ({ ...p, active: e.target.checked }))}
                />
                Active (uncheck to hide from PO dropdowns without deleting)
              </label>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 13, color: theme.textSecondary, cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={formData.is_internal || false}
                  onChange={(e) => setFormData(p => ({ ...p, is_internal: e.target.checked }))}
                />
                In-house / Internal — products assigned here won't generate external POs
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
                style={{
                  flex: 1, padding: 12,
                  border: `1px solid ${theme.border}`, backgroundColor: 'transparent',
                  color: theme.text, borderRadius: 8, fontSize: 14,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1, padding: 12,
                  backgroundColor: theme.accent, color: '#fff',
                  border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : (editingVendor ? 'Save Changes' : 'Create Vendor')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, theme, type = 'text', multiline, hint, required }) {
  const Tag = multiline ? 'textarea' : 'input'
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 12, fontWeight: 600,
        color: theme.textSecondary, marginBottom: 6,
      }}>
        {label}
      </label>
      <Tag
        type={multiline ? undefined : type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={multiline ? 3 : undefined}
        required={required}
        style={{
          width: '100%', padding: '10px 12px',
          border: `1px solid ${theme.border}`, borderRadius: 8,
          backgroundColor: theme.bgCard, color: theme.text,
          fontSize: 14, outline: 'none',
          resize: multiline ? 'vertical' : undefined,
          fontFamily: 'inherit',
        }}
      />
      {hint && (
        <p style={{ fontSize: 11, color: theme.textMuted, marginTop: 4, marginBottom: 0 }}>{hint}</p>
      )}
    </div>
  )
}
