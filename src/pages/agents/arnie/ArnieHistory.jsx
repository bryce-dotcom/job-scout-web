import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadSessions, deleteSession, renameSession, setSessionPinned, searchSessions } from './arnieEngine'
import { MessageCircle, Trash2, Clock, ChevronRight, Search, Pin, PinOff, Pencil, Check, X } from 'lucide-react'
import { useIsMobile } from '../../../hooks/useIsMobile'

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
  const isMobile = useIsMobile()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)   // null = not searching
  const [searching, setSearching] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draftTitle, setDraftTitle] = useState('')
  const editRef = useRef(null)

  const refresh = useCallback(async () => {
    try {
      setSessions(await loadSessions())
    } catch (err) {
      console.error('[Arnie History] Failed to load sessions:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { if (editingId) editRef.current?.focus() }, [editingId])

  // Content search hits the database, so it waits for a pause in typing
  // rather than firing on every keystroke.
  useEffect(() => {
    const q = query.trim()
    if (!q) { setResults(null); setSearching(false); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        setResults(await searchSessions(q, sessions))
      } catch (err) {
        console.error('[Arnie History] Search failed:', err)
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, sessions])

  const handleDelete = async (e, sessionId) => {
    e.stopPropagation()
    if (!confirm('Delete this conversation? This cannot be undone.')) return
    setDeleting(sessionId)
    await deleteSession(sessionId)
    setSessions(prev => prev.filter(s => s.session_id !== sessionId))
    setResults(prev => prev && prev.filter(s => s.session_id !== sessionId))
    setDeleting(null)
  }

  const togglePin = async (e, session) => {
    e.stopPropagation()
    const next = !session.pinned
    // Optimistic, then re-sort through the same path the list normally uses.
    setSessions(prev => prev
      .map(s => (s.session_id === session.session_id ? { ...s, pinned: next } : s))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)))
    await setSessionPinned(session.session_id, next)
  }

  const startRename = (e, session) => {
    e.stopPropagation()
    setEditingId(session.session_id)
    setDraftTitle(session.title === 'Untitled conversation' ? '' : session.title)
  }

  const commitRename = async (e, session) => {
    e?.stopPropagation()
    const next = draftTitle.trim()
    setEditingId(null)
    if (!next || next === session.title) return
    setSessions(prev => prev.map(s => (s.session_id === session.session_id ? { ...s, title: next, renamed: true } : s)))
    setResults(prev => prev && prev.map(s => (s.session_id === session.session_id ? { ...s, title: next } : s)))
    await renameSession(session.session_id, next)
  }

  const handleResume = (session) => {
    if (editingId) return
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

  const shown = results ?? sessions
  const iconBtn = {
    width: 32, height: 32, borderRadius: 8, border: 'none', backgroundColor: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  }

  return (
    <div style={{ padding: isMobile ? 16 : 24, maxWidth: 700, margin: '0 auto', backgroundColor: dark.bg, minHeight: '100%' }}>
      <div style={{ marginBottom: isMobile ? 12 : 16 }}>
        <h2 style={{ color: dark.text, fontSize: isMobile ? 16 : 18, fontWeight: 600, margin: 0 }}>
          Conversation History
        </h2>
        <p style={{ color: dark.textMuted, fontSize: 14, margin: '4px 0 0' }}>
          {results
            ? `${shown.length} match${shown.length === 1 ? '' : 'es'} for “${query.trim()}”`
            : `${sessions.length} conversation${sessions.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Search covers message text, not just titles — the auto-generated title
          is rarely the part anyone remembers. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
        backgroundColor: dark.bgCard, border: `1px solid ${dark.border}`, borderRadius: 10, padding: '0 10px',
      }}>
        <Search size={16} color={dark.textMuted} style={{ flexShrink: 0 }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search your conversations…"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: dark.text, fontSize: 14, padding: '10px 0', minWidth: 0,
          }}
        />
        {searching && <span style={{ color: dark.textMuted, fontSize: 12 }}>…</span>}
        {query && !searching && (
          <button onClick={() => setQuery('')} style={{ ...iconBtn, width: 24, height: 24 }} title="Clear search">
            <X size={14} color={dark.textMuted} />
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px', backgroundColor: dark.bgCard,
          borderRadius: 12, border: `1px solid ${dark.border}`,
        }}>
          <MessageCircle size={40} color={dark.textMuted} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <p style={{ color: dark.textMuted, fontSize: 14, margin: 0 }}>
            {results
              ? 'Nothing matched that. Try a word you remember saying.'
              : 'No conversations yet. Go chat with the old man!'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map((session, i) => {
            const isEditing = editingId === session.session_id
            // One divider between the kept conversations and the rest.
            const startsUnpinned = !results && !session.pinned && i > 0 && shown[i - 1].pinned
            return (
              <div key={session.session_id || session.id}>
                {startsUnpinned && (
                  <div style={{ color: dark.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '10px 2px 8px' }}>
                    Everything else
                  </div>
                )}
                <div
                  onClick={() => handleResume(session)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: isMobile ? '10px 12px' : '12px 16px',
                    backgroundColor: dark.bgCard, borderRadius: 10,
                    border: `1px solid ${session.pinned ? dark.orange : dark.border}`,
                    cursor: isEditing ? 'default' : 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!isEditing) e.currentTarget.style.backgroundColor = dark.bgCardHover }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = dark.bgCard }}
                >
                  {session.pinned
                    ? <Pin size={18} color={dark.orange} style={{ flexShrink: 0 }} />
                    : <MessageCircle size={18} color={dark.orange} style={{ flexShrink: 0 }} />}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <input
                        ref={editRef}
                        value={draftTitle}
                        onChange={e => setDraftTitle(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRename(e, session)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        placeholder="Name this conversation"
                        style={{
                          width: '100%', background: dark.bg, border: `1px solid ${dark.orange}`,
                          borderRadius: 6, color: dark.text, fontSize: 14, padding: '5px 8px', outline: 'none',
                        }}
                      />
                    ) : (
                      <div style={{
                        color: dark.text, fontSize: 14, fontWeight: 500,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {session.title}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Clock size={12} color={dark.textMuted} />
                      <span style={{ color: dark.textMuted, fontSize: 12 }}>
                        {formatDate(session.created_at)}
                      </span>
                    </div>
                    {session.snippet && (
                      <div style={{
                        color: dark.textMuted, fontSize: 12, marginTop: 4, fontStyle: 'italic',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {session.snippet}
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <button onClick={e => commitRename(e, session)} style={iconBtn} title="Save name">
                      <Check size={16} color={dark.orange} />
                    </button>
                  ) : (
                    <>
                      <button onClick={e => startRename(e, session)} style={{ ...iconBtn, opacity: 0.45 }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = 1)}
                        onMouseLeave={e => (e.currentTarget.style.opacity = 0.45)}
                        title="Rename">
                        <Pencil size={15} color={dark.textMuted} />
                      </button>
                      <button onClick={e => togglePin(e, session)} style={{ ...iconBtn, opacity: session.pinned ? 1 : 0.45 }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = 1)}
                        onMouseLeave={e => (e.currentTarget.style.opacity = session.pinned ? 1 : 0.45)}
                        title={session.pinned ? 'Unpin' : 'Pin to top'}>
                        {session.pinned
                          ? <PinOff size={15} color={dark.orange} />
                          : <Pin size={15} color={dark.textMuted} />}
                      </button>
                      <button onClick={e => handleDelete(e, session.session_id)} disabled={deleting === session.session_id}
                        style={{ ...iconBtn, opacity: 0.4 }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = 1)}
                        onMouseLeave={e => (e.currentTarget.style.opacity = 0.4)}
                        title="Delete conversation">
                        <Trash2 size={15} color="#ef4444" />
                      </button>
                      <ChevronRight size={16} color={dark.textMuted} style={{ flexShrink: 0 }} />
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
