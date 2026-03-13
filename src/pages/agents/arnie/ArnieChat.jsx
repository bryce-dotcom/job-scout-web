import { useState, useRef, useEffect, useCallback } from 'react'
import { useTheme } from '../../../components/Layout'
import { useStore } from '../../../lib/store'
import { sendMessageStream, createSession, saveMessage, updateSessionTitle, loadSessionMessages } from './arnieEngine'
import { getUserRole } from './arnieTools'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Copy, Check, Loader2, Sparkles, Calendar, Users, Package, FileText, Briefcase, BarChart3, Truck, Mic, Volume2, VolumeX, ChevronDown, Download } from 'lucide-react'
import { speak, stopSpeaking, isAvailable as elevenLabsAvailable, ARNIE_VOICES } from './arnieVoice'

// Dark Arnie theme
const dark = {
  bg: '#1a1d21',
  bgChat: '#22262b',
  bgBubbleArnie: '#2a2f35',
  bgBubbleUser: '#f97316',
  border: '#333840',
  borderLight: '#3d434b',
  text: '#e8e6e3',
  textSecondary: '#a0a4aa',
  textMuted: '#6b7280',
  orange: '#f97316',
  orangeHover: '#fb923c',
  orangeBg: 'rgba(249, 115, 22, 0.12)',
  orangeGlow: 'rgba(249, 115, 22, 0.3)',
  green: '#22c55e',
  red: '#ef4444',
  chipBg: '#2a2f35',
  chipBorder: '#3d434b',
  inputBg: '#2a2f35',
}

const QUICK_ACTIONS = {
  user: [
    { label: 'My Schedule', icon: Calendar, prompt: 'What jobs do I have scheduled today?' },
    { label: 'My Jobs', icon: Briefcase, prompt: 'Show me a summary of my assigned jobs' },
    { label: 'Products', icon: Package, prompt: 'What products and services do we offer?' },
    { label: 'Team', icon: Users, prompt: 'Who is on the team?' },
  ],
  admin: [
    { label: 'Job Overview', icon: Briefcase, prompt: 'Give me an overview of all jobs' },
    { label: 'Lead Pipeline', icon: Sparkles, prompt: 'How does our sales pipeline look?' },
    { label: 'Team Status', icon: Users, prompt: 'Show me the team roster' },
    { label: 'Inventory', icon: Package, prompt: 'What does our inventory look like?' },
    { label: 'Fleet', icon: Truck, prompt: 'Give me a fleet status report' },
  ],
  super_admin: [
    { label: 'Business Overview', icon: BarChart3, prompt: 'Give me a full business overview — jobs, revenue, pipeline, team' },
    { label: 'Financial Summary', icon: FileText, prompt: 'Show me a financial summary — invoices, payments, expenses, revenue' },
    { label: 'Job Overview', icon: Briefcase, prompt: 'Give me an overview of all jobs' },
    { label: 'Lead Pipeline', icon: Sparkles, prompt: 'How does our sales pipeline look?' },
    { label: 'Team & Payroll', icon: Users, prompt: 'Show me the team with pay rates' },
  ]
}

// Arnie avatar component — real image with orange ring
function ArnieAvatar({ size = 36 }) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      border: `2.5px solid ${dark.orange}`,
      overflow: 'hidden',
      flexShrink: 0,
      boxShadow: `0 0 8px ${dark.orangeGlow}`,
      backgroundColor: dark.bgChat,
    }}>
      <img
        src="/og-arnie.png"
        alt="OG Arnie"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </div>
  )
}


