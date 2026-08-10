import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { adminTheme } from './components/adminTheme'
import { AlertTriangle, Check, RotateCcw, Monitor, MapPin } from 'lucide-react'

// Crashes the app caught, so a bug stops depending on someone photographing
// their screen.
//
// Sentry has never been switched on here (Sentry.init is gated on
// VITE_SENTRY_DSN, set nowhere), so this was the only place a crash could be
// seen. It stays useful afterwards: it is deduped per (message, route) with a
// count, which answers "is this one broken page or the whole catalogue?" —
// the Products crash hit all 189 products with specs and nobody knew.

const fmt = (d) => d ? new Date(d).toLocaleString('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
}) : '—'

export default function DataConsoleCrashes() {
  const t = adminTheme
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showResolved, setShowResolved] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('client_errors')
      .select('*')
      .order('last_seen_at', { ascending: false })
      .limit(200)
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const setResolved = async (row, resolved) => {
    await supabase.from('client_errors').update({ resolved }).eq('id', row.id)
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, resolved } : r))
  }

  const visible = rows.filter(r => showResolved ? true : !r.resolved)
  const openCount = rows.filter(r => !r.resolved).length

  const card = {
    backgroundColor: t.bgCard, border: `1px solid ${t.border}`,
    borderRadius: '10px', padding: '14px 16px', marginBottom: '10px',
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: t.text, margin: 0 }}>Crashes</h2>
        {openCount > 0 && (
          <span style={{
            fontSize: '12px', fontWeight: 700, color: '#fff', backgroundColor: '#ef4444',
            borderRadius: '999px', padding: '2px 10px',
          }}>{openCount} open</span>
        )}
        <button
          onClick={() => setShowResolved(v => !v)}
          style={{
            marginLeft: 'auto', fontSize: '12px', color: t.textMuted, background: 'none',
            border: `1px solid ${t.border}`, borderRadius: '8px', padding: '6px 12px', cursor: 'pointer',
          }}
        >
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </button>
      </div>
      <p style={{ fontSize: '13px', color: t.textMuted, marginTop: 0, marginBottom: '16px' }}>
        Reported automatically when the app hits an error screen. Counted per message and page,
        so one bug is one row however many people hit it.
      </p>

      {loading ? (
        <p style={{ color: t.textMuted, fontSize: '13px' }}>Loading…</p>
      ) : visible.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: t.textMuted, fontSize: '13px', padding: '28px' }}>
          No crashes recorded. This is the good outcome — but it also means nothing has been reported
          since the reporter shipped, so treat a long silence as worth checking rather than proof.
        </div>
      ) : visible.map(r => (
        <div key={r.id} style={{ ...card, opacity: r.resolved ? 0.55 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <AlertTriangle size={16} style={{ color: r.resolved ? t.textMuted : '#ef4444', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: t.text, wordBreak: 'break-word' }}>
                {r.message}
              </div>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '5px', fontSize: '11.5px', color: t.textMuted }}>
                {r.route && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={11} />{r.route}</span>}
                <span>{r.seen_count > 1 ? `${r.seen_count} times` : 'once'}</span>
                <span>last {fmt(r.last_seen_at)}</span>
                {r.app_build && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Monitor size={11} />build {r.app_build}</span>}
              </div>
            </div>
            <button
              onClick={() => setResolved(r, !r.resolved)}
              title={r.resolved ? 'Reopen' : 'Mark resolved'}
              style={{
                flexShrink: 0, background: 'none', border: `1px solid ${t.border}`, borderRadius: '8px',
                padding: '6px 10px', cursor: 'pointer', color: t.textMuted, minHeight: '32px',
              }}
            >
              {r.resolved ? <RotateCcw size={14} /> : <Check size={14} />}
            </button>
          </div>

          {/* What they did before it broke, shown WITHOUT expanding — it is
              the part you read first, and burying it behind a click means it
              gets skipped in favour of a stack that says less. */}
          {r.breadcrumbs && (
            <div style={{
              marginTop: '10px', padding: '8px 10px', backgroundColor: t.bg,
              border: `1px solid ${t.border}`, borderRadius: '8px',
            }}>
              <div style={{ fontSize: '10.5px', fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                Leading up to it
              </div>
              <pre style={{
                margin: 0, fontSize: '11px', lineHeight: 1.5, color: t.textSecondary || t.textMuted,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '150px', overflowY: 'auto',
              }}>{r.breadcrumbs}</pre>
            </div>
          )}

          {(r.stack || r.component) && (
            <>
              <button
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                style={{
                  marginTop: '8px', fontSize: '11.5px', color: t.accent, background: 'none',
                  border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline',
                }}
              >
                {expanded === r.id ? 'Hide details' : 'Show stack'}
              </button>
              {expanded === r.id && (
                <pre style={{
                  marginTop: '8px', marginBottom: 0, fontSize: '11px', lineHeight: 1.45,
                  color: t.textMuted, background: t.bg, border: `1px solid ${t.border}`,
                  borderRadius: '8px', padding: '10px', overflowX: 'auto', whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {[r.component, r.stack].filter(Boolean).join('\n\n')}
                </pre>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
