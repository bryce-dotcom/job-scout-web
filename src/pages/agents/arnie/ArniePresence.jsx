// Walking up to someone who is already working.
//
// What was here was the template every chatbot ships with: a circular avatar
// centred on the page, a name, an italic greeting in quotes, and a row of
// pill-shaped suggestion chips. It is competent and it is anonymous, and this
// product is not selling a chatbot — it is selling a person who works for you
// and can reach into your computer. "The UI I'm seeing is crap, you are way
// more creative than that."
//
// SO THE IDEA IS A CREW BADGE, not a chat header. On a job you do not meet
// somebody through a centred portrait; you see their name board, their face,
// and what they are on right now. Everything here follows from that:
//
//   · the portrait is a rounded BADGE crop, left-aligned, not a floating
//     circle — a thing clipped to a board rather than an avatar bubble;
//   · his name is set large, tight and in the app's own voice, with the role
//     line beneath it in small caps like a crew card;
//   · the greeting sits as a spoken line, not a decorative italic quote;
//   · and the live strip under it is the whole point — where he is, whether
//     he is on a machine, what he is waiting on. He is already at work.
//
// THE CONTOURS are the app's own motif (the topographic background it has
// everywhere at 6%) brought forward and made to mean something: they are
// drawn in the state's colour, so the panel reads green when he is working,
// amber when he is waiting on you, quiet olive when he is idle. The brand
// already owned this; it was being used as wallpaper.
//
// No new webfont: this ships inside a PWA that has to open on a job site with
// no signal, and a display face is not worth a blocking request. Hierarchy
// comes from weight, size, tracking and case instead.

import { useNavigate } from 'react-router-dom'
import { Monitor, ChevronRight } from 'lucide-react'
import AssistantAvatar from '../../../components/AssistantAvatar'
import Contours from '../../../components/Contours'

// Warm, not the cold blue-grey the panel used to be: the ground is a deep
// forest ink that belongs with the app's olive, and the highlight is ember
// rather than safety orange.
const c = {
  ink: '#14181a',
  panel: '#1c2124',
  edge: '#2b3238',
  text: '#ece9e4',
  dim: '#9aa29c',
  faint: '#6d756f',
  ember: '#e0893c',
  sage: '#8aa07a',
  live: '#4ca96a',
  amber: '#d99429',
}

const STATE = {
  working: { tint: c.live, label: 'Working' },
  waiting: { tint: c.amber, label: 'Waiting on you' },
  idle: { tint: c.sage, label: 'Ready' },
  stale: { tint: c.amber, label: 'Not answering' },
  blocked: { tint: c.faint, label: 'Stopped' },
}

/**
 * @param {object} p
 * @param {object} p.assistant  from useAssistant(): name, persona
 * @param {string} p.personaKey
 * @param {object|null} p.status   computerState() — { state, detail }
 * @param {string} p.companyName
 * @param {function} p.onIdentity  open the "who your assistant is" picker
 */
export default function ArniePresence({ assistant, personaKey, status, companyName, onIdentity }) {
  const navigate = useNavigate()
  const st = STATE[status?.state] || STATE.idle
  const onMachine = status?.state && status.state !== 'idle'
  // The strapline under the name said "him". assistant.name is already the
  // right name for whoever this person chose; this line is tight, so it takes
  // the first word of it.
  // Blank while the persona is unknown — a fallback of "Arnie" here was half
  // of the page-load flash on Jenny's page.
  const firstName = (assistant?.name || '').trim().split(/\s+/)[0]

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: `linear-gradient(160deg, ${c.panel} 0%, ${c.ink} 72%)`,
      border: `1px solid ${c.edge}`, borderRadius: 18,
      padding: 18, marginBottom: 14,
      // The welcome state it sits in is centred, which fought the badge and
      // left the name floating away from the face it belongs to.
      textAlign: 'left',
    }}>
      <Contours tint={st.tint} />

      <div style={{ position: 'relative', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {/* The badge crop. A square with a soft radius reads as an ID card;
            a circle reads as a chat avatar, which is what everything else is. */}
        <button
          onClick={onIdentity}
          title="Choose who your assistant is"
          style={{
            position: 'relative', padding: 0, border: 'none', background: 'none',
            cursor: 'pointer', flexShrink: 0, lineHeight: 0,
            borderRadius: 16, boxShadow: `0 0 0 1px ${c.edge}, 0 10px 24px rgba(0,0,0,0.35)`,
            overflow: 'hidden', width: 78, height: 78,
          }}
        >
          <AssistantAvatar size={78} persona={personaKey} style={{ borderRadius: 16 }} />
          <span style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)',
            color: c.text, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
            padding: '10px 0 3px', textTransform: 'uppercase',
          }}>Switch</span>
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{
            margin: 0, color: c.text, fontSize: 25, fontWeight: 800,
            letterSpacing: '-0.025em', lineHeight: 1.05,
          }}>{assistant.name}</h2>

          <div style={{
            margin: '5px 0 0', color: c.faint, fontSize: 10.5, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            Your assistant{companyName ? ` · ${companyName}` : ''}
          </div>

          {/* Said, not quoted. A greeting in italics inside curly quotes is a
              decoration; this is him talking. */}
          {assistant.known !== false && (
            <p style={{
              margin: '11px 0 0', color: c.dim, fontSize: 14.5, lineHeight: 1.5,
            }}>
              <span style={{ color: c.ember, fontWeight: 600 }}>&ldquo;</span>
              {assistant.persona.greeting}
              <span style={{ color: c.ember, fontWeight: 600 }}>&rdquo;</span>
            </p>
          )}
        </div>
      </div>

      {/* Where he is. The one line that says he is a thing already at work on
          a machine rather than a box you type into. */}
      <button
        onClick={() => navigate('/agents/arnie/computer')}
        style={{
          position: 'relative', marginTop: 16, width: '100%',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(255,255,255,0.035)', border: `1px solid ${c.edge}`,
          borderRadius: 12, padding: '11px 13px', cursor: 'pointer',
          textAlign: 'left', minHeight: 48,
        }}
      >
        <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
          <Monitor size={16} style={{ color: st.tint }} />
          {onMachine && (
            <span style={{
              position: 'absolute', right: -3, top: -3, width: 7, height: 7,
              borderRadius: '50%', background: st.tint, boxShadow: `0 0 0 2px ${c.panel}`,
            }} />
          )}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'block', color: c.text, fontSize: 13, fontWeight: 600,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {/* null = still checking. It used to say "Not on a computer yet"
                for the first few seconds even with the agent running. */}
            {status == null ? 'Checking for your computer…' : (status.detail || 'Not on a computer yet')}
          </span>
          <span style={{ display: 'block', color: c.faint, fontSize: 11.5, marginTop: 1 }}>
            {status == null ? '' : onMachine ? st.label : `Put ${firstName || 'your assistant'} on one, to work in your programs`}
          </span>
        </span>
        <ChevronRight size={16} style={{ color: c.faint, flexShrink: 0 }} />
      </button>
    </div>
  )
}
