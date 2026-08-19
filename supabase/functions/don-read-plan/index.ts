// don-read-plan — Don reads the plan sheet.
//
// Civil plan sets already contain most of the answer: earthwork summary
// tables, pipe schedules, structure schedules, quantity legends, general
// notes. Extracting what the plan SAYS is high-confidence document AI and it
// is where the real leverage is.
//
// What this function deliberately does NOT do is compute cut/fill from
// contours. A PDF carries no elevation data, and a vendor who claims one-click
// cut/fill from a plan image is lying in a way an excavator detects on the
// first bid. When the sheet has an earthwork table we read it and say so; when
// it doesn't, we say we can't and point at the measure tool instead.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { callAnthropic } from "../_shared/anthropic.ts"
import { resolveCompanyId } from "../_shared/auth.ts"
import {
  WORK_TYPE_VOCAB, SOIL_VOCAB, TRENCH_WIDTH_RULE, correctionsBlock, sanitizeItems,
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
      return json({ error: 'At least one plan sheet image is required' }, 400)
    }
    if (images.length > 4) {
      return json({ error: 'Maximum 4 sheets at a time — plan sheets are dense, read them in batches' }, 400)
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const companyId = await resolveCompanyId(req, SUPABASE_URL, SERVICE_KEY)

    const imageBlocks = images.flatMap((img: any, idx: number) => ([
      {
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.base64 },
      },
      { type: 'text', text: `Sheet ${idx + 1} of ${images.length}` },
    ]))

    let corrections = ''
    if (SUPABASE_URL && SERVICE_KEY && companyId) {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/dougie_corrections?company_id=eq.${companyId}&field_type=eq.dig_plan&order=created_at.desc&limit=25`,
          { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } },
        )
        if (res.ok) corrections = correctionsBlock(await res.json())
      } catch (e) {
        console.warn('[Don] corrections fetch failed:', e)
      }
    }

    // ── PASS 1: read the sheet's own furniture ──────────────────────────
    // Title block, scale, legend, and — critically — whether there IS a
    // quantity table on this sheet. That single fact decides whether the
    // second pass is transcription (reliable) or estimation (not).
    const surveyPrompt = `You are looking at one or more civil engineering plan sheets for a construction site. Survey them before extracting anything.

For EACH sheet, report:
1. Sheet number from the title block (e.g. "C-301", "C3.1") and sheet title.
2. Discipline: grading | utility | site | erosion | detail | other.
3. Revision number or delta, and any revision cloud you can see.
4. The stated scale exactly as printed (e.g. "1\\" = 20'", "1:100"), and whether a graphic scale bar is present.
5. Whether the sheet contains any of these, yes or no with a location:
   - an EARTHWORK or CUT/FILL summary table
   - a PIPE or UTILITY schedule (lengths, sizes, slopes)
   - a STRUCTURE schedule (manholes, inlets, catch basins)
   - a general QUANTITY table or bid schedule
   - a legend
6. Any general notes that affect earthwork: import/export requirements,
   compaction specs, unsuitable material handling, dewatering, topsoil depth.

Transcribe any table you find ROW BY ROW, exactly as printed, including
headers and units. Do not summarise a table — transcribe it. If a number is
illegible write [?].

Be explicit when something is absent. "No earthwork table on this sheet" is a
useful answer.`

    const survey = await callAnthropic(
      { feature: 'don-read-plan', companyId, req },
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 6144,
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: surveyPrompt }] }],
      },
    )
    if (!survey.ok) {
      return json({ error: survey.friendly, ai_unavailable: survey.unavailable === true }, 502)
    }
    const surveyText = survey.data?.content?.map((c: any) => c.text || '').join('') || ''

    // ── PASS 2: turn the sheet's own numbers into takeoff candidates ────
    const siteHint = site
      ? `\nSITE CONTEXT (gap-filling only, never overrides the plan):
- Default soil: ${site.default_soil_class || 'unknown'}
- Rock expected: ${site.rock_expected ? 'yes' : 'no'}`
      : ''

    const extractPrompt = `You are Don, an excavation estimator reading a plan set. Below is your own survey of the sheets, and you still have the images.

SURVEY
---
${surveyText}
---
${siteHint}

WORK TYPES — use these keys exactly, and only these:
${WORK_TYPE_VOCAB}

SOIL CLASSES — use these keys exactly, or null:
${SOIL_VOCAB}

${TRENCH_WIDTH_RULE}

WHERE YOUR NUMBERS MAY COME FROM, in order of trust:

  TIER 1 — the sheet states the quantity outright. An earthwork table row
  ("CUT 4,180 CY / FILL 2,900 CY"), a pipe schedule row ("240 LF 8\\" PVC
  SDR-35 @ 1.00%"), a structure count, a bid quantity table. Transcribe it.
  confidence 0.85-0.95. This is the work you are actually good at.

  TIER 2 — the sheet states the dimensions and the quantity follows by
  arithmetic you can do from labelled dimensions (a pad called out as
  120' x 200', a trench depth from an invert and a rim elevation both
  printed on the sheet). confidence 0.6-0.8, and list the arithmetic in
  assumptions.

  TIER 3 — you would have to scale it off the drawing or interpolate
  contours. DO NOT DO THIS. Emit nothing for it. Instead add an entry to
  "needs_measurement" describing what a human should trace with the measure
  tool and on which sheet.

CUT AND FILL, READ THIS CAREFULLY: you cannot compute earthwork volume from
contour lines in an image. There is no elevation model here. If the sheet has
an earthwork table, read the table — that is Tier 1 and it is great. If it
does not, the honest output is a "needs_measurement" entry saying so. Never
estimate a cut/fill volume by looking at contours. A wrong cut/fill number
ends the relationship with a dirt contractor permanently.

Every item must carry source_ref naming the sheet and the exact row or
callout, e.g. "C-301 earthwork table, row 'SITE CUT'" or "C-401 pipe
schedule, line 3". A number a contractor cannot trace back to the plan is a
number they will not stand behind.
${corrections}

Return ONLY valid JSON (no markdown fences):

{
  "sheets": [
    { "sheet_number": "", "sheet_title": "", "discipline": "", "revision": "",
      "scale_text": "", "has_scale_bar": false,
      "has_earthwork_table": false, "has_pipe_schedule": false,
      "has_structure_schedule": false }
  ],
  "items": [
    { "work_type": "", "label": "", "soil_class": null,
      "length_ft": null, "width_ft": null, "depth_ft": null,
      "perimeter_ft": null, "area_sf": null,
      "top_area_sf": null, "bottom_area_sf": null,
      "count": null, "volume_bcy": null, "tons": null,
      "protection": null,
      "tier": 1,
      "confidence": 0.0,
      "source_ref": "sheet + exact row or callout",
      "assumptions": [] }
  ],
  "needs_measurement": [
    { "what": "what needs tracing, e.g. 'building pad cut depth'",
      "sheet": "C-301",
      "why": "why it cannot be read directly" }
  ],
  "earthwork_notes": ["general notes affecting earthwork, verbatim"],
  "unreadable": []
}

HARD RULES
1. NEVER output a price, rate or dollar figure. Quantities only.
2. NEVER estimate cut/fill from contours. See above.
3. A quantity you did not read and cannot derive from printed dimensions does
   not go in "items". It goes in "needs_measurement".
4. confidence is honest and tier-consistent: Tier 1 high, Tier 2 middling.
5. If the sheets are unreadable or are not civil plans, return empty arrays.`

    const extracted = await callAnthropic(
      { feature: 'don-read-plan', companyId, req },
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: extractPrompt }] }],
      },
    )
    if (!extracted.ok) {
      return json({ error: extracted.friendly, ai_unavailable: extracted.unavailable === true }, 502)
    }

    const raw = extracted.data?.content?.map((c: any) => c.text || '').join('') || ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return json({ error: 'Could not parse the reading', raw, survey: surveyText }, 422)

    let parsed: any
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return json({ error: 'Could not parse the reading', raw, survey: surveyText }, 422)
    }

    return json({
      success: true,
      sheets: Array.isArray(parsed.sheets) ? parsed.sheets : [],
      items: sanitizeItems(parsed.items, { withTier: true }),
      needs_measurement: Array.isArray(parsed.needs_measurement) ? parsed.needs_measurement : [],
      earthwork_notes: Array.isArray(parsed.earthwork_notes) ? parsed.earthwork_notes : [],
      unreadable: Array.isArray(parsed.unreadable) ? parsed.unreadable : [],
      survey: surveyText,
    })
  } catch (error) {
    console.error('[Don] read-plan error:', error)
    return json({ error: (error as Error).message }, 500)
  }
})
