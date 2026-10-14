// The machine, as a thing you are watching — not a row in a settings page.
//
// What this replaced was a white card with a coloured dot, a line of text and
// three buttons of equal weight: Refresh, Add a computer, Stop Arnie here.
// Everything on that page looked the same, so nothing read as more important
// than anything else, and the most important control on it — the one that
// takes his hands off your computer — was a small grey button in the middle
// of a row.
//
// THE THINKING. This page is the trust surface of the whole feature. A person
// looking at it wants three things in this order: is he on my machine, what
// is he doing right now, and how do I stop him. So that is the order, and the
// stop is a full-width control of its own with nothing competing beside it.
//
// It is dark, like Arnie's own panel, because this is HIM — the rest of the
// page is the paperwork around him. The contours carry the state: green while
// he works, amber while he waits on you, quiet olive when he is idle, grey
// when he is stopped. On a page this long, that colour is the thing you read
// from across the room.

import { Monitor, Power, RefreshCw, Download } from 'lucide-react'
import Contours from '../../../components/Contours'
import ScoutLoader from '../../../components/ScoutLoader'

const c = {
  ink: '#14181a', panel: '#1c2124', edge: '#2b3238',
  text: '#ece9e4', dim: '#9aa29c', faint: '#6d756f',
  sage: '#8aa07a', live: '#4ca96a', amber: '#d99429', stop: '#d9674f',
}

const STATE = {
  working: { tint: c.live, word: 'Working' },
  waiting: { tint: c.amber, word: 'Waiting on you' },
  idle: { tint: c.sage, word: 'Ready' },
  stale: { tint: c.amber, word: 'Not answering' },
  blocked: { tint: c.faint, word: 'Stopped' },
}

const PLATFORM = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }

