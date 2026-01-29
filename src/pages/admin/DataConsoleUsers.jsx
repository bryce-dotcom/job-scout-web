import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { adminTheme } from './components/adminTheme'
import AdminStats from './components/AdminStats'
import AdminModal, { FormField, FormInput, FormSelect, FormToggle, ModalFooter } from './components/AdminModal'
import { Badge } from './components/AdminStats'
import { Users, Shield, Code, Search, Edit2 } from 'lucide-react'

export default function DataConsoleUsers() {
  const [users, setUsers] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCompany, setFilterCompany] = useState('')
  const [editingUser, setEditingUser] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [usersRes, companiesRes] = await Promise.all([
        supabase.from('employees').select('*, company:companies(id, name)').order('first_name'),
        supabase.from('companies').select('id, name').order('name')
      ])

      setUsers(usersRes.data || [])
      setCompanies(companiesRes.data || [])
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (user, field) => {
    try {
      const { error } = await supabase
        .from('employees')
        .update({ [field]: !user[field] })
        .eq('id', user.id)

      if (error) throw error

      setUsers(users.map(u => u.id === user.id ? { ...u, [field]: !u[field] } : u))
    } catch (err) {
      alert('Error updating: ' + err.message)
    }
  }

  const handleSave = async () => {
    if (!editingUser) return
    setSaving(true)

    try {
      const { error } = await supabase
        .from('employees')
        .update({
          first_name: editingUser.first_name,
          last_name: editingUser.last_name,
          email: editingUser.email,
          phone: editingUser.phone,
          role: editingUser.role,
          is_admin: editingUser.is_admin,
          is_developer: editingUser.is_developer,
          active: editingUser.active
        })
        .eq('id', editingUser.id)

      if (error) throw error

      await fetchData()
      setEditingUser(null)
    } catch (err) {
      alert('Error saving: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const filtered = users.filter(u => {
    const matchesSearch =
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
    const matchesCompany = !filterCompany || u.company_id?.toString() === filterCompany
    return matchesSearch && matchesCompany
  })

  const stats = [
    { icon: Users, label: 'Total Users', value: users.length },
    { icon: Shield, label: 'Admins', value: users.filter(u => u.is_admin).length, color: adminTheme.warning },
    { icon: Code, label: 'Developers', value: users.filter(u => u.is_developer).length, color: adminTheme.accent },
    { icon: Users, label: 'Active', value: users.filter(u => u.active !== false).length, color: adminTheme.success }
  ]

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ color: adminTheme.text, fontSize: '24px', fontWeight: '700', marginBottom: '24px' }}>
        Users
      </h1>

      <AdminStats stats={stats} />

      {/* Filters */}
      <div style={{
        backgroundColor: adminTheme.bgCard,
        border: `1px solid ${adminTheme.border}`,
        borderRadius: '10px',
        padding: '16px',
        marginBottom: '16px',
        display: 'flex',
        gap: '16px'
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
            placeholder="Search users..."
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
          value={filterCompany}
          onChange={(e) => setFilterCompany(e.target.value)}
          style={{
            padding: '10px 12px',
            backgroundColor: adminTheme.bgInput,
            border: `1px solid ${adminTheme.border}`,
            borderRadius: '8px',
            color: adminTheme.text,
            fontSize: '14px',
            minWidth: '180px'
          }}
        >
          <option value="">All Companies</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
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
            No users found
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${adminTheme.border}` }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Name</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Email</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Company</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Role</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: adminTheme.textMuted, fontSize: '12px' }}>Admin</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: adminTheme.textMuted, fontSize: '12px' }}>Developer</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: adminTheme.textMuted, fontSize: '12px' }}>Active</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', color: adminTheme.textMuted, fontSize: '12px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => (
                <tr
                  key={user.id}
                  style={{ borderBottom: `1px solid ${adminTheme.border}` }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = adminTheme.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '12px 16px', color: adminTheme.text, fontSize: '14px', fontWeight: '500' }}>
                    {user.first_name} {user.last_name}
                  </td>
                  <td style={{ padding: '12px 16px', color: adminTheme.textMuted, fontSize: '13px' }}>
                    {user.email}
                  </td>
                  <td style={{ padding: '12px 16px', color: adminTheme.textMuted, fontSize: '13px' }}>
                    {user.company?.name || '-'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Badge>{user.role || 'Employee'}</Badge>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <ToggleSwitch
                      checked={user.is_admin}
                      onChange={() => handleToggle(user, 'is_admin')}
                    />
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <ToggleSwitch
                      checked={user.is_developer}
                      onChange={() => handleToggle(user, 'is_developer')}
                    />
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <ToggleSwitch
                      checked={user.active !== false}
                      onChange={() => handleToggle(user, 'active')}
                    />
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => setEditingUser(user)}
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Modal */}
      <AdminModal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title="Edit User"
      >
        {editingUser && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="First Name" required>
                <FormInput
                  value={editingUser.first_name}
                  onChange={(v) => setEditingUser({ ...editingUser, first_name: v })}
                />
              </FormField>
              <FormField label="Last Name" required>
                <FormInput
                  value={editingUser.last_name}
                  onChange={(v) => setEditingUser({ ...editingUser, last_name: v })}
                />
              </FormField>
            </div>

            <FormField label="Email" required>
              <FormInput
                type="email"
                value={editingUser.email}
                onChange={(v) => setEditingUser({ ...editingUser, email: v })}
              />
            </FormField>

            <FormField label="Phone">
              <FormInput
                value={editingUser.phone}
                onChange={(v) => setEditingUser({ ...editingUser, phone: v })}
              />
            </FormField>

            <FormField label="Role">
              <FormSelect
                value={editingUser.role}
                onChange={(v) => setEditingUser({ ...editingUser, role: v })}
                options={[
                  { value: 'Employee', label: 'Employee' },
                  { value: 'Manager', label: 'Manager' },
                  { value: 'Admin', label: 'Admin' },
                  { value: 'Owner', label: 'Owner' }
                ]}
              />
            </FormField>

            <div style={{ display: 'flex', gap: '24px', marginTop: '16px' }}>
              <FormToggle
                checked={editingUser.is_admin}
                onChange={(v) => setEditingUser({ ...editingUser, is_admin: v })}
                label="Admin"
              />
              <FormToggle
                checked={editingUser.is_developer}
                onChange={(v) => setEditingUser({ ...editingUser, is_developer: v })}
                label="Developer"
              />
              <FormToggle
                checked={editingUser.active !== false}
                onChange={(v) => setEditingUser({ ...editingUser, active: v })}
                label="Active"
              />
            </div>

            <ModalFooter
              onCancel={() => setEditingUser(null)}
              onSave={handleSave}
              saving={saving}
            />
          </>
        )}
      </AdminModal>
    </div>
  )
}

// Small toggle for table cells
function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: '36px',
        height: '20px',
        backgroundColor: checked ? adminTheme.accent : adminTheme.bgHover,
        borderRadius: '10px',
        border: `1px solid ${checked ? adminTheme.accent : adminTheme.border}`,
        position: 'relative',
        cursor: 'pointer',
        padding: 0
      }}
    >
      <div style={{
        width: '14px',
        height: '14px',
        backgroundColor: '#fff',
        borderRadius: '50%',
        position: 'absolute',
        top: '2px',
        left: checked ? '18px' : '2px',
        transition: 'left 0.15s'
      }} />
    </button>
  )
}
