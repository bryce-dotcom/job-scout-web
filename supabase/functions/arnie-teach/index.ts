// arnie-teach — turn a demonstration into steps a person can read and correct.
//
// The recorder knows WHERE somebody clicked and never WHY. A list of
// coordinates is not a skill: it breaks the first time the portal moves a
// button, and nobody reviewing it can tell whether it is right. So Arnie
// looks at the screenshots taken at each click and writes the step list in
// English, naming the field he can see rather than the pixel he was given.
//
// THE OUTPUT IS A DRAFT AND SAYS SO. xAI's own documentation is blunt about
// this and they are right: one demonstration cannot reveal the decision
// rules, the failure handling, or what must never happen without a person.
// Those are added by the human who taught it, which is why this writes
// status='draft' and never 'published'.
//
// WHAT IT NEVER SEES: what anybody typed. The recorder kept a character
// count, so Arnie knows a field was filled and how long the value was, and
// has to ask what it should be filled FROM. That is the right question — a
// step that hardcodes one customer's meter number is a step that is wrong for
// every other customer.

import { resolveCaller } from '../_shared/auth.ts'
import { callAnthropic } from '../_shared/anthropic.ts'
import { ARNIE_MODEL, textOf } from '../_shared/arnieModel.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// A demonstration is up to ten minutes and can be hundreds of events. Vision
// is the expensive part, so only the moments that PLACE a step get a picture:
// the clicks and the window changes. Typing runs are described in words.
const MAX_SHOTS = 18