const ago = (iso) => {
  if (!iso) return ''
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

// `who` is the assistant's short name — this panel said "him" and "Arnie" to
// people whose assistant is Jenny.
export default function MachinePanel({ who = 'Arnie', session, status, connected, busy, outOfDate, connecting = false, checking = false, checkedAt = null, onRefresh, onStop, onGetAgent }) {
  const st = STATE[status?.state] || STATE.idle
  const live = session?.status === 'live'

  return (
    <div style={{
      position: 'relative', overflow: 'hidden', textAlign: 'left',
      background: `linear-gradient(160deg, ${c.panel} 0%, ${c.ink} 72%)`,
      border: `1px solid ${c.edge}`, borderRadius: 18, padding: 18, marginBottom: 14,
    }}>
      <Contours tint={st.tint} />
      {/* Declared here so the panel is self-contained — it is rendered inside
          the drawer as well as the page, and a keyframe defined somewhere
          else is a keyframe that goes missing in one of them. */}
      <style>{'@keyframes jsSpin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }'}</style>

      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13 }}>
          <span style={{
            width: 46, height: 46, borderRadius: 13, flexShrink: 0,
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.edge}`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
          }}>
            <Monitor size={21} style={{ color: st.tint }} />
            {live && (
              <span style={{
                position: 'absolute', right: -4, top: -4, width: 11, height: 11, borderRadius: '50%',
                background: st.tint, boxShadow: `0 0 0 3px ${c.panel}, 0 0 10px ${st.tint}`,
              }} />
            )}
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0, color: c.text, fontSize: 20, fontWeight: 800,
              letterSpacing: '-0.02em', lineHeight: 1.15,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {session?.device_label || 'No computer yet'}
            </h2>
            <div style={{
              margin: '4px 0 0', color: c.faint, fontSize: 10.5, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              {session
                ? [PLATFORM[session.platform] || session.platform, session.agent_version && `agent ${session.agent_version}`]
                  .filter(Boolean).join(' · ')
                : 'Nothing connected'}
            </div>
          </div>

          {/* The word for the state, as a plain label rather than a pill —
              the colour is already doing the work twice over. */}
          <span style={{
            color: st.tint, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
            textTransform: 'uppercase', flexShrink: 0, marginTop: 3, whiteSpace: 'nowrap',
          }}>{st.word}</span>
        </div>

        {/* WHEN HE IS ACTUALLY DOING SOMETHING, the scout walks. There was
            no sign at all that anything was happening — the panel looked the
            same whether he was mid-action or idle, which is unnerving for a
            thing with hands on your machine. */}
        {status?.state === 'working' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0 0' }}>
            <ScoutLoader
              size={40}
              label={null}
              theme={{ text: c.text, textMuted: c.faint, border: c.edge, bgCard: c.panel }}
              style={{ padding: 0 }}
            />
            <p style={{ margin: 0, color: c.text, fontSize: 14.5, lineHeight: 1.45 }}>
              {status.detail}
            </p>
          </div>
        ) : (
          <p style={{ margin: '14px 0 0', color: c.dim, fontSize: 14.5, lineHeight: 1.5 }}>
            {status?.detail || `Put ${who} on a computer, to work in your programs alongside you.`}
          </p>
        )}
        {live && session?.last_seen_at && (
          <p style={{ margin: '3px 0 0', color: c.faint, fontSize: 11.5 }}>
            checked in {ago(session.last_seen_at)}
          </p>
        )}

        {/* AN AGENT THAT IS BEHIND. The launcher re-fetches on every start,
            so restarting it is the whole fix — but a copy left running for
            weeks never does, and nobody was told. A live session was taking
            screenshots it was allowed to take, which came back with no
            picture, because its agent predated them. */}
        {connected && outOfDate && (
          <p style={{ margin: '12px 0 0', color: c.amber, fontSize: 12.5, lineHeight: 1.45 }}>
            This agent is an older build. Close its window on that computer and open
            JobScout Agent again — it updates itself on the way up.
          </p>
        )}

        {/* What this machine cannot do, from the machine itself. On a Mac this
            is the difference between teaching working and recording nothing. */}
        {connected && session?.capabilities?.record === false && (
          <p style={{ margin: '10px 0 0', color: c.amber, fontSize: 12.5, lineHeight: 1.45 }}>
            This computer cannot watch the screen yet, so teaching would record nothing.
          </p>
        )}
        {connected && (session?.capabilities?.notes || []).map((n) => (
          <p key={n} style={{ margin: '6px 0 0', color: c.faint, fontSize: 12, lineHeight: 1.45 }}>{n}</p>
        ))}

        {/* The stop is alone and full width. It used to be one of three grey
            buttons in a row, which is not what the most serious control on
            the page should look like. */}
        {/* WHAT TO DO ABOUT IT, when it is not answering.
            The panel said NOT ANSWERING and then offered, as its biggest
            reddest button, "Stop Jenny on this computer" — stop a thing that
            had already stopped. The way back was "Add one", a grey button
            that sounds like buying a second machine. The buttons were keyed
            off the session row saying 'live', which it still does for hours
            after the agent has gone; only the heartbeat knows. */}
        {live && !connected && (
          <div style={{
            marginTop: 14, padding: '11px 13px', borderRadius: 11,
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${c.edge}`,
            color: c.dim, fontSize: 13, lineHeight: 1.5,
          }}>
            Open <strong style={{ color: c.text }}>JobScout Agent</strong> again on that computer
            — the same file you ran before, in your Downloads. It picks up where it left off and
            this turns green on its own.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {connected ? (
            <button onClick={onStop} disabled={busy} style={{
              flex: 1, minWidth: 180, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, background: 'rgba(217,103,79,0.14)', color: c.stop,
              border: `1px solid rgba(217,103,79,0.45)`, borderRadius: 12,
              padding: '12px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', minHeight: 48,
            }}>
              <Power size={16} /> Stop {who} on this computer
            </button>
          ) : (
            <button onClick={onGetAgent} style={{
              flex: 1, minWidth: 180, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, background: c.sage, color: c.ink, border: 'none', borderRadius: 12,
              padding: '12px 14px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', minHeight: 48,
            }}>
              <Download size={16} /> {connecting ? 'Hide the setup' : `Put ${who} on this computer`}
            </button>
          )}
          {/* "the check button does nothing" — reported twice. It was wired
              to the page's shared `busy` flag, which the refresh never set,
              so the spinner it already had could never spin; and when the
              answer was "still not answering", nothing on screen changed. It
              owns its own state now and says what it found, below. */}
          <button onClick={onRefresh} disabled={checking} title="Check again" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            background: 'rgba(255,255,255,0.04)', color: c.dim, border: `1px solid ${c.edge}`,
            borderRadius: 12, padding: '12px 14px', fontSize: 13, fontWeight: 600,
            cursor: checking ? 'default' : 'pointer', minHeight: 48, opacity: checking ? 0.75 : 1,
          }}>
            <RefreshCw
              size={15}
              style={checking ? { animation: 'jsSpin 0.9s linear infinite' } : undefined}
            /> {checking ? 'Checking…' : 'Check'}
          </button>
          {live && (
            <button onClick={onGetAgent} title="Connect another computer" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              background: 'rgba(255,255,255,0.04)', color: c.dim, border: `1px solid ${c.edge}`,
              borderRadius: 12, padding: '12px 14px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', minHeight: 48,
            }}>
              <Download size={15} /> Another computer
            </button>
          )}
        </div>

        {/* THE ANSWER, in words. A check whose result is "no change" is
            indistinguishable from a check that never ran — which is exactly
            what it looked like. */}
        {checkedAt && !checking && (
          <p style={{ margin: '10px 0 0', color: connected ? c.sage : c.faint, fontSize: 12.5 }}>
            {connected
              ? 'Answered just now.'
              : 'Checked just now — still nothing from that computer.'}
          </p>
        )}
      </div>
    </div>
  )
}
