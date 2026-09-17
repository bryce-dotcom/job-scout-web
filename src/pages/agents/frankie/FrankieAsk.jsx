// Ask Frankie — the conversation.
//
// Built for the phone first, because that is where it fell apart. The page
// used to be a document that grew with every answer: after the first one the
// composer had scrolled off the bottom of the screen, and when you got down
// to it, it was under the tab bar and the floating buttons. Now the
// conversation is a fixed frame between the app's top bar and the tab bar
// (see chatFrame.js), the messages scroll inside it, and the composer stays
// put — above the keyboard when it is up, above the tab bar when it is not.
//
// While in there: Frankie's answers are full-width cards on a phone (a
// margin table does not fit in 75% of 375px), tables scroll sideways inside
// the card instead of crushing their columns, the follow-up questions sit in
// a strip above the composer where a thumb can reach them, and a "latest"
// pill appears if you have scrolled up to re-read something when an answer
// lands.

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Send, DollarSign, TrendingUp, Receipt, PieChart,
  AlertTriangle, Clock, Loader2, Copy, Check, History, ArrowDown, Plus, RotateCcw
} from 'lucide-react'
import {
  sendMessageStream, createSession, saveMessage,
  loadSessions, loadSessionMessages,
  rememberLastSession, getLastSessionId, forgetLastSession,
} from './frankieEngine'
import { chatFrame } from './chatFrame'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)',
}

const QUICK_ACTIONS = [
  { label: 'Which crew is profitable?', icon: TrendingUp, prompt: 'Which crew is actually profitable? Break down revenue, labor hours, and margin by team for recent completed jobs.' },
  { label: 'Cash flow', icon: DollarSign, prompt: 'What does our cash flow look like? Revenue vs expenses for the last 30 days.' },
  { label: 'Overdue invoices', icon: AlertTriangle, prompt: 'Show me all overdue invoices. Who owes us money and how late are they?' },
  { label: 'Job profitability', icon: TrendingUp, prompt: 'Break down profitability of our recent completed jobs. Which ones had the best and worst margins?' },
  { label: 'Expense analysis', icon: PieChart, prompt: 'Analyze our expenses for the last 30 days. Any unusual spikes or patterns?' },
  { label: 'AR aging', icon: Clock, prompt: 'Give me an AR aging report. How much is current, 30 days, 60 days, and 90+ days overdue?' },
  { label: 'Burn rate', icon: Receipt, prompt: 'What is our monthly burn rate? How has it trended over the last 3 months?' },
]

const ACCENT = '#5a6349'
const ACCENT_BG = 'rgba(90,99,73,0.12)'
const NEAR_BOTTOM = 48   // px from the end that still counts as "reading the latest"

// Tables scroll sideways inside the card rather than folding every cell
// into a column of single words, which is what a 5-column markdown table
// does on a 375px screen.
const markdownComponents = {
  table: ({ node: _node, ...props }) => (
    <div className="frankie-table-wrap"><table {...props} /></div>
  ),
}