const SYSTEM = `You are watching a recording of somebody doing a job on their own computer, and writing down how to do it again.

You are given, in order: what program was in front, what the window was called, what they clicked (with a screenshot of the screen at that moment), and how many characters they typed into whatever they had just clicked. You are NEVER given the characters themselves, deliberately.

Write the steps as a numbered list, in plain English, in the words the person would use. For each step:
- Name the thing on screen from the SCREENSHOT — "the Premise / Meter # box", "the Add a line button" — never a coordinate.
- Where they typed, say what the value should come FROM rather than what it was. The job's meter number, the customer's name, today's date. If you cannot tell, say so plainly: that is a question for them, not a guess for you.
- If a step looks like signing in, say the person does that themselves. Arnie never types a password.
- If a step is a Submit, Send, Pay or Delete, say it stops there for a person to click.

Then, under a heading "What I am not sure about", list what one run could not tell you: which parts vary by customer, what should happen when something is missing, anything you had to guess. Be specific and short. If you are unsure about nothing, say so — but you usually should be.

Do not invent steps you did not see. If the recording is too thin to be useful, say that instead of padding it. No emoji.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // The person's own session. A demonstration is a recording of somebody's
  // screen; nothing should be able to read one on their behalf.
  const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
  if (!caller?.companyId || !caller.employeeId) return json({ error: 'Sign in to use this.' }, 401)

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const skillId = Number(body.skill_id)
  if (!Number.isFinite(skillId)) return json({ error: 'skill_id is required' }, 400)

  const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
  const rest = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init, headers: { ...H, ...(init.method && init.method !== 'GET' ? { Prefer: 'return=representation' } : {}) },
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`)
    return text ? JSON.parse(text) : []
  }

  try {
    // Only your own skill, and only one that has finished recording.
    const [skill] = await rest(`arnie_skills?select=id,name,outcome,status&id=eq.${skillId}&employee_id=eq.${caller.employeeId}&limit=1`)
    if (!skill) return json({ error: 'No recording of yours by that id.' }, 404)
    if (skill.status === 'recording') return json({ error: 'That one is still recording — stop it first.' }, 409)

    const obs = await rest(`arnie_skill_observations?select=seq,at,app,window_title,kind,x,y,text_length,key_name,shot_path&skill_id=eq.${skillId}&order=seq`)
    if (!obs.length) {
      return json({ error: 'There is nothing in that recording — the recorder saw no clicks at all.' }, 409)
    }

    // Build the transcript, and choose which moments get a picture. Clicks and
    // window changes place a step; a run of typing does not need one.
    const placing = obs.filter((o: Record<string, unknown>) =>
      o.shot_path && ['click', 'double_click', 'right_click', 'app_change'].includes(String(o.kind)))
    const step = Math.max(1, Math.ceil(placing.length / MAX_SHOTS))
    const withShots = new Set(placing.filter((_: unknown, i: number) => i % step === 0).slice(0, MAX_SHOTS)
      .map((o: Record<string, unknown>) => o.seq))

    const content: Record<string, unknown>[] = [{
      type: 'text',
      text: `They said they were going to show you: ${skill.outcome || skill.name}\n\nHere is the recording, in order.`,
    }]

    for (const o of obs) {
      const line = [
        `#${o.seq}`,
        o.kind === 'type' ? `typed ${o.text_length} characters`
          : o.kind === 'key' ? `pressed ${o.key_name}`
          : o.kind === 'app_change' ? `moved to ${o.app || 'another program'} — "${o.window_title || ''}"`
          : o.kind === 'paused' ? 'RECORDING PAUSED — Arnie was waiting on them to sign in, so nothing here was captured'
          : o.kind === 'resumed' ? 'recording resumed'
          : `${String(o.kind).replace('_', ' ')} at (${o.x}, ${o.y})`,
        o.app && o.kind !== 'app_change' ? `in ${o.app}` : '',
      ].filter(Boolean).join(' — ')
      content.push({ type: 'text', text: line })

      if (withShots.has(o.seq) && o.shot_path) {
        // Signed, short-lived, and fetched server-side. The bucket is private
        // and stays private.
        const signed = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/arnie-recordings/${o.shot_path}`, {
          method: 'POST', headers: H, body: JSON.stringify({ expiresIn: 300 }),
        }).then((r) => r.ok ? r.json() : null).catch(() => null)
        if (signed?.signedURL) {
          const img = await fetch(`${SUPABASE_URL}/storage/v1${signed.signedURL}`).catch(() => null)
          if (img?.ok) {
            const bytes = new Uint8Array(await img.arrayBuffer())
            let bin = ''
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
            content.push({
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: btoa(bin) },
            })
          }
        }
      }
    }

    // Through the one wrapper, so a demonstration is metered like every other
    // AI call and this feature is never the thing we cannot cost.
    const ai = await callAnthropic(
      { feature: 'arnie-teach', companyId: caller.companyId },
      {
        // Writing up a demonstration is real reading: medium effort, and room
        // for the thinking as well as the write-up.
        model: ARNIE_MODEL,
        max_tokens: 12000,
        output_config: { effort: 'medium' },
        system: SYSTEM,
        messages: [{ role: 'user', content }],
      },
    )

    if (!ai.ok) {
      // The recording is safe on disk either way, so this is "try again
      // later", not "your demonstration is gone".
      return json({
        error: ai.friendly || 'Arnie could not read the recording just now.',
        ai_unavailable: ai.unavailable === true,
        keep: 'The recording is kept — ask him to write it up again in a minute.',
      }, 503)
    }

    // By type: on Sonnet 5.5 the first block can be thinking, not text.
    const text = textOf(ai.data)
    if (!text) return json({ error: 'Arnie could not make anything of that recording.' }, 502)

    const cut = text.search(/what i am not sure about/i)
    const steps = cut > 0 ? text.slice(0, cut).trim() : text
    const notes = cut > 0 ? text.slice(cut).replace(/^.*?\n/, '').trim() : ''

    await rest(`arnie_skills?id=eq.${skillId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        // The step list as written, for a person to correct. It becomes a
        // machine-runnable list only once they have.
        steps: { written: steps, from_observations: obs.length, drafted_at: new Date().toISOString() },
        draft_notes: notes || null,
        status: 'draft',
        updated_at: new Date().toISOString(),
      }),
    })

    return json({ ok: true, steps, notes, observations: obs.length, pictures: withShots.size })
  } catch (e) {
    return json({ error: String((e as Error).message || e).slice(0, 400) }, 500)
  }
})
