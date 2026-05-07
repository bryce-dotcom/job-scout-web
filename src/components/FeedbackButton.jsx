import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { MessageSquare, X, Bug, Lightbulb, HelpCircle, Star, Send, CheckCircle, Inbox, Mail, Clock } from 'lucide-react'

const FEEDBACK_TYPES = [
  { value: 'bug', label: 'Bug Report', icon: Bug, color: '#ef4444' },
  { value: 'feature', label: 'Feature Request', icon: Lightbulb, color: '#eab308' },
  { value: 'question', label: 'Question', icon: HelpCircle, color: '#f97316' },
  { value: 'feedback', label: 'General Feedback', icon: Star, color: '#22c55e' }
]

const STATUS_COLORS = {
  new:         { bg: 'rgba(59,130,246,0.15)',  fg: '#60a5fa', label: 'New' },
  in_progress: { bg: 'rgba(234,179,8,0.15)',   fg: '#facc15', label: 'In Progress' },
  resolved:    { bg: 'rgba(34,197,94,0.15)',   fg: '#4ade80', label: 'Resolved' },
  wont_fix:    { bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8', label: 'Won’t Fix' },
}

// Per-user "I've seen replies up to this timestamp" — used to compute the
// unread badge on the floating button. Stored in localStorage so it doesn't
// flip back on every page reload.
const LAST_SEEN_KEY = (email) => `jobscout_feedback_lastseen_${email || 'anon'}`

export default function FeedbackButton() {
  const user = useStore((state) => state.user)
  const activeCompany = useStore((state) => state.activeCompany)

  const [isOpen, setIsOpen] = useState(false)
  const [tab, setTab] = useState('send')                 // 'send' | 'mine'
  const [type, setType] = useState('feedback')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // My Feedback view state
  const [myFeedback, setMyFeedback] = useState([])
  const [loadingMine, setLoadingMine] = useState(false)
  const [expanded, setExpanded] = useState({})           // { [id]: true } for which cards are expanded

  // Unread reply badge state
  const [unreadCount, setUnreadCount] = useState(0)

  const resetForm = () => {
    setType('feedback')
    setSubject('')
    setMessage('')
    setSubmitted(false)
  }

  const closeModal = () => {
    setIsOpen(false)
    resetForm()
  }

  // ── Unread-reply count poll ────────────────────────────────────────
  // Counts feedback rows authored by this user where replied_at is newer
  // than the user's saved "last seen" timestamp. Cheap query, runs every
  // 60s while the page is open + once on mount.
  const refreshUnread = useCallback(async () => {
    if (!user?.email) return
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY(user.email)) || '1970-01-01T00:00:00Z'
    const { count } = await supabase
      .from('feedback')
      .select('*', { count: 'exact', head: true })
      .eq('user_email', user.email)
      .not('reply_message', 'is', null)
      .gt('replied_at', lastSeen)
    setUnreadCount(count || 0)
  }, [user?.email])

  useEffect(() => {
    refreshUnread()
    const id = setInterval(refreshUnread, 60_000)
    return () => clearInterval(id)
  }, [refreshUnread])

  // ── Load user's feedback when the "Mine" tab opens ─────────────────
  const loadMyFeedback = useCallback(async () => {
    if (!user?.email) return
    setLoadingMine(true)
    const { data } = await supabase
      .from('feedback')
      .select('id, feedback_type, subject, message, page_url, status, created_at, reply_message, replied_at')
      .eq('user_email', user.email)
      .order('created_at', { ascending: false })
      .limit(50)
    setMyFeedback(data || [])
    setLoadingMine(false)
    // Mark everything as seen now — bumps lastSeen so the unread badge clears
    localStorage.setItem(LAST_SEEN_KEY(user.email), new Date().toISOString())
    setUnreadCount(0)
  }, [user?.email])

  useEffect(() => {
    if (isOpen && tab === 'mine') loadMyFeedback()
  }, [isOpen, tab, loadMyFeedback])

  // Auto-expand any item that has an unreplied-then-now-replied state
  useEffect(() => {
    const next = {}
    for (const f of myFeedback) {
      if (f.reply_message && f.replied_at) next[f.id] = true
    }
    setExpanded(next)
  }, [myFeedback])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!message.trim()) return

    setSubmitting(true)

    try {
      const { error } = await supabase.from('feedback').insert({
        user_email: user?.email || null,
        company_id: activeCompany?.id,
        feedback_type: type,
        subject: subject.trim() || null,
        message: message.trim(),
        page_url: window.location.pathname,
        status: 'new'
      })

      if (error) throw error

      setSubmitted(true)
      setTimeout(() => {
        closeModal()
      }, 2000)
    } catch (err) {
      alert('Error submitting feedback: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return null

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => { setIsOpen(true); setTab(unreadCount > 0 ? 'mine' : 'send') }}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: '#f97316',
          border: 'none',
          boxShadow: '0 4px 12px rgba(249, 115, 22, 0.4)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          transition: 'transform 0.2s, box-shadow 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)'
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(249, 115, 22, 0.5)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(249, 115, 22, 0.4)'
        }}
      >
        <MessageSquare size={24} color="#fff" />
        {/* Unread reply badge — pulses to draw attention. Tracy etc. need
            this to know admins replied to their tickets; before, replies
            only lived in the admin dashboard and users never saw them. */}
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            minWidth: '22px',
            height: '22px',
            padding: '0 6px',
            borderRadius: '11px',
            backgroundColor: '#dc2626',
            color: '#fff',
            fontSize: '12px',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #fff',
            boxShadow: '0 2px 6px rgba(220,38,38,0.5)',
          }}>{unreadCount}</span>
        )}
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
            padding: '20px'
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div
            style={{
              backgroundColor: '#1a1a1a',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #2a2a2a',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>Feedback</div>
                <div style={{ color: '#888', fontSize: '13px' }}>Send feedback or read replies from the team</div>
              </div>
              <button
                onClick={closeModal}
                style={{
                  padding: '8px',
                  backgroundColor: '#2a2a2a',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: '#888'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #2a2a2a', backgroundColor: '#1a1a1a' }}>
              {[
                { id: 'send', label: 'Send Feedback', icon: Send },
                { id: 'mine', label: `My Feedback${unreadCount > 0 ? ` (${unreadCount})` : ''}`, icon: Inbox },
              ].map(t => {
                const Icon = t.icon
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: active ? '#2a2a2a' : 'transparent',
                      border: 'none',
                      borderBottom: active ? '2px solid #f97316' : '2px solid transparent',
                      color: active ? '#fff' : '#888',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <Icon size={14} /> {t.label}
                  </button>
                )
              })}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
            {tab === 'send' ? (
              submitted ? (
                <div style={{ padding: '60px 24px', textAlign: 'center' }}>
                  <div style={{
                    width: '64px', height: '64px', backgroundColor: 'rgba(34,197,94,0.2)',
                    borderRadius: '50%', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', margin: '0 auto 20px'
                  }}>
                    <CheckCircle size={32} color="#22c55e" />
                  </div>
                  <div style={{ color: '#fff', fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
                    Thanks for your feedback!
                  </div>
                  <div style={{ color: '#888', fontSize: '14px' }}>
                    We&rsquo;ll reply in the &ldquo;My Feedback&rdquo; tab — check back here for responses.
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
                  {/* Type Selection */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ color: '#888', fontSize: '12px', marginBottom: '8px', display: 'block' }}>
                      What type of feedback?
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                      {FEEDBACK_TYPES.map(t => {
                        const Icon = t.icon
                        const isSelected = type === t.value
                        return (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => setType(t.value)}
                            style={{
                              padding: '12px',
                              backgroundColor: isSelected ? `${t.color}20` : '#2a2a2a',
                              border: `1px solid ${isSelected ? t.color : '#3a3a3a'}`,
                              borderRadius: '10px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              color: isSelected ? t.color : '#888',
                              transition: 'all 0.15s'
                            }}
                          >
                            <Icon size={18} />
                            <span style={{ fontSize: '13px', fontWeight: '500' }}>{t.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Subject */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ color: '#888', fontSize: '12px', marginBottom: '6px', display: 'block' }}>
                      Subject (optional)
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Brief summary..."
                      style={{
                        width: '100%', padding: '12px', backgroundColor: '#2a2a2a',
                        border: '1px solid #3a3a3a', borderRadius: '10px', color: '#fff', fontSize: '14px'
                      }}
                    />
                  </div>

                  {/* Message */}
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ color: '#888', fontSize: '12px', marginBottom: '6px', display: 'block' }}>
                      Message *
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us what's on your mind..."
                      rows={4}
                      required
                      style={{
                        width: '100%', padding: '12px', backgroundColor: '#2a2a2a',
                        border: '1px solid #3a3a3a', borderRadius: '10px', color: '#fff',
                        fontSize: '14px', resize: 'vertical'
                      }}
                    />
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={submitting || !message.trim()}
                    style={{
                      width: '100%', padding: '14px', backgroundColor: '#f97316',
                      border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px',
                      fontWeight: '600',
                      cursor: submitting || !message.trim() ? 'not-allowed' : 'pointer',
                      opacity: submitting || !message.trim() ? 0.6 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                    }}
                  >
                    {submitting ? 'Sending...' : <><Send size={18} /> Send Feedback</>}
                  </button>
                </form>
              )
            ) : (
              // ── My Feedback tab ──
              <div style={{ padding: '20px 24px' }}>
                {loadingMine && (
                  <div style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '40px' }}>
                    Loading…
                  </div>
                )}
                {!loadingMine && myFeedback.length === 0 && (
                  <div style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '40px' }}>
                    You haven&rsquo;t submitted any feedback yet.
                  </div>
                )}
                {!loadingMine && myFeedback.map(f => {
                  const status = STATUS_COLORS[f.status] || STATUS_COLORS.new
                  const isExpanded = !!expanded[f.id]
                  const hasReply = !!f.reply_message
                  return (
                    <div key={f.id} style={{
                      marginBottom: '12px',
                      padding: '14px',
                      backgroundColor: '#222',
                      border: '1px solid #2f2f2f',
                      borderRadius: '10px',
                    }}>
                      {/* Header row: subject + status + date */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: '#fff', fontSize: '14px', fontWeight: '600', marginBottom: '2px' }}>
                            {f.subject || `(${(f.feedback_type || 'feedback').replace('_', ' ')})`}
                          </div>
                          <div style={{ color: '#666', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <Clock size={11} /> {new Date(f.created_at).toLocaleDateString()}
                            <span>·</span>
                            <span style={{ textTransform: 'capitalize' }}>{f.feedback_type}</span>
                            {f.page_url && <><span>·</span><span>{f.page_url}</span></>}
                          </div>
                        </div>
                        <span style={{
                          padding: '3px 8px',
                          backgroundColor: status.bg,
                          color: status.fg,
                          fontSize: '11px',
                          fontWeight: '600',
                          borderRadius: '12px',
                          whiteSpace: 'nowrap',
                        }}>{status.label}</span>
                      </div>

                      {/* Original message */}
                      <div style={{ color: '#bbb', fontSize: '13px', lineHeight: '1.45', marginTop: '6px' }}>
                        {f.message}
                      </div>

                      {/* Reply (if any) */}
                      {hasReply && (
                        <div style={{ marginTop: '12px' }}>
                          <button
                            onClick={() => setExpanded(prev => ({ ...prev, [f.id]: !isExpanded }))}
                            style={{
                              padding: '6px 10px',
                              backgroundColor: 'rgba(249,115,22,0.12)',
                              border: '1px solid rgba(249,115,22,0.3)',
                              borderRadius: '8px',
                              color: '#fdba74',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <Mail size={12} /> {isExpanded ? 'Hide reply' : 'Reply from team'} · {f.replied_at ? new Date(f.replied_at).toLocaleDateString() : ''}
                          </button>
                          {isExpanded && (
                            <div style={{
                              marginTop: '8px',
                              padding: '12px 14px',
                              backgroundColor: '#1a1a1a',
                              border: '1px solid #2a2a2a',
                              borderRadius: '8px',
                              color: '#e5e5e5',
                              fontSize: '13px',
                              lineHeight: '1.55',
                              whiteSpace: 'pre-wrap',
                            }}>
                              {f.reply_message}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
