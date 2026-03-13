import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadSessions, deleteSession } from './arnieEngine'
import { MessageCircle, Trash2, Clock, ChevronRight } from 'lucide-react'

const dark = {
  bg: '#1a1d21',
  bgCard: '#22262b',
  bgCardHover: '#2a2f35',
  border: '#333840',
  text: '#e8e6e3',
  textMuted: '#6b7280',
  orange: '#f97316',
  orangeBg: 'rgba(249, 115, 22, 0.12)',
}

export default function ArnieHistory() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    loadSessions().then(data => {
      setSessions(data)
      setLoading(false)
    })
  }, [])

  const handleDelete = async (e, sessionId) => {
    e.stopPropagation()
    if (!confirm('Delete this conversation?')) return
    setDeleting(sessionId)
    await deleteSession(sessionId)
    setSessions(prev => prev.filter(s => s.session_id !== sessionId))
    setDeleting(null)
  }

  const handleResume = (session) => {
    navigate('/agents/arnie', { state: { sessionId: session.session_id } })
  }

  const formatDate = (dateStr) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    if (diff < 604800000) return d.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60, backgroundColor: dark.bg, minHeight: '100%' }}>
        <div style={{ color: dark.textMuted, fontSize: 14 }}>Loading conversations...</div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto', backgroundColor: dark.bg, minHeight: '100%' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: dark.text, fontSize: 18, fontWeight: 600, margin: 0 }}>
          Conversation History
        </h2>
        <p style={{ color: dark.textMuted, fontSize: 14, margin: '4px 0 0' }}>
          {sessions.length} conversation{sessions.length !== 1 ? 's' : ''}
        </p>
      </div>

      {sessions.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          backgroundColor: dark.bgCard,
          borderRadius: 12,
          border: `1px solid ${dark.border}`,
        }}>
          <MessageCircle size={40} color={dark.textMuted} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <p style={{ color: dark.textMuted, fontSize: 14, margin: 0 }}>
            No conversations yet. Go chat with the old man!
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sessions.map(session => (
            <div
              key={session.session_id || session.id}
              onClick={() => handleResume(session)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                backgroundColor: dark.bgCard,
                borderRadius: 10,
                border: `1px solid ${dark.border}`,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = dark.bgCardHover
                e.currentTarget.style.borderColor = dark.orange
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = dark.bgCard
                e.currentTarget.style.borderColor = dark.border
              }}
            >
              <MessageCircle size={18} color={dark.orange} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  color: dark.text,
                  fontSize: 14,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {session.title || 'Untitled conversation'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Clock size={12} color={dark.textMuted} />
                  <span style={{ color: dark.textMuted, fontSize: 12 }}>
                    {formatDate(session.created_at)}
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, session.session_id)}
                disabled={deleting === session.session_id}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  opacity: 0.4,
                  transition: 'opacity 0.15s',
                  flexShrink: 0,
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0.4}
                title="Delete conversation"
              >
                <Trash2 size={15} color="#ef4444" />
              </button>
              <ChevronRight size={16} color={dark.textMuted} style={{ flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
