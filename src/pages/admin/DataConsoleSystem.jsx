import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { adminTheme } from './components/adminTheme'
import AdminModal, { FormField, FormInput, FormTextarea, FormToggle, ModalFooter } from './components/AdminModal'
import { Settings, Plus, Edit2, Trash2, Save, RefreshCw, Key, ToggleLeft, Type, Hash } from 'lucide-react'

const TYPE_ICONS = {
  string: Type,
  number: Hash,
  boolean: ToggleLeft,
  json: Key
}

export default function DataConsoleSystem() {
  const [settings, setSettings] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  // Group settings by category
  const [categories, setCategories] = useState([])

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .order('category')
        .order('key')

      if (error) throw error

      setSettings(data || [])

      // Extract unique categories
      const cats = [...new Set((data || []).map(s => s.category || 'General'))]
      setCategories(cats)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)

    try {
      const data = {
        key: editing.key,
        value: editing.value,
        value_type: editing.value_type,
        category: editing.category || 'General',
        description: editing.description
      }

      if (editing.id) {
        await supabase.from('system_settings').update(data).eq('id', editing.id)
      } else {
        await supabase.from('system_settings').insert(data)
      }

      await fetchSettings()
      setEditing(null)
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this setting?')) return

    try {
      await supabase.from('system_settings').delete().eq('id', id)
      await fetchSettings()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const handleQuickUpdate = async (setting, newValue) => {
    try {
      await supabase.from('system_settings').update({ value: newValue }).eq('id', setting.id)
      await fetchSettings()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const getSettingsByCategory = (category) => {
    return settings.filter(s => (s.category || 'General') === category)
  }

  const renderValueInput = (setting) => {
    switch (setting.value_type) {
      case 'boolean':
        return (
          <button
            onClick={() => handleQuickUpdate(setting, setting.value === 'true' ? 'false' : 'true')}
            style={{
              padding: '6px 12px',
              backgroundColor: setting.value === 'true' ? 'rgba(34, 197, 94, 0.2)' : adminTheme.bgHover,
              border: `1px solid ${setting.value === 'true' ? adminTheme.success : adminTheme.border}`,
              borderRadius: '6px',
              color: setting.value === 'true' ? adminTheme.success : adminTheme.textMuted,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            {setting.value === 'true' ? 'Enabled' : 'Disabled'}
          </button>
        )
      case 'number':
        return (
          <input
            type="number"
            value={setting.value}
            onChange={(e) => handleQuickUpdate(setting, e.target.value)}
            style={{
              padding: '6px 12px',
              backgroundColor: adminTheme.bgInput,
              border: `1px solid ${adminTheme.border}`,
              borderRadius: '6px',
              color: adminTheme.text,
              fontSize: '14px',
              width: '120px'
            }}
          />
        )
      default:
        return (
          <div style={{
            color: adminTheme.text,
            fontSize: '14px',
            maxWidth: '300px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {setting.value}
          </div>
        )
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ color: adminTheme.text, fontSize: '24px', fontWeight: '700' }}>
          System Settings
        </h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={fetchSettings}
            style={{
              padding: '8px 16px',
              backgroundColor: adminTheme.bgHover,
              border: `1px solid ${adminTheme.border}`,
              borderRadius: '8px',
              color: adminTheme.text,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => setEditing({
              key: '',
              value: '',
              value_type: 'string',
              category: 'General',
              description: ''
            })}
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
            <Plus size={16} /> Add Setting
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: adminTheme.textMuted }}>Loading...</div>
      ) : settings.length === 0 ? (
        <div style={{
          backgroundColor: adminTheme.bgCard,
          border: `1px solid ${adminTheme.border}`,
          borderRadius: '12px',
          padding: '40px',
          textAlign: 'center'
        }}>
          <Settings size={48} style={{ color: adminTheme.textMuted, marginBottom: '16px' }} />
          <div style={{ color: adminTheme.text, fontSize: '18px', marginBottom: '8px' }}>No Settings Yet</div>
          <div style={{ color: adminTheme.textMuted, fontSize: '14px', marginBottom: '24px' }}>
            Add system settings to configure your application
          </div>
          <button
            onClick={() => setEditing({
              key: '',
              value: '',
              value_type: 'string',
              category: 'General',
              description: ''
            })}
            style={{
              padding: '10px 20px',
              backgroundColor: adminTheme.accent,
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Add First Setting
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {categories.map(category => (
            <div
              key={category}
              style={{
                backgroundColor: adminTheme.bgCard,
                border: `1px solid ${adminTheme.border}`,
                borderRadius: '12px',
                overflow: 'hidden'
              }}
            >
              {/* Category Header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${adminTheme.border}`,
                backgroundColor: adminTheme.bgHover
              }}>
                <div style={{ color: adminTheme.text, fontSize: '16px', fontWeight: '600' }}>
                  {category}
                </div>
              </div>

              {/* Settings List */}
              <div>
                {getSettingsByCategory(category).map(setting => {
                  const TypeIcon = TYPE_ICONS[setting.value_type] || Type

                  return (
                    <div
                      key={setting.id}
                      style={{
                        padding: '16px 20px',
                        borderBottom: `1px solid ${adminTheme.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px'
                      }}
                    >
                      {/* Type Icon */}
                      <div style={{
                        width: '32px',
                        height: '32px',
                        backgroundColor: adminTheme.accentBg,
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <TypeIcon size={16} style={{ color: adminTheme.accent }} />
                      </div>

                      {/* Key & Description */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: adminTheme.text, fontSize: '14px', fontWeight: '500', fontFamily: 'monospace' }}>
                          {setting.key}
                        </div>
                        {setting.description && (
                          <div style={{ color: adminTheme.textMuted, fontSize: '12px', marginTop: '2px' }}>
                            {setting.description}
                          </div>
                        )}
                      </div>

                      {/* Value */}
                      <div style={{ minWidth: '150px' }}>
                        {renderValueInput(setting)}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => setEditing(setting)}
                          style={{ padding: '6px', background: 'none', border: 'none', color: adminTheme.textMuted, cursor: 'pointer' }}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(setting.id)}
                          style={{ padding: '6px', background: 'none', border: 'none', color: adminTheme.error, cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      <AdminModal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit Setting' : 'Add Setting'}
        width="500px"
      >
        {editing && (
          <>
            <FormField label="Key" required>
              <FormInput
                value={editing.key}
                onChange={(v) => setEditing({ ...editing, key: v })}
                placeholder="e.g., feature_x_enabled"
                disabled={!!editing.id}
              />
            </FormField>

            <FormField label="Value Type" required>
              <select
                value={editing.value_type}
                onChange={(e) => setEditing({ ...editing, value_type: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: adminTheme.bgInput,
                  border: `1px solid ${adminTheme.border}`,
                  borderRadius: '8px',
                  color: adminTheme.text,
                  fontSize: '14px'
                }}
              >
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="json">JSON</option>
              </select>
            </FormField>

            <FormField label="Value" required>
              {editing.value_type === 'boolean' ? (
                <select
                  value={editing.value}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: adminTheme.bgInput,
                    border: `1px solid ${adminTheme.border}`,
                    borderRadius: '8px',
                    color: adminTheme.text,
                    fontSize: '14px'
                  }}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : editing.value_type === 'json' ? (
                <FormTextarea
                  value={editing.value}
                  onChange={(v) => setEditing({ ...editing, value: v })}
                  rows={4}
                  placeholder='{"key": "value"}'
                />
              ) : (
                <FormInput
                  type={editing.value_type === 'number' ? 'number' : 'text'}
                  value={editing.value}
                  onChange={(v) => setEditing({ ...editing, value: v })}
                />
              )}
            </FormField>

            <FormField label="Category">
              <FormInput
                value={editing.category}
                onChange={(v) => setEditing({ ...editing, category: v })}
                placeholder="e.g., General, Email, Features"
              />
            </FormField>

            <FormField label="Description">
              <FormTextarea
                value={editing.description}
                onChange={(v) => setEditing({ ...editing, description: v })}
                rows={2}
                placeholder="What this setting controls..."
              />
            </FormField>

            <ModalFooter onCancel={() => setEditing(null)} onSave={handleSave} saving={saving} />
          </>
        )}
      </AdminModal>
    </div>
  )
}
