// Shared vocabulary for Don's readers.
//
// The work-type keys MUST stay in sync with WORK_TYPES in
// src/lib/digEstimator.js — the frontend resolves whatever comes back here
// against that map to compute volumes. A key the engine doesn't know becomes
// an unpriced line the user has to fix by hand, so the model gets the exact
// list and is told not to invent.

export const WORK_TYPE_VOCAB = `
strip_topsoil   — strip and stockpile topsoil (area + depth)
mass_ex         — mass excavation / cut (area + depth)
overex          — over-excavate unsuitable material (area + depth)
fine_grade      — fine grade / finish grade (area only, no volume)
trench          — any trench: utility, storm, sewer, water, electric (length + width + depth)
bedding         — pipe bedding / drain rock (volume or tons)
footing         — footing or foundation excavation (perimeter + width + depth)
basement        — basement / cellar / crawlspace dig (area + depth)
septic_tank     — septic tank excavation (count)
leach_field     — leach field / drain field trenching (length + width + depth)
basin           — pond, detention or retention basin (top area + bottom area + depth)
backfill        — backfill and compact (volume)
haul_off        — haul spoil off site (volume in bank CY, or a load count)
import_fill     — import structural fill (volume or tons)
road_base       — road base, gravel, driveway base (volume or tons)
`.trim()

export const SOIL_VOCAB = `
topsoil, common_earth, sand, sandy_clay, clay, gravel, weathered_rock, rock
`.trim()

// Trench width is the field most often left off a field note, and guessing it
// silently is how a takeoff quietly goes wrong.
// Look the width up, never compute it. An earlier version asked the model to
// derive width from pipe OD plus working room; it did the arithmetic out loud,
// argued with itself mid-sentence, concluded 2.5 ft and then emitted 2.0. A
// table has no arithmetic to fumble.
export const TRENCH_WIDTH_RULE = `
TRENCH WIDTH: field notes give pipe size and depth but almost never trench
width. If the width is NOT written, look it up in this table by nominal pipe
size. Do not calculate it. Do not show any working.

  pipe up to 6 in ....... width_ft = 2.0
  pipe 8 to 12 in ....... width_ft = 2.5
  pipe 15 to 18 in ...... width_ft = 3.0
  pipe 21 to 24 in ...... width_ft = 3.5
  pipe 27 to 36 in ...... width_ft = 4.5
  pipe over 36 in ....... width_ft = 6.0
  no pipe size given .... width_ft = null

When you use the table you MUST do all three of these:
  1. set width_ft to exactly the table value, digit for digit
  2. add one short assumption: "Width 2.5 ft assumed for 8 in pipe"
  3. set that item's confidence to 0.6 or lower

Never present a looked-up width as if it were written on the page.
`.trim()

export const OUTPUT_CONTRACT = `
Return ONLY valid JSON (no markdown fences, no prose before or after):

{
  "header": {
    "job_name": "", "date": "", "crew": "", "notes": ""
  },
  "items": [
    {
      "work_type": "one key from the work type list, exactly as spelled",
      "label": "short human label, e.g. 'Sewer lateral trench'",
      "soil_class": "one key from the soil list, or null if not stated",
      "length_ft": null, "width_ft": null, "depth_ft": null,
      "perimeter_ft": null, "area_sf": null,
      "top_area_sf": null, "bottom_area_sf": null,
      "count": null,
      "volume_bcy": null,
      "loads": null, "tons": null,
      "protection": "sloped | shored | box | none | null",
      "confidence": 0.0,
      "source_ref": "quote the exact text this came from",
      "assumptions": ["anything you filled in that was not written down"]
    }
  ],
  "actuals": [
    {
      "equipment": "what the note calls it, e.g. '320', 'mini', 'D6'",
      "hours": 0.0,
      "loads": null,
      "work_date": "YYYY-MM-DD or null",
      "source_ref": "quote the exact text",
      "confidence": 0.0
    }
  ],
  "exposures": [
    { "kind": "rock | water | utility | unsuitable | access | weather | other",
      "note": "what was written",
      "source_ref": "quote the exact text" }
  ],
  "unreadable": ["any text you could not make out"]
}

HARD RULES
1. NEVER output a price, a rate, a dollar figure or a total. You produce
   quantities only. Pricing happens elsewhere and is none of your business.
2. DO NO ARITHMETIC. You report dimensions; a separate engine computes every
   volume, load count and hour from them. Specifically: if you have given
   length/width/depth, or area/depth, then volume_bcy MUST be null. Only fill
   volume_bcy when the page states a volume outright ("900 yards of spoil")
   and gives no dimensions to go with it. A volume you worked out yourself is
   a number nobody asked for and nobody will check.
3. NEVER invent a number that is not written or given by a stated lookup rule.
   Leave it null and say so in assumptions. A null is useful; a guess is a
   liability.
4. confidence is honest: 0.9+ only when the number is plainly written and
   unambiguous. Anything you inferred, looked up or squinted at is below 0.7.
5. source_ref must quote the actual text you read it from, so a human can
   check your work against the page.
6. assumptions are SHORT DECLARATIVE STATEMENTS, one clause each, under 90
   characters. "Width 2.5 ft assumed for 8 in pipe" — not your reasoning, not
   a calculation, and never a correction to something you said earlier in the
   same string. If you change your mind, state only the final answer.
7. Hours run on machines and loads run on trucks — those go in "actuals",
   not "items". Items are work to be priced; actuals are work already done.
8. If the page contains nothing you can read, return empty arrays. Do not
   pad the response.
`.trim()

