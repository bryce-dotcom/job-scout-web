// Being in a room while you carry on working.
//
// Bryce, 2026-10-22: "you should still be able to be working on your
// computer." So the call cannot live on a page — a page unmounts the moment
// you open an estimate, and the call would drop every time somebody went to
// look something up. That is the difference between a feature people use and
// one they try once.
//
// The connection is held HERE, above the router, and rendered as a dock that
// floats over whatever you are doing. Navigate all you like: Layout does not
// unmount, so neither does the room. The lobby page only asks this provider
// to join; it never owns the connection itself.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  LiveKitRoom, RoomAudioRenderer, GridLayout, ParticipantTile,
  useTracks, ControlBar,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'
import { Minus, Maximize2, PhoneOff, VideoOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { roomMeta, MAIN_ROOM } from '../lib/conferenceRooms'
import CampfireMark from './CampfireMark'

const RoomSessionContext = createContext(null)
export const useRoomSession = () => useContext(RoomSessionContext)

export function RoomSessionProvider({ theme, children }) {
  const companyId = useStore(s => s.companyId)
  const user = useStore(s => s.user)
  const employees = useStore(s => s.employees)
  // Only the platform can switch video on — the keys are JobScout's, not a
  // tenant's. So a customer must never be told to go and add them.
  const isDeveloper = useStore(s => s.isDeveloper)
  const [slug, setSlug] = useState(null)
  const [ticket, setTicket] = useState(null)
  const [status, setStatus] = useState('idle')   // idle | joining | live | unconfigured | error
  const [counts, setCounts] = useState({})       // slug -> how many are in it
  const [message, setMessage] = useState(null)
  const [expanded, setExpanded] = useState(false)

  const me = useMemo(
    () => (employees || []).find(e => e.email && user?.email && e.email.toLowerCase() === user.email.toLowerCase()) || null,
    [employees, user?.email],
  )
  const displayName = me?.name || user?.email || 'Someone'

  const leave = useCallback(() => {
    setSlug(null); setTicket(null); setStatus('idle'); setMessage(null); setExpanded(false)
  }, [])

  const join = useCallback(async (nextSlug) => {
    if (!nextSlug) return
    setSlug(nextSlug); setTicket(null); setStatus('joining'); setMessage(null)
    const { data, error } = await supabase.functions.invoke('room-token', {
      body: { slug: nextSlug, displayName },
    })
    if (error) { setStatus('error'); setMessage(error.message || 'Could not get in.'); return }
    if (data?.configured === false) { setStatus('unconfigured'); return }
    if (!data?.token || !data?.url) { setStatus('error'); setMessage('No ticket came back.'); return }
    setTicket(data); setStatus('live')
  }, [displayName])

  // ONE presence channel for the whole app, owned here.
  //
  // There were three — this provider, RoomsBar and the lobby page — all on
  // the topic rooms-lobby-<company>, and only this one announcing. Several
  // channels on one topic in a single client do not reliably see each
  // other's presence, so the lobby could show "Empty" on a card while the
  // dock beside it said Connected, about the same person. One writer and one
  // reader, and everything downstream takes the count from here.
  useEffect(() => {
    if (!companyId) return
    const channel = supabase.channel(`rooms-lobby-${companyId}`, {
      config: { presence: { key: `${me?.id || user?.email || 'anon'}` } },
    })
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
      // An open tab is not a person: room is null until you are actually in
      // one, and the count above skips anyone whose room is null.
      .subscribe(async (s) => {
        if (s === 'SUBSCRIBED') await channel.track({ room: slug || null, name: displayName, at: Date.now() })
      })
    return () => { supabase.removeChannel(channel) }
  }, [companyId, slug, displayName, me?.id, user?.email])

  const value = useMemo(
    () => ({ slug, status, join, leave, expanded, setExpanded, counts }),
    [slug, status, join, leave, expanded, counts],
  )

  return (
    <RoomSessionContext.Provider value={value}>
      {children}
      {slug && (
        <RoomDock
          theme={theme}
          slug={slug}
          ticket={ticket}
          status={status}
          message={message}
          expanded={expanded}
          setExpanded={setExpanded}
          onLeave={leave}
          isDeveloper={isDeveloper}
        />
      )}
    </RoomSessionContext.Provider>
  )
}

function RoomDock({ theme, slug, ticket, status, message, expanded, setExpanded, onLeave, isDeveloper }) {
  const meta = roomMeta(slug)
  const isMain = slug === MAIN_ROOM.slug

  // Floating, bottom-right on a desktop and across the bottom on a phone,
  // and always ABOVE the bottom tab bar so it never covers navigation.
  const shell = {
    position: 'fixed',
    right: expanded ? 16 : 16,
    bottom: `calc(16px + var(--jobscout-tabbar-space, 0px))`,
    left: expanded ? 16 : 'auto',
    width: expanded ? 'auto' : 'min(340px, calc(100vw - 32px))',
    height: expanded ? 'min(72vh, 620px)' : 'auto',
    background: theme.bgCard,
    border: `1px solid ${theme.accent}`,
    borderRadius: 14,
    boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
    zIndex: 1200,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  return (
    <div style={shell} data-lk-theme="default">
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
        borderBottom: `1px solid ${theme.border}`, background: theme.bg,
      }}>
        {/* The same fire as the front door, lit while the call is up, so the
            dock is obviously the thing you clicked and not a stray window. */}
        {isMain && <CampfireMark size={16} live={status === 'live'} id="cf-dock" />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meta.name}
          </div>
          <div style={{ fontSize: 10.5, color: theme.textMuted }}>
            {status === 'live' ? 'Connected' : status === 'joining' ? 'Walking in…' : status === 'unconfigured' ? 'Video not connected' : 'Trouble'}
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} title={expanded ? 'Shrink' : 'Expand'}
          style={iconBtn(theme)}>
          {expanded ? <Minus size={14} /> : <Maximize2 size={14} />}
        </button>
        <button onClick={onLeave} title="Leave the room"
          style={{ ...iconBtn(theme), color: '#dc2626', borderColor: '#fecaca' }}>
          <PhoneOff size={14} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: expanded ? 0 : 150, position: 'relative' }}>
        {status === 'unconfigured' && (
          <Note theme={theme} icon={<VideoOff size={22} />}>
            {isDeveloper
              ? `${meta.name} is ready — the project has no LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET yet.`
              : 'Video is not switched on yet. Nothing for you to do — it will just start working.'}
          </Note>
        )}
        {status === 'error' && <Note theme={theme} tone="#dc2626">{message}</Note>}
        {status === 'joining' && <Note theme={theme}>Walking in…</Note>}
        {status === 'live' && ticket && (
          <LiveKitRoom
            token={ticket.token}
            serverUrl={ticket.url}
            connect
            video
            audio
            onDisconnected={onLeave}
            style={{ height: '100%', width: '100%' }}
          >
            <Stage expanded={expanded} />
            <RoomAudioRenderer />
            <div style={{ borderTop: `1px solid ${theme.border}` }}>
              <ControlBar variation="minimal" controls={{ camera: true, microphone: true, screenShare: expanded, chat: false, leave: false }} />
            </div>
          </LiveKitRoom>
        )}
      </div>
    </div>
  )
}

function Stage({ expanded }) {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  )
  return (
    <GridLayout tracks={tracks} style={{ height: expanded ? 'calc(100% - 50px)' : '160px' }}>
      <ParticipantTile />
    </GridLayout>
  )
}

function Note({ theme, children, tone, icon }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 8, padding: 18, textAlign: 'center', height: '100%',
      color: tone || theme.textSecondary, fontSize: 12.5, lineHeight: 1.5,
    }}>
      {icon}
      <span>{children}</span>
    </div>
  )
}

const iconBtn = (theme) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 26, borderRadius: 7, cursor: 'pointer', flexShrink: 0,
  border: `1px solid ${theme.border}`, background: 'transparent', color: theme.textMuted,
})
