// don-read-notes — Don reads the legal pad.
//
// A photo of a field takeoff sheet, a notebook page, or the back of an
// envelope becomes structured takeoff items, machine hours and flagged
// exposures. This is the feature that makes crews actually use him: nobody
// wants to retype what they already wrote in the truck.
//
// Two passes, same as dougie-analyze, for the same reason: handwriting fails
// differently from interpretation. Pass 1 transcribes characters with no
// domain reasoning at all. Pass 2 gets the transcription AND the images and
// turns them into quantities. Asking one pass to do both produces confident
// nonsense — it reads what it expects a dirt note to say.
//
// The model proposes quantities. It never prices anything. All arithmetic
// happens in src/lib/digEstimator.js on the client.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { callAnthropic } from "../_shared/anthropic.ts"
import { resolveCompanyId } from "../_shared/auth.ts"
import {
  WORK_TYPE_VOCAB, SOIL_VOCAB, TRENCH_WIDTH_RULE, OUTPUT_CONTRACT, correctionsBlock, sanitizeItems,
} from "../_shared/digVocab.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { images, site } = await req.json()

    if (!images || !Array.isArray(images) || images.length === 0) {
      return json({ error: 'At least one image is required' }, 400)
    }
    if (images.length > 6) {
      return json({ error: 'Maximum 6 pages at a time' }, 400)
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const companyId = await resolveCompanyId(req, SUPABASE_URL, SERVICE_KEY)

    const imageBlocks = images.flatMap((img: any, idx: number) => ([
      {
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.base64 },
      },
      { type: 'text', text: `Page ${idx + 1} of ${images.length}` },
    ]))

    // ── Learning loop: replay this company's past corrections ────────────
    // The table already exists (dougie_corrections) and already has this
    // shape, so Don's loop cost one field_type value, not a new table.
    let corrections = ''
    if (SUPABASE_URL && SERVICE_KEY && companyId) {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/dougie_corrections?company_id=eq.${companyId}&field_type=eq.dig_note&order=created_at.desc&limit=30`,
          { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } },
        )
        if (res.ok) corrections = correctionsBlock(await res.json())
      } catch (e) {
        console.warn('[Don] corrections fetch failed:', e)
      }
    }

    // ── PASS 1: transcribe, do not interpret ────────────────────────────
    const ocrPrompt = `You are looking at a handwritten field note from an excavation crew. It might be a takeoff sheet, a notebook page, a daily log, or scribble on the back of a plan.

Your ONLY job right now is to transcribe. Do not interpret. Do not convert units. Do not guess at what a dirt contractor probably meant. Write down the characters you can see, line by line, in reading order.

Rules:
- Preserve abbreviations exactly. "SDR35" stays "SDR35". "320" stays "320". "LF" stays "LF".
- Preserve tick marks and tally counts as you see them, e.g. "IIII II".
- Preserve feet and inch marks: 8' and 8" are different and it matters enormously.
- Keep arrows, dashes and crossings-out — note when something is struck through.
- If a character is illegible write [?]. If a whole word is, write [illegible].
- Note the page layout: if there are columns or a table, keep the columns separated with pipes (|).

Output format:
=== PAGE 1 ===
<line by line transcription>
=== PAGE 2 ===
...`

    const ocr = await callAnthropic(
      { feature: 'don-read-notes', companyId, req },
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: ocrPrompt }] }],
      },
    )
    if (!ocr.ok) {
      return json({ error: ocr.friendly, ai_unavailable: ocr.unavailable === true }, 502)
    }
    const transcription = ocr.data?.content?.map((c: any) => c.text || '').join('') || ''

    // ── PASS 2: structure it, with the images available to cross-check ──
    const siteHint = site
      ? `\nSITE CONTEXT (use only to fill gaps, never to override what is written):
- Default soil: ${site.default_soil_class || 'unknown'}
- Rock expected on this site: ${site.rock_expected ? 'yes' : 'no'}
- Haul destination: ${site.haul_destination || 'unknown'}`
      : ''

    const structurePrompt = `You are Don, an excavation estimator. Below is a raw transcription of a crew's handwritten note, and you also have the original images. Where the transcription and the image disagree, trust the image.

TRANSCRIPTION
---
${transcription}
---
${siteHint}

WORK TYPES — use these keys exactly, and only these:
${WORK_TYPE_VOCAB}

SOIL CLASSES — use these keys exactly, or null:
${SOIL_VOCAB}

${TRENCH_WIDTH_RULE}

HOW DIRT CREWS WRITE, AND WHAT IT MEANS
- "240' of 8\\" SDR35 @ 5'" → a trench item: length 240, depth 5, 8-inch pipe.
  Width is not stated, so LOOK IT UP in the width table above and say so.
- "14 loads to Miller pit" → an ACTUAL (loads hauled), not a takeoff item,
  unless the note is clearly a bid estimate rather than a day's log.
- "320 6.5 hrs" → an ACTUAL: a 320-class excavator ran 6.5 hours.
- "40 ton base" → a road_base item, tons 40.
- "hit rock @ 6' NE corner" → an EXPOSURE of kind "rock". Not an item.
- "strip 100x150 x 6\\"" → strip_topsoil, area_sf 15000, depth_ft 0.5.
  Converting an unambiguous inch mark to feet is allowed and is not the
  arithmetic rule 2 forbids — that rule is about volumes. Say that you did.
- A number with no unit next to a length and width is usually depth in feet.
  If you cannot tell, leave it null rather than guessing.

DECIDING ITEM vs ACTUAL: if the page reads as work to be done (a bid, a
takeoff, a quantity list) the quantities are items. If it reads as work
already done (a date, hours, loads hauled, a daily log) they are actuals. A
page can contain both. When genuinely ambiguous, prefer actuals and lower the
confidence — an estimator adding a missing line is a smaller problem than a
bid inflated by yesterday's work.
${corrections}

${OUTPUT_CONTRACT}`

    const structured = await callAnthropic(
      { feature: 'don-read-notes', companyId, req },
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: structurePrompt }] }],
      },
    )
    if (!structured.ok) {
      return json({ error: structured.friendly, ai_unavailable: structured.unavailable === true }, 502)
    }

    const raw = structured.data?.content?.map((c: any) => c.text || '').join('') || ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) {
      return json({ error: 'Could not parse the reading', raw, transcription }, 422)
    }

    let parsed: any
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return json({ error: 'Could not parse the reading', raw, transcription }, 422)
    }

    return json({
      success: true,
      header: parsed.header || {},
      items: sanitizeItems(parsed.items),
      actuals: Array.isArray(parsed.actuals) ? parsed.actuals : [],
      exposures: Array.isArray(parsed.exposures) ? parsed.exposures : [],
      unreadable: Array.isArray(parsed.unreadable) ? parsed.unreadable : [],
      transcription,
    })
  } catch (error) {
    console.error('[Don] read-notes error:', error)
    return json({ error: (error as Error).message }, 500)
  }
})
