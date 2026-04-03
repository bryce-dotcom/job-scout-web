import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Send, DollarSign, TrendingUp, Receipt, PieChart,
  AlertTriangle, Clock, Loader2, Copy, Check, Trash2
} from 'lucide-react'
import {
  sendMessageStream, createSession, saveMessage,
  loadSessions, loadSessionMessages, deleteSession
} from './frankieEngine'

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
  { label: 'Cash Flow', icon: DollarSign, prompt: 'What does our cash flow look like? Revenue vs expenses for the last 30 days.' },
  { label: 'Overdue Invoices', icon: AlertTriangle, prompt: 'Show me all overdue invoices. Who owes us money and how late are they?' },
  { label: 'Job Profitability', icon: TrendingUp, prompt: 'Break down profitability of our recent completed jobs. Which ones had the best and worst margins?' },
  { label: 'Expense Analysis', icon: PieChart, prompt: 'Analyze our expenses for the last 30 days. Any unusual spikes or patterns?' },
  { label: 'AR Aging', icon: Clock, prompt: 'Give me an AR aging report. How much is current, 30 days, 60 days, and 90+ days overdue?' },
  { label: 'Burn Rate', icon: Receipt, prompt: 'What is our monthly burn rate? How has it trended over the last 3 months?' },
]

