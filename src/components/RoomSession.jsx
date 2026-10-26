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

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  LiveKitRoom, RoomAudioRenderer, GridLayout, ParticipantTile,
  useTracks, useLocalParticipant, ControlBar,
} from '@livekit/components-react'
import { Track, ScreenSharePresets, VideoPresets } from 'livekit-client'
import '@livekit/components-styles'
import { Minus, Maximize2, PhoneOff, VideoOff, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useIsMobile } from '../hooks/useIsMobile'
import { roomMeta, MAIN_ROOM } from '../lib/conferenceRooms'
import { pickCameraInBrowser, micWorksInBrowser } from '../lib/cameraPicker'
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
  const [cameraId, setCameraId] = useState(null)   // the camera that actually opened
  const [cameraErrors, setCameraErrors] = useState(null)
  const [micError, setMicError] = useState(null)
  const [message, setMessage] = useState(null)
  const [expanded, setExpanded] = useState(false)

  const me = useMemo(
    () => (employees || []).find(e => e.email && user?.email && e.email.toLowerCase() === user.email.toLowerCase()) || null,
    [employees, user?.email],
  )
  const displayName = me?.name || user?.email || 'Someone'
  // Per person: a tech on a phone and the same tech on a laptop have
  // different cameras, so the remembered one is keyed to them, not shared.
  const camKey = `campfire.camera.${me?.id || user?.email || 'anon'}`

  const leave = useCallback(() => {
    setSlug(null); setTicket(null); setStatus('idle'); setMessage(null); setExpanded(false)
  }, [])

  const join = useCallback(async (nextSlug) => {
    if (!nextSlug) return
    setSlug(nextSlug); setTicket(null); setStatus('joining'); setMessage(null)
    const { data, error } = await supabase.functions.invoke('room-token', {
      body: { slug: nextSlug, displayName },
    })
    if (error) { setStatus('error'); setMessage(joinErrorMessage(error)); return }
    if (data?.configured === false) { setStatus('unconfigured'); return }
    if (!data?.token || !data?.url) { setStatus('error'); setMessage('No ticket came back.'); return }

    // Find a camera that actually starts before handing over to LiveKit.
    //
    // LiveKit asks Windows for its "default" camera, and on a machine with a
    // virtual-camera app installed that default can be a device sitting in
    // front of the hardware which times out when the app behind it is not
    // running. One jammed virtual camera then means no video at all, while a
    // perfectly good webcam sits next to it unasked. Trying them in order
    // costs one getUserMedia on the way in and makes the call survive a
    // setup we do not control.
    let remembered = null
    try { remembered = localStorage.getItem(camKey) } catch { /* private window */ }
    // The microphone matters more than the camera and was never checked.
    // A dead camera is obvious to its owner; a dead mic is invisible to you
    // and only visible to everyone else.
    const mic = await micWorksInBrowser()
    setMicError(mic.ok ? null : (mic.name || 'Unknown'))

    const cam = await pickCameraInBrowser(remembered)
    setCameraId(cam.deviceId)
    setCameraErrors(cam.deviceId ? null : (cam.errors || []))
    if (cam.deviceId) { try { localStorage.setItem(camKey, cam.deviceId) } catch { /* ignore */ } }

    setTicket(data); setStatus('live')
  }, [displayName, camKey])

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
            // name AND id: the lobby draws a face at the fire, and a
            // headshot has to be looked up on the employee record.
            who[entry.room].push({ name: entry.name || 'Someone', id: entry.id ?? null })
          }
        }
        setCounts(next)
        setOccupants(who)
      })
      // An open tab is not a person: room is null until you are actually in
      // one, and the count above skips anyone whose room is null.
      .subscribe(async (s) => {
        if (s === 'SUBSCRIBED') await channel.track({ room: slug || null, name: displayName, id: me?.id ?? null, at: Date.now() })
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
          cameraId={cameraId}
          cameraErrors={cameraErrors}
          micError={micError}
          onRetry={() => join(slug)}
          blurKey={`campfire.blur.${me?.id || user?.email || "anon"}`}
        />
      )}
    </RoomSessionContext.Provider>
  )
}

