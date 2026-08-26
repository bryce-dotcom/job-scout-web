import { useState } from 'react'
import { Eye, EyeOff, ChevronUp, ChevronDown, X, RotateCcw, Lock } from 'lucide-react'
import { customisableSections, moveItem, toggleHidden } from '../lib/navPrefs'

/**
 * "Show me only what I actually use."
 *
 * The sidebar carries fifty-odd destinations and most people use six. This is
 * where somebody turns off the other forty-four.
 *
 * It is deliberately the ONE screen that lists hidden items as well as visible
 * ones — everywhere else in the app a hidden page is simply gone, so if this
 * showed the same filtered list there would be no way back.
 *
 * Up/down buttons rather than drag-and-drop: this is used on phones in trucks,
 * and dragging a small row with a gloved thumb is a worse experience than two
 * obvious buttons, whatever it looks like in a demo.
 */
export default function NavCustomizer({ sections, prefs, onChange, onReset, onClose, theme }) {
  const [draft, setDraft] = useState(prefs)
  const groups = customisableSections(sections, draft)

  const update = (next) => { setDraft(next); onChange(next) }

  const t = theme || {}
  const line = t.border || '#d6cdb8'
  const ink = t.text || '#2c3530'
  const sub = t.textSecondary || '#4d5a52'
  const muted = t.textMuted || '#7d8a7f'
  const card = t.bgCard || '#ffffff'
  const accent = t.accent || '#5a6349'

  const iconBtn = (enabled) => ({
    width: 34, height: 34, minWidth: 34, borderRadius: 8,
    border: `1px solid ${line}`, background: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.3,
  })

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
        zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: card, border: `1px solid ${line}`, borderRadius: 14,
          width: '100%', maxWidth: 520, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, padding: '16px 18px', borderBottom: `1px solid ${line}`,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: ink }}>Customise your menu</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: sub, lineHeight: 1.45 }}>
              Turn off what you don&rsquo;t use and put the rest in the order you want.
              This only changes your own menu — hidden pages still work if you have a link to one.
            </p>
          </div>
          <button onClick={onClose} title="Close" style={{ ...iconBtn(true), border: 'none' }}>
            <X size={18} color={muted} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '8px 18px 4px' }}>
          {groups.map(group => {
            const routes = group.items.map(i => i.to)
            return (
              <div key={group.key} style={{ marginBottom: 18 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
                  textTransform: 'uppercase', color: muted, margin: '10px 0 8px',
                }}>
                  {group.title}
                </div>
                {group.items.map((item, i) => (
                  <div key={item.to} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 0', borderBottom: `1px solid ${line}33`,
                  }}>
                    {item.icon && <item.icon size={16} color={item.hidden ? muted : accent} style={{ flexShrink: 0 }} />}
                    <span style={{
                      flex: 1, minWidth: 0, fontSize: 14,
                      color: item.hidden ? muted : ink,
                      textDecoration: item.hidden ? 'line-through' : 'none',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.label}
                    </span>

                    {item.protected ? (
                      <span title="This one always stays" style={{ ...iconBtn(false), cursor: 'default', opacity: 0.45 }}>
                        <Lock size={14} color={muted} />
                      </span>
                    ) : (
                      <button
                        onClick={() => update(toggleHidden(draft, item.to))}
                        title={item.hidden ? 'Show in menu' : 'Hide from menu'}
                        style={iconBtn(true)}
                      >
                        {item.hidden
                          ? <EyeOff size={15} color={muted} />
                          : <Eye size={15} color={accent} />}
                      </button>
                    )}

                    <button
                      onClick={() => update(moveItem(draft, group.key, routes, item.to, -1))}
                      disabled={i === 0}
                      title="Move up"
                      style={iconBtn(i > 0)}
                    >
                      <ChevronUp size={15} color={ink} />
                    </button>
                    <button
                      onClick={() => update(moveItem(draft, group.key, routes, item.to, 1))}
                      disabled={i === group.items.length - 1}
                      title="Move down"
                      style={iconBtn(i < group.items.length - 1)}
                    >
                      <ChevronDown size={15} color={ink} />
                    </button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, padding: '12px 18px', borderTop: `1px solid ${line}`,
        }}>
          <button
            onClick={() => { const next = onReset(); setDraft(next) }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: `1px solid ${line}`, borderRadius: 9,
              padding: '9px 13px', fontSize: 13, color: sub, cursor: 'pointer', minHeight: 42,
            }}
          >
            <RotateCcw size={14} /> Reset to default
          </button>
          <button
            onClick={onClose}
            style={{
              background: accent, color: '#fff', border: 0, borderRadius: 9,
              padding: '10px 20px', fontSize: 14, fontWeight: 650, cursor: 'pointer', minHeight: 42,
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
