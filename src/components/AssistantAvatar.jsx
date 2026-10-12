// The assistant's face, in one place.
//
// /og-arnie.png was hardcoded in four separate components — the chat, the
// floating corner panel twice, and the onboarding banner. Giving somebody a
// choice of assistant while three of those kept showing Arnie's face would
// have been worse than not offering the choice at all, and a fifth copy was
// only ever a matter of time.
//
// Reads the persona itself so it can be dropped in anywhere, including the
// corner panel, which renders outside the Arnie workspace and has no route
// context to inherit from.
//
// A persona whose artwork does not exist yet falls back to an icon rather
// than a broken image, so a persona can ship before its picture does.

import { useEffect, useState } from 'react'
import { Bot } from 'lucide-react'
import { useStore } from '../lib/store'
import { loadPersona, personaFor, assistantName } from '../lib/arniePersonaClient'

/**
 * `persona` may be passed in by a caller that already has the row (saves a
 * fetch); otherwise it is loaded here.
 */
export function useAssistant() {
  const user = useStore((s) => s.user)
  const getAgent = useStore((s) => s.getAgent)
  const getCompanyAgent = useStore((s) => s.getCompanyAgent)
  const [row, setRow] = useState(null)

  useEffect(() => {
    let alive = true
    if (!user?.id) return
    loadPersona(user.id).then((r) => { if (alive) setRow(r) }).catch(() => { /* keep the default */ })
    return () => { alive = false }
  }, [user?.id])

  return {
    personaRow: row,
    persona: personaFor(row?.persona),
    name: assistantName({
      personaRow: row,
      companyCustomName: getCompanyAgent?.('arnie-og')?.custom_name,
      agentFullName: getAgent?.('arnie-og')?.full_name,
    }),
  }
}

export default function AssistantAvatar({ size = 36, persona: personaKey, border, glow, background, style }) {
  const loaded = useAssistant()
  // A caller that already knows the persona wins; otherwise use the loaded one.
  const p = personaKey ? personaFor(personaKey) : loaded.persona
  const [broken, setBroken] = useState(false)

  // A different persona deserves a fresh attempt at its own picture.
  useEffect(() => { setBroken(false) }, [p.key])

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...(border ? { border } : null),
      ...(glow ? { boxShadow: glow } : null),
      ...(background ? { backgroundColor: background } : null),
      ...style,
    }}>
      {broken ? (
        <Bot size={Math.round(size * 0.58)} style={{ color: '#f97316' }} />
      ) : (
        <img
          src={p.avatar}
          alt={p.fullName}
          onError={() => setBroken(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </div>
  )
}
