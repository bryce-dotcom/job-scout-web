import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { adminTheme } from './components/adminTheme'
import { useIsMobile } from '../../hooks/useIsMobile'
import AdminStats from './components/AdminStats'
import { Badge } from './components/AdminStats'
import AdminModal, { FormField, FormTextarea, ModalFooter } from './components/AdminModal'
import { MessageSquare, Check, X, Clock, Bug, Lightbulb, HelpCircle, Star, Trash2, Reply, Send, ChevronDown, ChevronUp } from 'lucide-react'

const TYPE_CONFIG = {
  bug: { label: 'Bug Report', icon: Bug, color: adminTheme.error },
  feature: { label: 'Feature Request', icon: Lightbulb, color: adminTheme.warning },
  question: { label: 'Question', icon: HelpCircle, color: adminTheme.accent },
  feedback: { label: 'Feedback', icon: Star, color: adminTheme.success }
}

const STATUS_OPTIONS = ['new', 'in_progress', 'resolved', 'wont_fix']

export default function DataConsoleFeedback() {
  const isMobile = useIsMobile()
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [showReply, setShowReply] = useState(false)
  const [replyMessage, setReplyMessage] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  useEffect(() => {
    fetchFeedback()
  }, [])

  const fetchFeedback = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
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
        notes: adminNotes
      }).eq('id', selected.id)
      await fetchFeedback()
      setSelected(null)
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const sendReply = async () => {
    if (!selected || !replyMessage.trim() || !selected.user_email) return
    setSendingReply(true)
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-feedback-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}`, 'apikey': ANON_KEY },
        body: JSON.stringify({
          recipient_email: selected.user_email,
          subject: selected.subject || selected.feedback_type,
          original_message: selected.message,
          reply_message: replyMessage.trim(),
          feedback_type: selected.feedback_type
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to send reply')
      }

      // Save reply to feedback record
      const existingReplies = selected.reply_history || []
      const newReply = { message: replyMessage.trim(), sent_at: new Date().toISOString() }
      await supabase.from('feedback').update({
        reply_message: replyMessage.trim(),
        replied_at: new Date().toISOString(),
        reply_history: [...existingReplies, newReply],
        status: selected.status === 'new' ? 'in_progress' : selected.status
      }).eq('id', selected.id)

      setReplyMessage('')
      setShowReply(false)
      await fetchFeedback()
      setSelected({ ...selected, reply_message: replyMessage.trim(), replied_at: new Date().toISOString(), status: selected.status === 'new' ? 'in_progress' : selected.status })
      alert('Reply sent!')
    } catch (err) {
      alert('Error sending reply: ' + err.message)
    } finally {
      setSendingReply(false)
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
    <div style={{ padding: isMobile ? '16px' : '24px' }}>
      <h1 style={{ color: adminTheme.text, fontSize: isMobile ? '20px' : '24px', fontWeight: '700', marginBottom: isMobile ? '16px' : '24px' }}>
        Feedback Management
      </h1>

      <AdminStats stats={stats} />

      {/* Filter Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        flexWrap: 'wrap'
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
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${adminTheme.border}` }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px', width: '40px' }}>Type</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Subject</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>User</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Company</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Date</th>
                <th style={{ padding: '12px 16px', width: '150px' }}></th>
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
                  <td style={{ padding: '12px 16px' }}>{getTypeIcon(f.feedback_type)}</td>
                  <td
                    style={{ padding: '12px 16px', color: adminTheme.text, fontSize: '14px', cursor: 'pointer' }}
                    onClick={() => { setSelected(f); setAdminNotes(f.notes || ''); }}
                  >
                    {f.subject || 'No subject'}
                  </td>
                  <td style={{ padding: '12px 16px', color: adminTheme.textMuted, fontSize: '13px' }}>
                    {f.user_email || 'Unknown'}
                  </td>
                  <td style={{ padding: '12px 16px', color: adminTheme.textMuted, fontSize: '13px' }}>
                    {f.company_id || '-'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>{getStatusBadge(f.status)}</td>
                  <td style={{ padding: '12px 16px', color: adminTheme.textMuted, fontSize: '13px' }}>
                    {new Date(f.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {f.user_email && (
                        <button
                          onClick={() => { setSelected(f); setAdminNotes(f.notes || ''); setShowReply(true); setReplyMessage(''); }}
                          title="Reply"
                          style={{ padding: '6px', background: 'none', border: 'none', color: adminTheme.accent, cursor: 'pointer' }}
                        >
                          <Reply size={16} />
                        </button>
                      )}
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
          </div>
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
                {getTypeIcon(selected.feedback_type)}
                <span style={{ color: adminTheme.text, fontSize: '18px', fontWeight: '600' }}>
                  {selected.subject || 'No subject'}
                </span>
                {getStatusBadge(selected.status)}
              </div>

              <div style={{ display: 'flex', gap: isMobile ? '8px' : '24px', color: adminTheme.textMuted, fontSize: '13px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <span>From: {selected.user_email || 'Unknown'}</span>
                <span>Company ID: {selected.company_id || '-'}</span>
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

            {/* Previous Replies */}
            {selected.reply_history?.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ color: adminTheme.textMuted, fontSize: '12px', marginBottom: '8px' }}>Reply History</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selected.reply_history.map((r, i) => (
                    <div key={i} style={{
                      padding: '12px',
                      backgroundColor: 'rgba(249,115,22,0.08)',
                      border: `1px solid rgba(249,115,22,0.2)`,
                      borderRadius: '8px'
                    }}>
                      <div style={{ fontSize: '13px', color: adminTheme.text, whiteSpace: 'pre-wrap', marginBottom: '6px' }}>{r.message}</div>
                      <div style={{ fontSize: '11px', color: adminTheme.textMuted }}>{new Date(r.sent_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reply Section */}
            {selected.user_email && (
              <div style={{ marginBottom: '20px' }}>
                <button
                  onClick={() => { setShowReply(!showReply); if (!showReply) setReplyMessage(''); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 16px',
                    backgroundColor: showReply ? adminTheme.accentBg : adminTheme.bgHover,
                    border: `1px solid ${showReply ? adminTheme.accent : adminTheme.border}`,
                    borderRadius: '8px',
                    color: showReply ? adminTheme.accent : adminTheme.text,
                    fontSize: '14px', fontWeight: '500',
                    cursor: 'pointer', width: '100%'
                  }}
                >
                  <Reply size={16} />
                  Reply to {selected.user_email}
                  {showReply ? <ChevronUp size={16} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={16} style={{ marginLeft: 'auto' }} />}
                </button>

                {showReply && (
                  <div style={{ marginTop: '12px' }}>
                    <FormTextarea
                      value={replyMessage}
                      onChange={setReplyMessage}
                      rows={4}
                      placeholder="Type your reply to the user..."
                    />
                    <button
                      onClick={sendReply}
                      disabled={sendingReply || !replyMessage.trim()}
                      style={{
                        marginTop: '10px',
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 20px',
                        backgroundColor: (!replyMessage.trim() || sendingReply) ? adminTheme.border : adminTheme.accent,
                        color: '#fff', border: 'none', borderRadius: '8px',
                        fontSize: '14px', fontWeight: '500',
                        cursor: (!replyMessage.trim() || sendingReply) ? 'not-allowed' : 'pointer',
                        marginLeft: 'auto'
                      }}
                    >
                      <Send size={16} />
                      {sendingReply ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Admin Notes */}
            <FormField label="Admin Notes (internal)">
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
