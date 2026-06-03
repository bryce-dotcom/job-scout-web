import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useSmartBack from '../lib/useSmartBack'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { ArrowLeft, Pencil, Building2, Mail, Phone, MapPin, FileText, Package, DollarSign } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', bgCardHover: '#eef2eb',
  border: '#d6cdb8', text: '#2c3530', textSecondary: '#4d5a52',
  textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)'
}

export default function VendorDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const goBack = useSmartBack('/vendors')
  const isMobile = useIsMobile()
  const companyId = useStore((s) => s.companyId)
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const [vendor, setVendor] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    if (!companyId) { navigate('/'); return }
    fetchData()
  }, [companyId, id])

  const fetchData = async () => {
    setLoading(true)
    const [vRes, prodRes] = await Promise.all([
      supabase.from('vendors').select('*').eq('id', id).eq('company_id', companyId).maybeSingle(),
      supabase.from('products_services').select('id, item_id, name, unit_price, cost, vendor_sku, lead_time_days, active')
        .eq('company_id', companyId).eq('default_vendor_id', id).order('name'),
    ])
    setVendor(vRes.data || null)
    setProducts(prodRes.data || [])
    setLoading(false)
  }

  if (loading) {
    return <div style={{ padding: 24, color: theme.textMuted }}>Loading vendor…</div>
  }
  if (!vendor) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: '#dc2626', marginBottom: 16 }}>Vendor not found.</p>
        <button onClick={() => navigate('/vendors')} style={{
          color: theme.accent, textDecoration: 'underline',
          background: 'none', border: 'none', cursor: 'pointer',
        }}>← Back to Vendors</button>
      </div>
    )
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        marginBottom: 24, flexWrap: 'wrap',
      }}>
        <button
          onClick={goBack}
          style={{
            padding: 10, backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 8,
            cursor: 'pointer', color: theme.textSecondary,
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{
          width: 48, height: 48, borderRadius: 10,
          backgroundColor: theme.accentBg, color: theme.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 22, flexShrink: 0,
        }}>
          {vendor.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Vendor
          </p>
          <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, color: theme.text, margin: 0 }}>
            {vendor.name}
          </h1>
          {vendor.business_name && (
            <p style={{ fontSize: 14, color: theme.textSecondary, margin: '2px 0 0' }}>
              {vendor.business_name}
            </p>
          )}
        </div>
        <button
          onClick={() => navigate('/vendors', { state: { editId: vendor.id } })}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', backgroundColor: theme.accentBg,
            color: theme.accent, border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Pencil size={14} />
          Edit
        </button>
      </div>

      {/* Contact card */}
      <div style={{
        backgroundColor: theme.bgCard,
        border: `1px solid ${theme.border}`, borderRadius: 12,
        padding: 20, marginBottom: 20,
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: 16,
      }}>
        <ContactRow icon={<Building2 size={16} />} label="Contact" value={vendor.contact_name} theme={theme} />
        <ContactRow icon={<Phone size={16} />} label="Phone" value={vendor.phone} theme={theme}
          href={vendor.phone ? `tel:${vendor.phone}` : undefined} />
        <ContactRow icon={<Mail size={16} />} label="Email" value={vendor.email} theme={theme}
          href={vendor.email ? `mailto:${vendor.email}` : undefined} />
        <ContactRow icon={<DollarSign size={16} />} label="Payment terms" value={vendor.default_payment_terms} theme={theme} />
        <ContactRow icon={<MapPin size={16} />} label="Billing address" value={vendor.billing_address} theme={theme} fullSpan />
      </div>

      {vendor.notes && (
        <div style={{
          backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`, borderRadius: 12,
          padding: 20, marginBottom: 20,
        }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>
            Notes
          </p>
          <p style={{ fontSize: 14, color: theme.text, margin: 0, whiteSpace: 'pre-wrap' }}>
            {vendor.notes}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 16,
        borderBottom: `1px solid ${theme.border}`,
      }}>
        {[
          { id: 'products', label: `Products (${products.length})`, icon: Package },
          { id: 'pos', label: 'Purchase Orders', icon: FileText, disabled: true },
          { id: 'bills', label: 'Bills', icon: DollarSign, disabled: true },
        ].map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.id || (activeTab === 'overview' && tab.id === 'products')
          return (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              disabled={tab.disabled}
              style={{
                padding: '10px 16px',
                background: 'none', border: 'none',
                borderBottom: active ? `2px solid ${theme.accent}` : '2px solid transparent',
                color: tab.disabled ? theme.textMuted : (active ? theme.accent : theme.textSecondary),
                fontSize: 13, fontWeight: 600,
                cursor: tab.disabled ? 'not-allowed' : 'pointer',
                opacity: tab.disabled ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
                marginBottom: -1,
              }}
              title={tab.disabled ? 'Coming in the next phase' : ''}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab body */}
      {(activeTab === 'overview' || activeTab === 'products') && (
        products.length === 0 ? (
          <div style={{
            padding: 32, textAlign: 'center',
            backgroundColor: theme.bgCard,
            border: `1px dashed ${theme.border}`, borderRadius: 12,
            color: theme.textMuted, fontSize: 14,
          }}>
            No products linked to this vendor yet.
            <div style={{ fontSize: 12, marginTop: 6 }}>
              Set <strong>{vendor.name}</strong> as the Default Vendor on any product in Products &amp; Services to link it here.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {products.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px',
                backgroundColor: theme.bgCard,
                border: `1px solid ${theme.border}`, borderRadius: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                    {p.item_id ? `${p.item_id} · ` : ''}
                    {p.vendor_sku ? `Vendor SKU: ${p.vendor_sku} · ` : ''}
                    {p.lead_time_days ? `Lead time: ${p.lead_time_days}d` : 'No lead time set'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                    ${parseFloat(p.unit_price || 0).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>
                    cost ${parseFloat(p.cost || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === 'pos' && (
        <div style={{ padding: 32, textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>
          Purchase Order list arrives in Phase 1B.
        </div>
      )}
      {activeTab === 'bills' && (
        <div style={{ padding: 32, textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>
          Bills arrive in Phase 1F.
        </div>
      )}
    </div>
  )
}

function ContactRow({ icon, label, value, theme, href, fullSpan }) {
  if (!value) return (
    <div style={{ gridColumn: fullSpan ? '1 / -1' : undefined }}>
      <p style={{ fontSize: 11, color: theme.textMuted, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon} {label}
      </p>
      <p style={{ fontSize: 14, color: theme.textMuted, margin: 0, fontStyle: 'italic' }}>—</p>
    </div>
  )
  return (
    <div style={{ gridColumn: fullSpan ? '1 / -1' : undefined }}>
      <p style={{ fontSize: 11, color: theme.textMuted, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon} {label}
      </p>
      {href ? (
        <a href={href} style={{ fontSize: 14, fontWeight: 500, color: theme.accent, textDecoration: 'none' }}>
          {value}
        </a>
      ) : (
        <p style={{ fontSize: 14, fontWeight: 500, color: theme.text, margin: 0, whiteSpace: 'pre-wrap' }}>{value}</p>
      )}
    </div>
  )
}
