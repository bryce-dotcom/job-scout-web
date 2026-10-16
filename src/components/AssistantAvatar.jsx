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

import { useCallback, useEffect, useState } from 'react'
import { Bot, Sparkles } from 'lucide-react'
import { useStore } from '../lib/store'
import { loadPersona, personaFor, assistantName, PERSONA_CHANGED } from '../lib/arniePersonaClient'
import { badgeText } from '../lib/arnieAttention'

/**
 * `persona` may be passed in by a caller that already has the row (saves a
 * fetch); otherwise it is loaded here.
 */
// WHO YOUR ASSISTANT IS, REMEMBERED ON THE DEVICE. This used to start every
// page as OG Arnie — name, face, greeting — and switch to Jenny a few seconds
// later when the persona arrived (Bryce, 2026-10-15). The last-known persona is
// kept per person (shared devices: a truck tablet gets passed around), so a
// returning user sees their own assistant from the first paint, and a device
// that has never known shows nobody rather than the wrong somebody.
// `undefined` = not known yet; `null` = known, and it is the default (Arnie).
const personaMemo = new Map()
const personaKey = (id) => `jobscout_persona:${id}`
function rememberedPersona(userId) {
  if (!userId) return undefined
  if (personaMemo.has(userId)) return personaMemo.get(userId)
  try {
    const v = localStorage.getItem(personaKey(userId))
    if (v != null) { const r = JSON.parse(v); personaMemo.set(userId, r); return r }
  } catch { /* storage off — fall through to unknown */ }
  return undefined
}
function rememberPersona(userId, row) {
  if (!userId) return
  personaMemo.set(userId, row ?? null)
  try { localStorage.setItem(personaKey(userId), JSON.stringify(row ?? null)) } catch { /* fine */ }
}

export function useAssistant() {
  const user = useStore((s) => s.user)
  const getAgent = useStore((s) => s.getAgent)
  const getCompanyAgent = useStore((s) => s.getCompanyAgent)
  const [loaded, setLoaded] = useState(undefined)

  const reload = useCallback(() => {
    if (!user?.id) return () => {}
    let alive = true
    loadPersona(user.id).then((r) => {
      rememberPersona(user.id, r)
      if (alive) setLoaded({ userId: user.id, row: r ?? null })
    }).catch(() => { /* keep what we had */ })
    return () => { alive = false }
  }, [user?.id])

  // This person's fresh answer if we have it, else what this device last knew.
  const row = loaded && loaded.userId === user?.id ? loaded.row : rememberedPersona(user?.id)
  const known = row !== undefined

  useEffect(() => reload(), [reload])

  // Re-read when somebody switches assistant. Every surface that shows the
  // face or the name hangs off this hook, so listening here fixes all of
  // them at once — the corner launcher, the phone tab bar and the avatar
  // used to keep showing Arnie until the next full page load.
  useEffect(() => {
    let cancel = () => {}
    const onChanged = () => { cancel(); cancel = reload() }
    window.addEventListener(PERSONA_CHANGED, onChanged)
    return () => { window.removeEventListener(PERSONA_CHANGED, onChanged); cancel() }
  }, [reload])

  return {
    known,
    personaRow: row ?? null,
    persona: personaFor(row?.persona),
    // Blank while unknown — never another assistant's name.
    name: known ? assistantName({
      personaRow: row,
      companyCustomName: getCompanyAgent?.('arnie-og')?.custom_name,
      agentFullName: getAgent?.('arnie-og')?.full_name,
    }) : '',
  }
}

/**
 * @param {boolean} ai       show the sparkle that marks this as an assistant
 * @param {number}  attention how many things are waiting on this person
 */
export default function AssistantAvatar({
  size = 36, persona: personaKey, border, glow, background, style,
  ai = false, attention = 0,
}) {
  const loaded = useAssistant()
  // A caller that already knows the persona wins; otherwise use the loaded one.
  const p = personaKey ? personaFor(personaKey) : loaded.persona
  const [broken, setBroken] = useState(false)

  // A different persona deserves a fresh attempt at its own picture.
  useEffect(() => { setBroken(false) }, [p.key])

  const face = (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      ...(border ? { border } : null),
      ...(glow ? { boxShadow: glow } : null),
      ...(background ? { backgroundColor: background } : null),
      ...(ai || attention ? null : style),
    }}>
      {!personaKey && !loaded.known ? (
        // Not known yet: an empty badge, not Arnie's face on Jenny's page.
        <span style={{ width: '100%', height: '100%', background: 'rgba(127,127,127,0.18)' }} />
      ) : broken ? (
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

  // No badges, no wrapper — keeps the common case a single element.
  if (!ai && !attention) return face

  // The two badges say different things and must not be confused for each
  // other, so they sit on opposite corners and never move:
  //
  //   bottom-right, always there when asked for — WHAT this is. A face in a
  //   menu among human faces should not be able to pass for a colleague.
  //   bottom is the quieter corner, because identity is not news.
  //
  //   top-right, only when something is waiting — a count, like an unread
  //   message, which is exactly the thing Bryce asked it to feel like.
  const dot = Math.max(14, Math.round(size * 0.46))
  const spark = Math.max(12, Math.round(size * 0.40))

  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, ...style }}>
      {face}
      {ai && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', right: -1, bottom: -1,
            width: spark, height: spark, borderRadius: '50%',
            background: '#5a6349', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid #fff', boxSizing: 'border-box',
          }}
        >
          <Sparkles size={Math.max(7, Math.round(spark * 0.62))} strokeWidth={2.6} />
        </span>
      )}
      {attention > 0 && (
        <span
          style={{
            position: 'absolute', right: -3, top: -3, minWidth: dot, height: dot,
            padding: '0 3px', borderRadius: dot, boxSizing: 'border-box',
            background: '#ef4444', color: '#fff',
            font: `700 ${Math.max(9, Math.round(dot * 0.62))}px/1 system-ui, sans-serif`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid #fff',
          }}
        >
          {badgeText(attention)}
        </span>
      )}
    </span>
  )
}
