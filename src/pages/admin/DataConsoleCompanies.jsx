import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { adminTheme } from './components/adminTheme'
import AdminStats from './components/AdminStats'
import AdminModal, { FormField, FormInput, FormSelect, FormTextarea, ModalFooter } from './components/AdminModal'
import { Badge } from './components/AdminStats'
import { Building2, Users, Bot, Search, Edit2, LogIn, ChevronDown, ChevronRight } from 'lucide-react'

export default function DataConsoleCompanies() {
  const navigate = useNavigate()
  const setCompany = useStore((state) => state.setCompany)

  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [editingCompany, setEditingCompany] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchCompanies()
  }, [])

  const fetchCompanies = async () => {
    setLoading(true)
    try {
      // Get companies with user counts
      const { data: companiesData } = await supabase
        .from('companies')
        .select('*')
        .order('name')

      // Get employee counts per company
      const { data: employeeCounts } = await supabase
        .from('employees')
        .select('company_id')

      // Get agent recruitments per company
      const { data: agentCounts } = await supabase
        .from('company_agents')
        .select('company_id')

      const enriched = (companiesData || []).map(c => ({
        ...c,
        user_count: employeeCounts?.filter(e => e.company_id === c.id).length || 0,
        agent_count: agentCounts?.filter(a => a.company_id === c.id).length || 0
      }))

      setCompanies(enriched)
    } catch (err) {
      console.error('Error fetching companies:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!editingCompany) return
    setSaving(true)

    try {
      const { error } = await supabase
        .from('companies')
        .update({
          name: editingCompany.name,
          owner_email: editingCompany.owner_email,
          plan_type: editingCompany.plan_type,
          status: editingCompany.status,
          notes: editingCompany.notes
        })
        .eq('id', editingCompany.id)

      if (error) throw error

      await fetchCompanies()
      setEditingCompany(null)
    } catch (err) {
      alert('Error saving: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleImpersonate = async (company) => {
    if (!confirm(`Impersonate ${company.name}? This will switch your session to that company.`)) return

    setCompany(company)
    navigate('/dashboard')
  }

  const filtered = companies.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.owner_email?.toLowerCase().includes(search.toLowerCase())
  )

  const stats = [
    { icon: Building2, label: 'Total Companies', value: companies.length },
    { icon: Building2, label: 'Active', value: companies.filter(c => c.status === 'active').length, color: adminTheme.success },
    { icon: Building2, label: 'Trial', value: companies.filter(c => c.status === 'trial').length, color: adminTheme.warning },
    { icon: Users, label: 'Total Users', value: companies.reduce((sum, c) => sum + (c.user_count || 0), 0) }
  ]

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'success'
      case 'trial': return 'warning'
      case 'suspended': return 'error'
      default: return 'default'
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ color: adminTheme.text, fontSize: '24px', fontWeight: '700', marginBottom: '24px' }}>
        Companies
      </h1>

      <AdminStats stats={stats} />

      {/* Search */}
      <div style={{
        backgroundColor: adminTheme.bgCard,
        border: `1px solid ${adminTheme.border}`,
        borderRadius: '10px',
        padding: '16px',
        marginBottom: '16px'
      }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: adminTheme.textMuted
          }} />
          <input
            type="text"
            placeholder="Search companies..."
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
      </div>

      {/* Table */}
      <div style={{
        backgroundColor: adminTheme.bgCard,
        border: `1px solid ${adminTheme.border}`,
        borderRadius: '10px',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: adminTheme.textMuted }}>
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: adminTheme.textMuted }}>
            No companies found
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${adminTheme.border}` }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px', fontWeight: '500' }}>ID</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px', fontWeight: '500' }}>Company</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px', fontWeight: '500' }}>Owner</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px', fontWeight: '500' }}>Plan</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px', fontWeight: '500' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: adminTheme.textMuted, fontSize: '12px', fontWeight: '500' }}>Users</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: adminTheme.textMuted, fontSize: '12px', fontWeight: '500' }}>Agents</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', color: adminTheme.textMuted, fontSize: '12px', fontWeight: '500' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(company => (
                <>
                  <tr
                    key={company.id}
                    onClick={() => setExpandedId(expandedId === company.id ? null : company.id)}
                    style={{
                      borderBottom: `1px solid ${adminTheme.border}`,
                      cursor: 'pointer',
                      backgroundColor: expandedId === company.id ? adminTheme.bgHover : 'transparent'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = adminTheme.bgHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = expandedId === company.id ? adminTheme.bgHover : 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', color: adminTheme.textDim, fontSize: '13px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {expandedId === company.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {company.id}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: adminTheme.text, fontSize: '14px', fontWeight: '500' }}>
                      {company.name}
                    </td>
                    <td style={{ padding: '12px 16px', color: adminTheme.textMuted, fontSize: '13px' }}>
                      {company.owner_email || '-'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge color="accent">{company.plan_type || 'Free'}</Badge>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge color={getStatusColor(company.status)}>{company.status || 'active'}</Badge>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: adminTheme.text, fontSize: '14px' }}>
                      {company.user_count}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', color: adminTheme.text, fontSize: '14px' }}>
                      {company.agent_count}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setEditingCompany(company)}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: adminTheme.bgHover,
                            border: `1px solid ${adminTheme.border}`,
                            borderRadius: '6px',
                            color: adminTheme.textMuted,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px'
                          }}
                        >
                          <Edit2 size={14} /> Edit
                        </button>
                        <button
                          onClick={() => handleImpersonate(company)}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: adminTheme.accentBg,
                            border: 'none',
                            borderRadius: '6px',
                            color: adminTheme.accent,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px'
                          }}
                        >
                          <LogIn size={14} /> Enter
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === company.id && (
                    <tr>
                      <td colSpan={8} style={{ padding: '16px', backgroundColor: adminTheme.bg }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                          <div>
                            <div style={{ color: adminTheme.textMuted, fontSize: '11px', marginBottom: '4px' }}>Created</div>
                            <div style={{ color: adminTheme.text, fontSize: '13px' }}>
                              {company.created_at ? new Date(company.created_at).toLocaleDateString() : '-'}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: adminTheme.textMuted, fontSize: '11px', marginBottom: '4px' }}>Address</div>
                            <div style={{ color: adminTheme.text, fontSize: '13px' }}>
                              {company.city && company.state ? `${company.city}, ${company.state}` : '-'}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: adminTheme.textMuted, fontSize: '11px', marginBottom: '4px' }}>Notes</div>
                            <div style={{ color: adminTheme.text, fontSize: '13px' }}>
                              {company.notes || '-'}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Modal */}
      <AdminModal
        isOpen={!!editingCompany}
        onClose={() => setEditingCompany(null)}
        title="Edit Company"
      >
        {editingCompany && (
          <>
            <FormField label="Company Name" required>
              <FormInput
                value={editingCompany.name}
                onChange={(v) => setEditingCompany({ ...editingCompany, name: v })}
              />
            </FormField>

            <FormField label="Owner Email">
              <FormInput
                type="email"
                value={editingCompany.owner_email}
                onChange={(v) => setEditingCompany({ ...editingCompany, owner_email: v })}
              />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Plan Type">
                <FormSelect
                  value={editingCompany.plan_type}
                  onChange={(v) => setEditingCompany({ ...editingCompany, plan_type: v })}
                  options={[
                    { value: 'free', label: 'Free' },
                    { value: 'pro', label: 'Pro' },
                    { value: 'enterprise', label: 'Enterprise' }
                  ]}
                />
              </FormField>

              <FormField label="Status">
                <FormSelect
                  value={editingCompany.status}
                  onChange={(v) => setEditingCompany({ ...editingCompany, status: v })}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'trial', label: 'Trial' },
                    { value: 'suspended', label: 'Suspended' }
                  ]}
                />
              </FormField>
            </div>

            <FormField label="Notes">
              <FormTextarea
                value={editingCompany.notes}
                onChange={(v) => setEditingCompany({ ...editingCompany, notes: v })}
                rows={3}
              />
            </FormField>

            <ModalFooter
              onCancel={() => setEditingCompany(null)}
              onSave={handleSave}
              saving={saving}
            />
          </>
        )}
      </AdminModal>
    </div>
  )
}
