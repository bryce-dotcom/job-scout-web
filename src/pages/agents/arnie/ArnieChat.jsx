import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useTheme } from '../../../components/Layout'
import { useStore } from '../../../lib/store'
import { supabase } from '../../../lib/supabase'
import { sendMessageStream, createSession, saveMessage, updateSessionTitle, loadSessionMessages, rememberLastSession } from './arnieEngine'
import { getUserRole, isClockedIn } from './arnieTools'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Copy, Check, Loader2, Sparkles, Calendar, Users, Package, FileText, Briefcase, BarChart3, Truck, Mic, Volume2, VolumeX, ChevronDown, Download, Paperclip, X, Wrench, Sun, Bot, ClipboardList } from 'lucide-react'
import { readAttachment, attachmentNote, describeAttachments, ACCEPT_ATTR, MAX_ATTACHMENTS } from '../../../lib/chatAttachments'
import { DougieButton, composerTone } from '../../../components/ai/AiComposerTools'
import { speak, stopSpeaking, isAvailable as elevenLabsAvailable, getVoices, loadArnieVoices, rememberVoice, resolveVoice, unlockAudio, audioIsUnlocked } from './arnieVoice'
import { arnieTextNumber, ARNIE_EMAIL } from '../../../lib/arnieReach'
import AssistantAvatar, { useAssistant } from '../../../components/AssistantAvatar'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { localDateStr } from '../../../lib/localDate'
import ArnieOfferCard from '../../../components/ArnieOfferCard'
import ArniePresence from './ArniePresence'
import { startsTakeoff, endsTakeoff, joinSegments, takeoffHint } from '../../../lib/takeoffMode'
import { isStopCommand, bargeInAllowed } from '../../../lib/bargeIn'
import { holdAppUpdate } from '../../../lib/appUpdate'
import { looksLikeEcho } from '../../../lib/micEcho'

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
  { label: 'My day', icon: Sun, prompt: 'What does my day look like? Just the next thing first.' },
  { label: "What's next?", icon: Briefcase, prompt: 'What should I do next on this job?' },
  { label: 'Fix something', icon: Wrench, prompt: 'Something here is not working right and I need help working out why. Ask me what it is doing.' },
  { label: 'Parts', icon: Package, prompt: 'What am I installing on this job? List the line items and quantities.' },
  { label: 'Customer', icon: Users, prompt: 'Who is the customer on this job and what is the site address and phone number?' },
  { label: 'My sections', icon: Check, prompt: 'Which sections are assigned to me, and which are still open?' },
]

