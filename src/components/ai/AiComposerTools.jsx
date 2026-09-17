// The two buttons every AI text box carries: attach a file, and Dougie.
//
// Bryce: "on ALL AI text boxes there should be an upload button and the
// Dougie button that explains Dougie." One component so Arnie's dark
// composer and Frankie's light one get the same affordance, the same
// explanation, the same limits — from src/lib/chatAttachments.js, which
// is the one place the accepted types and sizes live.
//
// Dougie is the reader. He is not a separate chat; he is what happens to
// a photo or a PDF you drop into any AI box — the utility bill, the
// handwritten takeoff sheet, the invoice, the nameplate, the screenshot.
// The button says exactly that, then offers the paperclip.

import { useEffect, useRef, useState } from 'react'
import { Paperclip, ScanText, X, FileText, Loader2 } from 'lucide-react'
import { ACCEPT_ATTR, MAX_ATTACHMENTS, formatBytes } from '../../lib/chatAttachments'

/** Palette for the buttons — the caller's theme, not ours. */
export const composerTone = ({ bg, border, text, muted, accent, popBg }) => ({ bg, border, text, muted, accent, popBg: popBg || bg })

const btnStyle = (tone, active) => ({
  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
  border: `1px solid ${active ? tone.accent : tone.border}`, backgroundColor: tone.bg,
  color: active ? tone.accent : tone.muted, display: 'flex', alignItems: 'center',
  justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s',
})

/** The paperclip: a hidden file input and the button that opens it. */
export function AttachButton({ tone, onFiles, disabled, inputRef: outerRef, title = 'Attach a photo, screenshot or PDF' }) {
  const innerRef = useRef(null)
  const ref = outerRef || innerRef
  return (
    <>
      <input ref={ref} type="file" multiple accept={ACCEPT_ATTR} style={{ display: 'none' }}
        onChange={e => { onFiles(e.target.files); e.target.value = '' }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={disabled} title={title} aria-label={title} style={btnStyle(tone, false)}
        onMouseEnter={e => { e.currentTarget.style.borderColor = tone.accent; e.currentTarget.style.color = tone.accent }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = tone.border; e.currentTarget.style.color = tone.muted }}>
        <Paperclip size={18} />
      </button>
    </>
  )
}

/**
 * Dougie: tap, and a small card says what he does and offers the paperclip.
 * `onAttach` opens the same file input the AttachButton uses, so there is
 * one path for a file whichever button the person reached for.
 */
export function DougieButton({ tone, onAttach, agentName = 'Arnie' }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div ref={wrap} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen(o => !o)} title="Dougie — what he reads" aria-label="Dougie, the document reader" aria-expanded={open} style={btnStyle(tone, open)}
        onMouseEnter={e => { e.currentTarget.style.borderColor = tone.accent; e.currentTarget.style.color = tone.accent }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.borderColor = tone.border; e.currentTarget.style.color = tone.muted } }}>
        <ScanText size={18} />
      </button>
      {open && (
        <div role="dialog" aria-label="About Dougie" style={{
          position: 'absolute', bottom: 52, left: 0, width: 300, maxWidth: 'calc(100vw - 32px)', zIndex: 20,
          background: tone.popBg, border: `1px solid ${tone.border}`, borderRadius: 12, padding: 14,
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)', color: tone.text, fontSize: 13, lineHeight: 1.5,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <ScanText size={16} style={{ color: tone.accent }} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Dougie reads paper</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: tone.muted, cursor: 'pointer', padding: 4, display: 'flex' }}><X size={14} /></button>
          </div>
          <div style={{ color: tone.text }}>
            Hand {agentName} a photo or a PDF and Dougie pulls the numbers out of it — a utility bill, a handwritten takeoff sheet, an invoice, a nameplate, a screenshot of an error. What he reads lands in this conversation, so you can ask about it.
          </div>
          <div style={{ color: tone.muted, fontSize: 12, marginTop: 6 }}>
            Up to {MAX_ATTACHMENTS} files a message. Photos are sized down on your phone before they go anywhere.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => { setOpen(false); onAttach?.() }} style={{
              flex: 1, minHeight: 40, borderRadius: 8, border: 'none', background: tone.accent, color: '#fff',
              fontWeight: 650, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}><Paperclip size={14} /> Attach a photo or PDF</button>
            <a href="/admin/videos#walkthrough=dougie" style={{
              minHeight: 40, padding: '0 12px', borderRadius: 8, border: `1px solid ${tone.border}`, color: tone.text,
              fontSize: 13, display: 'flex', alignItems: 'center', textDecoration: 'none', whiteSpace: 'nowrap',
            }}>How he works</a>
          </div>
        </div>
      )}
    </div>
  )
}

/** The chips above the box: what is attached, what is still being read, what was refused. */
export function AttachmentChips({ tone, attachments = [], reading, error, onRemove }) {
  if (!attachments.length && !reading && !error) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
      {attachments.map(att => (
        <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 4px', borderRadius: 10, background: tone.bg, border: `1px solid ${tone.border}`, fontSize: 12, color: tone.text, maxWidth: 220 }}>
          {att.previewUrl
            ? <img src={att.previewUrl} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6 }} />
            : <span style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tone.muted }}><FileText size={16} /></span>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
          <span style={{ color: tone.muted }}>{formatBytes(att.bytes || 0)}</span>
          <button type="button" onClick={() => onRemove(att.id)} aria-label={`Remove ${att.name}`} style={{ background: 'none', border: 'none', color: tone.muted, cursor: 'pointer', padding: 2, display: 'flex' }}><X size={14} /></button>
        </div>
      ))}
      {reading && <span style={{ fontSize: 12, color: tone.muted, display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} style={{ animation: 'ai-spin 1s linear infinite' }} /> Reading…</span>}
      {error && <span style={{ fontSize: 12, color: '#e5484d' }}>{error}</span>}
      <style>{'@keyframes ai-spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
}
