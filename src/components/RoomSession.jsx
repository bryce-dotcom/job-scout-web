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
  useTracks, useSpeakingParticipants, useLocalParticipant, ControlBar,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'
import { Minus, Maximize2, PhoneOff, VideoOff, Sparkles } from 'lucide-react'
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
  const [occupants, setOccupants] = useState({}) // slug -> their names, for the circle
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
        const who = {}
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            if (!entry?.room) continue
            next[entry.room] = (next[entry.room] || 0) + 1
            // Names, not just a tally: the lobby draws people sitting round
            // the fire, and "3 people" cannot be sat anywhere.
            if (!who[entry.room]) who[entry.room] = []
            who[entry.room].push(entry.name || 'Someone')
          }
        }
        setCounts(next)
        setOccupants(who)
      })
      // An open tab is not a person: room is null until you are actually in
      // one, and the count above skips anyone whose room is null.
      .subscribe(async (s) => {
        if (s === 'SUBSCRIBED') await channel.track({ room: slug || null, name: displayName, at: Date.now() })
      })
    return () => { supabase.removeChannel(channel) }
  }, [companyId, slug, displayName, me?.id, user?.email])

  const value = useMemo(
    () => ({ slug, status, join, leave, expanded, setExpanded, counts, occupants }),
    [slug, status, join, leave, expanded, counts, occupants],
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
          blurKey={`campfire.blur.${me?.id || user?.email || "anon"}`}
        />
      )}
    </RoomSessionContext.Provider>
  )
}

// What actually went wrong with the camera, in words a tech on a roof can
// act on. "Device error" sends people to IT; "click the padlock" does not.
//
// LiveKit buckets everything it does not recognise into "Other", and that
// bucket is a dead end — it is what Bryce hit. So when we land there we ask
// the browser ourselves: count the cameras, and try a PLAIN getUserMedia with
// no constraints. If the plain one works while LiveKit's failed, the fault is
// the quality we asked for, not the device — which is a different fix and
// nobody could have guessed it from "could not start".
function deviceMessage({ failure, kind }, detail) {
  const thing = kind === 'audioinput' ? 'microphone' : 'camera'
  if (failure === 'PermissionDenied') return `Your browser is blocking the ${thing}. Click the padlock in the address bar, allow it, then rejoin.`
  if (failure === 'NotFound') return `No ${thing} found on this device. You can still see and hear everyone else.`
  if (failure === 'DeviceInUse') return `Another app is using the ${thing} — close it and rejoin.`

  if (!detail) return `Checking why the ${thing} did not start…`
  // Browsers only hand out a camera on a secure origin. Open the app on a
  // plain http:// address — a LAN IP, a staging box without a certificate —
  // and navigator.mediaDevices is simply not there. LiveKit files that under
  // "Other", and no amount of clicking Allow will ever fix it, because there
  // is nothing to allow.
  if (detail.insecure) return `This page is not on a secure (https) address, so the browser will not give it a ${thing} at all. Open JobScout on its https:// address and rejoin.`
  if (detail.count === 0) return `Windows is not offering this browser a ${thing} at all. Check Settings → Privacy & security → ${kind === 'audioinput' ? 'Microphone' : 'Camera'} and allow desktop apps.`
  if (detail.plainWorks) return `Your ${thing} works, but not at the quality we asked for. Pick a different ${thing} from the arrow beside the button — or tell Bryce and this gets fixed properly.`
  if (detail.name === 'NotReadableError' || detail.name === 'TrackStartError') return `Another app is holding the ${thing} — Teams, Zoom or OBS in the tray. Close it and rejoin.`
  // "Timeout starting video source". The browser asked Windows and Windows
  // never handed the device over — below the browser entirely, so allowing
  // the site again does nothing. Bryce lost an afternoon to this one, being
  // told to click the padlock on a permission that was already granted.
  if (detail.name === 'AbortError' || detail.name === 'TimeoutError') {
    // Name the APP, not the device. "Camera (NVIDIA Broadcast)" stripped of
    // its parenthetical reads "Camera takes it over", which is nonsense —
    // the whole point is inside the brackets. The regex match IS the app
    // name, in the label's own casing.
    const hog = (detail.labels || []).map(l => VIRTUAL_DEVICE.exec(l)).find(Boolean)
    if (hog) return `Windows will not release the ${thing}. ${hog[0]} takes it over — quit it from the system tray, not just its window, then restart your browser.`
    return `Windows never handed over the ${thing}. That is below the browser, so allowing it again will not help: close anything else that uses a ${thing}, restart your browser, and reboot if it keeps happening.`
  }
  if (detail.name === 'NotAllowedError') return `Your browser is blocking the ${thing}. Click the padlock in the address bar, allow it, then rejoin.`
  if (detail.name === 'OverconstrainedError') return `This ${thing} cannot do the quality we asked for. Tell Bryce — it is ours to fix, not yours.`
  return `The ${thing} could not start (${detail.name || 'unknown'}). ${detail.count} found. You can still see and hear everyone else.`
}

