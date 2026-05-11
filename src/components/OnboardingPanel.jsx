// OnboardingPanel
// =====================================================================
// HR-side widget shown inside the Employee edit modal. Lets Alayda send
// the new-hire's onboarding magic link, then watches the per-step
// checklist flip green as they complete each step on their phone.
// =====================================================================
import { useEffect, useState } from 'react'
import { Send, CheckCircle2, Circle, Copy, RefreshCw, ExternalLink, AlertCircle, FileText, Download, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'

const W2_STEPS = [
  { key: 'personal',          label: 'Personal info' },
  { key: 'w4',                label: 'Tax info (W-4)' },
  { key: 'direct_deposit',    label: 'Direct deposit' },
  { key: 'i9_section1',       label: 'I-9 Section 1 (employee)' },
  { key: 'signed',            label: 'Signed + finalized' },
]
const C1099_STEPS = [
  { key: 'personal',          label: 'Personal info' },
  { key: 'w9',                label: 'W-9 (1099 info)' },
  { key: 'direct_deposit',    label: 'Direct deposit' },
  { key: 'signed',            label: 'Signed + finalized' },
]

export default function OnboardingPanel({ employee, theme, sectionHeaderStyle }) {
  const user = useStore(s => s.user)
  const isHR = user?.is_developer || user?.has_hr_access ||
               ['Admin', 'Owner', 'Super Admin'].includes(user?.user_role || '')

  const [packet, setPacket] = useState(null)
  const [signedDocs, setSignedDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError]     = useState('')
  const [justSent, setJustSent] = useState(null)
  const [showI9Section2, setShowI9Section2] = useState(false)

  const refresh = async () => {
    if (!employee?.id) return
    setLoading(true)
    const { data: pkt } = await supabase
      .from('employee_onboarding_packets')
      .select('*')
      .eq('employee_id', employee.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setPacket(pkt || null)

    if (pkt?.id) {
      const { data: docs } = await supabase
        .from('signed_documents')
        .select('*')
        .eq('onboarding_packet_id', pkt.id)
        .eq('status', 'signed')
        .order('created_at', { ascending: false })
      setSignedDocs(docs || [])
    } else {
      setSignedDocs([])
    }
    setLoading(false)
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [employee?.id])

  // Generate signed PDF download URL on the fly. project-documents
  // bucket is private, so we use a short-lived signed URL.
  const downloadDoc = async (doc) => {
    if (!doc.pdf_storage_path) {
      alert('PDF is still being rendered — try again in a few seconds.')
      return
    }
    const { data, error: urlErr } = await supabase.storage
      .from('project-documents')
      .createSignedUrl(doc.pdf_storage_path, 300)
    if (urlErr) { alert('Could not generate download link: ' + urlErr.message); return }
    window.open(data.signedUrl, '_blank')
  }

  // Trigger a re-render (rare — only when PDFs are missing after finalize)
  const rerenderPdfs = async () => {
    if (!packet?.id) return
    const { data: session } = await supabase.auth.getSession()
    const tok = session?.session?.access_token
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/render-onboarding-pdfs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tok || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ packet_id: packet.id }),
    })
    setTimeout(refresh, 1500)
  }

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
      // Real failures only — info notes (e.g. "SMS not configured")
      // render in the green banner on the packet card, not as an error.
      if (data.delivery_errors?.length > 0) {
        setError(`Some channels failed: ${data.delivery_errors.join(' · ')}`)
      } else if (data.sent_via?.length === 0) {
        setError('Link created but nothing was delivered. Check email/SMS settings.')
      }
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

  // Branch checklist + I-9 banner on classification.
  const is1099 = employee?.tax_classification === '1099'
  const STEPS = is1099 ? C1099_STEPS : W2_STEPS

  // Per-step completion booleans (we track all columns either way; the
  // checklist just shows the relevant slice for this classification).
  const completionAll = {
    personal:       !!packet?.step_personal_completed_at,
    w4:             !!packet?.step_w4_completed_at,
    w9:             !!packet?.step_w9_completed_at,
    direct_deposit: !!packet?.step_direct_deposit_completed_at,
    i9_section1:    !!packet?.step_i9_section1_completed_at,
    signed:         !!packet?.step_signed_completed_at,
  }
  const completion = Object.fromEntries(STEPS.map(s => [s.key, completionAll[s.key]]))
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
          {justSent && (
            <div style={{
              padding: 8, marginBottom: 10,
              backgroundColor: justSent.sent_via?.length > 0 ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
              border: `1px solid ${justSent.sent_via?.length > 0 ? 'rgba(34,197,94,0.30)' : 'rgba(239,68,68,0.30)'}`,
              borderRadius: 6, fontSize: 12,
              color: justSent.sent_via?.length > 0 ? '#16a34a' : '#dc2626',
            }}>
              Just sent via: {justSent.sent_via?.join(', ') || '(none)'} · check inbox + spam folder
              {justSent.delivery_errors?.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 11, color: '#dc2626' }}>
                  Failures: {justSent.delivery_errors.join(' · ')}
                </div>
              )}
              {justSent.delivery_info?.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 11, color: theme.textMuted, fontStyle: 'italic' }}>
                  {justSent.delivery_info.join(' · ')}
                </div>
              )}
            </div>
          )}
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

          {/* I-9 §2 only matters for W-2 employees (federal employment
              eligibility verification). 1099 contractors don't get an I-9. */}
          {!is1099 && packet.status === 'completed' && packet.i9_section2_due_date && !packet.i9_section2_completed_at && (
            <div style={{
              marginTop: 10, padding: 12,
              backgroundColor: 'rgba(234,179,8,0.10)',
              border: '1px solid rgba(234,179,8,0.30)',
              borderRadius: 8, fontSize: 12, color: '#a16207',
            }}>
              <div style={{ marginBottom: 8 }}>
                <strong>I-9 Section 2 due {new Date(packet.i9_section2_due_date).toLocaleDateString()}.</strong> Federal law requires you to physically inspect {employee.name?.split(' ')[0] || 'their'}'s ID by this date.
              </div>
              <button onClick={() => setShowI9Section2(true)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', minHeight: 36,
                backgroundColor: '#a16207', color: '#fff',
                border: 'none', borderRadius: 6,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}><ShieldCheck size={13} /> Record I-9 Section 2 (after physical inspection)</button>
            </div>
          )}

          {packet.status === 'completed' && packet.i9_section2_completed_at && (
            <div style={{
              marginTop: 10, padding: 8,
              backgroundColor: 'rgba(34,197,94,0.10)',
              border: '1px solid rgba(34,197,94,0.30)',
              borderRadius: 6, fontSize: 12, color: '#16a34a',
            }}>
              <CheckCircle2 size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              I-9 Section 2 recorded {new Date(packet.i9_section2_completed_at).toLocaleDateString()}.
            </div>
          )}
        </div>
      )}

      {/* Signed PDFs — appears once at least one signed_documents row exists. */}
      {signedDocs.length > 0 && (
        <div style={{
          padding: 14, marginBottom: 16,
          backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>
              Signed documents on file ({signedDocs.length})
            </div>
            {signedDocs.some(d => !d.pdf_storage_path) && (
              <button onClick={rerenderPdfs} title="Re-render missing PDFs" style={{
                padding: '4px 8px', fontSize: 11, color: theme.accent,
                background: 'transparent', border: `1px solid ${theme.accent}`,
                borderRadius: 6, cursor: 'pointer',
              }}>Re-render PDFs</button>
            )}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {signedDocs.map(d => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px',
                backgroundColor: '#fff',
                border: `1px solid ${theme.border}`, borderRadius: 8,
                fontSize: 13, color: theme.text,
              }}>
                <FileText size={14} color={theme.textMuted} />
                <div style={{ flex: 1 }}>
                  <div>{d.document_label || d.document_kind}</div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>
                    Signed {new Date(d.signed_at).toLocaleString()}
                    {d.signature_typed_name && ` by ${d.signature_typed_name}`}
                  </div>
                </div>
                {d.pdf_storage_path ? (
                  <button onClick={() => downloadDoc(d)} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '6px 10px', minHeight: 30,
                    backgroundColor: theme.accentBg, color: theme.accent,
                    border: 'none', borderRadius: 6,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>
                    <Download size={12} /> View PDF
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: theme.textMuted, fontStyle: 'italic' }}>
                    PDF rendering…
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showI9Section2 && (
        <I9Section2Modal
          packet={packet}
          employee={employee}
          theme={theme}
          onClose={() => setShowI9Section2(false)}
          onDone={async () => { setShowI9Section2(false); await refresh() }}
        />
      )}
    </>
  )
}

// =====================================================================
// I-9 Section 2 — entered by HR after PHYSICALLY inspecting the
// employee's identity + work-authorization documents. The employee can't
// fill this out themselves; federal law requires the employer's
// inspection. Captures which List A doc, OR List B + List C combo, was
// shown, with issuer + document number + expiration.
// =====================================================================
function I9Section2Modal({ packet, employee, theme, onClose, onDone }) {
  const user = useStore(s => s.user)
  const [v, setV] = useState({
    list_choice: 'A',           // 'A' (one doc) or 'B+C' (two docs)
    a_title: '',
    a_issuer: '',
    a_number: '',
    a_expires: '',
    b_title: '',
    b_issuer: '',
    b_number: '',
    b_expires: '',
    c_title: '',
    c_issuer: '',
    c_number: '',
    c_expires: '',
    additional_info: '',
    inspector_name: user?.name || '',
    attest_inspected: false,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')
  const set = (k) => (e) => setV(p => ({ ...p, [k]: e.target.value }))

  const valid = v.attest_inspected && v.inspector_name && (
    (v.list_choice === 'A' && v.a_title && v.a_issuer && v.a_number) ||
    (v.list_choice === 'B+C' && v.b_title && v.b_issuer && v.b_number && v.c_title && v.c_issuer && v.c_number)
  )

  const submit = async () => {
    setErr(''); setSaving(true)
    try {
      // Persist as a signed_documents row (so it goes through the same
      // PDF render + audit flow as the other forms) AND update the
      // packet's i9_section2_completed_at + completed_by.
      const ip = null    // server-side fn would have it; client-side we don't
      const ua = navigator.userAgent
      const consent = `I, ${v.inspector_name}, attest under penalty of perjury that I physically examined the document(s) presented by the above-named employee, that they appear to be genuine and to relate to the employee, and to the best of my knowledge the employee is authorized to work in the United States.`

      const { data: doc, error: docErr } = await supabase
        .from('signed_documents')
        .insert({
          company_id: packet.company_id,
          employee_id: employee.id,
          onboarding_packet_id: packet.id,
          document_kind: 'i9_section2',
          document_label: 'Form I-9 Section 2 — Employer Review and Verification',
          values_snapshot: v,
          signature_typed_name: v.inspector_name,
          signed_at: new Date().toISOString(),
          signer_ip: ip,
          signer_user_agent: ua,
          consent_text: consent,
          status: 'signed',
        })
        .select('id')
        .single()
      if (docErr) throw docErr

      // Stamp the packet
      const { error: pktErr } = await supabase
        .from('employee_onboarding_packets')
        .update({
          i9_section2_completed_at: new Date().toISOString(),
          i9_section2_completed_by: user?.id || null,
        })
        .eq('id', packet.id)
      if (pktErr) throw pktErr

      // Render PDF for this new doc
      const { data: session } = await supabase.auth.getSession()
      const tok = session?.session?.access_token
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/render-onboarding-pdfs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tok || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ packet_id: packet.id }),
      }).catch(() => null)

      onDone()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inp = {
    width: '100%', padding: '10px 12px',
    border: `1px solid ${theme.border}`, borderRadius: 8,
    fontSize: 14, color: theme.text, backgroundColor: '#fff',
    boxSizing: 'border-box', outline: 'none',
  }
  const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: theme.textSecondary, marginBottom: 4 }

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, zIndex: 100,
    }}>
      <div style={{
        backgroundColor: theme.bgCard, borderRadius: 12,
        maxWidth: 640, width: '100%', maxHeight: '92vh', overflow: 'auto', padding: 22,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: theme.text }}>Form I-9 Section 2 — Employer Review</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer', color: theme.textMuted }}>×</button>
        </div>
        <p style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.5 }}>
          You must <strong>physically examine</strong> the employee's documents in person (or via authorized representative). Record what you saw below.
        </p>

        <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
          {[
            { v: 'A',   label: 'List A — one doc proves both ID + work auth (e.g. US Passport)' },
            { v: 'B+C', label: 'List B + List C — one ID doc + one work-auth doc' },
          ].map(o => (
            <button key={o.v} onClick={() => setV(p => ({ ...p, list_choice: o.v }))} style={{
              flex: 1, padding: '10px', minHeight: 44,
              backgroundColor: v.list_choice === o.v ? theme.accentBg : '#fff',
              border: `2px solid ${v.list_choice === o.v ? theme.accent : theme.border}`,
              borderRadius: 8, color: v.list_choice === o.v ? theme.accent : theme.textSecondary,
              fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
            }}>{o.label}</button>
          ))}
        </div>

        {v.list_choice === 'A' && (
          <DocBlock prefix="a_" title="List A document" v={v} set={set} inp={inp} lbl={lbl} placeholderTitle="e.g. U.S. Passport, Permanent Resident Card" />
        )}
        {v.list_choice === 'B+C' && (
          <>
            <DocBlock prefix="b_" title="List B document (identity)" v={v} set={set} inp={inp} lbl={lbl} placeholderTitle="e.g. Driver's License, State ID" />
            <DocBlock prefix="c_" title="List C document (work authorization)" v={v} set={set} inp={inp} lbl={lbl} placeholderTitle="e.g. Social Security Card, Birth Certificate" />
          </>
        )}

        <div style={{ marginTop: 14 }}>
          <label style={lbl}>Additional information (optional)</label>
          <textarea value={v.additional_info} onChange={set('additional_info')} rows={2} style={{ ...inp, resize: 'vertical' }} />
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={lbl}>Inspector name</label>
          <input type="text" value={v.inspector_name} onChange={set('inspector_name')} style={inp} />
        </div>

        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: 12, marginTop: 14,
          backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 8,
          cursor: 'pointer', fontSize: 12, color: theme.text, lineHeight: 1.45,
        }}>
          <input type="checkbox" checked={v.attest_inspected} onChange={(e) => setV(p => ({ ...p, attest_inspected: e.target.checked }))} style={{ marginTop: 2 }} />
          I attest under penalty of perjury that I physically examined the document(s) listed above, that they appear to be genuine and to relate to the employee named, and that to the best of my knowledge the employee is authorized to work in the United States.
        </label>

        {err && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 10 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px', minHeight: 44,
            background: 'transparent', border: `1px solid ${theme.border}`,
            color: theme.textSecondary, borderRadius: 8,
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={submit} disabled={!valid || saving} style={{
            flex: 2, padding: '12px', minHeight: 44,
            background: theme.accent, color: '#fff',
            border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 700,
            cursor: (!valid || saving) ? 'not-allowed' : 'pointer',
            opacity: (!valid || saving) ? 0.5 : 1,
          }}>{saving ? 'Saving…' : 'Sign + complete I-9 Section 2'}</button>
        </div>
      </div>
    </div>
  )
}

function DocBlock({ prefix, title, v, set, inp, lbl, placeholderTitle }) {
  return (
    <div style={{ marginTop: 10, padding: 12, backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#4b5563', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={lbl}>Document title</label>
          <input type="text" value={v[prefix + 'title']} onChange={set(prefix + 'title')} placeholder={placeholderTitle} style={inp} />
        </div>
        <div>
          <label style={lbl}>Issuing authority</label>
          <input type="text" value={v[prefix + 'issuer']} onChange={set(prefix + 'issuer')} placeholder="e.g. U.S. Department of State, Utah DPS" style={inp} />
        </div>
        <div>
          <label style={lbl}>Document number</label>
          <input type="text" value={v[prefix + 'number']} onChange={set(prefix + 'number')} style={inp} />
        </div>
        <div>
          <label style={lbl}>Expiration date (if any)</label>
          <input type="date" value={v[prefix + 'expires']} onChange={set(prefix + 'expires')} style={inp} />
        </div>
      </div>
    </div>
  )
}
