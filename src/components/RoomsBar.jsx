// Who is talking, right now, in the header.
//
// Bryce, 2026-10-22: a page you have to navigate to is a page nobody opens.
// So the rooms live in the sticky header instead — the Campfire plus any
// side room with somebody in it, each showing a headcount, one click to walk
// in. You see the team gathering the way you would see it across an office.
//
// It owns its own presence subscription rather than taking it from Layout,
// so Layout's hook count is untouched and this can be dropped anywhere.
// Presence is the right source here: the lobby only needs a headcount, and
// asking the media server for one on every render would be absurd.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { MAIN_ROOM, roomMeta } from '../lib/conferenceRooms'
import { useRoomSession } from './RoomSession'

export default function RoomsBar({ theme, compact = false }) {
  const navigate = useNavigate()
  const session = useRoomSession()
  const companyId = useStore(s => s.companyId)
  const [counts, setCounts] = useState({})

  useEffect(() => {
    if (!companyId) return
    // Read-only: this bar watches the lobby, it never announces anybody. The
    // page you are ON does the announcing when you actually join a room —
    // otherwise every open tab would read as a person in the Campfire.
    const channel = supabase.channel(`rooms-lobby-${companyId}`)
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const next = {}
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            if (!entry?.room) continue
            next[entry.room] = (next[entry.room] || 0) + 1
          }
        }
        setCounts(next)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [companyId])

  if (!companyId) return null

  // The Campfire always shows. A side room shows only while someone is in
  // it: an empty room in the header is clutter, and the full list is one
  // click away on the page.
  const busy = Object.keys(counts).filter(slug => slug !== MAIN_ROOM.slug && counts[slug] > 0)
  const campfire = counts[MAIN_ROOM.slug] || 0

  const pill = (slug, label, n, icon) => (
    <button
      key={slug}
      onClick={() => session?.join(slug)}
      title={n > 0 ? `${n} in ${label} — click to join` : `${label} — click to open it up`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: compact ? '4px 8px' : '5px 10px',
        borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
        fontSize: compact ? 11.5 : 12.5, fontWeight: 600,
        border: `1px solid ${n > 0 ? theme.accent : theme.border}`,
        background: n > 0 ? `${theme.accent}1a` : 'transparent',
        color: n > 0 ? theme.accent : theme.textMuted,
      }}
    >
      {icon}
      <span style={{ maxWidth: compact ? 70 : 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {n > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999,
          background: theme.accent, color: '#fff', fontSize: 10, fontWeight: 800,
        }}>{n}</span>
      )}
    </button>
  )

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflowX: 'auto' }}>
        {pill(MAIN_ROOM.slug, 'Campfire', campfire, <Flame size={12} />)}
        {busy.slice(0, 1).map(slug => pill(slug, roomMeta(slug).name, counts[slug], null))}
      </div>
    )
  }

  // The front door. Wide, warm and obvious, directly under the logo — you
  // walk in, you do not go hunting through a menu for it.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <button
        onClick={() => session?.join(MAIN_ROOM.slug)}
        title={campfire > 0 ? `${campfire} at the Campfire — click to join` : 'Open up the Campfire'}
        style={{
          display: 'flex', alignItems: 'center', gap: 9, width: '100%',
          padding: '9px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
          border: `1px solid ${campfire > 0 ? theme.accent : theme.border}`,
          background: campfire > 0 ? `${theme.accent}1a` : 'transparent',
          color: campfire > 0 ? theme.accent : theme.textMuted,
          fontSize: 13.5, fontWeight: 700,
        }}
      >
        <Flame size={16} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>{MAIN_ROOM.name}</span>
        {campfire > 0 ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
            background: theme.accent, color: '#fff', fontSize: 10.5, fontWeight: 800,
          }}>{campfire}</span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.8 }}>Empty</span>
        )}
      </button>

      {busy.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {busy.slice(0, 3).map(slug => pill(slug, roomMeta(slug).name, counts[slug], null))}
        </div>
      )}

      <button
        onClick={() => navigate('/rooms')}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '2px 2px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: theme.textMuted, fontSize: 11, fontWeight: 600,
        }}
      >
        <Plus size={11} /> Side rooms
      </button>
    </div>
  )
}
