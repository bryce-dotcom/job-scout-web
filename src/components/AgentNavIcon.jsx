// The face of an agent in the menu.
//
// Every agent row in the nav drew the same generic <Bot/>, in the same purple,
// at every size — so Arnie, Jenny, Sal, Chris, Frankie and Don were nine
// identical dots. Bryce: "the little stars in the menu on the phone instead of
// Arnie or Jenny's pic looks cheap… we want it to be their personal assistant
// and cool as hell." He is right: a crew of assistants that all look the same
// is a list of features, not a crew.
//
// Three tiers, best first:
//
//   1. ARNIE — the real photo of whoever this person chose, Arnie or Jenny.
//      The persona already owns its picture; this just shows it where people
//      actually look.
//   2. ANY OTHER AGENT with artwork at /agents/<slug>.(jpg|png) — shown the
//      same way. Dropping a file in upgrades that agent with no code change,
//      which is how the rest of the crew gets faces without a release.
//   3. Otherwise that agent's OWN icon from the agents table — Radar for Sal,
//      Sparkles for Chris, DollarSign for Frankie. Still not a photo, but at
//      least they stop being interchangeable.

import { useState, useEffect } from 'react'
import * as Icons from 'lucide-react'
import AssistantAvatar from './AssistantAvatar'

/** '/agents/sal' → 'sal'. Tolerates a trailing slash, which the stored rows have. */
const slugOf = (agent) => String(agent?.route_path || '').split('/').filter(Boolean).pop() || ''

export default function AgentNavIcon({ agent, size = 14, color = '#a855f7' }) {
  const slug = slugOf(agent).toLowerCase()
  const [art, setArt] = useState(null)   // resolved artwork url, or null
  const [tried, setTried] = useState(false)

  // Arnie is handled by the persona avatar, so no probing needed for him.
  // Matched on the SLUG, not the whole route string: the stored
  // route_path is not always exactly "/agents/arnie".
  const isArnie = slug === 'arnie'

  useEffect(() => {
    if (isArnie || !slug) { setTried(true); return }
    let alive = true
    // Probe rather than render-and-hope: an <img> that 404s inside a 12px
    // nav row flashes a broken-image glyph, which looks worse than the icon
    // it replaced.
    const tryOne = (ext) => new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(`/agents/${slug}.${ext}`)
      img.onerror = () => resolve(null)
      img.src = `/agents/${slug}.${ext}`
    })
    ;(async () => {
      const found = (await tryOne('jpg')) || (await tryOne('png'))
      if (alive) { setArt(found); setTried(true) }
    })()
    return () => { alive = false }
  }, [slug, isArnie])

  if (isArnie) {
    return <AssistantAvatar size={size} style={{ width: size, height: size }} />
  }

  if (art) {
    return (
      <span style={{
        width: size, height: size, borderRadius: '50%', overflow: 'hidden',
        flexShrink: 0, display: 'inline-flex',
      }}>
        <img src={art} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </span>
    )
  }

  // That agent's own icon, not a shared one. Capitalised to match lucide's
  // export names, since the table holds 'bot' in some rows and 'Bot' in others.
  const raw = String(agent?.icon || 'Bot')
  const name = raw.charAt(0).toUpperCase() + raw.slice(1)
  const Icon = Icons[name] || Icons.Bot
  // Nothing to show until the probe finishes, or the icon would flash and be
  // replaced by the photo a moment later.
  return <Icon size={size} style={{ color, opacity: tried ? 1 : 0 }} />
}
