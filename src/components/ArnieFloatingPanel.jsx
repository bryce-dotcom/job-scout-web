import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import ArnieChat from '../pages/agents/arnie/ArnieChat'
import { X, Clock, SquarePen, ChevronRight } from 'lucide-react'
import { stopSpeaking } from '../pages/agents/arnie/arnieVoice'
import { loadSessions, getLastSessionId } from '../pages/agents/arnie/arnieEngine'

const dark = {
  bg: '#1a1d21',
  bgHeader: '#22262b',
  border: '#333840',
  text: '#e8e6e3',
  textMuted: '#6b7280',
  orange: '#f97316',
  orangeGlow: 'rgba(249, 115, 22, 0.35)',
}

export default function ArnieFloatingPanel() {
  const hasAgent = useStore(s => s.hasAgent)
  const user = useStore(s => s.user)
  const company = useStore(s => s.company)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  // `undefined` means "not worked out yet". The chat is held back until it
  // resolves, because rendering with null first would start a new conversation
  // and then swap it out from under whatever had already been typed.
  const [sessionId, setSessionId] = useState(undefined)
  const [recent, setRecent] = useState([])
  const [showRecent, setShowRecent] = useState(false)

  // Remounts the chat. Switching conversations means loading a different
  // history, and a fresh component is a cleaner way to get there than reaching
  // into the existing one to reset half its state.
  const [convKey, setConvKey] = useState(0)

  // Reopening lands back in the conversation you were in. People close this
  // panel to see the screen behind it, not to change the subject — losing the
  // thread every time is what made it feel disposable.
  const resolveSession = useCallback(async () => {
    let sessions = []
    try { sessions = await loadSessions() } catch { /* offline — just start fresh */ }
    setRecent(sessions.slice(0, 6))
    const last = getLastSessionId()
    // Only resume something that still exists. A conversation deleted from the
    // History tab would otherwise resume as a blank chat writing messages into
    // a session nothing points at.
    setSessionId(last && sessions.some(s => s.session_id === last) ? last : null)
  }, [])

  // Opening is an action, so the lookup happens here rather than in an effect
  // watching `open` — same result, and it keeps the async work on the event
  // that caused it instead of a render that reacted to it.
  const openPanel = useCallback(() => {
    setOpen(true)
    resolveSession()
  }, [resolveSession])

  useEffect(() => {
    // Let anything on the page pop the corner guy open — e.g. the onboarding
    // banner's "Chat with Arnie" button dispatches window event 'arnie:open'.
    window.addEventListener('arnie:open', openPanel)
    return () => window.removeEventListener('arnie:open', openPanel)
  }, [openPanel])

  const handleClose = () => {
    stopSpeaking()
    setShowRecent(false)
    setOpen(false)
  }

  const startNew = () => {
    stopSpeaking()
    setShowRecent(false)
    setSessionId(null)
    setConvKey(k => k + 1)
  }

  const openConversation = (id) => {
    stopSpeaking()
    setShowRecent(false)
    setSessionId(id)
    setConvKey(k => k + 1)
  }

  const seeAllHistory = () => {
    handleClose()
    navigate('/agents/arnie/history')
  }

  if (!user || !hasAgent('arnie-og')) return null

  return (
    <>
      {/* Floating trigger — avatar with orange ring + "Ask Arnie" label */}
      {!open && (
        <div
          onClick={openPanel}
          style={{
            position: 'fixed',
            bottom: 92,
            right: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            zIndex: 999,
            transition: 'transform 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {/* "Ask Arnie" chip */}
          <div style={{
            backgroundColor: dark.bgHeader,
            color: dark.text,
            fontSize: 11,
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 12,
            border: `1px solid ${dark.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
            <span style={{ color: dark.orange, fontSize: 13 }}>&#x2728;</span>
            Ask Arnie
          </div>

          {/* Avatar with orange ring — real image */}
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: `3px solid ${dark.orange}`,
            overflow: 'hidden',
            boxShadow: `0 0 14px ${dark.orangeGlow}, 0 4px 12px rgba(0,0,0,0.3)`,
            backgroundColor: dark.bgHeader,
          }}>
            <img
              src="/og-arnie.png"
              alt="OG Arnie"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        </div>
      )}

      {/* Slide-out panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={handleClose}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 1100,
            }}
          />

          {/* Panel */}
          <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            maxWidth: 400,
            backgroundColor: dark.bg,
            zIndex: 1101,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-4px 0 30px rgba(0,0,0,0.4)',
            animation: 'arnieSlideIn 0.25s ease-out',
          }}>
            {/* Panel header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: `1px solid ${dark.border}`,
              backgroundColor: dark.bgHeader,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: `2.5px solid ${dark.orange}`,
                  overflow: 'hidden',
                  boxShadow: `0 0 8px ${dark.orangeGlow}`,
                  backgroundColor: dark.bg,
                }}>
                  <img
                    src="/og-arnie.png"
                    alt="OG Arnie"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div>
                  <div style={{ color: dark.text, fontSize: 15, fontWeight: 600 }}>OG Arnie</div>
                  <div style={{ color: dark.textMuted, fontSize: 12 }}>
                    AI Assistant{company?.name ? ` \u2022 ${company.name}` : ''}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={startNew}
                  title="New conversation"
                  style={{
                    width: 36, height: 36, borderRadius: 8, border: 'none',
                    backgroundColor: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <SquarePen size={18} color={dark.textMuted} />
                </button>
                <button
                  onClick={() => setShowRecent(v => !v)}
                  title="Recent conversations"
                  style={{
                    width: 36, height: 36, borderRadius: 8, border: 'none',
                    backgroundColor: showRecent ? 'rgba(249,115,22,0.15)' : 'transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Clock size={18} color={showRecent ? dark.orange : dark.textMuted} />
                </button>
                <button
                  onClick={handleClose}
                  title="Close"
                  style={{
                    width: 36, height: 36, borderRadius: 8, border: 'none',
                    backgroundColor: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={20} color={dark.textMuted} />
                </button>
              </div>
            </div>

            {/* Recent conversations — the panel is on every page, so this is
                where people actually reach for a past chat. Full pin/rename/
                search lives on the History tab. */}
            {showRecent && (
              <div style={{
                borderBottom: `1px solid ${dark.border}`,
                backgroundColor: dark.bgHeader,
                maxHeight: 260,
                overflowY: 'auto',
              }}>
                {recent.length === 0 ? (
                  <div style={{ padding: '14px 16px', color: dark.textMuted, fontSize: 13 }}>
                    No past conversations yet.
                  </div>
                ) : recent.map(s => (
                  <button
                    key={s.session_id}
                    onClick={() => openConversation(s.session_id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '9px 16px', border: 'none', cursor: 'pointer',
                      backgroundColor: s.session_id === sessionId ? 'rgba(249,115,22,0.10)' : 'transparent',
                      color: dark.text, fontSize: 13,
                      borderLeft: `2px solid ${s.session_id === sessionId ? dark.orange : 'transparent'}`,
                    }}
                  >
                    <span style={{
                      display: 'block', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {s.pinned ? '📌 ' : ''}{s.title}
                    </span>
                  </button>
                ))}
                <button
                  onClick={seeAllHistory}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, width: '100%',
                    padding: '10px 16px', border: 'none', background: 'transparent',
                    color: dark.orange, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                    borderTop: `1px solid ${dark.border}`,
                  }}
                >
                  All conversations <ChevronRight size={14} />
                </button>
              </div>
            )}

            {/* Chat — held back until we know which conversation to open, so a
                new one is never created and then discarded. */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {sessionId === undefined ? (
                <div style={{ padding: 24, color: dark.textMuted, fontSize: 13 }}>Loading…</div>
              ) : (
                <ArnieChat key={convKey} isPanel onClose={handleClose} sessionId={sessionId} />
              )}
            </div>
          </div>

          <style>{`
            @keyframes arnieSlideIn {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
          `}</style>
        </>
      )}
    </>
  )
}