const QUICK_ACTIONS = {
  user: [
    { label: 'My day', icon: Sun, prompt: 'Give me my daily brief — what needs my attention today?' },
    { label: 'My Jobs', icon: Briefcase, prompt: 'Show me a summary of my assigned jobs' },
    { label: 'Products', icon: Package, prompt: 'What products and services do we offer?' },
    { label: 'Fix something', icon: Wrench, prompt: 'I need help troubleshooting something. Ask me what it is doing.' },
    { label: 'Team', icon: Users, prompt: 'Who is on the team?' },
  ],
  admin: [
    { label: 'Morning brief', icon: Sun, prompt: 'Morning brief: what needs attention today — jobs with no crew, open shifts, stale quotes, overdue invoices?' },
    { label: 'Job Overview', icon: Briefcase, prompt: 'Give me an overview of all jobs' },
    { label: 'Lead Pipeline', icon: Sparkles, prompt: 'How does our sales pipeline look?' },
    { label: 'Team Status', icon: Users, prompt: 'Show me the team roster' },
    { label: 'Inventory', icon: Package, prompt: 'What does our inventory look like?' },
    { label: 'Fleet', icon: Truck, prompt: 'Give me a fleet status report' },
  ],
  super_admin: [
    { label: 'Morning brief', icon: Sun, prompt: 'Morning brief: what needs attention today — jobs with no crew, open shifts, stale quotes, overdue invoices?' },
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

/**
 * The face in the chat, which belongs to whoever this person chose.
 *
 * Arnie has had a real photo since August, so a persona that changed the name
 * and the voice and kept his face would be plainly wrong. The picture travels
 * with the rest of the identity.
 *
 * A persona whose artwork does not exist yet falls back to the agent's icon
 * rather than showing a broken image — so a persona can ship before its
 * picture does, and dropping the file into public/ later is all it takes.
 */
// The chat keeps its own orange ring; the face itself comes from the one
// shared avatar, so a new persona does not need finding in four files.
function ArnieAvatar({ size = 36, persona }) {
  return (
    <AssistantAvatar
      size={size}
      persona={persona}
      border={`2.5px solid ${dark.orange}`}
      glow={`0 0 8px ${dark.orangeGlow}`}
      background={dark.bgChat}
    />
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

// kickoff: a first message sent on the person's behalf when the chat mounts
// — the Onboarding page uses it to start "set up my company" without the
// new owner having to know what to type. Sent once, never again on re-render.
export default function ArnieChat({ isPanel = false, onClose, sessionId: externalSessionId, kickoff = null, onApplied = null, autoMic = false, status = null, openIdentity = null }) {
  const { theme } = useTheme()
  const isMobile = useIsMobile()
  const company = useStore(s => s.company)
  // Select the SETTINGS, derive the number here.
  //
  // This was `useStore(s => arnieTextNumber(s.settings))`, and
  // arnieTextNumber builds a fresh { raw, pretty } on every call. Zustand
  // compares a selector's result with Object.is, so a new object every time
  // means the component looked changed on every store notification — render,
  // re-select, render — until React gave up with "maximum update depth
  // exceeded" and the whole page died.
  //
  // It only bit where a Twilio number is configured: with none the selector
  // returns a stable null, which is why HHH crashed on every page that can
  // open Arnie while the demo company never did, and why this survived
  // review and a day of use.
  const settings = useStore(s => s.settings)
  const textNumber = useMemo(() => arnieTextNumber(settings), [settings])

  // Name, face and greeting all come from the one assistant hook, so a
  // fourth copy of this logic cannot drift from the other three. Read here
  // rather than from the route's outlet context, because this component is
  // also mounted as the floating corner panel, where there is no outlet —
  // it would work on the workspace page and be undefined everywhere else.
  const assistant = useAssistant()
  const personaRow = assistant.personaRow

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
  // Whether a tap has actually granted sound yet. On a phone it often has
  // not, and the old behaviour was plain silence: nothing to see, nothing to
  // do about it.
  const [soundReady, setSoundReady] = useState(() => audioIsUnlocked())
  const noteSound = useCallback(() => { setTimeout(() => setSoundReady(audioIsUnlocked()), 400) }, [])
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [voices, setVoices] = useState(() => getVoices())
  const [selectedVoice, setSelectedVoice] = useState(() => getVoices()[0]?.id || 'browser_male_1')
  const [showVoiceSelect, setShowVoiceSelect] = useState(false)
  // Arnie's own ElevenLabs voice (when this company may use it) arrives from the server.
  useEffect(() => {
    let live = true
    loadArnieVoices().then(({ voices: list, defaultId }) => { if (!live) return; setVoices(list); setSelectedVoice(defaultId) })
    return () => { live = false }
  }, [])

  // THE VOICE ON THE ACCOUNT WINS.
  //
  // This chat never read it. It took whatever loadArnieVoices worked out,
  // which starts from localStorage — so on any device where you had not
  // personally picked a voice in THAT browser, it fell through to Arnie's own
  // ElevenLabs voice. Which is a man. Somebody who had chosen Jenny, set her
  // voice, and opened the app on a second device was answered by Arnie in
  // Jenny's name: "Jenny now speaks as a man."
  //
  // The persona row is the account-level choice and the thing the Settings
  // screen promises follows you to your phone, so it is applied here as soon
  // as it arrives — unless you have picked something in this session, which
  // is a deliberate act and outranks it.
  const pickedHere = useRef(false)
  useEffect(() => {
    const saved = personaRow?.voice_id
    if (!saved || pickedHere.current) return
    const real = resolveVoice(saved)
    if (real?.id) setSelectedVoice(real.id)
  }, [personaRow?.voice_id, voices])

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const recognitionRef = useRef(null)
  const listeningRef = useRef(false)
  const silenceTimerRef = useRef(null)
  const transcriptRef = useRef('')
  const safetyTimerRef = useRef(null)
  // Takeoff mode — listen, say nothing, never send on a pause. The ref is
  // what the recognition callbacks read (they are built once and would close
  // over a stale state value); the state is only what the screen renders.
  const [takeoff, setTakeoff] = useState(false)
  const takeoffRef = useRef(false)
  // Speech collected across recognition restarts. event.results starts over
  // on every restart, and in this mode the silences that cause restarts are
  // the whole point.
  const takeoffTextRef = useRef('')

  // NO SELF-UPDATE IN THE MIDDLE OF SOMETHING.
  //
  // The app reloads itself onto a new build when someone comes back after two
  // minutes away — and a rep on a takeoff puts the phone in a pocket for far
  // longer than that between rooms. A reload then would throw away the whole
  // count. Same for an answer still arriving or being spoken, the mic open,
  // or a half-typed message. While any of those is true the update waits and
  // shows its banner instead; the moment they are all done it can go.
  const busyForUpdate = takeoff || loading || speaking || listening || !!input.trim()
  useEffect(() => (busyForUpdate ? holdAppUpdate('Arnie chat in use') : undefined), [busyForUpdate])

  // Mic state machine: 'idle' | 'listening' | 'paused' | 'bargein'
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
  // ── Cards waiting for this person, from the database ────────────────
  // Not just the ones drawn this turn: everything undecided, so a card made
  // yesterday, on another device, or before a reload is still on screen.
  const [pendingCards, setPendingCards] = useState([])
  const loadPending = useCallback(async () => {
    const me = useStore.getState().user
    const co = useStore.getState().companyId
    if (!me?.email || !co) return
    // created_by is the person's EMAIL — the badge compared it to their id
    // and so never counted a single card.
    const { data } = await supabase.from('arnie_proposals')
      .select('id,summary,target,created_at')
      .eq('company_id', co).eq('created_by', me.email).eq('status', 'pending')
      .order('id', { ascending: false }).limit(10)
    setPendingCards((data || []).map((r) => ({ ...r, busy: false, error: null })))
  }, [])
  useEffect(() => { loadPending() }, [loadPending])
  // A card already drawn in this conversation keeps its own buttons in place;
  // listing it again at the top would be the same card twice.
  const shownInline = new Set(messages.map((m) => m.proposal?.proposal?.id).filter(Boolean))
  const waitingCards = pendingCards.filter((c) => !shownInline.has(c.id))

  const decidePending = async (id, decision) => {
    setPendingCards((prev) => prev.map((c) => (c.id === id ? { ...c, busy: true, error: null } : c)))
    const res = await cfgInvoke({ action: decision, proposal_id: id })
    if (!res || res.error) {
      setPendingCards((prev) => prev.map((c) => (c.id === id ? { ...c, busy: false, error: res?.error || "That didn't go through." } : c)))
      return
    }
    setPendingCards((prev) => prev.filter((c) => c.id !== id))
    if (decision === 'apply') { try { await useStore.getState().fetchSettings?.() } catch { /* best-effort */ } }
  }

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

  // The receipt behind an expense card: the last photo the person sent
  // before the card. It never went through the model's tool call or the
  // proposal row — it is uploaded HERE, on approve, to the same place the
  // Expenses page puts receipts, and the URL is handed to arnie-config.
  const receiptForCard = async (msgId) => {
    const list = messagesRef.current
    const at = list.findIndex(m => m.id === msgId)
    for (let i = (at < 0 ? list.length : at) - 1; i >= 0; i--) {
      const m = list[i]
      if (m.role !== 'user') continue
      const img = (m.attachments || []).find(a => a.kind === 'image' && a.data && a.mediaType)
      if (!img) continue
      try {
        const bytes = Uint8Array.from(atob(img.data), c => c.charCodeAt(0))
        const ext = (img.mediaType.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
        const safe = String(img.name || 'receipt').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '')
        const path = `expenses/receipts/arnie_${Date.now()}_${safe}.${ext}`
        const { error } = await supabase.storage.from('project-documents').upload(path, new Blob([bytes], { type: img.mediaType }), { contentType: img.mediaType })
        if (error) return null
        const { data } = supabase.storage.from('project-documents').getPublicUrl(path)
        return { receipt_url: data.publicUrl, receipt_storage_path: path }
      } catch { return null }
    }
    return null
  }

  const kickoffSent = useRef(false)
  useEffect(() => {
    if (!kickoff || kickoffSent.current) return
    kickoffSent.current = true
    let fired = false
    const t = setTimeout(() => {
      fired = true; handleSend(kickoff, { canned: true })
      // "Speak it": the button that opened this was the person's gesture, so
      // the mic may start now. If the browser has no speech support the usual
      // alert would interrupt a reply; skip quietly and they can type.
      if (autoMic && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
        setTimeout(() => { try { startListening() } catch { /* they can tap the mic */ } }, 1200)
      }
    }, 400)
    // StrictMode mounts twice in dev: if the timer is cancelled before it
    // fires, the kickoff has not been sent — let the second mount send it.
    return () => { clearTimeout(t); if (!fired) kickoffSent.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kickoff])

  const decideProposal = async (decision, proposalId, msgId) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, proposalBusy: true } : m))
    const card = messagesRef.current.find(m => m.id === msgId)?.proposal
    const attachment = decision === 'apply' && card?.preview?.label === 'expense' ? await receiptForCard(msgId) : null
    const res = await cfgInvoke({ action: decision, proposal_id: proposalId, ...(attachment ? { attachment } : {}) })
    const failed = !res || res.error
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m
      if (failed) return { ...m, proposalBusy: false, proposalError: res?.error || 'That didn\'t go through.' }
      const status = decision === 'apply' ? 'applied' : 'rejected'
      return {
        ...m, proposalBusy: false, proposalStatus: status, proposalError: null,
        // A card can say what "done" means for it. A follow-up that just went
        // to a customer must not be told "you can roll it back anytime".
        content: status === 'applied'
          ? (m.proposal?.preview?.done || "Done — it's live. I logged the change, and you can roll it back anytime from Arnie's Settings tab.")
          : 'No sweat — tossed it. Nothing changed.',
      }
    }))
    // A successful apply changed a settings taxonomy list in the DB — refresh
    // the store so the new business unit / lead source / service type shows up
    // app-wide (dropdowns etc.) without a manual reload.
    if (decision === 'apply' && !failed) {
      try { await useStore.getState().fetchSettings?.() } catch { /* refresh is best-effort */ }
      // The created id rides in the apply response, not the card.
      try { onApplied?.(card, res) } catch { /* the page's own follow-up is its business */ }
      // A created lead should be on the Leads page the moment they look.
      if (res.created_id) {
        try { await useStore.getState().fetchLeads?.() } catch { /* best-effort */ }
      }
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

  // 'bargein' is the third state: she is talking, and the mic is still on —
  // but it acts only on a spoken stop (lib/bargeIn). Every way into "she is
  // about to talk" goes through micWhileTalking() so the two cannot diverge.
  const micWhileTalking = () => (bargeInAllowed() ? 'bargein' : 'paused')

  const pauseMic = useCallback(() => {
    if (micStateRef.current !== 'listening') return // only pause if actively listening
    micStateRef.current = micWhileTalking()
    // Stopped either way: in 'paused' it stays stopped; in 'bargein' onend
    // starts a FRESH run, so nothing the person already said is still sitting
    // in the results to be mistaken for a command.
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
  }, [])

  const resumeMic = useCallback(() => {
    if (micStateRef.current === 'bargein') {
      // Back to ordinary listening. Restarted so the run starts empty — what
      // it heard while she talked was mostly her.
      micStateRef.current = 'listening'
      transcriptRef.current = ''
      try { recognitionRef.current?.stop() } catch {}
      return
    }
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

  // ── talking while he thinks ──────────────────────────────────────────
  //
  // He used to write the WHOLE answer and only then start speaking it, which
  // is the single worst thing you can do to a person holding a phone in a
  // truck: a long silence, then a wall of speech. "When you talk to Arnie he
  // is slow — he types out his response then speaks it."
  //
  // Nothing got faster here. He starts talking at the end of his first
  // sentence instead of his last, which is the whole of the difference
  // between feeling slow and feeling present.
  const speechQueue = useRef([])
  const spokenUpTo = useRef(0)
  // The last thing said OUT LOUD, to compare the microphone against. Only
  // what was actually spoken can come back as an echo.
  const lastSpokenRef = useRef('')
  // "Stop" means the rest of THIS answer, including sentences still arriving.
  // Clearing the queue alone let the next streamed sentence start a moment
  // later, as if the button had not been pressed.
  const hushedRef = useRef(false)
  // Has the answer finished arriving? Until it has, an empty queue is only a
  // pause between sentences, not the end of speaking.
  const streamDoneRef = useRef(true)

  /** Play the next sentence; the mic comes back only when the queue empties. */
  const drainSpeech = useCallback(() => {
    if (speakingLockRef.current) return
    const next = speechQueue.current.shift()
    if (!next) {
      // THE STOP BUTTON FOLLOWS THE WHOLE ANSWER, NOT ONE SENTENCE.
      // Each sentence is its own clip, fetched while the last one plays, and
      // `speaking` used to drop to false at the end of every one of them —
      // so Stop vanished between sentences and was gone by the time anyone
      // reached for it. Found live on Bryce's account, 2026-10-14: Stop
      // disappeared six seconds into an eight-sentence answer.
      // Same for the mic: an empty queue mid-answer is a pause between
      // sentences, and handing the mic back then let it hear her NEXT
      // sentence and send it as the person's question.
      if (streamDoneRef.current) {
        setSpeaking(false)
        resumeMic()
      }
      return
    }
    speakingLockRef.current = true
    // Keep what was actually spoken, to compare the microphone against.
    lastSpokenRef.current = `${lastSpokenRef.current} ${next}`.slice(-4000)
    speak(next, selectedVoice,
      () => setSpeaking(true),
      () => {
        speakingLockRef.current = false
        drainSpeech()
      },
    )
  }, [selectedVoice, resumeMic])

  /**
   * Queue whatever COMPLETE sentences have arrived since last time.
   *
   * Only complete ones: half a sentence read aloud and then continued a
   * second later sounds broken, and worse, it mispronounces — "Dr" and "$1.5"
   * both end in something that looks like a full stop until the next word
   * arrives. `final` flushes whatever is left when the stream ends.
   */
  const speakAsItArrives = useCallback((full, final = false) => {
    if (!voiceOn || hushedRef.current) return
    if (final) {
      streamDoneRef.current = true
      // Nothing left to say and nothing playing: the answer is over.
      if (!speakingLockRef.current && !speechQueue.current.length && !String(full || '').slice(spokenUpTo.current).trim()) setSpeaking(false)
    }
    const fresh = String(full || '').slice(spokenUpTo.current)
    if (!fresh) return
    let cut = 0
    if (final) {
      cut = fresh.length
    } else {
      for (const m of fresh.matchAll(/[.!?…]["'’”)\]]*(?:\s|$)/g)) cut = m.index + m[0].length
    }
    if (cut <= 0) return
    const chunk = fresh.slice(0, cut).trim()
    spokenUpTo.current += cut
    if (!chunk) return
    speechQueue.current.push(chunk)
    // Stop shows from the moment there is something to say — including the
    // second or so while the first clip downloads, which is exactly when
    // someone who did not want the answer read aloud reaches for it.
    setSpeaking(true)
    drainSpeech()
  }, [voiceOn, drainSpeech])

  const resetSpeech = useCallback(() => {
    speechQueue.current = []
    spokenUpTo.current = 0
    lastSpokenRef.current = ''
    hushedRef.current = false
    streamDoneRef.current = false
  }, [])

  const handleStopSpeaking = () => {
    // Everything queued, not just what is playing — otherwise "stop" stops
    // one sentence and the next starts a moment later. And everything still
    // to ARRIVE in this answer, for the same reason.
    hushedRef.current = true
    speechQueue.current = []
    stopSpeaking()
    speakingLockRef.current = false
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

      // ── She is talking: listen for "stop" and nothing else ──────────
      // Checked before anything else, and nothing heard here is kept: while
      // she speaks, most of what the mic picks up is her own voice.
      if (micStateRef.current === 'bargein') {
        const latest = event.results[event.results.length - 1]?.[0]?.transcript || ''
        if (isStopCommand(latest, assistant.name) || isStopCommand(full, assistant.name)) {
          console.log('[Arnie Mic] heard "stop" — stopping')
          handleStopSpeaking()
        }
        return
      }
      transcriptRef.current = full

      // ── Takeoff mode ────────────────────────────────────────────────
      // Everything said since it started, including the runs that ended at
      // earlier silences.
      if (takeoffRef.current) {
        const sofar = joinSegments(takeoffTextRef.current, full)
        setInput(sofar)
        // No silence timer at all. A pause means they are counting.
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)

        const done = endsTakeoff(full, assistant.name)
        if (done.hit) {
          const text = joinSegments(takeoffTextRef.current, done.rest).trim()
          takeoffRef.current = false
          takeoffTextRef.current = ''
          setTakeoff(false)
          micStateRef.current = micWhileTalking()
          try { recognition.stop() } catch {}
          setInput('')
          transcriptRef.current = ''
          if (text) handleSend(text, { spoken: true })
        }
        return
      }

      // Asked for it out loud rather than reaching for the button — likely,
      // since both hands are busy.
      const start = startsTakeoff(full, assistant.name)
      if (start.hit) {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        takeoffRef.current = true
        takeoffTextRef.current = start.rest || ''
        setTakeoff(true)
        setInput(start.rest || '')
        transcriptRef.current = ''
        // Nothing is said back — being told "takeoff mode is on" out loud is
        // the first thing this mode exists to prevent.
        stopSpeaking()
        return
      }

      setInput(full)

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        const text = transcriptRef.current.trim()
        // Must be listening AND not already paused — recognition.stop() triggers a final
        // onresult which creates a new timer. Without the micState check, handleSend fires twice.
        if (text && listeningRef.current && micStateRef.current === 'listening') {
          // Did we just hear HER, through the speakers? A loud speaker leaks
          // into a microphone whatever the timing does, so this is checked on
          // what was heard rather than on when we listened.
          if (looksLikeEcho(text, lastSpokenRef.current)) {
            console.warn('[Arnie] Ignored the mic hearing her own answer back')
            setInput('')
            transcriptRef.current = ''
            return
          }
          micStateRef.current = micWhileTalking()
          try { recognition.stop() } catch {}
          setInput('')
          transcriptRef.current = ''
          // Off the microphone, so the answer opens by saying back what was
          // heard — they cannot see it to check it themselves.
          handleSend(text, { spoken: true })
        }
      }, 3000)
    }

    recognition.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.error('[Arnie Mic] Speech error:', e.error)
      }
    }

    recognition.onend = () => {
      // A takeoff lives through these restarts — the browser ends recognition
      // on every long silence, and this is the only moment the run's text can
      // be banked before `event.results` starts over empty.
      if (takeoffRef.current) {
        takeoffTextRef.current = joinSegments(takeoffTextRef.current, transcriptRef.current)
        transcriptRef.current = ''
      }
      // Only auto-restart if mic state is 'listening' (natural silence end)
      // Do NOT restart if 'paused' (we intentionally stopped) or 'idle' (user toggled off)
      // 'bargein' restarts too: that is the mic staying on while she talks.
      if ((micStateRef.current === 'listening' || micStateRef.current === 'bargein') && listeningRef.current) {
        try { recognition.start() } catch {}
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const stopListening = () => {
    listeningRef.current = false
    micStateRef.current = 'idle'
    // Turning the mic off ends a takeoff too. Leaving it armed would mean the
    // next thing said, possibly hours later, is filed as part of a building.
    takeoffRef.current = false
    takeoffTextRef.current = ''
    setTakeoff(false)
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
  const handleSend = useCallback(async (text, { canned = false, spoken = false } = {}) => {
    const msg = (text || input).trim()
    const files = canned ? [] : attachments
    if ((!msg && !files.length) || loading || reading || sendingRef.current) return
    sendingRef.current = true

    unlockAudio()
    pauseMic()
    // A fresh answer speaks from its own beginning, not from where the last
    // one got to.
    resetSpeech()
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
    // The mic is brought back if something went wrong and it was left paused.
    // It must NEVER come back while she is still talking, which is what this
    // used to do: her answers run well past thirty seconds, the mic opened
    // mid-sentence, the speakers fed her own voice back in, and the silence
    // timer sent it as the next question. Bryce's transcript has three of his
    // "messages" that are her previous replies word for word.
    //
    // So it waits again instead of firing, and only gives up once nothing is
    // being spoken and nothing is queued.
    const armSafety = () => {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
      safetyTimerRef.current = setTimeout(() => {
        if (speakingLockRef.current || speechQueue.current.length) { armSafety(); return }
        if (micStateRef.current === 'paused') {
          console.warn('[Arnie] Safety timer: force-resuming mic')
          resumeMic()
        }
      }, 30000)
    }
    armSafety()

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
            ? {
              ...m,
              content: partialText,
              ...(meta?.proposal ? { proposal: meta.proposal } : {}),
              // An offer he made on their own computer. Only the id is kept;
              // the card reads the row so it can never show a question that
              // was already answered on the Computer tab.
              ...(meta?.offerId ? { offerId: meta.offerId } : {}),
            }
            : m
        ))
        // He starts talking at the end of his first sentence, not his last.
        speakAsItArrives(partialText)
        // Who this person's assistant is, sent WITH the message. The engine
        // used to read this from a module cache that only the /agents/arnie
        // route ever filled, so from the corner launcher Jenny introduced
        // herself as Arnie.
      }, files, { spoken, personaRow: assistant.personaRow })

      await saveMessage(sid, 'assistant', fullResponse)
      // A card drawn this turn, or one decided elsewhere, shows or goes now.
      loadPending()

      // Whatever is left after the last full stop — usually nothing, because
      // he has been talking the whole way down.
      speakAsItArrives(fullResponse, true)

      if (messagesRef.current.length <= 1) {
        await updateSessionTitle(sid, title)
      }
    } catch (err) {
      console.error('Arnie error:', err)
      const errText = err.message?.includes('API key') || err.message?.includes('ANTHROPIC')
        // Plain words: this line is said by whichever assistant they chose,
        // and Arnie's "Ye gawds… kid" in Jenny's mouth is the wrong-persona
        // bug all over again.
        ? 'The AI key is not set up yet. Ask your admin to check the Supabase secrets.'
        : `Something went wrong: ${err.message || 'unknown error'}. Try that again.`
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: errText } : m
      ))
      speakText(errText)
    } finally {
      setLoading(false)
      sendingRef.current = false
      // However the turn ended, it has finished arriving — so an empty queue
      // now really does mean done, and Stop can go.
      streamDoneRef.current = true
      // Nothing playing and nothing queued — voice off, an empty answer, or
      // all of it already said — so nothing else will hand the mic back.
      if (!speakingLockRef.current && !speechQueue.current.length) {
        setSpeaking(false)
        resumeMic()
      }
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current)
    }
    // assistant.personaRow is in here because it arrives AFTER the first
    // render — without it this closes over null and the first message of
    // every session goes out as the wrong assistant.
  }, [input, attachments, reading, loading, sessionId, speakText, pauseMic, resumeMic, resetSpeech, speakAsItArrives, assistant.personaRow])

  // Finish a takeoff by hand — the banner, or the toggle while it is on.
  // Sends everything collected, exactly as saying "that's it" would.
  const finishTakeoff = useCallback(() => {
    const text = joinSegments(takeoffTextRef.current, transcriptRef.current).trim()
    takeoffRef.current = false
    takeoffTextRef.current = ''
    setTakeoff(false)
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    micStateRef.current = micWhileTalking()
    try { recognitionRef.current?.stop() } catch { /* already stopped */ }
    setInput('')
    transcriptRef.current = ''
    if (text) handleSend(text, { spoken: true })
  }, [handleSend])

  // Start one by hand. Also starts the mic if it is off, because somebody
  // reaching for this has not necessarily tapped the mic first.
  const beginTakeoff = useCallback(() => {
    stopSpeaking()
    takeoffTextRef.current = ''
    transcriptRef.current = ''
    setInput('')
    takeoffRef.current = true
    setTakeoff(true)
    if (!listeningRef.current) startListening()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


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
    a.download = `arnie-report-${localDateStr(new Date())}.txt`
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
            // A real finger. On a phone this may be the only tap before the
            // first answer arrives, and iOS grants sound to an ELEMENT a
            // finger has touched — so this is the chance to take it.
            // STOP FIRST, ALWAYS. This button was the only way to shut him
            // up, and yesterday I put the sound-blocked check in front of it:
            // on any machine where the unlock had not resolved, tapping it
            // returned early and did nothing at all. Bryce: "you cant
            // interrupt arnie he just keeps speaking". Interrupting is the
            // one thing that must never depend on anything else working.
            if (speaking || speechQueue.current.length) handleStopSpeaking()
            unlockAudio()
            noteSound()
            // Only AFTER stopping: a tap while sound is blocked is a request
            // FOR sound, not a request to turn the voice off.
            if (voiceOn && !audioIsUnlocked()) return
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
          {voiceOn && !soundReady ? 'Tap for sound' : voiceOn ? 'Voice ON' : 'Voice OFF'}
        </button>

        {/* A STOP, while he is talking, that says Stop.
            There was no such control: the only way to cut him off was a
            button labelled "Voice ON", which reads as a setting rather than
            an interrupt — and turns the voice off for good rather than
            stopping this answer. Nobody should have to switch a feature off
            to get a word in. */}
        {speaking && (
          <button
            onClick={handleStopSpeaking}
            aria-label="Stop talking"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 16, marginLeft: 6,
              border: `1px solid ${dark.red}`, backgroundColor: 'rgba(239,68,68,0.12)',
              color: dark.red, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 2, background: dark.red, display: 'inline-block' }} />
            Stop
          </button>
        )}

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
                Voice: {voices.find(v => v.id === selectedVoice)?.name || 'Andrew'}
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
                {voices.map(v => (
                  <div
                    key={v.id}
                    onClick={() => { pickedHere.current = true; setSelectedVoice(v.id); rememberVoice(v.id); setShowVoiceSelect(false) }}
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
        {/* WAITING FOR YOU — every undecided card, always visible.
            A card used to exist only in the turn that drew it: reload the
            page, open the app on your phone, or come back tomorrow and it was
            gone from the screen while still sitting in the database. Alayda
            had one waiting and was told for an afternoon that cards were
            broken. They were never broken; they were invisible. */}
        {waitingCards.length > 0 && (
          <div style={{
            border: `1px solid ${dark.orange}`, borderRadius: 12, padding: '11px 12px',
            background: 'rgba(249,115,22,0.07)',
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: dark.orange, marginBottom: 8 }}>
              Waiting for you · {waitingCards.length}
            </div>
            {waitingCards.map((c) => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                padding: '8px 0', borderTop: `1px solid ${dark.border}`,
              }}>
                <div style={{ flex: '1 1 180px', minWidth: 0, fontSize: 13.5, color: dark.text, lineHeight: 1.4 }}>
                  {c.summary || 'A change'}
                  {c.error && <div style={{ fontSize: 12, color: dark.red, marginTop: 3 }}>{c.error}</div>}
                </div>
                <button
                  onClick={() => decidePending(c.id, 'apply')}
                  disabled={c.busy}
                  style={{ border: 0, borderRadius: 9, padding: '8px 14px', minHeight: 40, cursor: 'pointer', background: dark.green, color: '#fff', fontWeight: 700, fontSize: 13 }}
                >
                  {c.busy ? '…' : 'Approve'}
                </button>
                <button
                  onClick={() => decidePending(c.id, 'reject')}
                  disabled={c.busy}
                  style={{ border: `1px solid ${dark.border}`, borderRadius: 9, padding: '8px 12px', minHeight: 40, cursor: 'pointer', background: 'transparent', color: dark.textMuted, fontWeight: 600, fontSize: 13 }}
                >
                  Discard
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Welcome state */}
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: isPanel ? '28px 12px' : '6px 2px 0' }}>
            {/* A crew badge, not a chatbot welcome. A centred avatar, a name,
                an italic greeting in quotes and a row of pill chips is the
                template every assistant ships with; this is a person already
                at work, and where he is working is the first thing it says.
                The corner panel keeps the small version \u2014 there is no room
                for a presence panel in a 380px drawer. */}
            {!isPanel && (
              <ArniePresence
                assistant={assistant}
                personaKey={personaRow?.persona}
                status={status}
                companyName={company?.name}
                onIdentity={openIdentity}
              />
            )}
            {isPanel && (
              <>
                <ArnieAvatar size={64} persona={personaRow?.persona} />
                <h2 style={{ color: dark.text, fontSize: 18, fontWeight: 700, margin: '12px 0 2px' }}>{assistant.name}</h2>
                <p style={{ color: dark.orange, fontSize: 13.5, margin: '0 0 14px' }}>
                  &ldquo;{assistant.persona.greeting}&rdquo;
                </p>
              </>
            )}
            {/* Where else he answers. People never found this on their own,
                and as a bordered grey box under the presence panel it was a
                second card competing with the first. It reads as what it is
                now: a quiet line of ways to reach him, no box at all. */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '4px 14px', alignItems: 'baseline',
              margin: '0 2px 18px', fontSize: 12, color: dark.textMuted, textAlign: 'left',
            }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: dark.textMuted }}>
                Also reach {assistant.name}
              </span>
              {textNumber && (
                <a href={`sms:${textNumber.raw}`} style={{ color: dark.textSecondary, textDecoration: 'none' }}>
                  {textNumber.pretty}
                </a>
              )}
              <a href={`mailto:${ARNIE_EMAIL}`} style={{ color: dark.textSecondary, textDecoration: 'none' }}>
                {ARNIE_EMAIL}
              </a>
              <span>or say &ldquo;every weekday at 7am, text me which rocks are off track&rdquo; and it becomes a routine</span>
            </div>
            {/* Left, with the rest of it. Centred chips under a left-aligned
                panel was the last thing still floating. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' }}>
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
            {msg.role === 'assistant' && <ArnieAvatar size={32} persona={personaRow?.persona} />}
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
                      {rows.length} {(pv.noun || 'product') + (rows.length === 1 ? '' : 's')} — {pv.label}
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
              {msg.proposal && pv0(msg).kind === 'create' && (() => {
                // A create has no before/after — there is nothing yet. What the
                // person is approving is a list of fields, so show every one
                // of them, and say plainly if this is being made despite a
                // near-match the user waved off.
                const pv = msg.proposal.preview || {}
                const st = msg.proposalStatus
                return (
                  <div style={{
                    marginTop: 8, background: dark.bgChat,
                    border: `1px solid ${st === 'applied' ? 'rgba(47,125,78,0.6)' : st === 'rejected' ? dark.border : 'rgba(201,129,47,0.7)'}`,
                    borderRadius: 12, padding: 12,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#d9963f', marginBottom: 6 }}>
                      New {pv.label}
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 650, color: dark.text, marginBottom: 8 }}>{pv.entity}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', columnGap: 12, rowGap: 4, marginBottom: st ? 10 : 12 }}>
                      {(pv.fields || []).map((f) => (
                        <div key={f.label} style={{ display: 'contents' }}>
                          <span style={{ fontSize: 12, color: dark.textMuted }}>{f.label}</span>
                          <span style={{ fontSize: 12.5, color: dark.text, overflowWrap: 'anywhere' }}>{f.value}</span>
                        </div>
                      ))}
                    </div>
                    {pv.despite && (
                      <div style={{ fontSize: 12, color: '#d9963f', marginBottom: 8 }}>{pv.despite}</div>
                    )}
                    {msg.proposalError && (
                      <div style={{ fontSize: 12.5, color: '#e88', marginBottom: 8 }}>{msg.proposalError}</div>
                    )}
                    {!st ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button disabled={msg.proposalBusy} onClick={() => decideProposal('apply', msg.proposal.proposal.id, msg.id)} style={{
                          flex: 1, background: '#c9812f', color: '#fff', border: 0, borderRadius: 8,
                          padding: '9px 12px', fontWeight: 650, fontSize: 13,
                          cursor: msg.proposalBusy ? 'default' : 'pointer', opacity: msg.proposalBusy ? 0.6 : 1,
                        }}>{msg.proposalBusy ? 'Working…' : `${pv.verb || 'Create'} ${pv.label}`}</button>
                        <button disabled={msg.proposalBusy} onClick={() => decideProposal('reject', msg.proposal.proposal.id, msg.id)} style={{
                          background: 'transparent', color: dark.textSecondary, border: `1px solid ${dark.border}`,
                          borderRadius: 8, padding: '9px 14px', fontSize: 13, cursor: 'pointer',
                        }}>Discard</button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: st === 'applied' ? '#7fdba0' : dark.textSecondary }}>
                        {st === 'applied' ? (pv.done || 'Created — you can undo this from Settings while nothing is attached to it.') : 'Discarded.'}
                      </div>
                    )}
                  </div>
                )
              })()}
              {/* He asked for something on this person's own computer and
                  was stopped — for want of a permission, or at a control he
                  will never press himself. The same card the Computer tab
                  draws, because two of them would be two answers to one
                  question. */}
              {msg.offerId && <ArnieOfferCard offerId={msg.offerId} />}
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
            <ArnieAvatar size={32} persona={personaRow?.persona} />
            <div style={{
              padding: '10px 14px', borderRadius: '16px 16px 16px 4px',
              backgroundColor: dark.bgBubbleArnie, border: `1px solid ${dark.border}`,
              display: 'flex', alignItems: 'center', gap: 8, color: dark.orange, fontSize: 14,
            }}>
              <Loader2 size={16} style={{ animation: 'arnieSpin 1s linear infinite' }} />
              {assistant.name || 'Arnie'} is working on it…
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

        {/* On air. The whole bar is the "done" control, because the one thing
            somebody in takeoff mode has is a phone in one hand and no
            attention to spare for finding a small button. */}
        {takeoff && (
          <button
            onClick={finishTakeoff}
            style={{
              width: '100%', textAlign: 'left', marginBottom: 8, cursor: 'pointer',
              background: 'rgba(249,115,22,0.12)', border: `1px solid ${dark.orange}`,
              borderRadius: 10, padding: '9px 12px', color: dark.text,
              font: 'inherit', fontSize: 12.5, lineHeight: 1.45, minHeight: 44,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: 4, background: dark.orange, flexShrink: 0,
              animation: 'arniePulse 1.5s ease-in-out infinite',
            }} />
            <span>{takeoffHint(assistant.name)}</span>
          </button>
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
          <DougieButton tone={composerTone({ bg: dark.inputBg, border: dark.borderLight, text: dark.text, muted: dark.textSecondary, accent: dark.orange, popBg: dark.bgChat })} onAttach={() => fileInputRef.current?.click()} agentName="Arnie" />

          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={takeoff ? 'Listening — take your time…' : listening ? 'Listening...' : 'Tap mic, type, or attach a photo...'}
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
            title={listening ? 'Stop listening' : `Speak to ${assistant.name || 'Arnie'}`}
          >
            <Mic size={18} />
          </button>

          {/* Takeoff mode. Next to the mic because it is a way of listening,
              not a separate feature, and it can also be asked for out loud. */}
          <button
            onClick={takeoff ? finishTakeoff : beginTakeoff}
            title={takeoff
              ? 'Finish the takeoff and send it'
              : 'Takeoff mode — listen without answering, however long the pauses'}
            style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              border: `1px solid ${takeoff ? dark.orange : dark.borderLight}`,
              backgroundColor: takeoff ? dark.orange : dark.inputBg,
              color: takeoff ? '#ffffff' : dark.textSecondary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {takeoff ? <Check size={18} /> : <ClipboardList size={18} />}
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