export default function FrankieAsk() {
  const location = useLocation()
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState(location.state?.sessionId || null)
  const [copied, setCopied] = useState(null)

  const messagesEndRef = useRef(null)
  const messagesRef = useRef(messages)
  const sendingRef = useRef(false)
  const inputRef = useRef(null)

  useEffect(() => { messagesRef.current = messages }, [messages])

  // Load existing session if provided
  useEffect(() => {
    if (location.state?.sessionId) {
      loadSessionMessages(location.state.sessionId).then(msgs => {
        setMessages(msgs.map(m => ({
          id: m.id || Date.now(),
          role: m.role,
          content: m.content
        })))
      })
    }
  }, [location.state?.sessionId])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading || sendingRef.current) return
    sendingRef.current = true
    if (!text) setInput('')

    const userMsg = { id: Date.now(), role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])

    const assistantId = Date.now() + 1
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])
    setLoading(true)

    try {
      let sid = sessionId
      if (!sid) {
        const session = await createSession(msg.slice(0, 80))
        sid = session?.session_id
        setSessionId(sid)
      }

      await saveMessage(sid, 'user', msg)

      const history = messagesRef.current
        .filter(m => m.id !== assistantId)
        .map(m => ({ role: m.role, content: m.content }))

      const fullResponse = await sendMessageStream(msg, history, (partialText) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: partialText } : m
        ))
      })

      await saveMessage(sid, 'assistant', fullResponse)
    } catch (e) {
      console.error('[FrankieAsk] Error:', e)
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `Something went wrong: ${e.message}. Try again.` }
          : m
      ))
    } finally {
      setLoading(false)
      sendingRef.current = false
      inputRef.current?.focus()
    }
  }, [input, loading, sessionId])

  const handleKeyDown = (e) => {
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
    setMessages([])
    setSessionId(null)
    setInput('')
  }

  const accentColor = '#5a6349'
  const accentBg = 'rgba(90,99,73,0.12)'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: theme.bg, maxWidth: '900px', margin: '0 auto', width: '100%'
    }}>
      {/* Messages Area */}
      <div style={{
        flex: 1, overflow: 'auto',
        padding: isMobile ? '16px' : '24px',
        display: 'flex', flexDirection: 'column', gap: '16px'
      }}>
        {/* Welcome state */}
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: isMobile ? '32px 16px' : '48px 24px' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '16px',
              background: accentBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <DollarSign size={32} style={{ color: accentColor }} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: theme.text, marginBottom: '8px' }}>
              Ask Frankie Anything
            </h2>
            <p style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '24px', maxWidth: '420px', margin: '0 auto 24px' }}>
              Your AI CFO is ready. Ask about cash flow, profitability, expenses, collections, or any financial question about your business.
            </p>

            {/* Quick Actions */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '8px',
              justifyContent: 'center', maxWidth: '600px', margin: '0 auto'
            }}>
              {QUICK_ACTIONS.map(action => {
                const Icon = action.icon
                return (
                  <button
                    key={action.label}
                    onClick={() => handleSend(action.prompt)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '8px 14px', borderRadius: '20px',
                      background: theme.bgCard, color: theme.text,
                      border: `1px solid ${theme.border}`,
                      cursor: 'pointer', fontSize: '13px', fontWeight: '500',
                      transition: 'all 0.15s'
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = accentBg; e.currentTarget.style.borderColor = accentColor }}
                    onMouseOut={e => { e.currentTarget.style.background = theme.bgCard; e.currentTarget.style.borderColor = theme.border }}
                  >
                    <Icon size={14} style={{ color: accentColor }} />
                    {action.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            gap: '8px'
          }}>
            {msg.role === 'assistant' && (
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: accentBg, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: '4px'
              }}>
                <DollarSign size={16} style={{ color: accentColor }} />
              </div>
            )}
            <div style={{
              maxWidth: isMobile ? '85%' : '75%',
              padding: '12px 16px',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.role === 'user' ? accentColor : theme.bgCard,
              color: msg.role === 'user' ? '#fff' : theme.text,
              border: msg.role === 'user' ? 'none' : `1px solid ${theme.border}`,
              fontSize: '14px', lineHeight: '1.6',
              position: 'relative'
            }}>
              {msg.role === 'assistant' && msg.content ? (
                <div className="frankie-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : msg.role === 'assistant' && !msg.content && loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.textMuted }}>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Analyzing your financials...
                </div>
              ) : (
                <span>{msg.content}</span>
              )}

              {/* Copy button for assistant messages */}
              {msg.role === 'assistant' && msg.content && (
                <button
                  onClick={() => handleCopy(msg.content, msg.id)}
                  style={{
                    position: 'absolute', top: '8px', right: '8px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: theme.textMuted, padding: '4px', borderRadius: '4px',
                    opacity: 0.5
                  }}
                  onMouseOver={e => e.currentTarget.style.opacity = 1}
                  onMouseOut={e => e.currentTarget.style.opacity = 0.5}
                >
                  {copied === msg.id ? <Check size={14} /> : <Copy size={14} />}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Quick actions after first response */}
        {messages.length > 0 && !loading && (
          <div style={{
            display: 'flex', gap: '6px', overflowX: 'auto',
            paddingBottom: '4px', flexShrink: 0
          }}>
            {QUICK_ACTIONS.slice(0, 4).map(action => {
              const Icon = action.icon
              return (
                <button
                  key={action.label}
                  onClick={() => handleSend(action.prompt)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '6px 10px', borderRadius: '16px',
                    background: accentBg, color: accentColor,
                    border: 'none', cursor: 'pointer',
                    fontSize: '12px', fontWeight: '500', whiteSpace: 'nowrap'
                  }}
                >
                  <Icon size={12} /> {action.label}
                </button>
              )
            })}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{
        padding: isMobile ? '12px 16px' : '16px 24px',
        borderTop: `1px solid ${theme.border}`,
        background: theme.bgCard
      }}>
        <div style={{
          display: 'flex', gap: '8px', alignItems: 'flex-end',
          maxWidth: '900px', margin: '0 auto'
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Frankie about your finances..."
            rows={1}
            style={{
              flex: 1, resize: 'none',
              padding: '12px 16px', borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              background: theme.bg, color: theme.text,
              fontSize: '14px', lineHeight: '1.5',
              outline: 'none', fontFamily: 'inherit',
              minHeight: '44px', maxHeight: '120px'
            }}
            onInput={e => {
              e.target.style.height = '44px'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: input.trim() ? accentColor : theme.border,
              color: '#fff', border: 'none', cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background 0.15s'
            }}
          >
            {loading ? (
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: '8px', fontSize: '12px', color: theme.textMuted
        }}>
          <span>Press Enter to send, Shift+Enter for new line</span>
          {sessionId && (
            <button
              onClick={handleNewChat}
              style={{
                background: 'none', border: 'none', color: theme.textMuted,
                cursor: 'pointer', fontSize: '12px', textDecoration: 'underline'
              }}
            >
              New conversation
            </button>
          )}
        </div>
      </div>

      {/* Spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .frankie-markdown p { margin: 0 0 8px; }
        .frankie-markdown p:last-child { margin-bottom: 0; }
        .frankie-markdown ul, .frankie-markdown ol { margin: 4px 0 8px; padding-left: 20px; }
        .frankie-markdown li { margin-bottom: 2px; }
        .frankie-markdown table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px; }
        .frankie-markdown th { background-color: ${accentBg}; color: ${accentColor}; padding: 8px; text-align: left; font-weight: 600; border-bottom: 2px solid ${accentColor}30; }
        .frankie-markdown td { padding: 6px 8px; border-bottom: 1px solid #e5e5e5; }
        .frankie-markdown tr:hover td { background-color: ${accentBg}; }
        .frankie-markdown code { background-color: ${accentBg}; color: ${accentColor}; padding: 1px 5px; border-radius: 3px; font-size: 13px; }
        .frankie-markdown h1, .frankie-markdown h2, .frankie-markdown h3 { margin: 12px 0 6px; }
        .frankie-markdown strong { color: inherit; }
        .frankie-markdown blockquote { border-left: 3px solid ${accentColor}; margin: 8px 0; padding: 4px 12px; color: #666; }
      `}</style>
    </div>
  )
}
