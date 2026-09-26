import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Inbox, Paperclip, ChevronDown, ChevronUp, Radar, AlertTriangle, Lightbulb } from 'lucide-react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { supabase } from '../../../lib/supabase'
import { toast } from '../../../lib/toast'

const defaultTheme = { bg: '#f7f5ef', bgCard: '#fff', border: '#d6cdb8', text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,.12)' }

const STATUS_LABEL = { received: 'Received', parsed: 'Read by Sal', failed: 'Could not read', ignored: 'Ignored' }
const STATUS_COLOR = { received: '#3b82f6', parsed: '#22c55e', failed: '#ef4444', ignored: '#7d8a7f' }

function when(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtSize(n) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// Sal's inbox: every email that reached the tenant's bids+ address, newest
// first, with its attachments. Nothing here is scored yet — the point of
// Phase 0 is that an alert can be SEEN, with the file the portal sent, the
// moment it arrives.
export default function SalInbox() {
  const navigate = useNavigate()
  const companyId = useStore((s) => s.companyId)
  const themeCtx = useTheme()
  const theme = themeCtx?.theme || defaultTheme
  const isMobile = useIsMobile()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(null)

  const load = async () => {
    if (!companyId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('bid_inbox')
      .select('id, email_id, from_email, subject, text_body, received_at, attachments, status, error, opportunity_ids')
      .eq('company_id', companyId)
      .order('received_at', { ascending: false })
      .limit(100)
    if (error) toast.error(`Could not load Sal's inbox: ${error.message}`)
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const openAttachment = async (a) => {
    if (!a?.storage_path) { toast.error(a?.error ? `That file was not stored: ${a.error}` : 'That file was not stored'); return }
    const { data, error } = await supabase.storage.from(a.bucket || 'project-documents').createSignedUrl(a.storage_path, 600)
    if (error || !data?.signedUrl) { toast.error('Could not open the file'); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const pad = isMobile ? '16px' : '24px'

  return (
    <div style={{ padding: pad, maxWidth: '960px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <Inbox size={18} style={{ color: theme.accent }} />
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: theme.text, margin: 0 }}>What the portals sent</h3>
      </div>

      {loading ? (
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '20px', border: `1px dashed ${theme.border}`, borderRadius: '10px', color: theme.textSecondary, fontSize: '13px', lineHeight: 1.5 }}>
          Nothing yet. Point a portal's bid alerts at Sal's address and they show up here the moment they arrive.
          <div style={{ marginTop: '10px' }}>
            <button onClick={() => navigate('/agents/sal/sources')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '44px', padding: '0 14px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              <Radar size={15} /> Get Sal's address
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rows.map((r) => {
            const atts = Array.isArray(r.attachments) ? r.attachments : []
            const stored = atts.filter((a) => a.storage_path).length
            const isOpen = open === r.id
            return (
              <div key={r.id} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px' }}>
                <button onClick={() => setOpen(isOpen ? null : r.id)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: '10px', textAlign: 'left', padding: '12px 14px', minHeight: '56px', width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subject || '(no subject)'}</div>
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.from_email} · {when(r.received_at)}
                      {atts.length > 0 && <span style={{ marginLeft: '8px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Paperclip size={11} />{stored}{stored !== atts.length ? `/${atts.length}` : ''}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: STATUS_COLOR[r.status] || theme.textMuted, padding: '2px 8px', borderRadius: '999px', border: `1px solid ${STATUS_COLOR[r.status] || theme.border}` }}>{STATUS_LABEL[r.status] || r.status}</span>
                    {isOpen ? <ChevronUp size={16} style={{ color: theme.textMuted }} /> : <ChevronDown size={16} style={{ color: theme.textMuted }} />}
                  </div>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${theme.border}` }}>
                    {r.error && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', color: '#b91c1c', fontSize: '12px', margin: '10px 0' }}><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />{r.error}</div>
                    )}
                    {atts.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '10px 0' }}>
                        {atts.map((a, i) => (
                          <button key={i} onClick={() => openAttachment(a)} title={a.error || a.content_type || ''} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '36px', padding: '0 10px', borderRadius: '8px', border: `1px solid ${a.storage_path ? theme.border : '#ef4444'}`, backgroundColor: a.storage_path ? theme.accentBg : 'transparent', color: a.storage_path ? theme.text : '#b91c1c', fontSize: '12px', cursor: 'pointer', maxWidth: '100%' }}>
                            <Paperclip size={12} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>{a.size ? <span style={{ color: theme.textMuted }}>{fmtSize(a.size)}</span> : null}
                          </button>
                        ))}
                      </div>
                    )}
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: '13px', color: theme.textSecondary, lineHeight: 1.5, margin: '8px 0 0', maxHeight: '360px', overflow: 'auto' }}>{(r.text_body || '').trim() || '(no text body)'}</pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '24px', padding: '12px 14px', borderRadius: '10px', backgroundColor: theme.accentBg, fontSize: '12px', color: theme.textSecondary, lineHeight: 1.5 }}>
        <Lightbulb size={16} style={{ color: theme.accent, flexShrink: 0, marginTop: '1px' }} />
        <div>
          Sal never logs into a portal and never scrapes one. What lands here is what the portals emailed to his address, with the files they attached. Reading each alert into a scored opportunity, and dropping the ones you choose on Benny, is the next thing being built.
        </div>
      </div>
    </div>
  )
}
