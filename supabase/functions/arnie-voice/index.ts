// arnie-voice — "Hey Jenny" on an iPhone (Bryce, 2026-10-26).
//
// A Shortcut, started by Vocal Shortcuts ("Hey Jenny"), dictates what was said
// and POSTs it here with the person's voice key; it reads `say` aloud and
// listens again, until they say thanks or go quiet.
//
//   POST  x-voice-key: jsv_…   { text }            → { say, done }
//   POST  (signed in, the app) { action: 'create_key', label? } → { key, hint }   (shown ONCE)
//                              { action: 'list_keys' }          → { keys }
//                              { action: 'revoke_key', id }     → { ok }
//
// The turn is the same Arnie that answers texts and routines (arnieHeadless):
// the same tools, rails and money gates, as that one employee. A card he drafts
// waits in the app for them to approve — nothing is done by voice alone. The
// conversation is a normal Arnie session (their history, Monday's review); it
// picks up where it left off for 15 minutes.
//
// verify_jwt is off for this function (config.toml): a Shortcut has no
// Supabase login. Who is asking is decided here — the key's hash, or the
// signed-in person for the key actions.

import { resolveCaller } from '../_shared/auth.ts'
import { runArnieTurn } from '../_shared/arnieHeadless.ts'
import { newVoiceKey, looksLikeVoiceKey, hashVoiceKey, keyHint, speakable, isGoodbye, VOICE_SESSION_MINUTES, VOICE_DAILY_CAP } from '../_shared/arnieVoice.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-voice-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
// A Shortcut speaks whatever comes back, so a failure is still a sentence.
const spoken = (say: string, done = false) => json({ say, done })

