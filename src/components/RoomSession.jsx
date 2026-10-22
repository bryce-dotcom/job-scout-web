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
  FocusLayout, FocusLayoutContainer, CarouselLayout,
  useTracks, useSpeakingParticipants, ControlBar,
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

// What actually went wrong with the camera, in words a tech on a roof can
// act on. "Device error" sends people to IT; "click the padlock" does not.
function deviceMessage({ failure, kind }) {
  const thing = kind === 'audioinput' ? 'microphone' : 'camera'
  if (failure === 'PermissionDenied') return `Your browser is blocking the ${thing}. Click the padlock in the address bar, allow it, then rejoin.`
  if (failure === 'NotFound') return `No ${thing} found on this device. You can still see and hear everyone else.`
  if (failure === 'DeviceInUse') return `Another app is using the ${thing} — close it and rejoin.`
  return `The ${thing} could not start. You can still see and hear everyone else.`
}

function RoomDock({ theme, slug, ticket, status, message, expanded, setExpanded, onLeave, isDeveloper }) {
  const [deviceIssue, setDeviceIssue] = useState(null)
  // Walking into a different room is a fresh start — the dock stays mounted
  // across a room change, so without this a warning from the last one follows
  // you in and reads as a fault with the room you just joined.
  useEffect(() => { setDeviceIssue(null) }, [slug])
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
            // Audio loses to video on a thin connection, and that is what
            // "I can't hear you very well" usually is. LiveKit captures at
            // 720p by default with BOTH of these off, so a dock the size of a
            // business card was being fed near-HD — upstream the office does
            // not have, competing with the one stream that actually matters.
            //
            // adaptiveStream asks only for the resolution the tile on screen
            // needs; dynacast stops sending layers nobody is looking at.
            // Expanding still gets full quality, because the layer is chosen
            // from what is rendered rather than fixed at join.
            //
            // The capture settings are deliberately untouched: echo
            // cancellation, noise suppression, auto gain and voice isolation
            // are all already on by default, and "fixing" them would be
            // theatre.
            options={{ adaptiveStream: true, dynacast: true }}
            onDisconnected={onLeave}
            // Without this a blocked camera is completely silent: you connect,
            // you see a grey avatar of yourself, and nothing anywhere says the
            // browser refused. People conclude the feature is broken.
            onMediaDeviceFailure={(failure, kind) => setDeviceIssue({ failure, kind })}
            // Flex column, not fixed heights. The stage used to be sized with
            // calc(100% - 50px) for the control bar, so the moment anything
            // else appeared above it — the camera warning — the controls got
            // pushed off the bottom edge. Let the box do the arithmetic.
            style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}
          >
            {deviceIssue && (
              <div style={{
                padding: '7px 10px', fontSize: 11.5, lineHeight: 1.4, flexShrink: 0,
                background: '#fef3c7', color: '#92400e', borderBottom: '1px solid #fde68a',
              }}>
                {deviceMessage(deviceIssue)}
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <Stage expanded={expanded} />
            </div>
            <RoomAudioRenderer />
            <div style={{ borderTop: `1px solid ${theme.border}`, flexShrink: 0 }}>
              <ControlBar variation="minimal" controls={{ camera: true, microphone: true, screenShare: true, chat: false, leave: false }} />
            </div>
          </LiveKitRoom>
        )}
      </div>
    </div>
  )
}

// How five faces fit in a box the size of a postcard.
//
// A grid is the obvious answer and it is the wrong one small: five tiles in
// a 340px dock is five thumbnails nobody can read, and the only thing anyone
// actually wants from a small window is to see WHO IS TALKING. So the dock
// is a speaker view and the expanded panel is a grid, and a screen share
// beats both because that is the thing everybody turned to look at.
function Stage({ expanded }) {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  )
  const speaking = useSpeakingParticipants()

  const share = tracks.find(t => t.source === Track.Source.ScreenShare)
  const cams = tracks.filter(t => t.source === Track.Source.Camera)

  // Somebody sharing their screen is the reason everyone is looking: it takes
  // the room, and the faces go into a strip beside it.
  if (share) {
    return (
      <FocusLayoutContainer style={{ height: '100%' }}>
        <FocusLayout trackRef={share} />
        {expanded && cams.length > 0 && (
          <CarouselLayout tracks={cams}><ParticipantTile /></CarouselLayout>
        )}
      </FocusLayoutContainer>
    )
  }

  // Expanded, there is room for everyone. GridLayout works out the rows and
  // columns for however many are in, so 2 and 9 both come out even.
  if (expanded) {
    return (
      <GridLayout tracks={cams} style={{ height: "100%" }}>
        <ParticipantTile />
      </GridLayout>
    )
  }

  // Collapsed: one face — whoever is speaking, else anybody but you, else
  // you — and a count so you know how many others are round the fire.
  const talking = new Set(speaking.map(p => p.identity))
  const hero = cams.find(t => talking.has(t.participant?.identity))
    || cams.find(t => !t.participant?.isLocal)
    || cams[0]
  const others = Math.max(0, cams.length - 1)

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 160, background: '#000' }}>
      {hero && <ParticipantTile trackRef={hero} style={{ height: '100%', width: '100%' }} />}
      {others > 0 && (
        <span
          title={`${others} other${others === 1 ? '' : 's'} in the room — expand to see everyone`}
          style={{
            position: 'absolute', right: 8, bottom: 8, zIndex: 2,
            padding: '2px 8px', borderRadius: 999, background: 'rgba(0,0,0,0.65)',
            color: '#fff', fontSize: 11, fontWeight: 700, pointerEvents: 'none',
          }}
        >
          +{others}
        </span>
      )}
    </div>
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