// Ask the browser directly, because LiveKit's "Other" tells us nothing.
// Apps that insert themselves between the hardware and the browser. When one
// of these is installed it usually OWNS the real camera, and when it is in a
// bad state nothing else can start it — including the physical camera it is
// wrapping. Naming the culprit saves the half hour of closing things at
// random that finding it the first time cost.
const VIRTUAL_DEVICE = /nvidia broadcast|obs virtual|streamlabs|snap camera|manycam|xsplit|camo|droidcam|epoccam|virtual camera/i

async function probeDevice(kind) {
  const want = kind === 'audioinput' ? 'audioinput' : 'videoinput'
  // Check this first: on an insecure origin navigator.mediaDevices does not
  // exist, so every call below would throw a TypeError that tells you
  // nothing about the real cause.
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || window.isSecureContext === false) {
    return { count: null, labels: [], plainWorks: false, name: null, insecure: true }
  }
  let count = null
  let labels = []
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const mine = devices.filter(d => d.kind === want)
    count = mine.length
    // Labels are only populated once permission is granted — which is itself
    // a signal: if we can read them, blocking is not the problem.
    labels = mine.map(d => d.label).filter(Boolean)
  } catch { /* enumerate can throw in locked-down browsers */ }

  // No constraints at all. Succeeding here while LiveKit failed is the
  // signal: the hardware is fine and our request was too demanding.
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      want === 'audioinput' ? { audio: true } : { video: true },
    )
    stream.getTracks().forEach(t => t.stop())
    return { count, labels, plainWorks: true, name: null }
  } catch (err) {
    return { count, labels, plainWorks: false, name: err?.name || null }
  }
}

function RoomDock({ theme, slug, ticket, status, message, expanded, setExpanded, onLeave, isDeveloper, blurKey }) {
  const [deviceIssue, setDeviceIssue] = useState(null)
  const [deviceDetail, setDeviceDetail] = useState(null)

  // Only runs when something actually failed, so the probe never asks for a
  // camera nobody wanted.
  useEffect(() => {
    if (!deviceIssue) { setDeviceDetail(null); return }
    let cancelled = false
    probeDevice(deviceIssue.kind).then(d => { if (!cancelled) setDeviceDetail(d) })
    return () => { cancelled = true }
  }, [deviceIssue])
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
                {deviceMessage(deviceIssue, deviceDetail)}
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <Stage expanded={expanded} />
            </div>
            <RoomAudioRenderer />
            <div style={{ borderTop: `1px solid ${theme.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
              <BlurToggle theme={theme} storageKey={blurKey} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <ControlBar variation="minimal" controls={{ camera: true, microphone: true, screenShare: true, chat: false, leave: false }} />
              </div>
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
// Background blur — the one thing people actually install NVIDIA Broadcast
// for, and the thing that broke Bryce's camera by sitting on it. Doing it
// here means nobody needs a virtual-camera app in front of the webcam.
//
// The processor and its segmentation model are several megabytes, so the
// module is imported only when somebody is actually in a call, never in the
// entry bundle. Off by default: segmentation runs on every frame, and an old
// laptop in a truck should not pay for a feature it was not asked about.
function BlurToggle({ theme, storageKey }) {
  const { cameraTrack } = useLocalParticipant()
  const [lib, setLib] = useState(null)
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(storageKey) === '1' } catch { return false }
  })

  useEffect(() => {
    let cancelled = false
    import('@livekit/track-processors')
      .then(m => { if (!cancelled && m.supportsBackgroundProcessors?.()) setLib(m) })
      .catch(() => { /* unsupported browser, or the model could not be fetched */ })
    return () => { cancelled = true }
  }, [])

  const track = cameraTrack?.track || null

  // Re-applied whenever the preference OR the track changes: turning the
  // camera off and on again produces a NEW track with no processor on it,
  // and without this the blur would silently fall off mid-call.
  useEffect(() => {
    if (!lib || !track) return
    let cancelled = false
    ;(async () => {
      try {
        const current = track.getProcessor?.()
        if (on && !current) {
          await track.setProcessor(lib.BackgroundProcessor({ mode: 'background-blur', blurRadius: 12 }))
        } else if (!on && current) {
          await track.stopProcessor()
        }
      } catch (err) {
        if (!cancelled) console.warn('[campfire] blur:', err?.message)
      }
    })()
    return () => { cancelled = true }
  }, [lib, track, on])

  if (!lib) return null

  const toggle = () => {
    const next = !on
    setOn(next)
    try { localStorage.setItem(storageKey, next ? '1' : '0') } catch { /* private window */ }
  }

  return (
    <button
      onClick={toggle}
      title={on ? 'Background blur is on' : 'Blur my background'}
      aria-pressed={on}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, marginRight: 6, borderRadius: 8, flexShrink: 0,
        cursor: 'pointer', border: `1px solid ${on ? theme.accent : theme.border}`,
        background: on ? theme.accentBg : 'transparent',
        color: on ? theme.accent : theme.textMuted,
      }}
    >
      <Sparkles size={15} />
    </button>
  )
}

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
    <div style={{ position: 'relative', flex: 1, minHeight: 160, background: '#000', display: 'flex' }}>
      {/* flex, not height:100% — a percentage height cannot resolve through an
          auto-height flex chain, and the tile silently computed to 0px: the
          dock went black while the participant was still in it. */}
      {hero && <ParticipantTile trackRef={hero} style={{ flex: 1, minWidth: 0 }} />}
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
