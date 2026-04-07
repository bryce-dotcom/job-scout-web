import { useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'

/**
 * SignatureModal
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - onConfirm: ({ method: 'drawn' | 'typed', imageDataUrl?: string, typedText?: string }) => void
 * - signerName: optional default name for the "Type" tab
 *
 * No external UI deps. Uses the `signature_pad` library (already a dep) for canvas drawing.
 */
export default function SignatureModal({ open, onClose, onConfirm, signerName = '' }) {
  const [mode, setMode] = useState('drawn') // 'drawn' | 'typed'
  const [typed, setTyped] = useState(signerName || '')
  const [isEmpty, setIsEmpty] = useState(true)
  const canvasRef = useRef(null)
  const padRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    setTyped(signerName || '')
  }, [signerName])

  // Initialise the signature pad when the modal opens in Draw mode
  useEffect(() => {
    if (!open || mode !== 'drawn') return
    const canvas = canvasRef.current
    if (!canvas) return

    // Size canvas to its container respecting device pixel ratio
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      canvas.width = rect.width * ratio
      canvas.height = rect.height * ratio
      const ctx = canvas.getContext('2d')
      ctx.scale(ratio, ratio)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, rect.width, rect.height)
      if (padRef.current) padRef.current.clear()
    }

    resize()
    const pad = new SignaturePad(canvas, {
      backgroundColor: '#ffffff',
      penColor: '#0d1b2a',
      minWidth: 0.8,
      maxWidth: 2.4,
    })
    padRef.current = pad
    setIsEmpty(true)

    const onEnd = () => setIsEmpty(pad.isEmpty())
    pad.addEventListener('endStroke', onEnd)

    const onResize = () => {
      const data = pad.toData()
      resize()
      pad.fromData(data)
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      try { pad.removeEventListener('endStroke', onEnd) } catch { /* ignore */ }
      try { pad.off() } catch { /* ignore */ }
      padRef.current = null
    }
  }, [open, mode])

  if (!open) return null

  const clearDrawn = () => {
    if (padRef.current) {
      padRef.current.clear()
      setIsEmpty(true)
    }
  }

  const canConfirm = mode === 'drawn' ? !isEmpty : typed.trim().length >= 2

  const confirm = () => {
    if (!canConfirm) return
    if (mode === 'drawn') {
      const imageDataUrl = padRef.current?.toDataURL('image/png')
      if (!imageDataUrl) return
      onConfirm({ method: 'drawn', imageDataUrl })
    } else {
      onConfirm({ method: 'typed', typedText: typed.trim() })
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15,20,17,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          border: '1px solid #d6cdb8',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #eef2eb' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#2c3530' }}>Sign this document</h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#7d8a7f' }}>
            Draw your signature or type your full name. Either method is legally binding under the E-SIGN Act.
          </p>
        </div>

        {/* Tab toggle */}
        <div style={{ display: 'flex', padding: '16px 24px 0', gap: '8px' }}>
          <button
            onClick={() => setMode('drawn')}
            style={tabButton(mode === 'drawn')}
          >
            Draw
          </button>
          <button
            onClick={() => setMode('typed')}
            style={tabButton(mode === 'typed')}
          >
            Type
          </button>
        </div>

        <div style={{ padding: '16px 24px 24px' }}>
          {mode === 'drawn' ? (
            <>
              <div
                style={{
                  border: '2px dashed #d6cdb8',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  backgroundColor: '#ffffff',
                  position: 'relative',
                }}
              >
                <canvas
                  ref={canvasRef}
                  style={{
                    width: '100%',
                    height: '200px',
                    display: 'block',
                    touchAction: 'none',
                    cursor: 'crosshair',
                  }}
                />
                {isEmpty && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    color: '#b7bfb3',
                    fontSize: '13px',
                    letterSpacing: '0.3px',
                  }}>
                    Sign above
                  </div>
                )}
              </div>
              <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={clearDrawn} style={linkButton}>Clear</button>
                <span style={{ fontSize: '12px', color: '#7d8a7f' }}>Use your mouse, finger, or stylus.</span>
              </div>
            </>
          ) : (
            <>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#4d5a52', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Your full legal name
              </label>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="e.g. John Smith"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #d6cdb8',
                  fontSize: '15px',
                  marginTop: '6px',
                  boxSizing: 'border-box',
                  color: '#2c3530',
                  backgroundColor: '#fbfaf6',
                }}
              />
              <div style={{
                marginTop: '14px',
                padding: '16px 20px',
                border: '2px dashed #d6cdb8',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                minHeight: '80px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span style={{
                  fontFamily: '"Brush Script MT", "Lucida Handwriting", "Segoe Script", cursive',
                  fontSize: '34px',
                  color: '#0d1b2a',
                  lineHeight: 1,
                }}>
                  {typed || 'Your Signature'}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#7d8a7f', marginTop: '10px' }}>
                By typing your name above you are affixing your legal electronic signature.
              </p>
            </>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #eef2eb', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={secondaryBtn}>Cancel</button>
          <button
            onClick={confirm}
            disabled={!canConfirm}
            style={{ ...primaryBtn, opacity: canConfirm ? 1 : 0.5, cursor: canConfirm ? 'pointer' : 'not-allowed' }}
          >
            Apply Signature
          </button>
        </div>
      </div>
    </div>
  )
}

function tabButton(active) {
  return {
    flex: 1,
    padding: '10px 12px',
    borderRadius: '10px',
    border: `1px solid ${active ? '#5a6349' : '#d6cdb8'}`,
    backgroundColor: active ? 'rgba(90,99,73,0.12)' : '#ffffff',
    color: active ? '#5a6349' : '#4d5a52',
    fontWeight: 600,
    fontSize: '14px',
    cursor: 'pointer',
  }
}

const primaryBtn = {
  padding: '10px 18px',
  borderRadius: '10px',
  border: 'none',
  background: 'linear-gradient(135deg, #5a6349 0%, #4a5239 100%)',
  color: '#ffffff',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
}

const secondaryBtn = {
  padding: '10px 18px',
  borderRadius: '10px',
  border: '1px solid #d6cdb8',
  backgroundColor: '#ffffff',
  color: '#4d5a52',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
}

const linkButton = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#5a6349',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
}
