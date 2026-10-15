import { useState, useEffect, useCallback } from 'react'
import AssistantAvatar, { useAssistant } from './AssistantAvatar'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import ArnieChat from '../pages/agents/arnie/ArnieChat'
import { X, Clock, SquarePen, ChevronRight, ChevronDown, MessageCircle, Monitor, GraduationCap, Maximize2 } from 'lucide-react'
import ArnieComputer from '../pages/agents/arnie/ArnieComputer'
import ArnieSkills from '../pages/agents/arnie/ArnieSkills'
import ArnieRoutines from '../pages/agents/arnie/ArnieRoutines'
import ArniePersona from '../pages/agents/arnie/ArniePersona'
import { stopSpeaking, unlockAudio } from '../pages/agents/arnie/arnieVoice'
import { loadSessions, getLastSessionId } from '../pages/agents/arnie/arnieEngine'
import { shouldIntroduce, markIntroDone, INTRO_KICKOFF } from '../lib/arnieIntro'
import { handOffLabel, assistantShortName } from '../lib/arniePersonaClient'

// Everything Arnie is, in the one place people actually open him. The
// Clock icon in the header still holds past conversations and his face still
// opens who-your-assistant-is, so four tabs is all this needs — any more and
// a 400px drawer starts needing its own navigation.
// A label has to say what the thing IS to somebody who has never been told.
// "Computer" meant nothing — it is the tab where you let him work in programs
// on your own machine, which is not a thing people expect an app to offer, so
// the name has to carry it. The `hint` is the hover on a desktop and the line
// under the strip on a phone, where there is no hover at all.
const TABS = [
  { key: 'chat', label: 'Chat', icon: MessageCircle, hint: 'Ask him anything about your business.' },
  {
    key: 'computer', label: 'My PC', icon: Monitor,
    hint: 'Work in the programs on your own computer — a utility portal, a spreadsheet — in the ones you allow, one at a time.',
  },
  {
    key: 'taught', label: 'Taught', icon: GraduationCap,
    hint: 'Jobs somebody has shown how to do once, written down in plain English.',
  },
  {
    key: 'routines', label: 'Standing', icon: Clock,
    hint: 'Work he does on a schedule without being asked — "every weekday at 7am, text me what is off track".',
  },
]

const dark = {
  bg: '#1a1d21',
  bgHeader: '#22262b',
  border: '#333840',
  text: '#e8e6e3',
  textMuted: '#6b7280',
  orange: '#f97316',
  orangeGlow: 'rgba(249, 115, 22, 0.35)',
}

