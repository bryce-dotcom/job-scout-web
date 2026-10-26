// A client joining one meeting, with no account and no app around it.
//
// Bryce, 2026-10-23: "how can we share an outside link if we want to have a
// meeting with a client."
//
// Deliberately nothing but the call. No sidebar, no nav, no sign-in — a
// client clicking a link from their builder should see a name box and a
// Join button, and nothing that implies they ought to have an account. The
// page knows the invite token and nothing else: it cannot name the room it
// is joining, cannot see the company, and cannot reach the rest of JobScout.
//
// The server decides everything that matters. guest-room-token resolves the
// token to ONE FireSide and mints a LiveKit ticket for it; this page just
// shows what comes back.

import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  LiveKitRoom, RoomAudioRenderer, GridLayout, ParticipantTile,
  useTracks, ControlBar,
} from '@livekit/components-react'
import { Track, VideoPresets } from 'livekit-client'
import '@livekit/components-styles'
import CampfireMark from '../components/CampfireMark'
import { pickCameraInBrowser } from '../lib/cameraPicker'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guest-room-token`

export default function GuestRoom() {
  const { token } = useParams()
  const [name, setName] = useState('')
  const [ticket, setTicket] = useState(null)
  const [cameraId, setCameraId] = useState(null)
  const [status, setStatus] = useState('asking')   // asking | joining | live | error
  const [message, setMessage] = useState(null)

  const join = async (e) => {
    e?.preventDefault?.()
    setStatus('joining'); setMessage(null)

    // The same camera hunt employees get: a guest with a jammed virtual
    // camera should still get their real webcam, and a guest with no working
    // camera should still get into the meeting with audio.
    const cam = await pickCameraInBrowser(null)
    setCameraId(cam.deviceId)

    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, displayName: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setStatus('error'); setMessage(data?.error || 'This link did not work.'); return }
      if (data?.configured === false) { setStatus('error'); setMessage('Video is not switched on yet. Try again shortly.'); return }
      if (!data?.token || !data?.url) { setStatus('error'); setMessage('This link did not work.'); return }
      setTicket(data); setStatus('live')
    } catch {
      setStatus('error'); setMessage('Could not reach the meeting. Check your connection.')
    }
  }

  if (status === 'live' && ticket) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#0b0d0c', display: 'flex', flexDirection: 'column' }} data-lk-theme="default">
        <LiveKitRoom
          token={ticket.token}
          serverUrl={ticket.url}
          connect
          video={cameraId ? true : false}
          audio
          options={{
            adaptiveStream: false,
            dynacast: false,
            videoCaptureDefaults: {
              resolution: VideoPresets.h720,
              ...(cameraId ? { deviceId: cameraId } : {}),
            },
          }}
          onDisconnected={() => { setStatus('asking'); setTicket(null) }}
          style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ flex: 1, minHeight: 0 }}><GuestStage /></div>
          <RoomAudioRenderer />
          <div style={{ flexShrink: 0, borderTop: '1px solid #222' }}>
            <ControlBar variation="minimal" controls={{ camera: true, microphone: true, screenShare: true, chat: false, leave: true }} />
          </div>
        </LiveKitRoom>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, background: '#f7f5ef',
    }}>
      <form
        onSubmit={join}
        style={{
          width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16,
          border: '1px solid #d6cdb8', padding: 26, textAlign: 'center',
          boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <CampfireMark size={46} live id="cf-guest" />
        </div>
        <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#2c3530' }}>
          You&rsquo;re invited to a meeting
        </h1>
        <p style={{ margin: '0 0 18px', fontSize: 13.5, color: '#7d8a7f', lineHeight: 1.5 }}>
          No account needed. Put your name in so everyone knows who joined.
        </p>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={40}
          autoFocus
          style={{
            width: '100%', padding: '11px 13px', borderRadius: 10, fontSize: 15,
            border: '1px solid #d6cdb8', background: '#fff', color: '#2c3530',
            marginBottom: 10, boxSizing: 'border-box',
          }}
        />

        <button
          type="submit"
          disabled={!name.trim() || status === 'joining'}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none',
            background: name.trim() ? '#5a6349' : '#c9c9c0', color: '#fff',
            fontSize: 15, fontWeight: 700,
            cursor: name.trim() && status !== 'joining' ? 'pointer' : 'default',
          }}
        >
          {status === 'joining' ? 'Joining…' : 'Join the meeting'}
        </button>

        {message && (
          <p style={{ margin: '14px 0 0', fontSize: 13, color: '#b91c1c', lineHeight: 1.45 }}>{message}</p>
        )}
      </form>
    </div>
  )
}

// Everyone else fills the frame; the guest is a small square, the same rule
// the employees' dock uses, because it is the rule every call app uses.
function GuestStage() {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  )
  const share = tracks.find(t => t.source === Track.Source.ScreenShare)
  const cams = tracks.filter(t => t.source === Track.Source.Camera)
  const me = cams.find(t => t.participant?.isLocal)
  const remotes = cams.filter(t => !t.participant?.isLocal)
  const stage = share ? [share] : (remotes.length > 0 ? remotes : (me ? [me] : []))
  const selfIsOnStage = !share && remotes.length === 0

  return (
    <div className="cf-share-stage" style={{ position: 'relative', height: '100%' }}>
      {/* contain, not cover: a shared screen cropped to fill the box
          loses the edges of the thing you are being shown. */}
      <style>{`.cf-share-stage .lk-participant-tile video { object-fit: ${share ? 'contain' : 'cover'} !important; background: #000; }`}</style>
      <GridLayout tracks={stage} style={{ height: '100%' }}>
        <ParticipantTile />
      </GridLayout>
      {me && !selfIsOnStage && (
        <span style={{
          position: 'absolute', right: 12, bottom: 12, zIndex: 2,
          width: 116, height: 86, borderRadius: 9, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.5)', background: '#000',
          boxShadow: '0 2px 8px rgba(0,0,0,0.45)', display: 'flex',
        }}>
          <ParticipantTile trackRef={me} style={{ flex: 1, minWidth: 0 }} />
        </span>
      )}
    </div>
  )
}
