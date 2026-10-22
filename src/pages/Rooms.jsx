// The conference rooms.
//
// Bryce, 2026-10-22: techs are on phones in the field, the office is on
// laptops, and there was nowhere in JobScout to just see each other. Base
// Camp is the main room and always exists; side rooms get opened on the spot
// and take the next free name off the topo list, so nobody has to invent one
// mid-conversation.
//
// This page is only the lobby. The call itself is held by RoomSession,
// above the router, so joining a room does not trap you here — you walk in
// and carry on working, and the dock follows you around the app.

import { useEffect, useMemo, useState } from 'react'
import { Video, Plus, Users, X, DoorOpen, Loader } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/ThemeContext'
import { toast } from '../lib/toast'
import { MAIN_ROOM, nextRoomName, occupancyLabel } from '../lib/conferenceRooms'
import { useRoomSession } from '../components/RoomSession'

export default function Rooms() {
  const theme = useTheme()
  const companyId = useStore(s => s.companyId)
  const user = useStore(s => s.user)
  const employees = useStore(s => s.employees)
  const session = useRoomSession()
  const joined = session?.slug || null

  const [rooms, setRooms] = useState([])
  const [headcount, setHeadcount] = useState({})
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)

  const me = useMemo(
    () => (employees || []).find(e => e.email && user?.email && e.email.toLowerCase() === user.email.toLowerCase()) || null,
    [employees, user?.email],
  )
  const myName = me?.name || user?.email || 'Someone'

  // The lobby list. Base Camp is not stored — it exists for every company,
  // so there is nothing to create before the first meeting.
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('conference_rooms')
        .select('id, slug, name, blurb, opened_by_name, created_at')
        .eq('company_id', companyId)
        .is('closed_at', null)
        .order('created_at')
      if (!cancelled) { setRooms(data || []); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [companyId])

  // Who is in which room, without asking the media server. Presence is
  // cheap and instant, and the lobby only needs a headcount — the real
  // participant list is whatever the call itself shows once you are in.
  useEffect(() => {
    if (!companyId) return
    const channel = supabase.channel(`rooms-lobby-${companyId}`, {
      config: { presence: { key: `${me?.id || user?.email || Math.random()}` } },
    })
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const counts = {}
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            if (!entry?.room) continue
            counts[entry.room] = (counts[entry.room] || 0) + 1
          }
        }
        setHeadcount(counts)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ room: joined || null, name: myName, at: Date.now() })
        }
      })
    return () => { supabase.removeChannel(channel) }
  }, [companyId, joined, myName, me?.id, user?.email])

  const openRoom = async () => {
    const taken = [...rooms.map(r => r.slug)]
    const pick = nextRoomName(taken)
    setOpening(true)
    try {
      const { data, error } = await supabase
        .from('conference_rooms')
        .insert({
          company_id: companyId, slug: pick.slug, name: pick.name, blurb: pick.blurb,
          opened_by: me?.id || null, opened_by_name: myName,
        })
        .select('id, slug, name, blurb, opened_by_name, created_at')
        .single()
      if (error) { toast.error('Could not open a room: ' + error.message); return }
      setRooms(prev => [...prev, data])
      session?.join(data.slug)
    } finally {
      setOpening(false)
    }
  }

  const closeRoom = async (room) => {
    if (!confirm(`Close ${room.name}? It disappears from the lobby. Anyone still talking stays connected.`)) return
    const { error } = await supabase.from('conference_rooms').update({ closed_at: new Date().toISOString() }).eq('id', room.id)
    if (error) { toast.error('Could not close it: ' + error.message); return }
    setRooms(prev => prev.filter(r => r.id !== room.id))
  }

  const all = [{ ...MAIN_ROOM, isMain: true }, ...rooms]

  return (
    <div style={{ padding: '20px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: theme.text, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Video size={22} style={{ color: theme.accent }} /> Rooms
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: theme.textSecondary, maxWidth: 560, lineHeight: 1.5 }}>
            Everyone gathers at Base Camp. Open a side room when a few of you need to go deep on
            something without holding up the rest.
          </p>
        </div>
        <button
          onClick={openRoom}
          disabled={opening}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
            background: theme.accent, color: '#fff', border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: opening ? 'wait' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          <Plus size={16} /> {opening ? 'Opening…' : 'Open a side room'}
        </button>
      </div>

      {loading ? (
        <Centered theme={theme}><Loader size={18} /> Looking around…</Centered>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 14 }}>
          {all.map(room => {
            const here = headcount[room.slug] || 0
            const live = here > 0
            return (
              <div
                key={room.slug}
                style={{
                  position: 'relative', background: theme.bgCard, borderRadius: 14,
                  border: `1px solid ${live ? theme.accent : theme.border}`,
                  padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
                  boxShadow: live ? `0 0 0 3px ${theme.accent}22` : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{room.name}</span>
                  {room.isMain && (
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: theme.accent, background: `${theme.accent}1f`, padding: '3px 7px', borderRadius: 999 }}>Main</span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.45, minHeight: 34 }}>{room.blurb}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: live ? theme.accent : theme.textMuted, fontWeight: live ? 700 : 500 }}>
                  <Users size={13} /> {occupancyLabel(here)}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <button
                    onClick={() => session?.join(room.slug)}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '9px 12px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      background: live ? theme.accent : theme.accentBg,
                      color: live ? '#fff' : theme.accent,
                      border: `1px solid ${theme.accent}`,
                    }}
                  >
                    <DoorOpen size={14} /> {live ? 'Join them' : 'Open it up'}
                  </button>
                  {!room.isMain && (
                    <button
                      onClick={() => closeRoom(room)}
                      title="Close this room"
                      style={{ padding: '9px 10px', borderRadius: 9, border: `1px solid ${theme.border}`, background: 'transparent', color: theme.textMuted, cursor: 'pointer' }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {room.opened_by_name && (
                  <div style={{ fontSize: 11, color: theme.textMuted }}>Opened by {room.opened_by_name}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Centered({ theme, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 60, color: theme.textMuted, fontSize: 14 }}>
      {children}
    </div>
  )
}