// hideLauncher: the corner pill stays off (detail pages, where it covered
// page buttons on mobile) but the panel stays mounted, so a page button can
// still open it through the arnie:open event ("Describe it to Arnie" on an
// estimate). Before this the panel was unmounted on those routes and the
// event fired into nothing.
export default function ArnieFloatingPanel({ hideLauncher = false } = {}) {
  // Whose face and name — the corner panel renders outside the Arnie
  // workspace, so it reads the persona itself.
  const assistant = useAssistant()
  const hasAgent = useStore(s => s.hasAgent)
  const user = useStore(s => s.user)
  // company was only read for the "AI Assistant · Company" subtitle, which
  // said nothing a person could not already see.
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  // `undefined` means "not worked out yet". The chat is held back until it
  // resolves, because rendering with null first would start a new conversation
  // and then swap it out from under whatever had already been typed.
  const [sessionId, setSessionId] = useState(undefined)
  const [picking, setPicking] = useState(false)
  const [tab, setTab] = useState('chat')
  const [recent, setRecent] = useState([])
  const [showRecent, setShowRecent] = useState(false)

  // Remounts the chat. Switching conversations means loading a different
  // history, and a fresh component is a cleaner way to get there than reaching
  // into the existing one to reset half its state.
  const [convKey, setConvKey] = useState(0)
  // 'arnie:open' may carry a first message and ask for the mic (the Estimates
  // page's "Describe it to Arnie"). Consumed by the next chat mount.
  const [kickoff, setKickoff] = useState(null)
  const [autoMic, setAutoMic] = useState(false)
  const [intent, setIntent] = useState(null)

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

  // ── he speaks first, once ────────────────────────────────────────────
  // Everything he can do sat behind four tab labels nobody had been told the
  // meaning of. A person who has never talked to him gets introduced by him
  // rather than by a tooltip — and he can look at what is actually missing
  // and start on it, which no written welcome can.
  useEffect(() => {
    if (!user?.id) return
    let alive = true
    const t = setTimeout(async () => {
      let sessions = []
      try { sessions = await loadSessions() } catch { return /* offline: another day */ }
      if (!alive) return
      if (!shouldIntroduce({
        userId: user.id,
        sessionCount: sessions.length,
        path: window.location.pathname,
        alreadyOpen: open,
      })) return
      markIntroDone(user.id)
      window.dispatchEvent(new CustomEvent('arnie:open', {
        detail: { kickoff: INTRO_KICKOFF, mic: false },
      }))
    }, 2500)   // let the page they asked for finish arriving first
    return () => { alive = false; clearTimeout(t) }
    // Deliberately not re-running on `open`: this fires once per person, and
    // reacting to the panel opening would make it fight the person using it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // Opening is an action, so the lookup happens here rather than in an effect
  // watching `open` — same result, and it keeps the async work on the event
  // that caused it instead of a render that reacted to it.
  const openPanel = useCallback((e) => {
    // Opening this is almost always a tap, and on a phone it may be the only
    // one before the first answer is spoken. iOS grants sound to an element a
    // finger has touched, so take the chance while there is one.
    unlockAudio()
    const d = e?.detail || null
    if (d?.kickoff) {
      // A fresh thread for a task that starts with a script, so the kickoff
      // is the first thing in it and nothing older gets replied to.
      stopSpeaking()
      setKickoff(String(d.kickoff))
      setAutoMic(d.mic !== false)
      setIntent(d.intent || null)
      setSessionId(null)
      setConvKey((k) => k + 1)
      setOpen(true)
      return
    }
    setKickoff(null); setAutoMic(false); setIntent(null)
    setOpen(true)
    resolveSession()
  }, [resolveSession])

  // When Arnie's card lands an estimate, take the person to it.
  const handleApplied = useCallback((card, res) => {
    if (intent !== 'estimate') return
    const created = card?.proposal?.created || card?.created || card?.proposal?.payload?.created
    const quoteId = Number(res?.created_id) || Number(created?.quote_id) || 0
    if (quoteId) { setOpen(false); navigate(`/estimates/${quoteId}`) }
  }, [intent, navigate])

  useEffect(() => {
    // Let anything on the page pop the corner guy open — e.g. the onboarding
    // banner's "Chat with Arnie" button dispatches window event 'arnie:open'.
    window.addEventListener('arnie:open', openPanel)
    // A tab asking to hand over to another one — the Taught tab's "Teach her
    // a job" sends you to the Computer tab, where the recorder actually is.
    const toTab = (e) => { const k = e?.detail?.tab; if (k) { setOpen(true); setTab(k) } }
    window.addEventListener('arnie:tab', toTab)
    return () => {
      window.removeEventListener('arnie:open', openPanel)
      window.removeEventListener('arnie:tab', toTab)
    }
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

  // The tab you are on, opened full size — and for the chat, the SAME
  // conversation (ArnieChatPage reads it from location state).
  const PAGE_FOR_TAB = { chat: '/agents/arnie', computer: '/agents/arnie/computer', taught: '/agents/arnie/taught', routines: '/agents/arnie/routines' }
  const expandToPage = () => {
    handleClose()
    navigate(PAGE_FOR_TAB[tab] || '/agents/arnie', tab === 'chat' && sessionId ? { state: { sessionId } } : undefined)
  }

  if (!user || !hasAgent('arnie-og')) return null

  return (
    <>
      {/* Floating trigger — avatar with orange ring + the hand-off label */}
      {!open && !hideLauncher && (
        <div
          onClick={openPanel}
          // Desktop only: on a phone Arnie is the middle slot of the bottom
          // tab bar, so this would be a second way to open the same panel
          // sitting on top of the page. `hidden` is Layout's class —
          // display:none on mobile, flex above md.
          className="hidden"
          style={{
            position: 'fixed',
            // Above the mobile tab bar (0 on desktop).
            bottom: 'calc(92px + var(--jobscout-tabbar-space, 0px))',
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
          {/* The chip. It said "Ask Arnie" to everyone, including the people
              who had chosen Jenny — the one surface a rename never reached,
              and the most visible one in the app. It is built from the
              persona now, like every other label. */}
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
            {handOffLabel(assistantShortName({ personaRow: assistant.personaRow }))}
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
            <AssistantAvatar size="100%" style={{ width: '100%', height: '100%' }} />
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
              {/* His face is the switch here too. This drawer is where most
                  people actually talk to him \u2014 the full page is somewhere you
                  go on purpose \u2014 so leaving it as a circle with "AI Assistant"
                  under it meant the identity work was invisible to everyday
                  use. A badge crop rather than a circle, for the same reason
                  as the main page: a crew card, not a chat avatar. */}
              <button
                onClick={() => setPicking(true)}
                title="Choose who your assistant is"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, minWidth: 0,
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  font: 'inherit', textAlign: 'left',
                }}
              >
                <span style={{
                  width: 40, height: 40, borderRadius: 11, overflow: 'hidden',
                  boxShadow: `0 0 0 1px ${dark.border}, 0 4px 12px rgba(0,0,0,0.35)`,
                  backgroundColor: dark.bg, flexShrink: 0, lineHeight: 0,
                  display: 'inline-flex',
                }}>
                  <AssistantAvatar size={40} style={{ borderRadius: 11 }} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{
                    display: 'block', color: dark.text, fontSize: 15, fontWeight: 700,
                    letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{assistant.name}</span>
                  {/* "AI Assistant" told nobody anything they could not see. */}
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    color: dark.textMuted, fontSize: 10.5, fontWeight: 700,
                    letterSpacing: '0.09em', textTransform: 'uppercase',
                  }}>
                    Your assistant
                    <ChevronDown size={11} style={{ marginTop: 1 }} />
                  </span>
                </span>
              </button>
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
                {/* EXPAND TO THE PAGE — desktop and laptop only. It was taken
                    out once because the page has nothing this drawer lacks;
                    what the page HAS is room. A 400px column is tight for
                    reading a job's lines or watching her work on your
                    computer (Bryce, 2026-10-15). Same conversation, same tab.
                    `hidden` is Layout's class: gone on a phone, where this
                    drawer already is the whole screen. */}
                <button
                  className="hidden"
                  onClick={expandToPage}
                  title="Open full screen"
                  aria-label="Open full screen"
                  style={{
                    width: 36, height: 36, borderRadius: 8, border: 'none',
                    backgroundColor: 'transparent', cursor: 'pointer',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Maximize2 size={17} color={dark.textMuted} />
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

            {/* ONE ARNIE.
                There used to be a drawer and a page, with different things in
                each — so the computer he can work on, the jobs he had been
                taught and the standing work all lived somewhere nobody went.
                "Let's not have a corner panel and a page, that's just a mess."
                They are the SAME components, rendered in here. Nothing is
                duplicated, so nothing can drift apart again, and on a phone
                this drawer is the whole screen anyway. */}
            <div style={{
              display: 'flex', borderBottom: `1px solid ${dark.border}`,
              backgroundColor: dark.bgHeader, flexShrink: 0,
            }}>
              {TABS.map((t) => {
                const on = tab === t.key
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    title={t.hint}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '8px 2px 7px', minHeight: 48,
                      borderBottom: `2px solid ${on ? dark.orange : 'transparent'}`,
                      color: on ? dark.orange : dark.textMuted,
                    }}
                  >
                    <t.icon size={17} />
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.02em' }}>{t.label}</span>
                  </button>
                )
              })}
            </div>

            {/* What this tab IS, for the phone, where there is no hover. One
                line, under the strip, only on the tabs whose names cannot
                carry their own meaning. */}
            {tab !== 'chat' && (
              <div style={{
                padding: '9px 14px', fontSize: 11.5, lineHeight: 1.45,
                color: dark.textMuted, backgroundColor: dark.bgHeader,
                borderBottom: `1px solid ${dark.border}`, flexShrink: 0,
              }}>
                {TABS.find((t) => t.key === tab)?.hint}
              </div>
            )}

            {/* Chat — held back until we know which conversation to open, so a
                new one is never created and then discarded. */}
            <div style={{
              flex: 1,
              overflow: tab === 'chat' ? 'hidden' : 'auto',
              // The page's own surfaces are light. Inside a dark drawer that
              // reads as the page arriving, which is what it is.
              backgroundColor: tab === 'chat' ? 'transparent' : '#f7f5ef',
            }}>
              {tab === 'chat' && (sessionId === undefined ? (
                <div style={{ padding: 24, color: dark.textMuted, fontSize: 13 }}>Loading…</div>
              ) : (
                <ArnieChat key={convKey} isPanel onClose={handleClose} sessionId={sessionId} kickoff={kickoff} autoMic={autoMic} onApplied={handleApplied} openIdentity={() => setPicking(true)} />
              ))}
              {tab === 'computer' && <ArnieComputer />}
              {tab === 'taught' && <ArnieSkills />}
              {tab === 'routines' && <ArnieRoutines />}
            </div>

            {/* Over the drawer, not a trip to a settings page. Changing who
                you are talking to should not close the conversation you are
                in the middle of. Same ArniePersona the other two places use. */}
            {picking && (
              <div
                onClick={() => setPicking(false)}
                style={{
                  position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(10,12,14,0.6)',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                  padding: '14px 12px', overflowY: 'auto',
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ background: '#f7f5ef', borderRadius: 14, padding: 14, width: '100%' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <strong style={{ fontSize: 14.5, color: '#2c3530' }}>Who your assistant is</strong>
                    <button
                      onClick={() => setPicking(false)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: '#4d5a52',
                        fontSize: 13, fontWeight: 600, padding: '8px 6px', minHeight: 44,
                      }}
                    >Done</button>
                  </div>
                  <ArniePersona />
                </div>
              </div>
            )}
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
