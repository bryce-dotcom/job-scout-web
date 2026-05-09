// OnboardingPanel
// =====================================================================
// HR-side widget shown inside the Employee edit modal. Lets Alayda send
// the new-hire's onboarding magic link, then watches the per-step
// checklist flip green as they complete each step on their phone.
// =====================================================================
import { useEffect, useState } from 'react'
import { Send, CheckCircle2, Circle, Copy, RefreshCw, ExternalLink, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'

const STEPS = [
  { key: 'personal',          label: 'Personal info' },
  { key: 'w4',                label: 'Tax info (W-4)' },
  { key: 'direct_deposit',    label: 'Direct deposit' },
  { key: 'i9_section1',       label: 'I-9 Section 1 (employee)' },
  { key: 'signed',            label: 'Signed + finalized' },
]

export default function OnboardingPanel({ employee, theme, sectionHeaderStyle }) {
  const user = useStore(s => s.user)
  const isHR = user?.is_developer || user?.has_hr_access ||
               ['Admin', 'Owner', 'Super Admin'].includes(user?.user_role || '')

  const [packet, setPacket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError]     = useState('')
  const [justSent, setJustSent] = useState(null)

  const refresh = async () => {
    if (!employee?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('employee_onboarding_packets')
      .select('*')
      .eq('employee_id', employee.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setPacket(data || null)
    setLoading(false)
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [employee?.id])

  const sendLink = async () => {
    setSending(true)
    setError('')
    setJustSent(null)
    try {
      const { data: session } = await supabase.auth.getSession()
      const tok = session?.session?.access_token
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-onboarding-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tok || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          employee_id: employee.id,
          channels: ['email', 'sms'],
        }),
      })
      const data = await res.json()
      if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`)
      setJustSent(data)
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (!isHR) return null

  // Compose the links from packet.token if present
  const link = packet?.token
    ? `${window.location.origin}/onboarding/${packet.token}`
    : null

  // Per-step completion booleans
  const completion = {
    personal:       !!packet?.step_personal_completed_at,
    w4:             !!packet?.step_w4_completed_at,
    direct_deposit: !!packet?.step_direct_deposit_completed_at,
    i9_section1:    !!packet?.step_i9_section1_completed_at,
    signed:         !!packet?.step_signed_completed_at,
  }
  const completedCount = Object.values(completion).filter(Boolean).length

  const card = {
    padding: '14px 16px',
    backgroundColor: 'rgba(34,197,94,0.06)',
    border: '1px solid rgba(34,197,94,0.20)',
    borderRadius: 10,
    marginBottom: 16,
  }

  return (
    <>
      <div style={sectionHeaderStyle}>Onboarding</div>

      {loading && <div style={{ color: theme.textMuted, fontSize: 13 }}>Loading…</div>}

      {!loading && !packet && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, marginBottom: 4 }}>
            Send a self-service onboarding link
          </div>
          <div style={{ fontSize: 13, color: theme.textSecondary, marginBottom: 12 }}>
            {employee.name?.split(' ')[0] || 'They'} will get an email + text with a link to fill out W-4, direct deposit, I-9, and sign — right from their phone. Everything they submit lands here automatically.
          </div>
          {!employee.email && !employee.phone && (
            <div style={{ padding: 8, backgroundColor: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, color: '#dc2626', fontSize: 12, marginBottom: 10 }}>
              <AlertCircle size={12} style={{ verticalAlign: 'middle' }} /> Add an email or phone first.
            </div>
          )}
          {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <button onClick={sendLink} disabled={sending || (!employee.email && !employee.phone)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', minHeight: 40,
            backgroundColor: theme.accent, color: '#fff',
            border: 'none', borderRadius: 8,
            fontSize: 13, fontWeight: 600,
            cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.5 : 1,
          }}>
            <Send size={14} /> {sending ? 'Sending…' : `Send onboarding link to ${employee.name?.split(' ')[0] || employee.email || employee.phone}`}
          </button>
        </div>
      )}

      {!loading && packet && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>
                Onboarding {packet.status === 'completed' ? '✓ complete' : `(${completedCount} / ${STEPS.length} steps)`}
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                {packet.sent_at ? `Sent ${new Date(packet.sent_at).toLocaleString()}` : 'Not sent yet'}
                {packet.opened_at && ` · opened ${new Date(packet.opened_at).toLocaleDateString()}`}
                {packet.completed_at && ` · finished ${new Date(packet.completed_at).toLocaleString()}`}
              </div>
            </div>
            <button onClick={refresh} title="Refresh status" style={{
              padding: 6, background: 'transparent', border: `1px solid ${theme.border}`,
              borderRadius: 6, cursor: 'pointer', color: theme.textMuted,
            }}><RefreshCw size={13} /></button>
          </div>

          {/* Checklist */}
          <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
            {STEPS.map(s => {
              const done = completion[s.key]
              return (
                <div key={s.key} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px',
                  backgroundColor: done ? 'rgba(34,197,94,0.10)' : '#fff',
                  border: `1px solid ${done ? 'rgba(34,197,94,0.30)' : theme.border}`,
                  borderRadius: 8, fontSize: 13,
                  color: done ? '#16a34a' : theme.textSecondary,
                }}>
                  {done ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                  {s.label}
                </div>
              )
            })}
          </div>

          {/* Magic link controls */}
          {packet.status !== 'completed' && link && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: theme.textMuted, padding: 8, background: '#fff', border: `1px solid ${theme.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{link}</span>
                <button onClick={() => navigator.clipboard?.writeText(link)} title="Copy link" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: theme.accent, padding: 4 }}>
                  <Copy size={13} />
                </button>
                <a href={link} target="_blank" rel="noopener noreferrer" title="Open" style={{ color: theme.accent, padding: 4 }}>
                  <ExternalLink size={13} />
                </a>
              </div>
              <button onClick={sendLink} disabled={sending} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', minHeight: 36,
                background: 'transparent', color: theme.accent,
                border: `1px solid ${theme.accent}`, borderRadius: 8,
                fontSize: 12, fontWeight: 600,
                cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.5 : 1,
              }}>
                <Send size={12} /> {sending ? 'Resending…' : 'Resend link'}
              </button>
              {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>{error}</div>}
            </>
          )}

          {packet.status === 'completed' && packet.i9_section2_due_date && !packet.i9_section2_completed_at && (
            <div style={{
              marginTop: 10, padding: 10,
              backgroundColor: 'rgba(234,179,8,0.10)',
              border: '1px solid rgba(234,179,8,0.30)',
              borderRadius: 8, fontSize: 12, color: '#a16207',
            }}>
              <strong>I-9 Section 2 due {new Date(packet.i9_section2_due_date).toLocaleDateString()}.</strong> Federal law requires you to physically inspect their ID by this date and record it on the I-9 — this can't be done electronically.
            </div>
          )}
        </div>
      )}
    </>
  )
}