export default function FrankieAsk() {
  const location = useLocation()
  const navigate = useNavigate()
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState(location.state?.sessionId || null)
  const [copied, setCopied] = useState(null)
  // True while working out which conversation to show, so the welcome screen
  // does not flash up and then get replaced by yesterday's chat.
  const [resuming, setResuming] = useState(true)
  // Where the chat sits on screen — see chatFrame.js.
  const [frame, setFrame] = useState(() => chatFrame({ isMobile, anchorTop: 0, viewportHeight: 800, layoutHeight: 800 }))
  // Whether the reader is at the end of the conversation. New content only
  // auto-scrolls when they are; otherwise a pill offers the way down.
  const [atBottom, setAtBottom] = useState(true)
  const [unseen, setUnseen] = useState(false)

  const anchorRef = useRef(null)
  const listRef = useRef(null)
  const messagesRef = useRef(messages)
  const sendingRef = useRef(false)
  const inputRef = useRef(null)
  const stickRef = useRef(true)
  const frameRef = useRef(frame)

  useEffect(() => { messagesRef.current = messages }, [messages])

  // ── Which conversation is this? ──────────────────────────────────
  //
  // An explicit session from History wins; "New chat" from History starts
  // blank; otherwise pick up the conversation this person was last in,
  // provided it still exists.
  useEffect(() => {
    let cancelled = false
    const requested = location.state?.sessionId || null
    const fresh = location.state?.fresh === true

    async function resolve() {
      let sid = requested
      if (!sid && !fresh) {
        const last = getLastSessionId()
        if (last) {
          let existing = []
          try { existing = await loadSessions() } catch { /* offline — start fresh */ }
          sid = existing.some(s => s.session_id === last) ? last : null
          if (!sid) forgetLastSession()
        }
      }
      if (cancelled) return
      if (!sid) {
        setSessionId(null)
        setMessages([])
        setResuming(false)
        return
      }
      const msgs = await loadSessionMessages(sid)
      if (cancelled) return
      setSessionId(sid)
      rememberLastSession(sid)
      stickRef.current = true
      setMessages(msgs.map((m, i) => ({
        id: m.id || m.message_id || `${sid}-${i}`,
        role: m.role,
        content: m.content,
      })))
      setResuming(false)
    }

    setResuming(true)
    resolve()
    return () => { cancelled = true }
  }, [location.state?.sessionId, location.state?.fresh])

  // ── Frame: pin the chat between the bars, track the keyboard ─────
  useLayoutEffect(() => {
    const measure = (initial) => {
      const a = anchorRef.current
      if (!a) return
      // The page has nothing to scroll to once the chat is pinned; start it
      // at the top so the anchor's offset is the real one. Only on mount:
      // iOS pans the layout viewport itself when the keyboard opens, and
      // fighting that would jitter the composer.
      if (isMobile && initial) window.scrollTo(0, 0)
      const vv = window.visualViewport
      const tabbar = document.querySelector('[data-mobile-tabbar]')
      const next = chatFrame({
        isMobile,
        anchorTop: Math.round(a.getBoundingClientRect().top + window.scrollY),
        viewportHeight: Math.round(vv?.height ?? window.innerHeight),
        layoutHeight: window.innerHeight,
        viewportOffsetTop: Math.round(vv?.offsetTop ?? 0),
        tabbarHeight: tabbar ? Math.round(tabbar.getBoundingClientRect().height) : 0,
      })
      if (JSON.stringify(next) !== JSON.stringify(frameRef.current)) {
        frameRef.current = next
        setFrame(next)
      }
    }
    measure(true)
    const onChange = () => measure(false)
    window.addEventListener('resize', onChange)
    const vv = window.visualViewport
    vv?.addEventListener('resize', onChange)
    vv?.addEventListener('scroll', onChange)
    // Anything that moves the anchor — a banner appearing above, the URL bar
    // collapsing, a rotation — changes the document's size too.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onChange) : null
    ro?.observe(document.documentElement)
    return () => {
      window.removeEventListener('resize', onChange)
      vv?.removeEventListener('resize', onChange)
      vv?.removeEventListener('scroll', onChange)
      ro?.disconnect()
    }
  }, [isMobile])

  // ── Scrolling ─────────────────────────────────────────────────────
  const scrollToEnd = useCallback((smooth = true) => {
    const el = listRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    stickRef.current = true
    setAtBottom(true)
    setUnseen(false)
  }, [])

  const onListScroll = () => {
    const el = listRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM
    stickRef.current = near
    setAtBottom(near)
    if (near) setUnseen(false)
  }

  // Follow the conversation while the reader is at the end of it; when they
  // have scrolled up, leave them there and light the pill instead.
  useLayoutEffect(() => {
    if (stickRef.current) scrollToEnd(false)
    else if (messages.length) setUnseen(true)
  }, [messages, loading, frame.style.height, scrollToEnd])

  // ── Sending ───────────────────────────────────────────────────────
  const handleSend = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading || sendingRef.current) return
    sendingRef.current = true
    if (!text) {
      setInput('')
      if (inputRef.current) inputRef.current.style.height = 'auto'
    }

    stickRef.current = true
    const userMsg = { id: Date.now(), role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])

    const assistantId = Date.now() + 1
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])
    setLoading(true)

    try {
      let sid = sessionId
      if (!sid) {
        const session = await createSession(msg)
        sid = session?.session_id
        setSessionId(sid)
        rememberLastSession(sid)
      }

      await saveMessage(sid, 'user', msg)

      const history = messagesRef.current
        .filter(m => m.id !== assistantId && !m.error)
        .map(m => ({ role: m.role, content: m.content }))

      const fullResponse = await sendMessageStream(msg, history, (partialText, meta) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: partialText, status: meta?.status || null } : m
        ))
      })

      await saveMessage(sid, 'assistant', fullResponse)
    } catch (e) {
      console.error('[FrankieAsk] Error:', e)
      // Kept out of the saved conversation and out of the history sent back
      // to the model; it is a note to the reader, with a way to retry.
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: e.message || 'Something went wrong.', error: true, retryOf: msg }
          : m
      ))
    } finally {
      setLoading(false)
      sendingRef.current = false
      // On a phone, refocusing pops the keyboard back up over the answer
      // that just arrived. Let the reader read.
      if (!isMobile) inputRef.current?.focus()
    }
  }, [input, loading, sessionId, isMobile])

  const retry = (m) => {
    setMessages(prev => prev.filter(x => x.id !== m.id))
    handleSend(m.retryOf)
  }

  // Enter sends on a keyboard with a Shift key. On a phone, Enter is a new
  // line and the button sends: phone keyboards have no Shift+Enter, and a
  // question about money is worth a second line before it goes.
  const handleKeyDown = (e) => {
    if (isMobile) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleCopy = (content, id) => {
    navigator.clipboard.writeText(content)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleNewChat = () => {
    forgetLastSession()
    setMessages([])
    setSessionId(null)
    setInput('')
    stickRef.current = true
  }

  const canSend = input.trim().length > 0 && !loading
  const showWelcome = messages.length === 0 && !loading && !resuming

  // ── Pieces ────────────────────────────────────────────────────────

  const chip = (action, style = {}) => {
    const Icon = action.icon
    return (
      <button
        key={action.label}
        onClick={() => handleSend(action.prompt)}
        disabled={loading}
        className="frankie-chip"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', borderRadius: 20,
          background: theme.bgCard, color: theme.text,
          border: `1px solid ${theme.border}`,
          cursor: loading ? 'default' : 'pointer', fontSize: 13, fontWeight: 500,
          whiteSpace: 'nowrap', opacity: loading ? 0.5 : 1,
          ...style,
        }}
      >
        <Icon size={13} style={{ color: ACCENT, flexShrink: 0 }} />
        {action.label}
      </button>
    )
  }

  const assistantCard = (msg) => {
    if (msg.error) {
      return (
        <div style={{
          borderRadius: 14, border: '1px solid rgba(192,57,43,0.35)', background: 'rgba(192,57,43,0.06)',
          padding: '12px 14px', fontSize: 14, lineHeight: 1.5, color: theme.text,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a93226', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
            <AlertTriangle size={14} /> Frankie couldn't answer that
          </div>
          <div style={{ color: theme.textSecondary, marginBottom: 10 }}>{msg.content}</div>
          <button onClick={() => retry(msg)} disabled={loading} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10,
            background: ACCENT, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
            <RotateCcw size={13} /> Try again
          </button>
        </div>
      )
    }

    const thinking = !msg.content && loading
    return (
      <div style={{
        borderRadius: 14, border: `1px solid ${theme.border}`, background: theme.bgCard,
        boxShadow: '0 1px 2px rgba(44,53,48,0.05)', overflow: 'hidden',
      }}>
        {/* Who is talking, and a way to copy. Out of the text, not over it. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px 0', fontSize: 12, fontWeight: 600, color: ACCENT,
        }}>
          <span style={{
            width: 20, height: 20, borderRadius: 6, background: ACCENT_BG,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <DollarSign size={12} />
          </span>
          Frankie
          <span style={{ flex: 1 }} />
          {!thinking && (
            <button
              onClick={() => handleCopy(msg.content, msg.id)}
              title="Copy answer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
                borderRadius: 6, color: copied === msg.id ? ACCENT : theme.textMuted, fontSize: 11, fontWeight: 500,
              }}
            >
              {copied === msg.id ? <><Check size={13} /> Copied</> : <Copy size={13} />}
            </button>
          )}
        </div>
        <div style={{ padding: '6px 12px 12px', fontSize: 14, lineHeight: 1.6, color: theme.text }}>
          {thinking ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: theme.textMuted, padding: '4px 0' }}>
              <span className="frankie-dots"><i /><i /><i /></span>
              {msg.status || 'Analyzing your financials…'}
            </div>
          ) : (
            <div className="frankie-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {msg.content}
              </ReactMarkdown>
            </div>
          )}
          {/* A lookup that starts after some text has streamed shows under it. */}
          {!thinking && msg.status && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: theme.textMuted, fontSize: 13, marginTop: 8 }}>
              <span className="frankie-dots"><i /><i /><i /></span>
              {msg.status}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* In-flow marker for where the chat begins; the chat itself may be
          pinned to the screen, and this is how it knows where "here" is. */}
      <div ref={anchorRef} aria-hidden="true" />

      <div style={{
        ...frame.style,
        display: 'flex', flexDirection: 'column',
        background: theme.bg, zIndex: 30,
        overflow: 'hidden',
      }}>
        {/* Messages */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
          <div
            ref={listRef}
            onScroll={onListScroll}
            style={{
              flex: 1, overflowY: 'auto', overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
              padding: isMobile ? '12px 12px 8px' : '24px 24px 12px',
            }}
          >
            <div style={{
              maxWidth: 860, margin: '0 auto',
              display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16,
            }}>
              {resuming && messages.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '48px 24px', color: theme.textMuted, fontSize: 14 }}>
                  <Loader2 size={16} style={{ animation: 'frankie-spin 1s linear infinite' }} />
                  Picking up where you left off…
                </div>
              )}

              {showWelcome && (
                <div style={{ textAlign: 'center', padding: isMobile ? '20px 4px 8px' : '48px 24px' }}>
                  <div style={{
                    width: isMobile ? 52 : 64, height: isMobile ? 52 : 64, borderRadius: 16,
                    background: ACCENT_BG, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}>
                    <DollarSign size={isMobile ? 26 : 32} style={{ color: ACCENT }} />
                  </div>
                  <h2 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: theme.text, margin: '0 0 6px' }}>
                    Ask Frankie anything
                  </h2>
                  <p style={{ fontSize: 14, color: theme.textMuted, maxWidth: 420, margin: '0 auto 20px', lineHeight: 1.5 }}>
                    Cash flow, profitability, expenses, collections — your AI CFO has the books open.
                  </p>
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
                    maxWidth: 600, margin: '0 auto',
                  }}>
                    {QUICK_ACTIONS.map(a => chip(a, isMobile ? { flex: '1 1 45%', justifyContent: 'center', padding: '11px 12px' } : {}))}
                  </div>
                </div>
              )}

              {messages.map(msg => (
                msg.role === 'user' ? (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{
                      maxWidth: isMobile ? '88%' : '70%',
                      padding: '10px 14px', borderRadius: '18px 18px 4px 18px',
                      background: ACCENT, color: '#fff',
                      fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} style={{ maxWidth: isMobile ? '100%' : '85%' }}>
                    {assistantCard(msg)}
                  </div>
                )
              ))}
            </div>
          </div>

          {/* Back to the latest, when the reader has gone up to re-read. */}
          {!atBottom && messages.length > 0 && (
            <button
              onClick={() => scrollToEnd(true)}
              style={{
                position: 'absolute', left: '50%', bottom: 10, transform: 'translateX(-50%)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 20, border: `1px solid ${theme.border}`,
                background: unseen ? ACCENT : theme.bgCard, color: unseen ? '#fff' : theme.textSecondary,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(44,53,48,0.18)',
              }}
            >
              <ArrowDown size={13} /> {unseen ? 'New answer' : 'Latest'}
            </button>
          )}
        </div>

        {/* Composer */}
        <div style={{
          flexShrink: 0, background: theme.bgCard, borderTop: `1px solid ${theme.border}`,
          paddingBottom: isMobile && !frame.keyboardOpen ? 0 : undefined,
        }}>
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            {/* Follow-ups, within thumb reach. Only once the talk has started;
                on the welcome screen the same questions are the main event. */}
            {messages.length > 0 && (
              <div className="frankie-chips" style={{
                display: 'flex', gap: 6, overflowX: 'auto',
                padding: isMobile ? '8px 12px 0' : '10px 24px 0',
              }}>
                {QUICK_ACTIONS.map(a => chip(a, { padding: '6px 10px', fontSize: 12 }))}
              </div>
            )}

            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-end',
              padding: isMobile ? '8px 12px' : '10px 24px',
            }}>
              <div style={{
                flex: 1, display: 'flex', alignItems: 'flex-end',
                background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 22,
                padding: '4px 4px 4px 14px', minHeight: 44,
              }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Frankie about your finances…"
                  rows={1}
                  enterKeyHint={isMobile ? 'enter' : 'send'}
                  style={{
                    flex: 1, resize: 'none', border: 'none', outline: 'none',
                    background: 'transparent', color: theme.text,
                    fontSize: 15, lineHeight: '22px', padding: '7px 0',
                    fontFamily: 'inherit', maxHeight: 132, minWidth: 0,
                  }}
                  onInput={e => {
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 132) + 'px'
                  }}
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!canSend}
                  aria-label="Send"
                  style={{
                    width: 36, height: 36, borderRadius: 18, flexShrink: 0,
                    background: canSend ? ACCENT : theme.border,
                    color: '#fff', border: 'none', cursor: canSend ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s',
                  }}
                >
                  {loading
                    ? <Loader2 size={16} style={{ animation: 'frankie-spin 1s linear infinite' }} />
                    : <Send size={16} style={{ marginLeft: 2 }} />}
                </button>
              </div>
            </div>

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: isMobile ? '0 14px 8px' : '0 24px 10px', fontSize: 12, color: theme.textMuted,
            }}>
              <span>{isMobile ? '' : 'Enter to send · Shift+Enter for a new line'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button onClick={() => navigate('/agents/frankie/history')} style={linkBtn(theme)}>
                  <History size={12} /> History
                </button>
                {sessionId && (
                  <button onClick={handleNewChat} style={linkBtn(theme)}>
                    <Plus size={12} /> New chat
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes frankie-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes frankie-pulse { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
          .frankie-dots { display: inline-flex; gap: 4px; }
          .frankie-dots i { width: 6px; height: 6px; border-radius: 3px; background: ${ACCENT}; animation: frankie-pulse 1.2s infinite ease-in-out; }
          .frankie-dots i:nth-child(2) { animation-delay: 0.15s; }
          .frankie-dots i:nth-child(3) { animation-delay: 0.3s; }
          .frankie-chips { scrollbar-width: none; }
          .frankie-chips::-webkit-scrollbar { display: none; }
          .frankie-chip:not(:disabled):hover { background: ${ACCENT_BG} !important; border-color: ${ACCENT} !important; }
          .frankie-markdown p { margin: 0 0 8px; }
          .frankie-markdown p:last-child { margin-bottom: 0; }
          .frankie-markdown ul, .frankie-markdown ol { margin: 4px 0 8px; padding-left: 20px; }
          .frankie-markdown li { margin-bottom: 2px; }
          .frankie-table-wrap { overflow-x: auto; margin: 8px 0; border: 1px solid ${theme.border}; border-radius: 8px; -webkit-overflow-scrolling: touch; }
          .frankie-markdown table { border-collapse: collapse; font-size: 13px; min-width: 100%; }
          .frankie-markdown th { background-color: ${ACCENT_BG}; color: ${ACCENT}; padding: 8px 10px; text-align: left; font-weight: 600; white-space: nowrap; border-bottom: 1px solid ${theme.border}; }
          .frankie-markdown td { padding: 6px 10px; border-bottom: 1px solid ${theme.border}; white-space: nowrap; }
          .frankie-markdown tr:last-child td { border-bottom: none; }
          .frankie-markdown tr:hover td { background-color: ${ACCENT_BG}; }
          .frankie-markdown code { background-color: ${ACCENT_BG}; color: ${ACCENT}; padding: 1px 5px; border-radius: 3px; font-size: 13px; }
          .frankie-markdown h1, .frankie-markdown h2, .frankie-markdown h3 { margin: 12px 0 6px; font-size: 15px; }
          .frankie-markdown strong { color: inherit; }
          .frankie-markdown blockquote { border-left: 3px solid ${ACCENT}; margin: 8px 0; padding: 4px 12px; color: ${theme.textSecondary}; }
        `}</style>
      </div>
    </>
  )
}

const linkBtn = (theme) => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: 'none', border: 'none', color: theme.textMuted,
  cursor: 'pointer', fontSize: 12, fontWeight: 500, padding: '4px 0',
})
