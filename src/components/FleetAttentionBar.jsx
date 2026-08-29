// The line that says what the fleet needs today.
//
// Sits at the top of the fleet list because that is the screen someone opens
// when they think about their equipment at all. Everything it counts already
// existed on individual detail pages; the problem was that a fact on a page
// nobody opened is not information.
//
// Each pill is a filter, not a link to somewhere else. Tapping "3 overdue"
// leaves you looking at the same list with only those machines in it, which
// is what you wanted; bouncing you to a separate alerts screen would mean
// losing the search and the type filter you had set.
//
// Nothing renders when nothing needs attention. A permanent strip reading
// "0 problems" trains people to skip the row it lives in, so by the time it
// does say something, they have already stopped reading it.

import { ShieldAlert, Wrench, CalendarClock, Clock } from 'lucide-react'

// Colours are fixed rather than themed: these are severity signals, and a
// theme that softened red into the palette would soften the only thing on the
// page that is trying to interrupt you.
export default function FleetAttentionBar({ attention, active, onPick, isMobile }) {
  const c = attention?.counts
  if (!c) return null

  const pills = [
    c.unsafe > 0 && {
      key: 'unsafe', icon: ShieldAlert, fg: '#b91c1c', bg: 'rgba(239,68,68,.12)',
      label: `${c.unsafe} unsafe to run`,
    },
    // The unsafe ones are counted here too. They are a subset, not a separate
    // queue, and subtracting them would make the totals stop adding up against
    // the list you get when you tap through.
    c.requests > 0 && {
      key: 'requests', icon: Wrench, fg: '#c2410c', bg: 'rgba(194,65,12,.10)',
      label: `${c.requests} repair request${c.requests === 1 ? '' : 's'}`,
    },
    c.overdue > 0 && {
      key: 'overdue', icon: CalendarClock, fg: '#b91c1c', bg: 'rgba(239,68,68,.10)',
      label: `${c.overdue} service${c.overdue === 1 ? '' : 's'} overdue`,
    },
    c.dueSoon > 0 && {
      key: 'dueSoon', icon: Clock, fg: '#8a6d08', bg: 'rgba(234,179,8,.14)',
      label: `${c.dueSoon} due soon`,
    },
  ].filter(Boolean)

  if (!pills.length) return null

  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16,
      // Scrolls sideways on a phone rather than stacking four full-width rows
      // and pushing the fleet itself below the fold.
      ...(isMobile ? { flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 4 } : null),
    }}>
      {pills.map(p => {
        const Icon = p.icon
        const on = active === p.key
        return (
          <button
            key={p.key}
            onClick={() => onPick(on ? null : p.key)}
            style={{
              minHeight: 44, padding: '0 14px', borderRadius: 22, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
              background: on ? p.fg : p.bg,
              color: on ? '#fff' : p.fg,
              border: `1px solid ${on ? p.fg : 'transparent'}`,
              fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
            }}
          >
            <Icon size={15} /> {p.label}
          </button>
        )
      })}
    </div>
  )
}