// Why the microphone did not open, for the one person who cannot hear that
// it has not. Phones are the common case — Christopher joined from one and
// was silent to the room — so the advice names where the switch actually is
// on a phone rather than describing a desktop padlock.
function micMessage(name) {
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Your browser is blocking the microphone. On a phone: Settings → the browser → Microphone. On a computer: the padlock in the address bar. Then rejoin.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found on this device.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Another app is using the microphone — a phone call, Teams or Zoom. Close it and try again.'
  }
  if (name === 'InsecureContext') {
    return 'This page is not on a secure (https) address, so it cannot use a microphone.'
  }
  return 'The microphone would not start. Check nothing else is using it, then try again.'
}

// Why joining failed, in words the person reading it can act on.
//
// Alayda, 2026-10-26, saw "Failed to send a request to the Edge Function".
// That is supabase-js's wording for a request that never got a reply AT ALL
// — not a refusal, not a server error, no response. It tells her nothing,
// and it reads like the product is broken when the usual causes are on the
// machine in front of her: an ad blocker or privacy extension swallowing
// requests to supabase.co, a VPN or work network blocking it, or simply
// being offline for a moment.
//
// Checked at the time: the function was healthy from outside — 401 without
// a token, CORS preflight 200. So the honest message names the likely cause
// rather than passing a library's internal phrasing to an office manager.
function joinErrorMessage(error) {
  const text = [error?.message, error?.name, error?.context?.statusText].filter(Boolean).join(' ')

  // The network never reached us.
  if (/failed to send|fetch|network|load failed/i.test(text)) {
    return 'Could not reach the meeting service. Check your internet, and if you use an ad blocker or VPN, allow supabase.co — that is usually what stops it.'
  }
  if (/sign in|unauthor|401|jwt|token/i.test(text)) {
    return 'Your session has expired. Sign out and back in, then try again.'
  }
  if (/5\d\d/.test(text)) {
    return 'The meeting service had a problem. Try again in a moment.'
  }
  return error?.message || 'Could not get in.'
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

// We tried every camera on the machine and none of them started. Say which,
// and say the useful thing — not "device error".
function triedEveryCameraMessage(errors = []) {
  const first = errors[0]?.name
  if (first === 'InsecureContext') return 'This page is not on a secure (https) address, so the browser will not give it a camera. Everyone can still hear you.'
  if (first === 'NotFound' || errors.length === 0) return 'No camera on this device. Everyone can still hear you.'
  if (errors.every(e => e.name === 'NotAllowedError')) return 'Your browser is blocking the camera. Click the padlock in the address bar, allow it, then rejoin.'
  const n = errors.length
  // "all 2 cameras" is the sort of phrasing that makes software feel
  // machine-written. Two is "either".
  const where = n === 1 ? 'your camera' : n === 2 ? 'either of your cameras' : `any of your ${n} cameras`
  return `Windows would not start ${where}, so you have joined with audio only. On a laptop this is usually a camera privacy switch — an F-key with a camera on it, a shutter on the bezel, or Camera Privacy Mode in the maker's app.`
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

function RoomDock({ theme, slug, ticket, status, message, expanded, setExpanded, onLeave, isDeveloper, blurKey, cameraId, cameraErrors, micError, onRetry }) {
  const isMobile = useIsMobile()
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
  // A phone is not a small desktop.
  //
  // Bryce, 2026-10-23: "it's gotta be different for the phone and the
  // desktop — look at how Meet or Messenger does it." They all do the same
  // two things, and we were doing neither: minimised is a bar across the
  // FULL width at the bottom, not a floating card wedged into a corner with
  // a 16px margin; and expanded is the whole screen, not a panel inset
  // inside a page you cannot read anyway.
  //
  // On a desktop the floating card is right, because the whole point there
  // is that the call sits beside the work.
  const place = isMobile
    ? (expanded
        // paddingTop for the notch. An installed PWA on an iPhone is truly
        // full screen, so the status bar sits ON TOP of the first thing we
        // draw — which is the header carrying Minimise and Leave. Bryce,
        // 2026-10-23: "can't see the minimize button on the iPhone so they
        // can keep working." Trapped in a call is not a small bug.
        ? { left: 0, right: 0, top: 0, bottom: 0, width: 'auto', height: 'auto', borderRadius: 0, paddingTop: 'env(safe-area-inset-top, 0px)' }
        : { left: 0, right: 0, bottom: 'var(--jobscout-tabbar-space, 0px)', width: 'auto', height: 'auto', borderRadius: '14px 14px 0 0' })
    : (expanded
        // Expanded on a desktop means MAXIMISED, not "a tall panel across the
        // bottom". Bryce, 2026-10-26: "when I make the screen big it cuts the
        // screen in half" — exactly what min(72vh, 620px) anchored to the
        // bottom looks like on a large monitor: the call takes the lower
        // portion and the app keeps showing above it, so the screen reads as
        // split rather than as a call you opened up. Inset on all four sides
        // instead, which is what maximising a window looks like.
        ? { left: 16, right: 16, top: 16, bottom: `calc(16px + var(--jobscout-tabbar-space, 0px))`, width: 'auto', height: 'auto', borderRadius: 14 }
        : { left: 'auto', right: 16, bottom: `calc(16px + var(--jobscout-tabbar-space, 0px))`, width: 'min(340px, calc(100vw - 32px))', height: 'auto', borderRadius: 14 })

  const shell = {
    position: 'fixed',
    ...place,
    background: theme.bgCard,
    border: `1px solid ${theme.accent}`,
    boxShadow: isMobile && expanded ? 'none' : '0 12px 40px rgba(0,0,0,0.25)',
    zIndex: isMobile && expanded ? 1400 : 1200,
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
        {/* Full screen on a phone is where somebody gets stuck, so that is
            where the way out is biggest and labelled. An icon alone is a
            guess; "Minimise" is not. */}
        <button onClick={() => setExpanded(!expanded)} title={expanded ? 'Minimise and keep working' : 'Expand'}
          aria-label={expanded ? 'Minimise' : 'Expand'}
          style={isMobile && expanded
            ? { ...iconBtn(theme, true), width: 'auto', padding: '0 12px', gap: 6, fontSize: 13, fontWeight: 700, color: theme.text }
            : iconBtn(theme)}>
          {expanded ? <Minus size={isMobile ? 18 : 14} /> : <Maximize2 size={14} />}
          {isMobile && expanded && <span>Minimise</span>}
        </button>
        <button onClick={onLeave} title="Leave the room" aria-label="Leave"
          style={{ ...iconBtn(theme, isMobile && expanded), color: '#dc2626', borderColor: '#fecaca' }}>
          <PhoneOff size={isMobile && expanded ? 18 : 14} />
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
        {status === 'error' && (
          <Note theme={theme} tone="#dc2626">
            {message}
            {/* Most causes of a failed join are momentary — a dropped
                connection, a sleeping laptop. Making somebody close the dock
                and hunt for the fire again to retry is a poor answer. */}
            {onRetry && (
              <button
                onClick={onRetry}
                style={{
                  display: 'block', margin: '10px auto 0', padding: '5px 14px',
                  borderRadius: 999, border: '1px solid #dc2626', background: 'transparent',
                  color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Try again
              </button>
            )}
          </Note>
        )}
        {status === 'joining' && <Note theme={theme}>Walking in…</Note>}
        {status === 'live' && ticket && (
          <LiveKitRoom
            token={ticket.token}
            serverUrl={ticket.url}
            connect
            // Audio always. Video only when a camera actually opened — joining
            // without one is a normal call, not a failure, and a tech in a van
            // should still hear everyone.
            video={cameraId ? true : false}
            audio
            // Audio loses to video on a thin connection, and that is what
            // "I can't hear you very well" usually is.
            //
            // The answer here is SIMULCAST, which is on by default and was
            // never the problem: every camera publishes h180 and h360 beside
            // the capture resolution, and the server forwards whichever layer
            // a receiver can actually take. That is the automatic adjustment
            // to a weak connection, and it needs nothing from us.
            //
            // The capture settings are deliberately untouched: echo
            // cancellation, noise suppression, auto gain and voice isolation
            // are all already on by default, and "fixing" them would be
            // theatre.
            options={{
              // Both OFF again, deliberately.
              //
              // I turned them on to stop video starving audio, and Bryce's
              // report after was "super laggy and the sound is worse than
              // ever" — two people, both on wifi. adaptiveStream renegotiates
              // the layer every time a tile changes size, and dynacast churns
              // subscriptions; in a two-person call they buy almost nothing
              // and the renegotiation is itself the stutter.
              //
              // The same end is reached by making video cheap by
              // construction instead: capture at 540p rather than 720p, so
              // there is simply less to send and nothing to renegotiate. A
              // dock-sized tile cannot tell the difference.
              // OFF, now on evidence rather than on a hunch.
              //
              // It went off on 10-23 alongside a resolution drop, so the two
              // were never separated and I was guessing. This morning it came
              // back ON with the resolution left at 720p, which isolated it,
              // and Bryce's report hours later was "pretty glitchy" — the
              // same word as last time, from the same change.
              //
              // That is a real result, so it goes off and stays off: twice
              // asked for, twice glitchy. 720p stays, because that was the
              // OTHER variable and it is what fixed the graininess.
              //
              // Nothing is lost for a weak connection. Simulcast is still on
              // by default, so every camera publishes h180 and h360 beside
              // the 720p, and the server forwards whichever layer a receiver
              // can take. Adjusting to the CONNECTION never depended on this;
              // only adjusting to the tile's SIZE did, and a slightly
              // oversized stream beats a stuttering one.
              adaptiveStream: false,
              dynacast: false,
              // Screen share ships at 1080p FIFTEEN frames a second by
              // default, which is why a scrolling spreadsheet judders.
              // 30fps costs more bandwidth and is the whole point of
              // sharing a screen somebody has to read while it moves.
              publishDefaults: { screenShareEncoding: ScreenSharePresets.h1080fps30.encoding },
              // The camera we already proved opens, rather than whatever
              // Windows calls "default" — which on a machine with a virtual
              // camera installed may be a device that times out.
              videoCaptureDefaults: {
                // 540p, not the 720p default: 800kbps against 1.7Mbps, for a
                // picture nobody can tell apart in a dock. Video is the thing
                // that makes audio stutter on a domestic connection, and the
                // cheapest fix is to send less of it.
                // 720p is the TOP layer, not the only one.
                //
                // Bryce, 2026-10-26: "the pixel is grainy, can it auto adjust
                // the clarity according to the connection or the size?"
                //
                // It already adjusts to the CONNECTION — simulcast is on by
                // default, so every camera publishes h180 and h360 alongside
                // this, and the server forwards whichever layer the receiver
                // can actually take. Capping capture at 540p did not make
                // that smarter, it just removed the sharp layer, so a tile
                // filling a maximised window had nothing good to show.
                resolution: VideoPresets.h720,
                // The camera we already proved opens, rather than whatever
                // Windows calls "default".
                ...(cameraId ? { deviceId: cameraId } : {}),
              },
            }}
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
            {/* Two ways video can be missing, and they need different words.
                cameraErrors means we tried every camera on the machine before
                connecting and none started — LiveKit never got as far as
                failing, so without this the dock would say nothing at all. */}
            {/* The mic comes FIRST, above any camera complaint. Being unable
                to see somebody is a nuisance; being unable to hear them ends
                the meeting, and the person it is happening to is the only one
                who cannot tell. */}
            {micError && (
              <div style={{
                padding: '7px 10px', fontSize: 11.5, lineHeight: 1.4, flexShrink: 0,
                background: '#fee2e2', color: '#991b1b', borderBottom: '1px solid #fecaca',
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              }}>
                <span><strong>Nobody can hear you.</strong> {micMessage(micError)}</span>
                {onRetry && (
                  <button
                    onClick={onRetry}
                    style={{
                      padding: '1px 8px', borderRadius: 999, border: '1px solid #991b1b',
                      background: 'transparent', color: '#991b1b', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Try again
                  </button>
                )}
              </div>
            )}
            {(cameraErrors?.length || deviceIssue) && (
              <div style={{
                padding: '7px 10px', fontSize: 11.5, lineHeight: 1.4, flexShrink: 0,
                background: '#fef3c7', color: '#92400e', borderBottom: '1px solid #fde68a',
              }}>
                {cameraErrors?.length
                  ? triedEveryCameraMessage(cameraErrors)
                  : deviceMessage(deviceIssue, deviceDetail)}
                {/* Flipping a privacy switch does not reach a call that has
                    already started, and leaving and rejoining to find out is
                    a lot to ask of someone mid-conversation. This re-runs the
                    camera hunt and reconnects with whatever it finds. */}
                {cameraErrors?.length > 0 && onRetry && (
                  <button
                    onClick={onRetry}
                    style={{
                      marginLeft: 6, padding: '1px 8px', borderRadius: 999,
                      border: '1px solid #92400e', background: 'transparent',
                      color: '#92400e', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Try again
                  </button>
                )}
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <Stage expanded={expanded} setExpanded={setExpanded} />
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
  //
  // Every change QUEUES behind the last one. setProcessor and stopProcessor
  // are async, and the first version fired them straight from the effect —
  // so toggling the camera while one was still in flight left livekit-client
  // reading `this.processor.processedTrack` off a processor that was either
  // half-built or already detached, and /rooms crashed for a real user on
  // 2026-10-26 with exactly that message. One chain, one operation at a time.
  const opRef = useRef(Promise.resolve())
  const trackRef = useRef(null)
  trackRef.current = track

  useEffect(() => {
    if (!lib || !track) return
    let cancelled = false
    const want = on

    opRef.current = opRef.current.then(async () => {
      // Checked AFTER the queue, not before: by the time our turn comes the
      // track may have been replaced or the call left. The old code set this
      // flag and then never looked at it except in the catch.
      if (cancelled) return
      try {
        const current = track.getProcessor?.()
        if (want && !current) {
          const processor = lib.BackgroundProcessor({ mode: 'background-blur', blurRadius: 12 })
          if (cancelled) return
          await track.setProcessor(processor)
        } else if (!want && current) {
          await track.stopProcessor()
        }
      } catch (err) {
        console.warn('[campfire] blur:', err?.message)
      }
    })

    return () => { cancelled = true }
  }, [lib, track, on])

  // Leaving the call must not leave a processor running on a track nobody
  // owns any more — that is the same detached-processor state from the other
  // direction, and it keeps a segmentation model churning after the dock has
  // gone.
  useEffect(() => () => {
    const leaving = trackRef.current
    opRef.current = opRef.current.then(async () => {
      try {
        if (leaving?.getProcessor?.()) await leaving.stopProcessor()
      } catch { /* the track is already gone, which is the outcome we wanted */ }
    })
  }, [])

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

function Stage({ expanded, setExpanded }) {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  )

  const share = tracks.find(t => t.source === Track.Source.ScreenShare)
  const cams = tracks.filter(t => t.source === Track.Source.Camera)

  // Open the dock the moment somebody shares.
  //
  // Nobody shares a screen so it can be looked at in a box the size of a
  // business card — a spreadsheet at 340px wide is unreadable however good
  // the stream is. (This was originally justified by adaptiveStream needing
  // a big element to fetch a big layer; that is off now, and the UX reason
  // is the one that was always doing the work.) Only on the way IN, so
  // collapsing it again is still your call.
  const sharing = !!share
  useEffect(() => {
    if (sharing && !expanded) setExpanded?.(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing])

  // A shared screen takes the whole stage, for everybody including whoever
  // is sharing it.
  //
  // Bryce, 2026-10-26: "sharing screen doesn't work real well, it's a small
  // guy for the other user that she can't click on, and I can't see what I'm
  // sharing."
  //
  // Both were FocusLayoutContainer. It is a CSS grid that divides its space
  // between a focused tile and a carousel of the rest, so the share arrived
  // as ONE CELL rather than as the thing everyone turned to look at — small,
  // with nothing to click to make it bigger. Hand-rolled here instead, so
  // the share fills the stage and the faces sit over it as thumbnails.
  //
  // object-fit: contain, not cover. A screen is the wrong shape for the box
  // it lands in, and cover CROPS — you would lose the edges of the very
  // spreadsheet you are being shown. Letterboxing is correct for a screen
  // even though it is wrong for a face.
  if (share) {
    const faces = cams.slice(0, 4)
    return (
      <div className="cf-share-stage" style={{ position: 'relative', height: '100%', background: '#000', display: 'flex' }}>
        <ParticipantTile trackRef={share} style={{ flex: 1, minWidth: 0 }} />
        {faces.length > 0 && (
          <div style={{
            position: 'absolute', right: 8, top: 8, zIndex: 2,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            {faces.map((t, i) => (
              <span
                key={(t.participant?.identity || 'p') + i}
                style={{
                  width: expanded ? 112 : 70, height: expanded ? 84 : 52,
                  borderRadius: 7, overflow: 'hidden', display: 'flex',
                  border: '1px solid rgba(255,255,255,0.45)', background: '#000',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
                }}
              >
                <ParticipantTile trackRef={t} style={{ flex: 1, minWidth: 0 }} />
              </span>
            ))}
          </div>
        )}
        <style>{`
          .cf-share-stage > .lk-participant-tile video { object-fit: contain !important; background: #000; }
        `}</style>
      </div>
    )
  }

  // THE RULE, and it is the one FaceTime and Messenger use: the people you
  // are talking TO fill the frame, and you are a small square in the corner,
  // always.
  //
  // Bryce, 2026-10-23: "what it should do is show everyone else big and me
  // small all the time." The speaker-switching this replaces was actively
  // wrong — hero preferred whoever was SPEAKING, so the moment he opened his
  // mouth he replaced Alayda with himself, which is the opposite of what a
  // call is for. Nobody needs to watch themselves talk.
  const me = cams.find(t => t.participant?.isLocal)
  const remotes = cams.filter(t => !t.participant?.isLocal)
  // Alone in the room, you are the only thing to show — a black rectangle
  // would read as broken.
  const stage = remotes.length > 0 ? remotes : (me ? [me] : [])
  const selfIsOnStage = remotes.length === 0

  if (expanded) {
    return (
      <div style={{ position: 'relative', height: '100%' }}>
        <GridLayout tracks={stage} style={{ height: '100%' }}>
          <ParticipantTile />
        </GridLayout>
        {me && !selfIsOnStage && (
          <span style={{
            position: 'absolute', right: 12, bottom: 12, zIndex: 2,
            width: 128, height: 96, borderRadius: 9, overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.5)', background: '#000',
            boxShadow: '0 2px 8px rgba(0,0,0,0.45)', display: 'flex',
          }}>
            <ParticipantTile trackRef={me} style={{ flex: 1, minWidth: 0 }} />
          </span>
        )}
      </div>
    )
  }

  const hero = stage[0]
  const others = Math.max(0, remotes.length - 1)

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 160, background: '#000', display: 'flex' }}>
      {/* flex, not height:100% — a percentage height cannot resolve through an
          auto-height flex chain, and the tile silently computed to 0px: the
          dock went black while the participant was still in it. */}
      {hero && <ParticipantTile trackRef={hero} style={{ flex: 1, minWidth: 0 }} />}
      {/* You, small, in the corner.
          Bryce, 2026-10-23: "you can't see yourself." True, and it was my
          doing: the small view shows whoever is TALKING and deliberately
          prefers anybody but you, so the one face never on screen was your
          own. Every other call app puts you in a corner for the same reason
          — you cannot tell you are badly lit, off-centre or frozen unless
          you can see it. Hidden when you are the hero, so you never appear
          twice. */}
      {me && !selfIsOnStage && (
        <span style={{
          position: 'absolute', left: 8, bottom: 8, zIndex: 2,
          width: 72, height: 54, borderRadius: 7, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.5)', background: '#000',
          boxShadow: '0 2px 6px rgba(0,0,0,0.4)', display: 'flex',
        }}>
          <ParticipantTile trackRef={me} style={{ flex: 1, minWidth: 0 }} />
        </span>
      )}
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

// 26px is a fine target for a mouse and a poor one for a thumb. The way out
// of a call is the one control that must never be fiddly.
const iconBtn = (theme, big = false) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: big ? 38 : 26, height: big ? 38 : 26,
  borderRadius: big ? 10 : 7, cursor: 'pointer', flexShrink: 0,
  border: `1px solid ${theme.border}`, background: 'transparent', color: theme.textMuted,
})
