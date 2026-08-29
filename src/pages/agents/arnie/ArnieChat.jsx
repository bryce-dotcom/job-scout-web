import { useState, useRef, useEffect, useCallback } from 'react'
import { useTheme } from '../../../components/Layout'
import { useStore } from '../../../lib/store'
import { supabase } from '../../../lib/supabase'
import { sendMessageStream, createSession, saveMessage, updateSessionTitle, loadSessionMessages, rememberLastSession } from './arnieEngine'
import { getUserRole, isClockedIn } from './arnieTools'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Copy, Check, Loader2, Sparkles, Calendar, Users, Package, FileText, Briefcase, BarChart3, Truck, Mic, Volume2, VolumeX, ChevronDown, Download, Paperclip, X, Wrench } from 'lucide-react'
import { readAttachment, attachmentNote, describeAttachments, ACCEPT_ATTR, MAX_ATTACHMENTS } from '../../../lib/chatAttachments'
import { speak, stopSpeaking, isAvailable as elevenLabsAvailable, ARNIE_VOICES, unlockAudio } from './arnieVoice'
import { useIsMobile } from '../../../hooks/useIsMobile'

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

// Shown instead of the role menu whenever someone is clocked into a job. The
// role sets are all desk questions ("how does our pipeline look?") — nobody up
// a ladder is asking that, and the four things they DO ask are always the same.
const FIELD_ACTIONS = [
  { label: "What's next?", icon: Briefcase, prompt: 'What should I do next on this job?' },
  { label: 'Fix something', icon: Wrench, prompt: 'Something here is not working right and I need help working out why. Ask me what it is doing.' },
  { label: 'Parts', icon: Package, prompt: 'What am I installing on this job? List the line items and quantities.' },
  { label: 'Customer', icon: Users, prompt: 'Who is the customer on this job and what is the site address and phone number?' },
  { label: 'My sections', icon: Check, prompt: 'Which sections are assigned to me, and which are still open?' },
]

const QUICK_ACTIONS = {
  user: [
    { label: 'My Schedule', icon: Calendar, prompt: 'What jobs do I have scheduled today?' },
    { label: 'My Jobs', icon: Briefcase, prompt: 'Show me a summary of my assigned jobs' },
    { label: 'Products', icon: Package, prompt: 'What products and services do we offer?' },
    { label: 'Fix something', icon: Wrench, prompt: 'I need help troubleshooting something. Ask me what it is doing.' },
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

// Tier A proposals preview a whole taxonomy list; Tier B previews one field on
// one record. They need different cards, and this is how a message says which.
const pv0 = (msg) => msg.proposal?.preview || {}

function ArnieAvatar({ size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `2.5px solid ${dark.orange}`, overflow: 'hidden', flexShrink: 0,
      boxShadow: `0 0 8px ${dark.orangeGlow}`, backgroundColor: dark.bgChat,
    }}>
      <img src="/og-arnie.png" alt="OG Arnie" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  )
}


// Config requests used to be routed by a regex over the message text here:
// a verb plus one of three taxonomy nouns. It missed "upsell" entirely — a
// supported target the pattern never mentioned — and any phrasing that did
// not name the list outright ("we don't sell to government any more").
//
// Arnie now decides for himself: propose_change is a tool on his rail, and
// the drafted proposal arrives on the stream as a `proposal` event. Deciding
// what the user meant is the model's job, not a pattern's.