export function correctionsBlock(rows: any[]): string {
  if (!rows || rows.length === 0) return ''
  const lines = rows.map((c: any) => {
    const ctx = c.context?.work_type ? ` [${c.context.work_type}]` : ''
    return `- ${c.field_name}: you read "${c.original_value}" → the crew corrected it to "${c.corrected_value}"${ctx}`
  })
  return `

PAST CORRECTIONS FROM THIS COMPANY — these are your own previous mistakes on
this crew's handwriting and abbreviations. Apply what they teach you:
${lines.join('\n')}`
}

// ── Output sanitizer ─────────────────────────────────────────────────────
// Both readers pass their items through this. It lives here rather than in
// each function because a rule written down twice is a rule that drifts —
// that is the root cause behind half the regressions in this codebase.

const ALLOWED_WORK_TYPES = new Set([
  'strip_topsoil', 'mass_ex', 'overex', 'fine_grade', 'trench', 'bedding',
  'footing', 'basement', 'septic_tank', 'leach_field', 'basin', 'backfill',
  'haul_off', 'import_fill', 'road_base',
])

const GEOMETRY_FIELDS = [
  'length_ft', 'width_ft', 'depth_ft', 'perimeter_ft',
  'area_sf', 'top_area_sf', 'bottom_area_sf',
]

const NUM_FIELDS = [...GEOMETRY_FIELDS, 'count', 'volume_bcy', 'loads', 'tons']

export function sanitizeItems(items: any, opts: { withTier?: boolean } = {}): any[] {
  if (!Array.isArray(items)) return []
  return items
    .filter((it) => it && ALLOWED_WORK_TYPES.has(it.work_type))
    .map((it) => {
      const clean: any = {
        work_type: it.work_type,
        label: typeof it.label === 'string' ? it.label.slice(0, 120) : null,
        soil_class: typeof it.soil_class === 'string' ? it.soil_class : null,
        protection: ['sloped', 'shored', 'box', 'none'].includes(it.protection) ? it.protection : null,
        // A missing confidence is treated as a poor one, so an item the model
        // forgot to score lands flagged for review instead of sliding onto a
        // bid on nobody's authority.
        confidence: typeof it.confidence === 'number' ? Math.max(0, Math.min(1, it.confidence)) : 0.5,
        source_ref: typeof it.source_ref === 'string' ? it.source_ref.slice(0, 300) : null,
        assumptions: Array.isArray(it.assumptions)
          ? it.assumptions
              .filter((a: any) => typeof a === 'string')
              .map((a: string) => a.split(/;|—\s*CORRECTION/i)[0].trim().slice(0, 90))
              .filter(Boolean)
              .slice(0, 4)
          : [],
      }

      for (const f of NUM_FIELDS) {
        const v = Number(it[f])
        clean[f] = Number.isFinite(v) && v > 0 ? v : null
      }

      // The model is told not to do arithmetic, and mostly obeys. When it
      // slips and returns a volume it worked out from dimensions it also gave
      // us, drop the volume: the engine derives it from the geometry, and two
      // sources for one number is how they end up disagreeing.
      if (clean.volume_bcy != null && GEOMETRY_FIELDS.some((f) => clean[f] != null)) {
        clean.volume_bcy = null
      }

      if (opts.withTier) {
        const tier = [1, 2, 3].includes(Number(it.tier)) ? Number(it.tier) : 2
        clean.tier = tier
        // Tier 3 means "scaled off the drawing", which the prompt forbids. If
        // one slips through anyway, cap it so the UI holds it for review.
        if (tier === 3) clean.confidence = Math.min(clean.confidence, 0.4)
      }

      return clean
    })
}