const URL_ = Deno.env.get('SUPABASE_URL')!
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const get = async (p: string) => { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H }); return r.ok ? r.json() : [] }
const write = (p: string, method: string, body: unknown) => fetch(`${URL_}/rest/v1/${p}`, { method, headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(body) })
const EMP_SEL = 'id,company_id,email,phone,name,role,user_role,is_admin,is_developer,has_hr_access,active'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const body = await req.json().catch(() => ({})) as Record<string, any>
  const voiceKey = String(req.headers.get('x-voice-key') || body.key || '').trim()

  // ── The key actions, from the app, signed in ─────────────────────────────
  if (body.action) {
    const caller = await resolveCaller(req, URL_, KEY, { verify: true })
    if (!caller?.companyId || caller.employeeId == null) return json({ error: 'Sign in first.' }, 401)
    if (body.action === 'list_keys') {
      const keys = await get(`arnie_voice_keys?select=id,hint,label,created_at,last_used_at&employee_id=eq.${caller.employeeId}&revoked_at=is.null&order=created_at.desc`)
      return json({ keys })
    }
    if (body.action === 'create_key') {
      const live = await get(`arnie_voice_keys?select=id&employee_id=eq.${caller.employeeId}&revoked_at=is.null`)
      if (live.length >= 5) return json({ error: 'You have five voice keys already. Turn one off first.' }, 409)
      const key = newVoiceKey()
      const r = await write('arnie_voice_keys', 'POST', { company_id: caller.companyId, employee_id: caller.employeeId, key_hash: await hashVoiceKey(key), hint: keyHint(key), label: String(body.label || 'iPhone').slice(0, 40) })
      if (!r.ok) return json({ error: 'The key could not be made just now.' }, 500)
      return json({ key, hint: keyHint(key), endpoint: `${URL_}/functions/v1/arnie-voice` })
    }
    if (body.action === 'revoke_key') {
      const r = await write(`arnie_voice_keys?id=eq.${Number(body.id)}&employee_id=eq.${caller.employeeId}&revoked_at=is.null`, 'PATCH', { revoked_at: new Date().toISOString() })
      const rows = r.ok ? await r.json() : []
      return json({ ok: rows.length > 0 })
    }
    return json({ error: 'Unknown action.' }, 400)
  }

  // ── A question, from the Shortcut ───────────────────────────────────────
  if (!looksLikeVoiceKey(voiceKey)) return spoken('This shortcut has no voice key. Make one in JobScout, under Arnie, Settings.', true)
  const [k] = await get(`arnie_voice_keys?select=id,company_id,employee_id,uses_today,uses_day,revoked_at&key_hash=eq.${await hashVoiceKey(voiceKey)}&limit=1`)
  if (!k || k.revoked_at) return spoken('That voice key has been turned off. Make a new one in JobScout, under Arnie, Settings.', true)
  const [emp] = await get(`employees?select=${EMP_SEL}&id=eq.${k.employee_id}&company_id=eq.${k.company_id}&active=eq.true&limit=1`)
  if (!emp) return spoken('That voice key belongs to someone who is no longer active in JobScout.', true)

  const today = new Date().toISOString().slice(0, 10)
  const uses = k.uses_day === today ? (k.uses_today || 0) : 0
  if (uses >= VOICE_DAILY_CAP) return spoken('That is the limit for voice today. The app still works.', true)
  await write(`arnie_voice_keys?id=eq.${k.id}`, 'PATCH', { uses_today: uses + 1, uses_day: today, last_used_at: new Date().toISOString() })

  const said = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 2000)
  if (isGoodbye(said)) return spoken('', true)

  try {
    // The conversation: theirs from the last 15 minutes, or a new one.
    const email = String(emp.email || '').toLowerCase()
    const since = new Date(Date.now() - VOICE_SESSION_MINUTES * 60_000).toISOString()
    const [open] = await get(`ai_sessions?select=session_id&company_id=eq.${emp.company_id}&user_email=eq.${encodeURIComponent(email)}&current_module=eq.arnie&context_json=like.*%22voice%22:true*&last_activity=gte.${since}&order=last_activity.desc&limit=1`)
    let sid = open?.session_id as string | undefined
    let history: { role: string; content: string }[] = []
    const now = new Date().toISOString()
    if (sid) {
      const rows = await get(`ai_messages?select=role,content&session_id=eq.${sid}&order=created_at.desc&limit=12`)
      history = (Array.isArray(rows) ? rows : []).reverse().map((m: any) => ({ role: m.role, content: String(m.content || '').replace(/⟦receipt⟧[\s\S]*$/, '').trim() })).filter((m) => m.content)
    } else {
      sid = crypto.randomUUID()
      await write('ai_sessions', 'POST', { company_id: emp.company_id, session_id: sid, user_email: email, started: now, last_activity: now, status: 'active', current_module: 'arnie', context_json: JSON.stringify({ title: `Voice: ${said}`.slice(0, 80), voice: true }) })
    }
    while (history.length && history[0].role !== 'user') history.shift()
    await write('ai_messages', 'POST', { company_id: emp.company_id, message_id: crypto.randomUUID(), session_id: sid, role: 'user', content: said, timestamp: now })

    const turn = await runArnieTurn({ url: URL_, key: KEY, internalKey: Deno.env.get('ARNIE_INTERNAL_KEY') || undefined }, {
      employee: emp, messages: [...history, { role: 'user', content: said }], voice: true,
    })
    if (turn.error || !String(turn.text || '').trim()) {
      console.warn('[arnie-voice]', turn.error || 'empty answer')
      return spoken('Sorry, I could not get an answer just now. Try again in a minute.')
    }
    let say = speakable(turn.text)
    if (turn.proposal && !/approve|in the app/i.test(say)) say += ' It is waiting for you to approve in the JobScout app.'
    await write('ai_messages', 'POST', { company_id: emp.company_id, message_id: crypto.randomUUID(), session_id: sid, role: 'assistant', content: turn.text, timestamp: new Date().toISOString() })
    await write(`ai_sessions?session_id=eq.${sid}`, 'PATCH', { last_activity: new Date().toISOString() })
    return spoken(say)
  } catch (e) {
    console.error('[arnie-voice]', (e as Error)?.message)
    return spoken('Sorry, something went wrong on my end. Try again in a minute.')
  }
})
