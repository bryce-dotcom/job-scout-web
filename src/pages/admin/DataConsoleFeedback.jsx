import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { adminTheme } from './components/adminTheme'
import AdminStats from './components/AdminStats'
import { Badge } from './components/AdminStats'
import AdminModal, { FormField, FormTextarea, ModalFooter } from './components/AdminModal'
import { MessageSquare, Check, X, Clock, Bug, Lightbulb, HelpCircle, Star, Trash2 } from 'lucide-react'

const TYPE_CONFIG = {
  bug: { label: 'Bug Report', icon: Bug, color: adminTheme.error },
  feature: { label: 'Feature Request', icon: Lightbulb, color: adminTheme.warning },
  question: { label: 'Question', icon: HelpCircle, color: adminTheme.accent },
  feedback: { label: 'Feedback', icon: Star, color: adminTheme.success }
}

const STATUS_OPTIONS = ['new', 'in_progress', 'resolved', 'wont_fix']

export default function DataConsoleFeedback() {
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchFeedback()
  }, [])

  const fetchFeedback = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('*, user:user_id(email), company:company_id(name)')
        .order('created_at', { ascending: false })

      if (error) throw error
      setFeedback(data || [])
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (id, status) => {
    try {
      await supabase.from('feedback').update({
        status,
        resolved_at: status === 'resolved' ? new Date().toISOString() : null
      }).eq('id', id)
      await fetchFeedback()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const saveNotes = async () => {
    if (!selected) return
    setSaving(true)

    try {
      await supabase.from('feedback').update({
        admin_notes: adminNotes
      }).eq('id', selected.id)
      await fetchFeedback()
      setSelected(null)
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteFeedback = async (id) => {
    if (!confirm('Delete this feedback?')) return

    try {
      await supabase.from('feedback').delete().eq('id', id)
      await fetchFeedback()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const filteredFeedback = filter === 'all'
    ? feedback
    : feedback.filter(f => f.status === filter)

  const stats = [
    { icon: MessageSquare, label: 'Total', value: feedback.length },
    { icon: Clock, label: 'New', value: feedback.filter(f => f.status === 'new').length, color: adminTheme.accent },
    { icon: Clock, label: 'In Progress', value: feedback.filter(f => f.status === 'in_progress').length, color: adminTheme.warning },
    { icon: Check, label: 'Resolved', value: feedback.filter(f => f.status === 'resolved').length, color: adminTheme.success }
  ]

  const getStatusBadge = (status) => {
    const colors = {
      new: 'accent',
      in_progress: 'warning',
      resolved: 'success',
      wont_fix: 'default'
    }
    return <Badge color={colors[status] || 'default'}>{status.replace('_', ' ')}</Badge>
  }

  const getTypeIcon = (type) => {
    const config = TYPE_CONFIG[type] || TYPE_CONFIG.feedback
    const Icon = config.icon
    return <Icon size={16} style={{ color: config.color }} />
  }

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ color: adminTheme.text, fontSize: '24px', fontWeight: '700', marginBottom: '24px' }}>
        Feedback Management
      </h1>

      <AdminStats stats={stats} />

      {/* Filter Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px'
      }}>
        {['all', ...STATUS_OPTIONS].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            style={{
              padding: '8px 16px',
              backgroundColor: filter === status ? adminTheme.accentBg : adminTheme.bgCard,
              border: `1px solid ${filter === status ? adminTheme.accent : adminTheme.border}`,
              borderRadius: '8px',
              color: filter === status ? adminTheme.accent : adminTheme.textMuted,
              fontSize: '13px',
              cursor: 'pointer',
              textTransform: 'capitalize'
            }}
          >
            {status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Feedback List */}
      <div style={{
        backgroundColor: adminTheme.bgCard,
        border: `1px solid ${adminTheme.border}`,
        borderRadius: '12px',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: adminTheme.textMuted }}>Loading...</div>
        ) : filteredFeedback.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: adminTheme.textMuted }}>No feedback found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${adminTheme.border}` }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px', width: '40px' }}>Type</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Subject</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>User</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Company</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Date</th>
                <th style={{ padding: '12px 16px', width: '120px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredFeedback.map(f => (
                <tr
                  key={f.id}
                  style={{ borderBottom: `1px solid ${adminTheme.border}` }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = adminTheme.bgHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{ padding: '12px 16px' }}>{getTypeIcon(f.type)}</td>
                  <td
                    style={{ padding: '12px 16px', color: adminTheme.text, fontSize: '14px', cursor: 'pointer' }}
                    onClick={() => { setSelected(f); setAdminNotes(f.admin_notes || ''); }}
                  >
                    {f.subject || 'No subject'}
                  </td>
                  <td style={{ padding: '12px 16px', color: adminTheme.textMuted, fontSize: '13px' }}>
                    {f.user?.email || 'Unknown'}
                  </td>
                  <td style={{ padding: '12px 16px', color: adminTheme.textMuted, fontSize: '13px' }}>
                    {f.company?.name || '-'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>{getStatusBadge(f.status)}</td>
                  <td style={{ padding: '12px 16px', color: adminTheme.textMuted, fontSize: '13px' }}>
                    {new Date(f.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {f.status !== 'resolved' && (
                        <button
                          onClick={() => updateStatus(f.id, 'resolved')}
                          title="Mark Resolved"
                          style={{ padding: '6px', background: 'none', border: 'none', color: adminTheme.success, cursor: 'pointer' }}
                        >
                          <Check size={16} />
                        </button>
                      )}
                      {f.status === 'new' && (
                        <button
                          onClick={() => updateStatus(f.id, 'in_progress')}
                          title="Mark In Progress"
                          style={{ padding: '6px', background: 'none', border: 'none', color: adminTheme.warning, cursor: 'pointer' }}
                        >
                          <Clock size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => deleteFeedback(f.id)}
                        title="Delete"
                        style={{ padding: '6px', background: 'none', border: 'none', color: adminTheme.error, cursor: 'pointer' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Feedback Detail Modal */}
      <AdminModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title="Feedback Details"
        width="600px"
      >
        {selected && (
          <>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                {getTypeIcon(selected.type)}
                <span style={{ color: adminTheme.text, fontSize: '18px', fontWeight: '600' }}>
                  {selected.subject || 'No subject'}
                </span>
                {getStatusBadge(selected.status)}
              </div>

              <div style={{ display: 'flex', gap: '24px', color: adminTheme.textMuted, fontSize: '13px', marginBottom: '16px' }}>
                <span>From: {selected.user?.email || 'Unknown'}</span>
                <span>Company: {selected.company?.name || '-'}</span>
                <span>{new Date(selected.created_at).toLocaleString()}</span>
              </div>

              <div style={{
                padding: '16px',
                backgroundColor: adminTheme.bgHover,
                borderRadius: '8px',
                color: adminTheme.text,
                fontSize: '14px',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap'
              }}>
                {selected.message || 'No message'}
              </div>
            </div>

            {/* Page/URL Info */}
            {selected.page_url && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ color: adminTheme.textMuted, fontSize: '12px', marginBottom: '6px' }}>Page URL</div>
                <div style={{ color: adminTheme.text, fontSize: '13px', fontFamily: 'monospace' }}>
                  {selected.page_url}
                </div>
              </div>
            )}

            {/* Status Change */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ color: adminTheme.textMuted, fontSize: '12px', marginBottom: '8px' }}>Change Status</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {STATUS_OPTIONS.map(status => (
                  <button
                    key={status}
                    onClick={() => {
                      updateStatus(selected.id, status)
                      setSelected({ ...selected, status })
                    }}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: selected.status === status ? adminTheme.accentBg : adminTheme.bgHover,
                      border: `1px solid ${selected.status === status ? adminTheme.accent : adminTheme.border}`,
                      borderRadius: '6px',
                      color: selected.status === status ? adminTheme.accent : adminTheme.textMuted,
                      fontSize: '12px',
                      cursor: 'pointer',
                      textTransform: 'capitalize'
                    }}
                  >
                    {status.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Admin Notes */}
            <FormField label="Admin Notes">
              <FormTextarea
                value={adminNotes}
                onChange={setAdminNotes}
                rows={4}
                placeholder="Internal notes about this feedback..."
              />
            </FormField>

            <ModalFooter onCancel={() => setSelected(null)} onSave={saveNotes} saving={saving} saveLabel="Save Notes" />
          </>
        )}
      </AdminModal>
    </div>
  )
}
