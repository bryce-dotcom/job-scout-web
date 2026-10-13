// What Cole checks before a job is approved, at the moment it is being saved.
//
// From his own write-up: customer details, Business Unit, project name, notes
// on every line, signed terms, spec sheets, annual savings — and the owner's
// go-ahead. "She never approves without all of it."
//
// THE RULE THIS FOLLOWS: it only ticks what it actually looked at. The page
// can see the contact details, the per-line notes and the signature, so those
// are checked for real. It cannot see the Business Unit, the spec sheets or
// whether the owner said yes, so those stay as plain reminders — never a
// green tick. A checklist that ticks something it did not verify is worse
// than no checklist, because it teaches people to trust it and then is wrong
// on the one job where it mattered.
//
// The list is data (settings key lenard_checklist_az), so a line can be added
// or reworded without a deploy. A line this component has no check for simply
// shows as a reminder, which is the safe direction for an unknown.

import { Check, Circle } from 'lucide-react'

export default function LenardClosingChecklist({ items, verified, theme }) {
  if (!items?.length) return null
  const T = theme || {}
  const done = items.filter((i) => verified[i.id] === true).length
  const checkable = items.filter((i) => verified[i.id] !== undefined).length

  return (
    <div style={{
      border: `1px solid ${T.border || '#d6cdb8'}`, borderRadius: 10,
      padding: '10px 12px', marginBottom: 14,
      background: T.bg || 'rgba(0,0,0,0.02)',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: T.textMuted || '#7d8a7f', marginBottom: 8,
      }}>
        Before this gets approved · {done} of {checkable} checked
      </div>
      {items.map((item) => {
        const state = verified[item.id]          // true | false | undefined
        const known = state !== undefined
        const ok = state === true
        return (
          <div key={item.id} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', padding: '3px 0' }}>
            {ok
              ? <Check size={13} style={{ color: '#2f7d4e', flexShrink: 0, marginTop: 2 }} />
              : <Circle size={13} style={{ color: known ? '#b45309' : (T.textMuted || '#7d8a7f'), flexShrink: 0, marginTop: 2 }} />}
            <span style={{
              fontSize: 12, lineHeight: 1.45,
              color: ok ? (T.textMuted || '#7d8a7f') : (T.text || '#2c3530'),
            }}>
              {item.label}
              {/* Said plainly rather than left to look like a failed check. */}
              {!known && (
                <span style={{ color: T.textMuted || '#7d8a7f' }}> — check this yourself</span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
