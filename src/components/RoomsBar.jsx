// The way in: a fire, a name, and the word that says what it is for.
//
// Bryce, 2026-10-22: the button was too big and "nobody knows what the fuck
// the Campfire is". Both true. A pill reads as a control you have to make a
// decision about; a lit fire with CampFire beside it reads as a PLACE, and
// the little word underneath — collaborate — is the whole explanation anyone
// needs. No box, no border, no pill: the fire carries the colour, the text
// does the telling.
//
// It owns its own presence subscription rather than taking one from Layout,
// so Layout's hook count is untouched and this can be dropped anywhere.
// Presence is the right source: the lobby only needs a headcount, and asking
// the media server for one on every render would be absurd.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { MAIN_ROOM, roomMeta } from '../lib/conferenceRooms'
import { useRoomSession } from './RoomSession'
import CampfireMark from './CampfireMark'

export default function RoomsBar({ theme, compact = false }) {
  const navigate = useNavigate()
  const session = useRoomSession()
  const companyId = useStore(s => s.companyId)
  const [counts, setCounts] = useState({})

  useEffect(() => {
    if (!companyId) return
    // Read-only: this watches the lobby, it never announces anybody. The room
    // you are IN does the announcing — otherwise every open tab would read as
    // a person sitting at the fire.
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

  // One click does both jobs. Bryce, 2026-10-22: "I like that you click
  // CampFire and you're in — but make the UI open to the rooms page." So the
  // fire puts you in the room AND opens the lobby behind the dock, which is
  // what lets the menu item go away: the side rooms are already on screen
  // instead of being a second thing to go and find.
  const enter = (slug) => { session?.join(slug); navigate('/rooms') }

  const here = counts[MAIN_ROOM.slug] || 0
  const busy = Object.keys(counts).filter(s => s !== MAIN_ROOM.slug && counts[s] > 0)

  const count = (n) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 17, height: 17, padding: '0 5px', borderRadius: 999,
      background: '#f97316', color: '#fff', fontSize: 10.5, fontWeight: 800, flexShrink: 0,
    }}>{n}</span>
  )

  // On a phone the header already carries the menu and Feedback, so the fire
  // goes in on its own and the words come off.
  if (compact) {
    return (
      <button
        onClick={() => enter(MAIN_ROOM.slug)}
        aria-label={here > 0 ? `CampFire, ${here} inside` : 'CampFire'}
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: '4px 2px', cursor: 'pointer' }}
      >
        <CampfireMark size={22} live={here > 0} id="cf-m" />
        {here > 0 && count(here)}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <button
        onClick={() => enter(MAIN_ROOM.slug)}
        title={here > 0 ? `${here} at the CampFire — click to join them` : 'CampFire — start it up'}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
        }}
      >
        <CampfireMark size={28} live={here > 0} id="cf-d" />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.15 }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: theme.text, letterSpacing: '-0.01em' }}>
            CampFire
          </span>
          <span style={{ fontSize: 10, fontWeight: 500, color: theme.textMuted, letterSpacing: '0.06em' }}>
            collaborate
          </span>
        </span>
        {here > 0 && count(here)}
      </button>

      {/* A side room shows only while someone is in it. An empty room listed
          here is clutter, and the full set is one click away. */}
      {busy.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 38 }}>
          {busy.slice(0, 3).map(slug => (
            <button
              key={slug}
              onClick={() => enter(slug)}
              title={`${counts[slug]} in ${roomMeta(slug).name}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: 0,
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 600, color: theme.textMuted, whiteSpace: 'nowrap',
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: 999, background: '#f97316', flexShrink: 0 }} />
              {roomMeta(slug).name}
              <span style={{ opacity: 0.75 }}>{counts[slug]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
