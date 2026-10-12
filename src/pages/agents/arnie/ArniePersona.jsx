// Who your assistant is — yours, not the company's.
//
// Everything else about Arnie is already per seat. This is the name, the
// manner and the voice. One agent with two skins: picking Jenny changes who
// you are talking to, not what she is allowed to do. Same rails, same
// refusals, same permissions.
//
// There is deliberately NO "describe your assistant's personality" box. That
// would be a prompt-injection surface into something that has hands on your
// computer and money rails. The manner is a choice from a list; the name is
// free text and is checked to look like a name before it reaches a prompt.

import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../../lib/store'
import { UserRound, Check, Volume2, Loader2 } from 'lucide-react'
import { loadPersona, savePersona, PERSONA_LIST, personaFor } from '../../../lib/arniePersonaClient'
import AssistantAvatar from '../../../components/AssistantAvatar'
import { getVoices, savedVoiceId, rememberVoice, speak, unlockAudio } from './arnieVoice'

// Switching persona without having chosen a voice should sound right straight
// away. edge_jenny already existed in the voice list — "Warm American female"
// — so Jenny has one waiting for her.
const DEFAULT_VOICE = { arnie: null, jenny: 'edge_jenny' }

const t = {
  card: '#ffffff', card2: '#f0ebdd', ink: '#2c3530', sub: '#4d5a52', muted: '#7d8a7f',
  line: '#d6cdb8', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.10)',
  rm: '#b91c1c', rmBg: 'rgba(185,28,28,0.08)', add: '#2f7d4e',
}

