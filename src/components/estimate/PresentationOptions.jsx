import { FileText, Sparkles, FileSignature, Send, Download } from 'lucide-react'
import { proposalModeOptions, proposalMode, sendButtonLabel } from '../../lib/proposalModes'

// Three ways to present a quote, shown as three choices.
//
// This card used to be four buttons that did not read as a set: "Preview PDF",
// "Download PDF", a green Send whose behaviour depended on a mode buried in a
// settings modal, and "Formal Legal Proposal" — which IS one of the modes but
// looked like a separate feature. A rep who had never used the system could
// not tell what any of them would send, and "View/Preview PDF" says nothing
// about being the plain estimate.
//
// The consequence was measurable: of 110 sent estimates, 79 went as the bare
// document and only 21 as the interactive quote, because choosing the
// interactive one meant knowing a dropdown existed somewhere else.
//
// So: name each way, say in one line what the customer gets, and put the
// action on the row. The mode is chosen by the button you press, not
// remembered from a screen you visited earlier.

const ICONS = {
  pdf: FileText,
  interactive: Sparkles,
  formal: FileSignature,
}

export default function PresentationOptions({
  theme,
  currentMode,
  alreadySent = false,
  saving = false,
  generatingPdf = false,
  pdfUrl = null,
  onSend,            // (modeId) => void   — set the mode and open the send modal
  onPreviewPdf,      // ()      => void
  onDownloadPdf,     // ()      => void
}) {
  const active = proposalMode(currentMode).id

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <p style={{ fontSize: '12px', color: theme.textMuted, margin: '0 0 2px', lineHeight: 1.5 }}>
        Three ways to send this. Pick the one that fits the customer.
      </p>

      {proposalModeOptions().map((m) => {
        const Icon = ICONS[m.id] || FileText
        const isActive = m.id === active
        return (
          <div
            key={m.id}
            style={{
              border: `1px solid ${isActive ? theme.accent : theme.border}`,
              borderRadius: '10px',
              padding: '12px 14px',
              backgroundColor: isActive ? (theme.accentBg || 'rgba(90,99,73,0.08)') : 'transparent',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0 }}>
              <Icon size={18} style={{ color: theme.accent, flexShrink: 0, marginTop: '2px' }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                  {m.label}
                  {isActive && alreadySent && (
                    <span style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '400', marginLeft: '6px' }}>
                      · sent
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '3px', lineHeight: 1.45 }}>
                  {m.blurb}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => onSend?.(m.id)}
                disabled={saving}
                style={{
                  flex: 1,
                  minWidth: '150px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  padding: '10px 14px',
                  backgroundColor: theme.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                  minHeight: '40px',
                }}
                title={m.blurb}
              >
                <Send size={15} />
                {sendButtonLabel(m.id, alreadySent && isActive)}
              </button>

              {/* Only the plain estimate has a file to look at or keep. The
                  other two are web documents the customer opens from a link,
                  so offering "download" there would be a lie. */}
              {m.id === 'pdf' && (
                <>
                  <button
                    onClick={onPreviewPdf}
                    disabled={generatingPdf || saving}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      padding: '10px 14px',
                      backgroundColor: 'transparent',
                      color: theme.accent,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '8px',
                      fontSize: '13px',
                      cursor: (generatingPdf || saving) ? 'not-allowed' : 'pointer',
                      opacity: (generatingPdf || saving) ? 0.6 : 1,
                      minHeight: '40px',
                    }}
                    title="See the estimate exactly as the customer will receive it"
                  >
                    <FileText size={15} />
                    {generatingPdf ? 'Generating…' : 'Preview'}
                  </button>
                  {pdfUrl && (
                    <button
                      onClick={onDownloadPdf}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        padding: '10px 12px',
                        backgroundColor: 'transparent',
                        color: theme.textMuted,
                        border: `1px solid ${theme.border}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        minHeight: '40px',
                      }}
                      title="Download a copy"
                    >
                      <Download size={15} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
