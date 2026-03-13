import { useState } from 'react'
import { useStore } from '../lib/store'
import ArnieChat from '../pages/agents/arnie/ArnieChat'
import { X } from 'lucide-react'
import { stopSpeaking } from '../pages/agents/arnie/arnieVoice'

const dark = {
  bg: '#1a1d21',
  bgHeader: '#22262b',
  border: '#333840',
  text: '#e8e6e3',
  textMuted: '#6b7280',
  orange: '#f97316',
  orangeGlow: 'rgba(249, 115, 22, 0.35)',
}

export default function ArnieFloatingPanel() {
  const hasAgent = useStore(s => s.hasAgent)
  const user = useStore(s => s.user)
  const company = useStore(s => s.company)
  const [open, setOpen] = useState(false)

  const handleClose = () => {
    stopSpeaking()
    setOpen(false)
  }

  if (!user || !hasAgent('arnie-og')) return null

  return (
    <>
      {/* Floating trigger — avatar with orange ring + "Ask Arnie" label */}
      {!open && (
        <div
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            bottom: 92,
            right: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            zIndex: 999,
            transition: 'transform 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {/* "Ask Arnie" chip */}
          <div style={{
            backgroundColor: dark.bgHeader,
            color: dark.text,
            fontSize: 11,
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 12,
            border: `1px solid ${dark.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
            <span style={{ color: dark.orange, fontSize: 13 }}>&#x2728;</span>
            Ask Arnie
          </div>

          {/* Avatar with orange ring — real image */}
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: `3px solid ${dark.orange}`,
            overflow: 'hidden',
            boxShadow: `0 0 14px ${dark.orangeGlow}, 0 4px 12px rgba(0,0,0,0.3)`,
            backgroundColor: dark.bgHeader,
          }}>
            <img
              src="/og-arnie.png"
              alt="OG Arnie"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        </div>
      )}

      {/* Slide-out panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={handleClose}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 1100,
            }}
          />

          {/* Panel */}
          <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            maxWidth: 400,
            backgroundColor: dark.bg,
            zIndex: 1101,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-4px 0 30px rgba(0,0,0,0.4)',
            animation: 'arnieSlideIn 0.25s ease-out',
          }}>
            {/* Panel header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: `1px solid ${dark.border}`,
              backgroundColor: dark.bgHeader,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: `2.5px solid ${dark.orange}`,
                  overflow: 'hidden',
                  boxShadow: `0 0 8px ${dark.orangeGlow}`,
                  backgroundColor: dark.bg,
                }}>
                  <img
                    src="/og-arnie.png"
                    alt="OG Arnie"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div>
                  <div style={{ color: dark.text, fontSize: 15, fontWeight: 600 }}>OG Arnie</div>
                  <div style={{ color: dark.textMuted, fontSize: 12 }}>
                    AI Assistant{company?.name ? ` \u2022 ${company.name}` : ''}
                  </div>
                </div>
              </div>
              <button
                onClick={handleClose}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={20} color={dark.textMuted} />
              </button>
            </div>

            {/* Chat */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <ArnieChat isPanel onClose={handleClose} />
            </div>
          </div>

          <style>{`
            @keyframes arnieSlideIn {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
          `}</style>
        </>
      )}
    </>
  )
}