export default function ArniePersona({ onChanged }) {
  const user = useStore((s) => s.user)
  const companyId = useStore((s) => s.companyId)
  const [row, setRow] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  const [voices, setVoices] = useState([])

  const load = useCallback(async () => {
    if (!user?.id) return
    const r = await loadPersona(user.id)
    setRow(r)
    setName(r?.display_name || '')
  }, [user?.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { try { setVoices(getVoices() || []) } catch { setVoices([]) } }, [])

  const current = personaFor(row?.persona)
  const chosenVoice = row?.voice_id || savedVoiceId() || ''

  const commit = async (patch) => {
    setBusy(true); setErr(''); setSaved(false)
    const { error } = await savePersona(user?.id, companyId, {
      persona: row?.persona || 'arnie',
      display_name: row?.display_name ?? null,
      voice_id: row?.voice_id ?? null,
      ...patch,
    })
    if (error) setErr(error)
    else {
      setSaved(true); setTimeout(() => setSaved(false), 1800)
      await load()
      onChanged?.()
    }
    setBusy(false)
  }

  const pick = async (key) => {
    // Changing persona without a renamed assistant should change the name
    // too, or someone picks Jenny and is still greeted by Arnie.
    //
    // The voice is the fiddly bit. A voice the PERSON chose is theirs and is
    // left alone. A voice this screen assigned when they picked a persona is
    // not a preference, and carrying it over leaves Arnie talking in Jenny's
    // voice when they switch back — which is exactly what happened the first
    // time this was tried. So: an auto-assigned one is recognised by matching
    // the persona default it came from, and replaced.
    const current = row?.voice_id || null
    const wasAutoAssigned = Object.values(DEFAULT_VOICE).includes(current)
    const voice = (!current || wasAutoAssigned) ? (DEFAULT_VOICE[key] || null) : current
    if (voice !== current) { try { rememberVoice(voice || '') } catch { /* private mode */ } }
    await commit({ persona: key, display_name: row?.display_name || null, voice_id: voice })
  }

  const saveName = async () => {
    await commit({ display_name: name.trim() || null })
  }

  const pickVoice = async (id) => {
    // The voice used to live in localStorage, which meant a rep who chose one
    // on a laptop got a different one on the phone they actually use.
    rememberVoice(id)
    await commit({ voice_id: id || null })
  }

  return (
    <section style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <h3 style={{ margin: '0 0 5px', fontSize: 15, fontWeight: 700, color: t.ink, display: 'flex', alignItems: 'center', gap: 8 }}>
        <UserRound size={17} style={{ color: t.accent }} /> Your assistant
      </h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: t.sub, lineHeight: 1.55 }}>
        Yours alone — the rest of the company keeps whoever they picked. It changes who you are
        talking to, never what they are allowed to do.
      </p>

      {err && <div style={{ background: t.rmBg, color: t.rm, borderRadius: 9, padding: '9px 11px', fontSize: 13, marginBottom: 11 }}>{err}</div>}

      <div style={{ display: 'grid', gap: 9, marginBottom: 14 }}>
        {PERSONA_LIST.map((p) => {
          const on = (row?.persona || 'arnie') === p.key
          return (
            <button
              key={p.key}
              onClick={() => pick(p.key)}
              disabled={busy}
              style={{
                display: 'flex', gap: 11, alignItems: 'flex-start', textAlign: 'left', cursor: 'pointer',
                background: on ? t.accentBg : t.card2,
                border: `1px solid ${on ? t.accent : t.line}`,
                borderRadius: 10, padding: '11px 13px', width: '100%',
              }}
            >
              {/* Their face, because that is what is being chosen. A pair of
                  radio buttons asks you to pick a label; this asks you to
                  pick a person, which is the actual question — and it is the
                  only place you can see Jenny before deciding. */}
              <span style={{ position: 'relative', flexShrink: 0, display: 'inline-flex' }}>
                <AssistantAvatar size={44} persona={p.key} border={`2px solid ${on ? t.accent : t.line}`} />
                {on && (
                  <span style={{
                    position: 'absolute', right: -3, bottom: -3,
                    width: 18, height: 18, borderRadius: '50%', background: t.accent,
                    border: '2px solid #fff',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}><Check size={10} color="#fff" strokeWidth={3} /></span>
                )}
              </span>
              <span style={{ flex: 1, minWidth: 0, marginTop: 2 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: t.ink }}>{p.fullName}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: t.sub, lineHeight: 1.5, marginTop: 2 }}>{p.blurb}</span>
              </span>
            </button>
          )
        })}
      </div>

      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: t.sub, marginBottom: 5 }}>
        Call them something else (optional)
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={current.fullName}
          maxLength={24}
          style={{
            flex: 1, minWidth: 180, background: '#fff', border: `1px solid ${t.line}`,
            borderRadius: 8, padding: '8px 10px', fontSize: 13, color: t.ink, minHeight: 38,
          }}
        />
        <button onClick={saveName} disabled={busy || (name.trim() === (row?.display_name || ''))}
          style={btn(t.accent, '#fff')}>
          {busy ? <Loader2 size={13} /> : <Check size={13} />} Save
        </button>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 11.5, color: t.muted, lineHeight: 1.5 }}>
        A name, not a sentence — up to three words. Anything longer is ignored, because what goes
        here is read by the assistant itself.
      </p>

      {!!voices.length && (
        <>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: t.sub, marginBottom: 5 }}>
            Voice
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={chosenVoice}
              onChange={(e) => pickVoice(e.target.value)}
              disabled={busy}
              style={{
                flex: 1, minWidth: 200, background: '#fff', border: `1px solid ${t.line}`,
                borderRadius: 8, padding: '8px 10px', fontSize: 13, color: t.ink, minHeight: 38,
              }}
            >
              <option value="">Default for {current.shortName}</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>{v.label || v.name || v.id}</option>
              ))}
            </select>
            <button
              onClick={() => {
                try {
                  unlockAudio()
                  speak(`Hello, I'm ${name.trim() || current.shortName}.`, chosenVoice || undefined)
                } catch { /* no voice on this device */ }
              }}
              style={btn(t.card2, t.sub)}
            >
              <Volume2 size={13} /> Hear it
            </button>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: t.muted }}>
            Saved to your account, so it follows you to your phone.
          </p>
        </>
      )}

      {saved && (
        <div style={{ marginTop: 11, fontSize: 12.5, color: t.add, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Check size={13} /> Saved.
        </div>
      )}
    </section>
  )
}

const btn = (bg, fg) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
  background: bg, color: fg, border: '1px solid transparent',
  borderRadius: 8, padding: '7px 11px', fontSize: 12.5, fontWeight: 600, minHeight: 38,
})
