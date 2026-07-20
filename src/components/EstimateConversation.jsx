// EstimateConversation
// =====================================================================
// One-stop comms thread for an estimate. Sits at the top of the
// estimate page and shows:
//   - the actual email that went out to the customer (system entries
//     written by sendEstimate())
//   - any replies the customer typed back through their portal link
//   - any responses the rep types here, plus internal notes
//
// Replaces the "I have no idea what was sent or whether the customer
// said anything" black hole that Doug + Noah called out.
// =====================================================================
import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send, Lock, Mail, ChevronDown, ChevronRight, RefreshCw, User, Building } from 'lucide-react'
import { supabase } from '../lib/supabase'

const REFRESH_MS = 30_000

export default function EstimateConversation({
  quoteId,
  companyId,
  currentEmployee,
  customerInfo,
  theme,
  isMobile,
}) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [internal, setInternal] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  // Default collapsed on mobile — this panel is ~500px tall and sat between the
  // estimate header and the line items, adding to the scroll-to-work problem.
  const [collapsed, setCollapsed] = useState(() => !!isMobile)
  const pollRef = useRef(null)

  const fetchMessages = async () => {
    if (!quoteId) return
    const { data, error: fetchErr } = await supabase
      .from('estimate_messages')
      .select('*')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: true })
      .limit(200)
    if (fetchErr) {
      setError(fetchErr.message)
    } else {
      setMessages(data || [])
      setError('')
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchMessages()
    pollRef.current = setInterval(fetchMessages, REFRESH_MS)
    return () => clearInterval(pollRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId])

  const send = async () => {
    if (!draft.trim() || !companyId || !quoteId) return
    setSending(true)
    setError('')
    try {
      const repName = currentEmployee?.name || currentEmployee?.first_name || 'JobScout'
      const repEmail = currentEmployee?.email || null
      const { data, error: insErr } = await supabase
        .from('estimate_messages')
        .insert({
          quote_id: quoteId,
          company_id: companyId,
          from_role: 'rep',
          from_name: repName,
          from_email: repEmail,
          channel: internal ? 'note' : 'portal',
          body: draft.trim(),
          is_internal: internal,
        })
        .select('*')
        .single()
      if (insErr) throw insErr
      setMessages((m) => [...m, data])
      setDraft('')
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setSending(false)
    }
  }

  const customerLabel = customerInfo?.business_name || customerInfo?.name || customerInfo?.customer_name || 'Customer'
  const unreadFromCustomer = messages.filter(
    (m) => m.from_role === 'customer' && !m.read_at,
  ).length

  // Outer card
  const card = {
    backgroundColor: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  }

  return (
    <div style={card}>
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          borderBottom: collapsed ? 'none' : `1px solid ${theme.border}`,
        }}
      >
        <MessageSquare size={18} color={theme.accent} />
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>
            Conversation
            {unreadFromCustomer > 0 && (
              <span style={{
                marginLeft: 8, padding: '2px 8px', borderRadius: 999,
                backgroundColor: '#ef4444', color: '#fff',
                fontSize: 11, fontWeight: 700,
              }}>{unreadFromCustomer} new from {customerLabel}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
            {messages.length === 0
              ? 'Nothing here yet — send the estimate and the email body will appear here.'
              : `${messages.length} message${messages.length === 1 ? '' : 's'} between you and ${customerLabel}`}
          </div>
        </div>
        {collapsed ? <ChevronRight size={18} color={theme.textMuted} /> : <ChevronDown size={18} color={theme.textMuted} />}
      </button>

      {!collapsed && (
        <div style={{ padding: '8px 0 0' }}>
          {loading && messages.length === 0 ? (
            <div style={{ padding: '20px 16px', color: theme.textMuted, fontSize: 13 }}>Loading…</div>
          ) : (
            <div style={{ maxHeight: isMobile ? 320 : 420, overflowY: 'auto', padding: '0 12px 12px' }}>
              {messages.length === 0 && (
                <div style={{
                  padding: '14px 16px', borderRadius: 10,
                  backgroundColor: theme.bg, color: theme.textMuted, fontSize: 13,
                }}>
                  No messages yet. The first email you send will be archived here so you always know exactly what the customer received.
                </div>
              )}

              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  msg={m}
                  theme={theme}
                  expanded={expandedIds.has(m.id)}
                  onToggleExpand={() => {
                    setExpandedIds((s) => {
                      const ns = new Set(s)
                      if (ns.has(m.id)) ns.delete(m.id); else ns.add(m.id)
                      return ns
                    })
                  }}
                />
              ))}
            </div>
          )}

          {/* Reply box */}
          <div style={{ borderTop: `1px solid ${theme.border}`, padding: 12, backgroundColor: theme.bg }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: theme.textSecondary, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={internal}
                  onChange={(e) => setInternal(e.target.checked)}
                />
                <Lock size={12} />
                Internal note (only your team sees this)
              </label>
              <button
                onClick={fetchMessages}
                title="Refresh"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: 4 }}
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={internal
                ? 'Internal note — only visible to your team'
                : `Reply to ${customerLabel} — they will see this on their portal link`
              }
              rows={isMobile ? 3 : 2}
              style={{
                width: '100%',
                padding: 10,
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                fontSize: isMobile ? 16 : 14,
                color: theme.text,
                WebkitTextFillColor: theme.text,
                backgroundColor: theme.bgCard,
                boxSizing: 'border-box',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
            {error && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#dc2626' }}>{error}</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                onClick={send}
                disabled={!draft.trim() || sending}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8,
                  backgroundColor: internal ? '#6b7280' : theme.accent,
                  color: '#fff', border: 'none',
                  cursor: !draft.trim() || sending ? 'not-allowed' : 'pointer',
                  opacity: !draft.trim() || sending ? 0.6 : 1,
                  fontSize: 13, fontWeight: 600,
                  minHeight: 40,
                }}
              >
                <Send size={14} />
                {sending ? 'Sending…' : internal ? 'Save note' : 'Reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg, theme, expanded, onToggleExpand }) {
  const isCustomer = msg.from_role === 'customer'
  const isSystem = msg.from_role === 'system'
  const isInternal = !!msg.is_internal

  // Color dictionary
  const tone = isInternal
    ? { bg: 'rgba(107,114,128,0.10)', border: '#6b7280', label: '#6b7280' }
    : isCustomer
      ? { bg: 'rgba(59,130,246,0.08)', border: '#3b82f6', label: '#1d4ed8' }
      : isSystem
        ? { bg: theme.bg, border: theme.border, label: theme.textMuted }
        : { bg: 'rgba(90,99,73,0.10)', border: theme.accent, label: theme.accent }

  const Icon = isCustomer ? User : isSystem ? Mail : isInternal ? Lock : Building
  const align = isCustomer ? 'flex-start' : 'flex-end'

  // For system "estimate sent" rows, the body can be the full email HTML.
  // Truncate by default, expand on click.
  const looksLikeEmailDump = isSystem && (msg.channel === 'email' || (msg.body || '').length > 200)
  const previewBody = looksLikeEmailDump && !expanded
    ? (msg.body || '').slice(0, 180) + '…'
    : msg.body

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align, padding: '8px 4px' }}>
      <div style={{
        maxWidth: '92%',
        backgroundColor: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 10,
        padding: '10px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Icon size={12} color={tone.label} />
          <span style={{ fontSize: 11, fontWeight: 700, color: tone.label, textTransform: 'uppercase', letterSpacing: 0.04 }}>
            {isSystem ? 'System' : isCustomer ? msg.from_name || 'Customer' : msg.from_name || 'Rep'}
            {isInternal && ' · internal'}
            {msg.channel === 'email' && ' · email'}
            {msg.channel === 'portal' && !isSystem && ' · portal'}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: theme.textMuted }}>
            {formatStamp(msg.created_at)}
          </span>
        </div>
        {msg.subject && (
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, marginBottom: 4 }}>{msg.subject}</div>
        )}
        <div style={{ fontSize: 13, color: theme.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {previewBody}
        </div>
        {msg.metadata?.portal_url && (
          <div style={{ marginTop: 6, fontSize: 12 }}>
            <a href={msg.metadata.portal_url} target="_blank" rel="noopener noreferrer" style={{ color: theme.accent }}>
              Open the link the customer received →
            </a>
          </div>
        )}
        {looksLikeEmailDump && (
          <button
            onClick={onToggleExpand}
            style={{ marginTop: 6, background: 'transparent', border: 'none', color: tone.label, cursor: 'pointer', fontSize: 12, padding: 0 }}
          >
            {expanded ? 'Show less' : 'Show full email'}
          </button>
        )}
      </div>
    </div>
  )
}

function formatStamp(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    return sameDay
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return iso }
}
