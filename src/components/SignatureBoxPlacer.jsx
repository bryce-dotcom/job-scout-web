// Draw a box where the customer signs.
//
// Most forms declare their own signature line and this is never needed —
// lib/signatureTargets reads the AcroForm field and the document signs
// itself. The IRS W-9 declares nothing: it signs on a printed rule, so the
// only way to know where is for somebody to look at the page and say. That
// is the one document on Robert Anderson's job that still cannot be signed.
//
// The page is rendered by the viewer the rest of the app already uses, and
// every corner is converted through the viewer's own convertToPdfPoint, so
// scale and page rotation are its problem rather than arithmetic repeated
// here. What is left — which corner is which, which page, how small is a
// misclick — lives in lib/signatureBox, where it can be tested without a
// browser.

import { useEffect, useRef, useState } from 'react'
import { X, Trash2, Check, Loader } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { findSignatureTargets } from '../lib/signatureTargets'
import { normalizeRect, boxForStorage, boxesOnPage, placementAdvice } from '../lib/signatureBox'

const MAX_WIDTH = 760

export default function SignatureBoxPlacer({ template, theme, onClose, onSaved }) {
  const canvasRef = useRef(null)
  const viewportRef = useRef(null)
  const docRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)
  const [boxes, setBoxes] = useState([])
  const [detected, setDetected] = useState([])
  const [drag, setDrag] = useState(null)       // {x1,y1,x2,y2} in canvas px
  const [saving, setSaving] = useState(false)

  const isUtilityForm = template?._source === 'utility_forms'
  const bucket = isUtilityForm ? 'utility-pdfs' : 'project-documents'
  // Utility forms keep the file on form_file; the library list normalizes it
  // onto file_path as well, so fall through rather than trusting one of them.
  const path = (isUtilityForm ? template?.form_file : null) || template?.file_path

  // Load the file once: the viewer for rendering, pdf-lib for what the form
  // already declares. Both read the same bytes.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        if (!path) throw new Error('This template has no file attached.')
        const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(path)
        if (dlErr || !blob) throw new Error(dlErr?.message || 'Could not open the template file.')
        const bytes = new Uint8Array(await blob.arrayBuffer())

        const { PDFDocument } = await import('pdf-lib')
        try {
          const probe = await PDFDocument.load(bytes, { ignoreEncryption: true })
          if (!cancelled) setDetected(findSignatureTargets(probe).signature)
        } catch { /* a form we cannot parse simply declares nothing */ }

        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
        // getDocument consumes the buffer it is handed, and pdf-lib has
        // already read these bytes — pass a copy or the second reader gets
        // a detached ArrayBuffer.
        const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
        if (cancelled) return
        docRef.current = doc
        setPageCount(doc.numPages)

        const existing = Array.isArray(template?.signature_fields) ? template.signature_fields : []
        setBoxes(existing)
        setLoading(false)
      } catch (err) {
        if (!cancelled) { setError(err.message || 'Could not open this template.'); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [bucket, path, template?.signature_fields])

  // Render the page in view.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const doc = docRef.current
      const canvas = canvasRef.current
      if (!doc || !canvas || loading) return
      try {
        const page = await doc.getPage(pageIndex + 1)
        const natural = page.getViewport({ scale: 1 })
        const scale = Math.min(MAX_WIDTH / natural.width, 1.6)
        const viewport = page.getViewport({ scale })
        if (cancelled) return
        viewportRef.current = viewport
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: ctx, viewport }).promise
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not draw this page.')
      }
    })()
    return () => { cancelled = true }
  }, [pageIndex, loading])

  const canvasPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvasRef.current.width / rect.width),
      y: (e.clientY - rect.top) * (canvasRef.current.height / rect.height),
    }
  }

  const handleDown = (e) => {
    const p = canvasPoint(e)
    setDrag({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
  }
  const handleMove = (e) => {
    if (!drag) return
    const p = canvasPoint(e)
    setDrag(d => ({ ...d, x2: p.x, y2: p.y }))
  }
  const handleUp = () => {
    if (!drag || !viewportRef.current) { setDrag(null); return }
    const vp = viewportRef.current
    // The viewer converts canvas pixels to PDF points, rotation and all.
    const p1 = vp.convertToPdfPoint(drag.x1, drag.y1)
    const p2 = vp.convertToPdfPoint(drag.x2, drag.y2)
    const box = boxForStorage(normalizeRect(p1, p2), pageIndex)
    setDrag(null)
    if (!box) { toast.info('That box is too small — drag across the signature line.'); return }
    setBoxes(prev => [...prev, box])
  }

  const save = async () => {
    setSaving(true)
    try {
      const table = isUtilityForm ? 'utility_forms' : 'document_templates'
      const id = isUtilityForm ? template._sourceId : template.id
      const payload = { signature_fields: boxes }
      if (!isUtilityForm) payload.updated_at = new Date().toISOString()
      const { error: err } = await supabase.from(table).update(payload).eq('id', id)
      if (err) { toast.error('Save failed: ' + err.message); return }
      toast.success(boxes.length
        ? `Saved ${boxes.length} signature box${boxes.length === 1 ? '' : 'es'} — new copies of this form sign themselves`
        : 'Signature boxes cleared')
      onSaved?.(boxes)
      onClose?.()
    } finally {
      setSaving(false)
    }
  }

  const vp = viewportRef.current
  const placedHere = boxesOnPage(boxes, pageIndex)
  const detectedHere = boxesOnPage(detected, pageIndex)
  const advice = placementAdvice({ detectedCount: detected.length, placedCount: boxes.length })
  const adviceColor = advice.tone === 'needed' ? '#eab308' : advice.tone === 'placed' ? '#22c55e' : theme.textMuted

  // A stored box is in PDF points; put it back on the canvas through the
  // same viewport so what is shown is what will be stamped.
  const toCanvasRect = (b) => {
    if (!vp) return null
    const [cx1, cy1] = vp.convertToViewportPoint(b.x, b.y)
    const [cx2, cy2] = vp.convertToViewportPoint(b.x + b.width, b.y + b.height)
    return {
      left: Math.min(cx1, cx2), top: Math.min(cy1, cy2),
      width: Math.abs(cx2 - cx1), height: Math.abs(cy2 - cy1),
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: theme.bgCard, borderRadius: 12, width: '100%', maxWidth: MAX_WIDTH + 60, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>Signature box — {template?.form_name}</div>
            <div style={{ fontSize: 12, color: adviceColor, marginTop: 2, lineHeight: 1.4 }}>{advice.text}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', padding: 4 }}><X size={20} /></button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 16, background: theme.bg, display: 'flex', justifyContent: 'center' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: theme.textMuted, fontSize: 14, padding: 40 }}>
              <Loader size={16} className="spin" /> Opening the form…
            </div>
          ) : error ? (
            <div style={{ color: '#ef4444', fontSize: 14, padding: 40, textAlign: 'center' }}>{error}</div>
          ) : (
            <div style={{ position: 'relative', lineHeight: 0 }}>
              <canvas
                ref={canvasRef}
                onMouseDown={handleDown}
                onMouseMove={handleMove}
                onMouseUp={handleUp}
                onMouseLeave={() => setDrag(null)}
                style={{ cursor: 'crosshair', maxWidth: '100%', boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }}
              />
              {/* What the form already declares — shown, not editable, so
                  nobody places a second box over a line that already works. */}
              {detectedHere.map((b, i) => {
                const r = toCanvasRect(b)
                return r && (
                  <div key={`d${i}`} style={{
                    position: 'absolute', left: r.left, top: r.top, width: r.width, height: r.height,
                    border: '2px dashed #3b82f6', background: 'rgba(59,130,246,0.10)', pointerEvents: 'none',
                  }} />
                )
              })}
              {placedHere.map((b, i) => {
                const r = toCanvasRect(b)
                return r && (
                  <div key={`p${i}`} style={{
                    position: 'absolute', left: r.left, top: r.top, width: r.width, height: r.height,
                    border: '2px solid #5a6349', background: 'rgba(90,99,73,0.16)', pointerEvents: 'none',
                  }} />
                )
              })}
              {drag && (
                <div style={{
                  position: 'absolute',
                  left: Math.min(drag.x1, drag.x2), top: Math.min(drag.y1, drag.y2),
                  width: Math.abs(drag.x2 - drag.x1), height: Math.abs(drag.y2 - drag.y1),
                  border: '2px solid #5a6349', background: 'rgba(90,99,73,0.22)', pointerEvents: 'none',
                }} />
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 18px', borderTop: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => setPageIndex(i => Math.max(0, i - 1))}
            disabled={pageIndex === 0}
            style={navStyle(theme, pageIndex === 0)}
          >Previous</button>
          <span style={{ fontSize: 13, color: theme.textSecondary }}>Page {pageIndex + 1} of {pageCount || 1}</span>
          <button
            onClick={() => setPageIndex(i => Math.min((pageCount || 1) - 1, i + 1))}
            disabled={pageIndex >= pageCount - 1}
            style={navStyle(theme, pageIndex >= pageCount - 1)}
          >Next</button>

          <div style={{ flex: 1 }} />

          {boxes.length > 0 && (
            <button
              onClick={() => setBoxes([])}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            ><Trash2 size={13} /> Clear {boxes.length}</button>
          )}
          <button
            onClick={save}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}
          ><Check size={14} /> {saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function navStyle(theme, disabled) {
  return {
    padding: '8px 12px',
    background: disabled ? theme.bg : theme.accentBg,
    color: disabled ? theme.textMuted : theme.accent,
    border: `1px solid ${disabled ? theme.border : theme.accent}`,
    borderRadius: 8, fontSize: 13, fontWeight: 500,
    cursor: disabled ? 'default' : 'pointer',
  }
}