export default function ArnieChat({ isPanel = false, onClose, sessionId: externalSessionId }) {
  const { theme } = useTheme()
  const user = useStore(s => s.user)
  const company = useStore(s => s.company)

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState(externalSessionId || null)
  const [copiedId, setCopiedId] = useState(null)

  // Voice state — ElevenLabs
  const [voiceOn, setVoiceOn] = useState(elevenLabsAvailable())
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState(ARNIE_VOICES[1].id) // Bill — deep American
  const [showVoiceSelect, setShowVoiceSelect] = useState(false)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const recognitionRef = useRef(null)

  const { role } = getUserRole()
  const quickActions = QUICK_ACTIONS[role] || QUICK_ACTIONS.user

  // Load existing session messages
  useEffect(() => {
    if (externalSessionId) {
      setSessionId(externalSessionId)
      loadSessionMessages(externalSessionId).then(msgs => {
        setMessages(msgs.map(m => ({ id: m.id, role: m.role, content: m.content })))
      })
    }
  }, [externalSessionId])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Pause/resume mic helpers
  const pauseMic = useCallback(() => {
    pausedRef.current = true
    if (recognitionRef.current && listeningRef.current) {
      try { recognitionRef.current.stop() } catch {}
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
  }, [])

  const resumeMic = useCallback(() => {
    pausedRef.current = false
    if (listeningRef.current && recognitionRef.current) {
      try { recognitionRef.current.start() } catch {}
    }
  }, [])

  // Speak via ElevenLabs — mic is already paused during response cycle
  const speakText = useCallback((text) => {
    if (!voiceOn) {
      // No voice — resume mic right away
      resumeMic()
      return
    }
    speak(
      text,
      selectedVoice,
      () => setSpeaking(true),
      () => {
        setSpeaking(false)
        // Resume mic after Arnie finishes speaking
        resumeMic()
      }
    )
  }, [voiceOn, selectedVoice, resumeMic])

  const handleStopSpeaking = () => {
    stopSpeaking()
    setSpeaking(false)
    resumeMic()
  }

  // Kill everything — called on close/unmount
  const killAll = useCallback(() => {
    stopSpeaking()
    setSpeaking(false)
    setListening(false)
    listeningRef.current = false
    recognitionRef.current?.abort()
    recognitionRef.current = null
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
  }, [])

  useEffect(() => {
    return killAll
  }, [killAll])

  // Continuous mic with 3-second silence buffer
  // Listens through pauses/commas — only sends after 3s of total silence
  const listeningRef = useRef(false)
  const silenceTimerRef = useRef(null)
  const transcriptRef = useRef('')
  const pausedRef = useRef(false)

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.')
      return
    }

    // Stop Arnie if he's talking
    if (speaking) handleStopSpeaking()

    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    transcriptRef.current = ''

    recognition.onstart = () => {
      setListening(true)
      listeningRef.current = true
    }

    recognition.onresult = (event) => {
      // Build full transcript from all results
      const full = Array.from(event.results)
        .map(r => r[0].transcript)
        .join('')
      transcriptRef.current = full
      setInput(full)

      // Reset the silence timer every time we get new speech
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        // 3 seconds of silence — send it
        const text = transcriptRef.current.trim()
        if (text && listeningRef.current) {
          // Pause mic while processing
          try { recognition.stop() } catch {}
          setInput('')
          transcriptRef.current = ''
          handleSend(text)
        }
      }, 3000)
    }

    recognition.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.error('Speech error:', e.error)
      }
    }

    // Auto-restart to keep mic hot (unless paused for Arnie's response)
    recognition.onend = () => {
      if (listeningRef.current && !pausedRef.current) {
        try { recognition.start() } catch {}
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const stopListening = () => {
    listeningRef.current = false
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
    setInput('')
    transcriptRef.current = ''
  }

  const handleSend = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return

    // Pause mic for the entire response cycle (generating + speaking)
    pauseMic()

    setInput('')
    transcriptRef.current = ''
    const userMsg = { id: Date.now(), role: 'user', content: msg }
    const assistantId = Date.now() + 1
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    // Add empty assistant message that we'll stream into
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    try {
      let sid = sessionId
      if (!sid) {
        const session = await createSession(msg.slice(0, 80))
        sid = session?.session_id
        setSessionId(sid)
      }

      await saveMessage(sid, 'user', msg)

      const history = messages.map(m => ({ role: m.role, content: m.content }))

      // Stream response — update the assistant bubble in real-time
      const fullResponse = await sendMessageStream(msg, history, (partialText) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: partialText } : m
        ))
      })

      await saveMessage(sid, 'assistant', fullResponse)
      speakText(fullResponse)

      if (messages.length === 0) {
        await updateSessionTitle(sid, msg.slice(0, 80))
      }
    } catch (err) {
      console.error('Arnie error:', err)
      const errText = err.message?.includes('API key')
        ? 'Ye gawds! The Gemini API key ain\'t set up yet, kid. Tell your admin to add VITE_GEMINI_API_KEY to the environment.'
        : 'Ay, something went sideways on me. Give it another shot in a sec, boss.'
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: errText } : m
      ))
      speakText(errText)
    } finally {
      setLoading(false)
    }
  }, [input, loading, sessionId, messages, speakText, pauseMic])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleCopy = (content, id) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const [exportedId, setExportedId] = useState(null)

  const handleExport = (content, id) => {
    // Export as .txt file download
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `arnie-report-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setExportedId(id)
    setTimeout(() => setExportedId(null), 2000)
  }

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    height: isPanel ? '100%' : 'calc(100vh - 140px)',
    maxWidth: isPanel ? undefined : 900,
    margin: isPanel ? undefined : '0 auto',
    padding: isPanel ? undefined : '0 16px',
    backgroundColor: dark.bg,
    borderRadius: isPanel ? 0 : 12,
    overflow: 'hidden',
  }

  return (
    <div style={containerStyle}>
      {/* Voice controls bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 14px',
        backgroundColor: dark.bgChat,
        borderBottom: `1px solid ${dark.border}`,
        flexShrink: 0,
      }}>
        {/* Voice toggle */}
        <button
          onClick={() => {
            if (voiceOn) handleStopSpeaking()
            setVoiceOn(!voiceOn)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 16,
            border: `1px solid ${voiceOn ? dark.green : dark.borderLight}`,
            backgroundColor: voiceOn ? 'rgba(34, 197, 94, 0.12)' : 'transparent',
            color: voiceOn ? dark.green : dark.textMuted,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          Voice {voiceOn ? 'ON' : 'OFF'}
        </button>

        {/* Voice selector — ElevenLabs voices */}
        {voiceOn && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowVoiceSelect(!showVoiceSelect)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 8,
                border: `1px solid ${dark.borderLight}`,
                backgroundColor: dark.inputBg,
                color: dark.textSecondary,
                fontSize: 11,
                cursor: 'pointer',
                maxWidth: 200,
              }}
            >
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                Voice: {ARNIE_VOICES.find(v => v.id === selectedVoice)?.name || 'Bill'}
              </span>
              <ChevronDown size={12} />
            </button>
            {showVoiceSelect && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                backgroundColor: dark.bgChat,
                border: `1px solid ${dark.border}`,
                borderRadius: 8,
                maxHeight: 240,
                overflowY: 'auto',
                zIndex: 10,
                minWidth: 250,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                {ARNIE_VOICES.map(v => (
                  <div
                    key={v.id}
                    onClick={() => { setSelectedVoice(v.id); setShowVoiceSelect(false) }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      backgroundColor: v.id === selectedVoice ? dark.orangeBg : 'transparent',
                      borderBottom: `1px solid ${dark.border}`,
                    }}
                    onMouseEnter={e => { if (v.id !== selectedVoice) e.currentTarget.style.backgroundColor = dark.bgBubbleArnie }}
                    onMouseLeave={e => { if (v.id !== selectedVoice) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: v.id === selectedVoice ? dark.orange : dark.text }}>
                      {v.name}
                    </div>
                    <div style={{ fontSize: 11, color: dark.textMuted, marginTop: 1 }}>
                      {v.desc}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: isPanel ? '16px 14px' : '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        backgroundColor: dark.bg,
      }}>
        {/* Welcome state */}
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '32px 12px' }}>
            <ArnieAvatar size={80} />
            <div style={{ marginTop: 16 }} />
            <h2 style={{ color: dark.text, fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>
              OG Arnie
            </h2>
            <p style={{ color: dark.textSecondary, fontSize: 13, margin: '0 0 6px' }}>
              AI Assistant{company?.name ? ` \u2022 ${company.name}` : ''}
            </p>
            <p style={{
              color: dark.orange,
              fontSize: 14,
              margin: '12px 0 24px',
              fontStyle: 'italic',
            }}>
              "Ay, what's good? O.G. Arnie here. You need somethin', I got you."
            </p>

            {/* Quick action chips */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'center',
            }}>
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleSend(action.prompt)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 20,
                    border: `1px solid ${dark.chipBorder}`,
                    backgroundColor: dark.chipBg,
                    color: dark.text,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = dark.orangeBg
                    e.currentTarget.style.borderColor = dark.orange
                    e.currentTarget.style.color = dark.orange
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = dark.chipBg
                    e.currentTarget.style.borderColor = dark.chipBorder
                    e.currentTarget.style.color = dark.text
                  }}
                >
                  <action.icon size={14} />
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            {msg.role === 'assistant' && (
              <ArnieAvatar size={32} />
            )}

            <div className="arnie-msg-wrapper" style={{
              maxWidth: isPanel ? '85%' : '70%',
              position: 'relative',
            }}>
              <div style={{
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                backgroundColor: msg.role === 'user' ? dark.bgBubbleUser : dark.bgBubbleArnie,
                color: dark.text,
                fontSize: 14,
                lineHeight: 1.6,
                border: msg.role === 'assistant' ? `1px solid ${dark.border}` : 'none',
              }}>
                {msg.role === 'assistant' ? (
                  <div className="arnie-markdown" style={{ overflow: 'auto' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                )}
              </div>

              {/* Action buttons for assistant messages */}
              {msg.role === 'assistant' && msg.content && (
                <div
                  className="arnie-msg-actions"
                  style={{
                    position: 'absolute',
                    top: -10,
                    right: -6,
                    display: 'flex',
                    gap: 4,
                    opacity: 0,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <button
                    onClick={() => handleCopy(msg.content, msg.id)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: `1px solid ${dark.border}`,
                      backgroundColor: dark.bgChat,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    title="Copy"
                  >
                    {copiedId === msg.id ? <Check size={12} color={dark.green} /> : <Copy size={12} color={dark.textSecondary} />}
                  </button>
                  <button
                    onClick={() => handleExport(msg.content, msg.id)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: `1px solid ${dark.border}`,
                      backgroundColor: dark.bgChat,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    title="Export as file"
                  >
                    {exportedId === msg.id ? <Check size={12} color={dark.green} /> : <Download size={12} color={dark.textSecondary} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ArnieAvatar size={32} />
            <div style={{
              padding: '10px 14px',
              borderRadius: '16px 16px 16px 4px',
              backgroundColor: dark.bgBubbleArnie,
              border: `1px solid ${dark.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: dark.orange,
              fontSize: 14,
            }}>
              <Loader2 size={16} style={{ animation: 'arnieSpin 1s linear infinite' }} />
              Arnie's cookin' somethin' up...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick chips after first response */}
      {messages.length > 0 && !loading && (
        <div style={{
          padding: '0 14px 8px',
          backgroundColor: dark.bg,
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          flexShrink: 0,
        }}>
          {quickActions.slice(0, 4).map((action) => (
            <button
              key={action.label}
              onClick={() => handleSend(action.prompt)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 16,
                border: `1px solid ${dark.chipBorder}`,
                backgroundColor: dark.chipBg,
                color: dark.textSecondary,
                fontSize: 12,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = dark.orange
                e.currentTarget.style.color = dark.orange
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = dark.chipBorder
                e.currentTarget.style.color = dark.textSecondary
              }}
            >
              <action.icon size={12} />
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div style={{
        padding: isPanel ? '10px 14px 14px' : '12px 16px 20px',
        backgroundColor: dark.bg,
        borderTop: `1px solid ${dark.border}`,
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={listening ? 'Listening...' : 'Tap mic or type...'}
            rows={1}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 12,
              border: `1px solid ${listening ? dark.red : dark.borderLight}`,
              backgroundColor: dark.inputBg,
              color: dark.text,
              fontSize: 14,
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              minHeight: 44,
              maxHeight: 120,
              transition: 'border-color 0.15s',
            }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onFocus={e => { if (!listening) e.target.style.borderColor = dark.orange }}
            onBlur={e => { if (!listening) e.target.style.borderColor = dark.borderLight }}
          />

          {/* Mic button */}
          <button
            onClick={listening ? stopListening : startListening}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              border: 'none',
              backgroundColor: listening ? dark.red : dark.green,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s',
              flexShrink: 0,
              animation: listening ? 'arniePulse 1.5s ease-in-out infinite' : 'none',
            }}
            title={listening ? 'Stop listening' : 'Speak to Arnie'}
          >
            <Mic size={18} />
          </button>

          {/* Send button */}
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              border: 'none',
              backgroundColor: input.trim() && !loading ? dark.orange : dark.borderLight,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              transition: 'background-color 0.15s',
              flexShrink: 0,
            }}
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Dark Arnie markdown + animation styles */}
      <style>{`
        .arnie-markdown p { margin: 0 0 8px; }
        .arnie-markdown p:last-child { margin: 0; }
        .arnie-markdown ul, .arnie-markdown ol { margin: 4px 0 8px; padding-left: 20px; }
        .arnie-markdown li { margin: 2px 0; }
        .arnie-markdown h1, .arnie-markdown h2, .arnie-markdown h3 { margin: 12px 0 6px; color: ${dark.orange}; }
        .arnie-markdown h1 { font-size: 18px; }
        .arnie-markdown h2 { font-size: 16px; }
        .arnie-markdown h3 { font-size: 14px; font-weight: 600; }
        .arnie-markdown table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px; }
        .arnie-markdown th, .arnie-markdown td {
          padding: 6px 10px;
          border: 1px solid ${dark.border};
          text-align: left;
        }
        .arnie-markdown th {
          background-color: ${dark.orangeBg};
          font-weight: 600;
          color: ${dark.orange};
        }
        .arnie-markdown code {
          background-color: rgba(249, 115, 22, 0.1);
          color: ${dark.orange};
          padding: 1px 5px;
          border-radius: 4px;
          font-size: 13px;
        }
        .arnie-markdown pre {
          background-color: #0d0f12;
          color: #d4d4d4;
          padding: 12px;
          border-radius: 8px;
          overflow-x: auto;
          margin: 8px 0;
          border: 1px solid ${dark.border};
        }
        .arnie-markdown pre code {
          background: none;
          padding: 0;
          color: inherit;
        }
        .arnie-markdown strong { font-weight: 600; color: ${dark.text}; }
        .arnie-markdown em { color: ${dark.orange}; }
        .arnie-markdown blockquote {
          border-left: 3px solid ${dark.orange};
          margin: 8px 0;
          padding: 4px 12px;
          color: ${dark.textSecondary};
          background: ${dark.orangeBg};
          border-radius: 0 6px 6px 0;
        }
        .arnie-markdown a { color: ${dark.orange}; text-decoration: underline; }
        /* Show action buttons on hover */
        .arnie-msg-wrapper:hover .arnie-msg-actions { opacity: 1 !important; }
        @keyframes arnieSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes arniePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          50% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
        }
      `}</style>
    </div>
  )
}