export default function ArnieChat({ isPanel = false, onClose, sessionId: externalSessionId }) {
  const { theme } = useTheme()
  const isMobile = useIsMobile()
  const company = useStore(s => s.company)

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState(externalSessionId || null)
  const [copiedId, setCopiedId] = useState(null)
  const [attachments, setAttachments] = useState([])
  const [attachError, setAttachError] = useState('')
  const [reading, setReading] = useState(false)
  const fileInputRef = useRef(null)
  const [exportedId, setExportedId] = useState(null)

  // Voice state
  const [voiceOn, setVoiceOn] = useState(true) // always available now (browser TTS is free)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState(ARNIE_VOICES[0]?.id || 'browser_male_1')
  const [showVoiceSelect, setShowVoiceSelect] = useState(false)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const recognitionRef = useRef(null)
  const listeningRef = useRef(false)
  const silenceTimerRef = useRef(null)
  const transcriptRef = useRef('')
  const safetyTimerRef = useRef(null)

  // Mic state machine: 'idle' | 'listening' | 'paused'
  // Replaces the old boolean pausedRef to prevent double-start race conditions
  const micStateRef = useRef('idle')

  // messagesRef — always mirrors `messages` state, used in handleSend to avoid stale closures
  const messagesRef = useRef([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const { role, userId } = getUserRole()
  // Being clocked into a job outranks the role menu — see detectMode() in
  // arnieEngine, which shifts Arnie's answering style on the same signal.
  const onJob = isClockedIn(userId)
  const quickActions = onJob ? FIELD_ACTIONS : (QUICK_ACTIONS[role] || QUICK_ACTIONS.user)

  // ── Arnie config (Tier A): admins can ask for changes right here in chat ──
  // Arnie drafts the change himself via the propose_change tool; this side
  // only renders the resulting card and relays the admin's decision. There is
  // deliberately no client-side admin check any more — the edge function
  // decides who may propose, from the JWT, and a check here would only be a
  // second copy of that rule that could drift out of step with it.
  const cfgInvoke = async (body) => {
    try {
      const { data, error } = await supabase.functions.invoke('arnie-config', { body })
      if (error) {
        let m = error.message
        try { m = (await error.context?.json())?.error || m } catch { /* keep default */ }
        return { error: m }
      }
      return data || {}
    } catch (e) {
      return { error: e.message || 'Arnie config is unreachable right now.' }
    }
  }

  const decideProposal = async (decision, proposalId, msgId) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, proposalBusy: true } : m))
    const res = await cfgInvoke({ action: decision, proposal_id: proposalId })
    const failed = !res || res.error
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m
      if (failed) return { ...m, proposalBusy: false, proposalError: res?.error || 'That didn\'t go through.' }
      const status = decision === 'apply' ? 'applied' : 'rejected'
      return {
        ...m, proposalBusy: false, proposalStatus: status, proposalError: null,
        content: status === 'applied'
          ? "Done — it's live. I logged the change, and you can roll it back anytime from Arnie's Settings tab."
          : 'No sweat — tossed it. Nothing changed.',
      }
    }))
    // A successful apply changed a settings taxonomy list in the DB — refresh
    // the store so the new business unit / lead source / service type shows up
    // app-wide (dropdowns etc.) without a manual reload.
    if (decision === 'apply' && !failed) {
      try { await useStore.getState().fetchSettings?.() } catch { /* refresh is best-effort */ }
    }
  }

  // Load existing session messages
  useEffect(() => {
    if (externalSessionId) {
      setSessionId(externalSessionId)
      rememberLastSession(externalSessionId)
      loadSessionMessages(externalSessionId).then(msgs => {
        setMessages(msgs.map(m => ({ id: m.id, role: m.role, content: m.content })))
      })
    }
  }, [externalSessionId])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Cleanup on unmount — fully stop mic and speech
  useEffect(() => {
    return () => {
      stopSpeaking()
      listeningRef.current = false
      micStateRef.current = 'idle'
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
      try { recognitionRef.current?.stop() } catch {}
      recognitionRef.current = null
    }
  }, [])

  // ── Mic helpers (state machine) ───────────────────────────────────────

  const pauseMic = useCallback(() => {
    if (micStateRef.current !== 'listening') return // only pause if actively listening
    micStateRef.current = 'paused'
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
  }, [])

  const resumeMic = useCallback(() => {
    if (micStateRef.current !== 'paused') return // only resume if we were paused
    micStateRef.current = 'listening'
    // 100ms delay to avoid racing with recognition.onend
    setTimeout(() => {
      if (micStateRef.current === 'listening' && recognitionRef.current) {
        try { recognitionRef.current.start() } catch (e) {
          console.warn('[Arnie Mic] Failed to restart after resume:', e)
        }
      }
    }, 100)
  }, [])

  // ── TTS helper ──────────────────────────────────────────────────────

  const speakingLockRef = useRef(false)
  const speakText = useCallback((text) => {
    if (!voiceOn) {
      resumeMic()
      return
    }
    if (speakingLockRef.current) {
      console.warn('[Arnie] speakText blocked — already speaking')
      return
    }
    speakingLockRef.current = true
    stopSpeaking() // kill anything playing before starting
    speak(text, selectedVoice,
      () => setSpeaking(true),
      () => {
        setSpeaking(false)
        speakingLockRef.current = false
        resumeMic()
      }
    )
  }, [voiceOn, selectedVoice, resumeMic])

  const handleStopSpeaking = () => {
    stopSpeaking()
    setSpeaking(false)
    resumeMic()
  }

  // ── Speech recognition ──────────────────────────────────────────────

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.')
      return
    }

    unlockAudio() // Unlock audio on user gesture so TTS can play later
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
      micStateRef.current = 'listening'
    }

    recognition.onresult = (event) => {
      const full = Array.from(event.results).map(r => r[0].transcript).join('')
      transcriptRef.current = full
      setInput(full)

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        const text = transcriptRef.current.trim()
        // Must be listening AND not already paused — recognition.stop() triggers a final
        // onresult which creates a new timer. Without the micState check, handleSend fires twice.
        if (text && listeningRef.current && micStateRef.current === 'listening') {
          micStateRef.current = 'paused'
          try { recognition.stop() } catch {}
          setInput('')
          transcriptRef.current = ''
          handleSend(text)
        }
      }, 3000)
    }

    recognition.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.error('[Arnie Mic] Speech error:', e.error)
      }
    }

    recognition.onend = () => {
      // Only auto-restart if mic state is 'listening' (natural silence end)
      // Do NOT restart if 'paused' (we intentionally stopped) or 'idle' (user toggled off)
      if (micStateRef.current === 'listening' && listeningRef.current) {
        try { recognition.start() } catch {}
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const stopListening = () => {
    listeningRef.current = false
    micStateRef.current = 'idle'
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
    setInput('')
    transcriptRef.current = ''
  }

  // ── Attachments ─────────────────────────────────────────────────────

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter(f => f && f.size >= 0)
    if (!files.length) return
    setAttachError('')
    setReading(true)
    const added = []
    const problems = []
    for (const file of files) {
      if (attachments.length + added.length >= MAX_ATTACHMENTS) {
        problems.push(`I can take ${MAX_ATTACHMENTS} at a time — ${file.name} didn't make the cut.`)
        continue
      }
      try {
        added.push(await readAttachment(file))
      } catch (err) {
        problems.push(err.message)
      }
    }
    if (added.length) setAttachments(prev => [...prev, ...added])
    setAttachError(problems.join(' '))
    setReading(false)
  }, [attachments.length])

  const removeAttachment = (id) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
    setAttachError('')
  }

  // Ctrl+V a screenshot straight into the box — how people actually share one.
  const handlePaste = (e) => {
    const files = Array.from(e.clipboardData?.items || [])
      .filter(i => i.kind === 'file')
      .map(i => i.getAsFile())
      .filter(Boolean)
    if (files.length) {
      e.preventDefault()
      addFiles(files)
    }
  }

  // ── Send message ────────────────────────────────────────────────────

  const sendingRef = useRef(false)

  // `canned` marks a quick-action chip — a fixed prompt that shouldn't swallow
  // a photo the user is still composing around. Voice does carry it: on a job
  // site "what is this?" spoken over a snapshot is the normal way to ask.
  const handleSend = useCallback(async (text, { canned = false } = {}) => {
    const msg = (text || input).trim()
    const files = canned ? [] : attachments
    if ((!msg && !files.length) || loading || reading || sendingRef.current) return
    sendingRef.current = true

    unlockAudio()
    pauseMic()
    setInput('')
    if (files.length) setAttachments([])
    setAttachError('')
    transcriptRef.current = ''

    const userMsg = { id: Date.now(), role: 'user', content: msg, attachments: files }
    const assistantId = Date.now() + 1
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    // Safety timer: if mic is still paused after 30s, force-resume
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
    safetyTimerRef.current = setTimeout(() => {
      if (micStateRef.current === 'paused') {
        console.warn('[Arnie] Safety timer: force-resuming mic after 30s')
        resumeMic()
      }
    }, 30000)

    try {
      // The files themselves aren't stored, so the saved transcript has to name
      // them or a reopened session reads as a non-sequitur. An attachment with
      // no typed text still needs a title.
      const note = attachmentNote(files)
      const savedText = note ? (msg ? `${msg}\n\n${note}` : note) : msg
      const title = (msg || describeAttachments(files) || 'New conversation').slice(0, 80)

      let sid = sessionId
      if (!sid) {
        const session = await createSession(title)
        sid = session?.session_id
        setSessionId(sid)
      }
      rememberLastSession(sid)

      await saveMessage(sid, 'user', savedText)

      // Use messagesRef.current to avoid stale closure over `messages`
      const history = messagesRef.current.map(m => ({ role: m.role, content: m.content, attachments: m.attachments }))

      // Stream response — text appears in real-time. A config request is no
      // longer a separate branch: Arnie reaches for propose_change himself,
      // and the drafted change arrives here as `meta.proposal` mid-stream.
      const fullResponse = await sendMessageStream(msg, history, (partialText, meta) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: partialText, ...(meta?.proposal ? { proposal: meta.proposal } : {}) }
            : m
        ))
      }, files)

      await saveMessage(sid, 'assistant', fullResponse)

      // Speak the full response after streaming completes
      speakText(fullResponse)

      if (messagesRef.current.length <= 1) {
        await updateSessionTitle(sid, title)
      }
    } catch (err) {
      console.error('Arnie error:', err)
      const errText = err.message?.includes('API key') || err.message?.includes('ANTHROPIC')
        ? 'Ye gawds! The API key ain\'t set up yet, kid. Tell your admin to check the Supabase secrets.'
        : `Ay, something went sideways. ${err.message || 'Unknown error'}. Try again, boss.`
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: errText } : m
      ))
      speakText(errText)
    } finally {
      setLoading(false)
      sendingRef.current = false
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
    }
  }, [input, attachments, reading, loading, sessionId, speakText, pauseMic, resumeMic])

  // An attached file is enough on its own — a screenshot with no caption is a
  // perfectly clear question.
  const canSend = (!!input.trim() || attachments.length > 0) && !loading && !reading

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

  const handleExport = (content, id) => {
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

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: isPanel ? '100%' : 'calc(100dvh - 140px)',
      maxWidth: isPanel ? undefined : 900,
      margin: isPanel ? undefined : '0 auto',
      padding: isPanel ? undefined : '0 16px',
      backgroundColor: dark.bg,
      borderRadius: isPanel ? 0 : 12,
      overflow: 'hidden',
    }}>
      {/* Voice controls bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 14px', backgroundColor: dark.bgChat,
        borderBottom: `1px solid ${dark.border}`, flexShrink: 0,
      }}>
        <button
          onClick={() => {
            if (voiceOn) handleStopSpeaking()
            setVoiceOn(!voiceOn)
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 16,
            border: `1px solid ${voiceOn ? dark.green : dark.borderLight}`,
            backgroundColor: voiceOn ? 'rgba(34, 197, 94, 0.12)' : 'transparent',
            color: voiceOn ? dark.green : dark.textMuted,
            fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          Voice {voiceOn ? 'ON' : 'OFF'}
        </button>

        {voiceOn && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowVoiceSelect(!showVoiceSelect)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${dark.borderLight}`,
                backgroundColor: dark.inputBg, color: dark.textSecondary,
                fontSize: 11, cursor: 'pointer', maxWidth: 200,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Voice: {ARNIE_VOICES.find(v => v.id === selectedVoice)?.name || 'Bill'}
              </span>
              <ChevronDown size={12} />
            </button>
            {showVoiceSelect && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                backgroundColor: dark.bgChat, border: `1px solid ${dark.border}`,
                borderRadius: 8, maxHeight: 240, overflowY: 'auto', zIndex: 10,
                minWidth: 250, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                {ARNIE_VOICES.map(v => (
                  <div
                    key={v.id}
                    onClick={() => { setSelectedVoice(v.id); setShowVoiceSelect(false) }}
                    style={{
                      padding: '8px 12px', cursor: 'pointer',
                      backgroundColor: v.id === selectedVoice ? dark.orangeBg : 'transparent',
                      borderBottom: `1px solid ${dark.border}`,
                    }}
                    onMouseEnter={e => { if (v.id !== selectedVoice) e.currentTarget.style.backgroundColor = dark.bgBubbleArnie }}
                    onMouseLeave={e => { if (v.id !== selectedVoice) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: v.id === selectedVoice ? dark.orange : dark.text }}>
                      {v.name}
                    </div>
                    <div style={{ fontSize: 11, color: dark.textMuted, marginTop: 1 }}>{v.desc}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages area */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: isPanel ? '16px 14px' : (isMobile ? '16px 10px' : '24px 16px'),
        display: 'flex', flexDirection: 'column', gap: 18, backgroundColor: dark.bg,
      }}>
        {/* Welcome state */}
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '32px 12px' }}>
            <ArnieAvatar size={80} />
            <div style={{ marginTop: 16 }} />
            <h2 style={{ color: dark.text, fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>OG Arnie</h2>
            <p style={{ color: dark.textSecondary, fontSize: 13, margin: '0 0 6px' }}>
              AI Assistant{company?.name ? ` \u2022 ${company.name}` : ''}
            </p>
            <p style={{ color: dark.orange, fontSize: 14, margin: '12px 0 24px', fontStyle: 'italic' }}>
              "Ay, what's good? O.G. Arnie here. You need somethin', I got you."
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleSend(action.prompt, { canned: true })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 20,
                    border: `1px solid ${dark.chipBorder}`,
                    backgroundColor: dark.chipBg, color: dark.text,
                    fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
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
          <div key={msg.id} style={{
            display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            gap: 10, alignItems: 'flex-start',
          }}>
            {msg.role === 'assistant' && <ArnieAvatar size={32} />}
            <div className="arnie-msg-wrapper" style={{ maxWidth: isPanel ? '85%' : (isMobile ? '88%' : '70%'), position: 'relative' }}>
              <div style={{
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                backgroundColor: msg.role === 'user' ? dark.bgBubbleUser : dark.bgBubbleArnie,
                color: dark.text, fontSize: 14, lineHeight: 1.6,
                border: msg.role === 'assistant' ? `1px solid ${dark.border}` : 'none',
              }}>
                {msg.role === 'assistant' ? (
                  <div className="arnie-markdown" style={{ overflow: 'auto' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <>
                    {msg.attachments?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: msg.content ? 8 : 0 }}>
                        {msg.attachments.map(att => att.previewUrl ? (
                          <img
                            key={att.id} src={att.previewUrl} alt={att.name}
                            style={{
                              maxWidth: 180, maxHeight: 180, borderRadius: 8,
                              border: '1px solid rgba(255,255,255,0.25)', display: 'block',
                            }}
                          />
                        ) : (
                          <span key={att.id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: 'rgba(255,255,255,0.18)', borderRadius: 8,
                            padding: '6px 10px', fontSize: 12.5, maxWidth: 200,
                          }}>
                            <FileText size={13} style={{ flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {msg.content && <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>}
                  </>
                )}
              </div>
              {msg.proposal && pv0(msg).kind === 'bulk' && (() => {
                // Every affected row is listed, deliberately. "This changes 34
                // products" is not something a person can meaningfully approve
                // — the whole value of the card is seeing which 34.
                const pv = msg.proposal.preview || {}
                const st = msg.proposalStatus
                const rows = pv.rows || []
                return (
                  <div style={{
                    marginTop: 8, background: dark.bgChat,
                    border: `1px solid ${st === 'applied' ? 'rgba(47,125,78,0.6)' : st === 'rejected' ? dark.border : 'rgba(201,129,47,0.7)'}`,
                    borderRadius: 12, padding: 12,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#d9963f', marginBottom: 6 }}>
                      {rows.length} {rows.length === 1 ? 'product' : 'products'} — {pv.label}
                    </div>
                    <div style={{ fontSize: 12.5, color: dark.textSecondary, marginBottom: 10 }}>
                      Where {pv.filter} → <span style={{ color: '#7fdba0', fontWeight: 600 }}>{String(pv.after)}</span>
                    </div>
                    <div style={{ maxHeight: 220, overflowY: 'auto', border: `1px solid ${dark.border}`, borderRadius: 8, marginBottom: st ? 10 : 12 }}>
                      {rows.map((r) => (
                        <div key={r.id} style={{
                          display: 'flex', justifyContent: 'space-between', gap: 8,
                          padding: '6px 10px', fontSize: 12.5, borderBottom: `1px solid ${dark.border}`,
                        }}>
                          <span style={{ color: dark.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                          {/* Quoted, because the difference is often only whitespace */}
                          <span style={{ color: '#e88', flex: 'none', fontFamily: 'ui-monospace, monospace' }}>"{r.before}"</span>
                        </div>
                      ))}
                    </div>
                    {msg.proposalError && (
                      <div style={{ fontSize: 12.5, color: '#e88', marginBottom: 8 }}>{msg.proposalError}</div>
                    )}
                    {!st ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button disabled={msg.proposalBusy} onClick={() => decideProposal('apply', msg.proposal.proposal.id, msg.id)} style={{
                          flex: 1, background: '#c9812f', color: '#fff', border: 0, borderRadius: 8,
                          padding: '9px 12px', fontWeight: 650, fontSize: 13,
                          cursor: msg.proposalBusy ? 'default' : 'pointer', opacity: msg.proposalBusy ? 0.6 : 1,
                        }}>{msg.proposalBusy ? 'Working…' : `Approve all ${rows.length}`}</button>
                        <button disabled={msg.proposalBusy} onClick={() => decideProposal('reject', msg.proposal.proposal.id, msg.id)} style={{
                          background: 'transparent', color: dark.textSecondary, border: `1px solid ${dark.border}`,
                          borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                        }}>Discard</button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: st === 'applied' ? '#7fdba0' : dark.textSecondary }}>
                        {st === 'applied' ? `Applied to ${rows.length} — you can roll this back from Settings.` : 'Discarded.'}
                      </div>
                    )}
                  </div>
                )
              })()}
              {msg.proposal && pv0(msg).kind === 'record' && (() => {
                // A record change is one field on one row, so the chip diff
                // used for taxonomy lists would say nothing useful. What
                // matters here is WHICH record — a valid change applied to
                // the wrong job is the failure this card exists to prevent.
                const pv = msg.proposal.preview || {}
                const st = msg.proposalStatus
                return (
                  <div style={{
                    marginTop: 8, background: dark.bgChat,
                    border: `1px solid ${st === 'applied' ? 'rgba(47,125,78,0.6)' : st === 'rejected' ? dark.border : 'rgba(201,129,47,0.7)'}`,
                    borderRadius: 12, padding: 12,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#d9963f', marginBottom: 6 }}>
                      Change to {pv.label}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 650, color: dark.text, marginBottom: 8 }}>{pv.entity}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: st ? 10 : 12 }}>
                      <span style={{
                        fontSize: 12.5, padding: '3px 10px', borderRadius: 8, maxWidth: '100%',
                        background: 'rgba(220,80,80,0.14)', color: '#e88', border: '1px solid rgba(220,80,80,0.4)',
                      }}>{pv.before}</span>
                      <span style={{ color: dark.textMuted, fontSize: 13 }}>→</span>
                      <span style={{
                        fontSize: 12.5, padding: '3px 10px', borderRadius: 8, maxWidth: '100%',
                        background: 'rgba(47,125,78,0.22)', color: '#7fdba0', border: '1px solid rgba(47,125,78,0.5)',
                      }}>{pv.after}</span>
                    </div>
                    {msg.proposalError && (
                      <div style={{ fontSize: 12.5, color: '#e88', marginBottom: 8 }}>{msg.proposalError}</div>
                    )}
                    {!st ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button disabled={msg.proposalBusy} onClick={() => decideProposal('apply', msg.proposal.proposal.id, msg.id)} style={{
                          flex: 1, background: '#c9812f', color: '#fff', border: 0, borderRadius: 8,
                          padding: '9px 12px', fontWeight: 650, fontSize: 13,
                          cursor: msg.proposalBusy ? 'default' : 'pointer', opacity: msg.proposalBusy ? 0.6 : 1,
                        }}>{msg.proposalBusy ? 'Working…' : 'Approve & apply'}</button>
                        <button disabled={msg.proposalBusy} onClick={() => decideProposal('reject', msg.proposal.proposal.id, msg.id)} style={{
                          background: 'transparent', color: dark.textSecondary, border: `1px solid ${dark.border}`,
                          borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                        }}>Discard</button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: st === 'applied' ? '#7fdba0' : dark.textSecondary }}>
                        {st === 'applied' ? 'Applied — you can roll this back from Settings.' : 'Discarded.'}
                      </div>
                    )}
                  </div>
                )
              })()}
              {/* Matched on what this card IS, not on what it is not. The
                  previous "anything that isn't a record" test meant a preview
                  shape this build had never seen fell in here and crashed on
                  the .map below. An unknown kind now renders nothing at all,
                  which is the correct thing to do with a card you cannot draw. */}
              {msg.proposal && Array.isArray(pv0(msg).after) && (() => {
                const pv = msg.proposal.preview || {}
                const afterLc = (pv.after || []).map(x => String(x).toLowerCase())
                const beforeSet = new Set((pv.before || []).map(x => String(x).toLowerCase()))
                const removed = (pv.before || []).filter(x => !afterLc.includes(String(x).toLowerCase()))
                const st = msg.proposalStatus
                return (
                  <div style={{
                    marginTop: 8, background: dark.bgChat,
                    border: `1px solid ${st === 'applied' ? 'rgba(47,125,78,0.6)' : st === 'rejected' ? dark.border : 'rgba(201,129,47,0.7)'}`,
                    borderRadius: 12, padding: 12,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#d9963f', marginBottom: 8 }}>
                      Change to {pv.label}s
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: st ? 10 : 12 }}>
                      {(pv.after || []).map((x, i) => {
                        const added = !beforeSet.has(String(x).toLowerCase())
                        return (
                          <span key={`a${i}`} style={{
                            fontSize: 12.5, padding: '3px 10px', borderRadius: 20,
                            background: added ? 'rgba(47,125,78,0.22)' : 'rgba(255,255,255,0.05)',
                            color: added ? '#7fdba0' : dark.textSecondary,
                            border: `1px solid ${added ? 'rgba(47,125,78,0.5)' : dark.border}`,
                          }}>{added ? '+ ' : ''}{x}</span>
                        )
                      })}
                      {removed.map((x, i) => (
                        <span key={`r${i}`} style={{
                          fontSize: 12.5, padding: '3px 10px', borderRadius: 20,
                          background: 'rgba(220,80,80,0.14)', color: '#e88', textDecoration: 'line-through',
                          border: '1px solid rgba(220,80,80,0.4)',
                        }}>{x}</span>
                      ))}
                    </div>
                    {msg.proposalError && (
                      <div style={{ fontSize: 12.5, color: '#e88', marginBottom: 8 }}>{msg.proposalError}</div>
                    )}
                    {!st ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button disabled={msg.proposalBusy} onClick={() => decideProposal('apply', msg.proposal.proposal.id, msg.id)} style={{
                          flex: 1, background: '#c9812f', color: '#fff', border: 0, borderRadius: 8,
                          padding: '9px 12px', fontWeight: 650, fontSize: 13,
                          cursor: msg.proposalBusy ? 'default' : 'pointer', opacity: msg.proposalBusy ? 0.6 : 1,
                        }}>{msg.proposalBusy ? 'Working…' : 'Approve & apply'}</button>
                        <button disabled={msg.proposalBusy} onClick={() => decideProposal('reject', msg.proposal.proposal.id, msg.id)} style={{
                          background: 'transparent', color: dark.textSecondary, border: `1px solid ${dark.border}`,
                          borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                        }}>Discard</button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: st === 'applied' ? '#7fdba0' : dark.textSecondary }}>
                        {st === 'applied' ? 'Applied — you can roll this back from Settings.' : 'Discarded.'}
                      </div>
                    )}
                  </div>
                )
              })()}
              {msg.role === 'assistant' && msg.content && (
                <div className="arnie-msg-actions" style={{
                  position: 'absolute', top: -10, right: -6,
                  display: 'flex', gap: 4, opacity: 0, transition: 'opacity 0.15s',
                }}>
                  <button onClick={() => handleCopy(msg.content, msg.id)} style={{
                    width: 28, height: 28, borderRadius: 6,
                    border: `1px solid ${dark.border}`, backgroundColor: dark.bgChat,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }} title="Copy">
                    {copiedId === msg.id ? <Check size={12} color={dark.green} /> : <Copy size={12} color={dark.textSecondary} />}
                  </button>
                  <button onClick={() => handleExport(msg.content, msg.id)} style={{
                    width: 28, height: 28, borderRadius: 6,
                    border: `1px solid ${dark.border}`, backgroundColor: dark.bgChat,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }} title="Export as file">
                    {exportedId === msg.id ? <Check size={12} color={dark.green} /> : <Download size={12} color={dark.textSecondary} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ArnieAvatar size={32} />
            <div style={{
              padding: '10px 14px', borderRadius: '16px 16px 16px 4px',
              backgroundColor: dark.bgBubbleArnie, border: `1px solid ${dark.border}`,
              display: 'flex', alignItems: 'center', gap: 8, color: dark.orange, fontSize: 14,
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
          padding: '0 14px 8px', backgroundColor: dark.bg,
          display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0,
        }}>
          {quickActions.slice(0, 4).map((action) => (
            <button
              key={action.label}
              onClick={() => handleSend(action.prompt, { canned: true })}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 16,
                border: `1px solid ${dark.chipBorder}`,
                backgroundColor: dark.chipBg, color: dark.textSecondary,
                fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                flexShrink: 0, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = dark.orange; e.currentTarget.style.color = dark.orange }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = dark.chipBorder; e.currentTarget.style.color = dark.textSecondary }}
            >
              <action.icon size={12} />
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div style={{
        padding: isPanel ? '10px 14px 14px' : (isMobile ? '10px 10px 16px' : '12px 16px 20px'),
        backgroundColor: dark.bg, borderTop: `1px solid ${dark.border}`, flexShrink: 0,
      }}>
        {/* Pending attachments */}
        {(attachments.length > 0 || reading || attachError) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            {attachments.map(att => (
              <div key={att.id} style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
                background: dark.inputBg, border: `1px solid ${dark.borderLight}`,
                borderRadius: 10, maxWidth: 190,
                padding: att.previewUrl ? '4px 22px 4px 4px' : '7px 26px 7px 10px',
              }}>
                {att.previewUrl ? (
                  <img src={att.previewUrl} alt={att.name} style={{ height: 46, width: 46, objectFit: 'cover', borderRadius: 7, display: 'block' }} />
                ) : (
                  <FileText size={14} style={{ color: dark.orange, flexShrink: 0 }} />
                )}
                <span style={{
                  fontSize: 12, color: dark.textSecondary, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100,
                }}>{att.name}</span>
                <button
                  onClick={() => removeAttachment(att.id)}
                  title={`Remove ${att.name}`}
                  style={{
                    position: 'absolute', top: 3, right: 3, width: 18, height: 18,
                    borderRadius: 9, border: 'none', background: 'rgba(0,0,0,0.72)',
                    color: '#fff', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1,
                  }}
                >
                  <X size={11} />
                </button>
              </div>
            ))}
            {reading && (
              <span style={{ fontSize: 12, color: dark.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={13} style={{ animation: 'arnieSpin 1s linear infinite' }} /> Reading…
              </span>
            )}
            {attachError && <span style={{ fontSize: 12, color: dark.red }}>{attachError}</span>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            style={{ display: 'none' }}
            onChange={e => { addFiles(e.target.files); e.target.value = '' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach a photo, screenshot or PDF"
            style={{
              width: 44, height: 44, borderRadius: 12,
              border: `1px solid ${dark.borderLight}`, backgroundColor: dark.inputBg,
              color: dark.textSecondary, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = dark.orange; e.currentTarget.style.color = dark.orange }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = dark.borderLight; e.currentTarget.style.color = dark.textSecondary }}
          >
            <Paperclip size={18} />
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={listening ? 'Listening...' : 'Tap mic, type, or attach a photo...'}
            rows={1}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 12,
              border: `1px solid ${listening ? dark.red : dark.borderLight}`,
              backgroundColor: dark.inputBg, color: dark.text,
              fontSize: 14, resize: 'none', outline: 'none', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 44, maxHeight: 120, transition: 'border-color 0.15s',
            }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onFocus={e => { if (!listening) e.target.style.borderColor = dark.orange }}
            onBlur={e => { if (!listening) e.target.style.borderColor = dark.borderLight }}
          />

          <button
            onClick={listening ? stopListening : startListening}
            style={{
              width: 44, height: 44, borderRadius: 12, border: 'none',
              backgroundColor: listening ? dark.red : dark.green,
              color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
              animation: listening ? 'arniePulse 1.5s ease-in-out infinite' : 'none',
            }}
            title={listening ? 'Stop listening' : 'Speak to Arnie'}
          >
            <Mic size={18} />
          </button>

          <button
            onClick={() => handleSend()}
            disabled={!canSend}
            style={{
              width: 44, height: 44, borderRadius: 12, border: 'none',
              backgroundColor: canSend ? dark.orange : dark.borderLight,
              color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: canSend ? 'pointer' : 'default',
              transition: 'background-color 0.15s', flexShrink: 0,
            }}
          >
            <Send size={18} />
          </button>
        </div>
      </div>

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
        .arnie-markdown th, .arnie-markdown td { padding: 6px 10px; border: 1px solid ${dark.border}; text-align: left; }
        .arnie-markdown th { background-color: ${dark.orangeBg}; font-weight: 600; color: ${dark.orange}; }
        .arnie-markdown code { background-color: rgba(249, 115, 22, 0.1); color: ${dark.orange}; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
        .arnie-markdown pre { background-color: #0d0f12; color: #d4d4d4; padding: 12px; border-radius: 8px; overflow-x: auto; margin: 8px 0; border: 1px solid ${dark.border}; }
        .arnie-markdown pre code { background: none; padding: 0; color: inherit; }
        .arnie-markdown strong { font-weight: 600; color: ${dark.text}; }
        .arnie-markdown em { color: ${dark.orange}; }
        .arnie-markdown blockquote { border-left: 3px solid ${dark.orange}; margin: 8px 0; padding: 4px 12px; color: ${dark.textSecondary}; background: ${dark.orangeBg}; border-radius: 0 6px 6px 0; }
        .arnie-markdown a { color: ${dark.orange}; text-decoration: underline; }
        .arnie-msg-wrapper:hover .arnie-msg-actions { opacity: 1 !important; }
        @keyframes arnieSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes arniePulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); } 50% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } }
      `}</style>
    </div>
  )
}
