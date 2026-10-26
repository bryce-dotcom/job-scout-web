// "Hey Jenny" on your iPhone (Bryce, 2026-10-26, after a "Hey Grok" post).
//
// JobScout is a web app, so an iPhone Shortcut cannot open it the way it
// opens Grok's app. Instead the Shortcut does the talking: it listens, sends
// the words to arnie-voice with this person's voice key, and reads the answer
// aloud — and Vocal Shortcuts starts it on a spoken phrase. This card makes the
// key (shown once), turns keys off, and lays out the Shortcut step by step.

import { useEffect, useState } from 'react'
import { Mic, Copy, Check, KeyRound, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

const t = {
  ink: '#2c3530', sub: '#4d5a52', muted: '#7d8a7f', line: '#d6cdb8', card: '#ffffff', card2: '#f7f5ef',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.10)', amber: '#b45309', rm: '#b91c1c',
}
export const VOICE_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/arnie-voice`

async function call(body) {
  const { data, error } = await supabase.functions.invoke('arnie-voice', { body })
  if (error) {
    let msg = error.message
    try { msg = (await error.context?.json())?.error || msg } catch { /* keep */ }
    return { error: msg }
  }
  return data
}

export default function ArnieVoiceShortcut({ name = 'Jenny' }) {
  const [keys, setKeys] = useState(null)
  const [fresh, setFresh] = useState(null) // the key just made — shown once
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState('')
  const phrase = `Hey ${name}`

  const load = async () => { const r = await call({ action: 'list_keys' }); setKeys(r?.keys || []) }
  useEffect(() => { load() }, [])

  const make = async () => {
    setBusy(true); setErr('')
    const r = await call({ action: 'create_key', label: 'iPhone' })
    setBusy(false)
    if (r?.error) { setErr(r.error); return }
    setFresh(r.key); load()
  }
  const turnOff = async (id) => {
    setBusy(true); setErr('')
    const r = await call({ action: 'revoke_key', id })
    setBusy(false)
    if (r?.error || !r?.ok) setErr(r?.error || 'That key could not be turned off.')
    load()
  }
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1800) } catch { /* the text is on screen to copy by hand */ }
  }

  const box = { background: t.card2, border: `1px solid ${t.line}`, borderRadius: 8, padding: '8px 10px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, wordBreak: 'break-all', color: t.ink }
  const btn = (bg, fg) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: bg === 'transparent' ? `1px solid ${t.line}` : 'none', background: bg, color: fg, fontSize: 13, fontWeight: 600, cursor: 'pointer' })

  return (
    <div data-voice-shortcut style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 16, marginBottom: 18, textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: t.accentBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: t.accent, flex: 'none' }}><Mic size={18} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: t.ink }}>"{phrase}" on your iPhone</div>
          <div style={{ fontSize: 12.5, color: t.muted }}>Say "{phrase}", ask your question, and hear the answer — hands-free. Anything that changes a record still waits for you to approve in the app.</div>
        </div>
      </div>

      {fresh ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.amber, marginBottom: 6 }}>Your voice key — copy it now. It is shown only this once.</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
            <div style={{ ...box, flex: '1 1 260px' }}>{fresh}</div>
            <button type="button" onClick={() => copy(fresh, 'key')} style={btn(t.accent, '#fff')}>{copied === 'key' ? <Check size={14} /> : <Copy size={14} />} {copied === 'key' ? 'Copied' : 'Copy key'}</button>
          </div>
          <div style={{ fontSize: 12, color: t.muted, marginTop: 6 }}>It acts as you, with your access, and nothing more. Anyone with it can ask {name} things as you — keep it in the Shortcut only. Turn it off below any time.</div>
        </div>
      ) : (
        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={make} disabled={busy} style={btn(t.accent, '#fff')}><KeyRound size={14} /> Make my voice key</button>
          <span style={{ fontSize: 12.5, color: t.muted }}>Step one. You paste it into the Shortcut once.</span>
        </div>
      )}
      {err && <div style={{ color: t.rm, fontSize: 13, marginTop: 8 }}>{err}</div>}

      <ol style={{ margin: '16px 0 0', paddingLeft: 20, fontSize: 13.5, lineHeight: 1.6, color: t.sub }}>
        <li>On your iPhone, open <b>Shortcuts</b> → <b>+</b>. Name it <b>{phrase}</b>.</li>
        <li>Add <b>Repeat</b> (10 times). Inside it, add these in order:
          <ol type="a" style={{ paddingLeft: 18, margin: '4px 0' }}>
            <li><b>Dictate Text</b> — Stop Listening: <i>After Pause</i>.</li>
            <li><b>Get Contents of URL</b> — paste the address below; tap <i>Show More</i>: Method <b>POST</b>; Headers: add <b>x-voice-key</b> = your key; Request Body <b>JSON</b>: add <b>text</b> = <i>Dictated Text</i>.</li>
            <li><b>Get Dictionary Value</b> — Get <b>Value</b> for <b>say</b> in <i>Contents of URL</i>.</li>
            <li><b>If</b> <i>Dictionary Value</i> <b>has no value</b> → <b>Stop This Shortcut</b>; Otherwise → <b>Speak Text</b> <i>Dictionary Value</i> (turn on <i>Wait Until Finished</i>).</li>
          </ol>
        </li>
        <li>Shortcut details (ⓘ): turn on <b>Allow Running When Locked</b>.</li>
        <li><b>Settings</b> → <b>Accessibility</b> → <b>Vocal Shortcuts</b> → <b>Set Up</b> → pick the <b>{phrase}</b> shortcut → say "{phrase}" three times.</li>
      </ol>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ ...box, flex: '1 1 260px' }}>{VOICE_ENDPOINT}</div>
        <button type="button" onClick={() => copy(VOICE_ENDPOINT, 'url')} style={btn('transparent', t.accent)}>{copied === 'url' ? <Check size={14} /> : <Copy size={14} />} {copied === 'url' ? 'Copied' : 'Copy address'}</button>
      </div>
      <div style={{ fontSize: 12.5, color: t.muted, marginTop: 8 }}>Say "thanks" or just stop talking to end it. If the phone is locked, iOS asks for one tap first.</div>

      {keys?.length > 0 && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${t.line}`, paddingTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Your voice keys</div>
          {keys.map((k) => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13, color: t.sub }}>
              <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{k.hint}</span>
              <span style={{ flex: 1, minWidth: 0, color: t.muted }}>{k.label} · {k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleDateString()}` : 'not used yet'}</span>
              <button type="button" onClick={() => turnOff(k.id)} disabled={busy} style={btn('transparent', t.rm)}><Trash2 size={13} /> Turn off</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
