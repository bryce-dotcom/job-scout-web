// Reading a photograph of a building into a window takeoff.
//
// This is Lenard's shape applied to glass. Lenard points a camera at a fixture
// and the answer is "that is a 4ft 2-lamp T8, 59 system watts" — looked up in a
// reference table, not guessed. Walter points a camera at an elevation and the
// answer is "four double-hungs on the second storey, sill about 13ft up". In
// both cases the model OBSERVES and the table does the arithmetic.
//
// Two rules hold this together, and both exist because of money:
//
//   1. THE MODEL NEVER COUNTS PANES. It counts UNITS of a named type. Six
//      double-hungs is six units; the catalogue says a double-hung is two
//      panes and rowPanes() multiplies. A model asked for panes would report
//      twelve, and a model asked for both would eventually report twelve units
//      of two panes and bill the house twice.
//
//   2. THE MODEL NEVER NAMES A PRODUCT OR A PRICE. The product comes off the
//      tenant's own price book through cleaningWorkKey() and the matcher. A
//      photo that proposed "$6 per pane" would be inventing the one number the
//      company already owns.
//
// Everything the model sends back is untrusted. normalizeAnalysis() is the
// gate: every type_code is checked against the catalogue, every enum against
// its list, every number clamped to something a building could actually be. A
// run whose type it invented keeps its count and loses its type, so the rep is
// asked to name it rather than being handed a silent wrong answer.

export const FACES = ['both', 'out', 'in'] as const
export const SEGMENTS = ['residential', 'commercial'] as const
export const CONDITIONS = ['maintenance', 'first_clean', 'post_construction', 'hard_water'] as const
export const CONFIDENCE = ['high', 'medium', 'low'] as const

export type Face = typeof FACES[number]
export type Segment = typeof SEGMENTS[number]
export type Condition = typeof CONDITIONS[number]
export type Confidence = typeof CONFIDENCE[number]

export interface PhotoContext {
  face?: Face | null
  segment?: Segment | null
  storeys?: number | null
  notes?: string | null
}

export interface PhotoRun {
  area_name: string | null
  type_code: string | null
  // What the model called it when the catalogue has no such code. Kept so the
  // rep can see the guess that was refused instead of a blank row.
  type_code_rejected: string | null
  units: number
  floor: number
  reach_in: number | null
  width_in: number | null
  height_in: number | null
  // true  = separate pieces of glass in a divided sash (bills by the lite)
  // false = a grille: one pane with a grid over or inside it
  // null  = could not tell from the photograph
  divided_lites: boolean | null
  screens_visible: boolean | null
  condition: Condition
  confidence: Confidence
  why: string | null
  watch_for: string | null
}

export interface PhotoAnalysis {
  surface: string | null
  storeys: number | null
  wall_material: string | null
  segment_looks_like: Segment | null
  scale: {
    reference_code: string | null
    reference_name: string | null
    dimension_in: number | null
    reliability: string | null
    how: string | null
  } | null
  runs: PhotoRun[]
  not_counted: string[]
  notes: string | null
}

// ── the prompt ──────────────────────────────────────────────────────────

const num = (v: unknown): string => (v === null || v === undefined ? '?' : String(v))

/**
 * One line per window type, straight off the catalogue.
 *
 * The lites column is the one that costs money, so it is spelled out rather
 * than printed as a number: "12 lites, BILLED BY THE LITE" reads as an
 * instruction, where "lites=12" reads as trivia.
 */
function catalogueTable(types: any[]): string {
  return types.map((t) => {
    const panes = Number(t.panes_per_unit) || 1
    const lites = Number(t.lites_per_unit) || panes
    const billing = t.bill_lites
      ? `${lites} lites, BILLED BY THE LITE`
      : `${panes} pane${panes === 1 ? '' : 's'}`
    const size = `${num(t.typical_width_in)}x${num(t.typical_height_in)}in typical`
    const extras: string[] = []
    if (Number(t.screens_per_unit) > 0) extras.push(`${t.screens_per_unit} screen${Number(t.screens_per_unit) === 1 ? '' : 's'}`)
    if (t.has_track) extras.push('has a track')
    const where = Array.isArray(t.typical_locations) && t.typical_locations.length
      ? ` Found: ${t.typical_locations.join(', ')}.`
      : ''
    const tips = t.identification_tips ? ` HOW TO TELL: ${t.identification_tips}` : ''
    const miss = t.common_mistakes ? ` MISTAKE TO AVOID: ${t.common_mistakes}` : ''
    return `${t.type_code} | ${t.type_name} | ${t.family} | ${billing} | ${size}${extras.length ? ' | ' + extras.join(', ') : ''}${where}${tips}${miss}`
  }).join('\n')
}

function scaleTable(scale: any[]): string {
  return scale.map((s) =>
    `${s.reference_code} | ${s.reference_name} | ${s.dimension_in}in ${s.dimension_of} | reliability ${s.reliability} | ${s.notes || ''}`
  ).join('\n')
}

export function buildWindowPhotoPrompt(
  { types, scale, context }: { types: any[]; scale: any[]; context?: PhotoContext | null },
): string {
  const ctx = context || {}
  const jobFace = ctx.face && FACES.includes(ctx.face)
    ? { both: 'inside AND outside', out: 'the outside only', in: 'the inside only' }[ctx.face]
    : null
  const said: string[] = []
  if (ctx.segment) said.push(`The rep has this job down as ${ctx.segment}.`)
  if (jobFace) said.push(`The job is being quoted for ${jobFace}.`)
  if (ctx.storeys) said.push(`The rep says the building is ${ctx.storeys} storey(s).`)
  if (ctx.notes) said.push(`The rep's note with the photo: "${String(ctx.notes).slice(0, 400)}"`)

  return `You are Walter, a window cleaning estimator. A rep standing at a job has just taken this photograph and needs the windows in it counted.

Your entire job is to record WHAT IS THERE. You do not price anything, you never name a product, and you never give a dollar figure — the company's own price book does that afterwards from your count.

${said.length ? `WHAT THE REP TOLD YOU\n${said.map((s) => `• ${s}`).join('\n')}\n` : ''}
STEP 1 — SAY WHAT YOU ARE LOOKING AT BEFORE YOU NAME ANYTHING
Describe the photograph first, out loud, in your reasoning: is it the outside of a building or a room inside? How many storeys can you see? What is the wall made of — brick, concrete block, vinyl siding, stucco, glass? Where is the door? Is this the whole elevation or a corner of it? Do not start naming window types until you have done this. A model that names first and looks second counts the windows it expected instead of the windows in the frame.

STEP 2 — NAME EACH WINDOW FROM THIS CATALOGUE, AND ONLY FROM THIS CATALOGUE
Use the type_code exactly as written. If nothing in the catalogue fits what you can see, say so in watch_for and leave type_code null — do NOT invent a code and do NOT force a window into the nearest row.

type_code | name | family | how it bills | typical size | extras | notes
${catalogueTable(types)}

STEP 3 — COUNT UNITS. NEVER COUNT PANES.
units is how many WINDOWS of that type you can see, as a person would count them standing in the yard. Six double-hung windows is units: 6. It is NOT 12. The catalogue already knows a double-hung holds two pieces of glass and the arithmetic is done after you. If you report panes the house gets billed twice.

STEP 4 — THE ONE EXPENSIVE MISTAKE: A GRILLE IS NOT DIVIDED GLASS
A window crossed by a white grid is either
  • TRUE DIVIDED LITES — separate small panes puttied into the sash, each one washed by hand. Bills by the lite, so a 6-over-6 is twelve pieces of glass instead of two. Use divided_lite_6 (or french_door, jalousie) and set divided_lites: true.
  • A GRILLE — one full-size pane with a grid snapped onto it or sealed between the glass. Washes in one wipe like any other pane. Use grille_insert or the plain type, and set divided_lites: false.
Nearly every window built since about 1980 is a grille. True divided lites belong to old houses, historic sashes, and interior french doors. Tell them apart by looking at the bars where they meet the glass: a true muntin casts a shadow and carries putty or a glazing bead, and the grid lines usually do not line up perfectly from sash to sash. A grille is flat, perfectly even, often visibly BEHIND the glass surface, and the reflection of the sky runs across it unbroken. If you cannot tell at this resolution, set divided_lites: null and say so in watch_for. Guessing true costs the customer six times the right price; guessing false costs the company a day of labour. Null is the honest answer and the rep will walk over and touch it.

STEP 5 — HOW HIGH, MEASURED AGAINST SOMETHING IN THE FRAME
Do not estimate heights by eye. Find one of these references in the photograph, name it, and work from it. State which one you used and how, in scale.how.

reference_code | name | dimension | reliability | notes
${scaleTable(scale)}

Then for each run give:
  • floor — 1 for ground, 2 for the second storey, and so on. Count storeys off the glazing lines, not off apparent height.
  • reach_in — how far ABOVE THE GROUND the TOP of that glass is, in inches, derived from the reference. This is the number that decides whether the crew is on a ladder, a waterfed pole or a lift, so it matters more than the window's own size.
If no reference is in the frame, say so in scale.how, leave reach_in null, and still give floor if you can count storeys. A named reference with a reliability of low beats a confident guess with none.

STEP 6 — CONDITION
  • maintenance — ordinary dirt, a house that gets cleaned.
  • first_clean — visibly neglected: streaked, filmed, cobwebbed, years of it.
  • post_construction — stickers or labels still on the glass, stucco or paint spatter, mortar haze, no landscaping in, dirt where a lawn will go. This one changes the whole price, so only say it when the picture shows building work.
  • hard_water — white or cloudy mineral staining, usually on the lower glass and usually on the sprinkler side.
Default to maintenance. Do not read a dirty photograph as dirty glass.

STEP 7 — SAY WHAT YOU CANNOT SEE
A photograph of the front of a house is not a count of the house. List in not_counted every obvious thing this frame does not show: the other elevations, the inside, windows behind a tree or a vehicle, basement or below-grade openings, skylights, anything cut off by the edge of the frame. The rep is going to walk the property and this list is what they walk with. Be specific — "the rear and both side elevations", not "other windows".

STEP 8 — GROUP INTO RUNS
One run = one type of window, on one storey, that the crew treats the same way. Four matching double-hungs across the upstairs is one run with units: 4. Give each run an area_name a person would recognise — "Front elevation, upstairs", "Living room picture window", "Garage side". Do not make a run per window.
Set confidence per run: high if you can see it plainly, medium if you are inferring from partial view or resolution, low if you are largely guessing. A low-confidence run is useful; a run dressed up as high is not.

STEP 9 — RETURN ONLY THIS JSON, AND NOTHING ELSE
No preamble, no markdown fence, no commentary after it.

{
  "surface": "one line on what this photograph is, e.g. front elevation of a two-storey brick house",
  "storeys": 2,
  "wall_material": "brick",
  "segment_looks_like": "residential" | "commercial",
  "scale": {
    "reference_code": "entry_door",
    "how": "the front door leaf is 80in and the upstairs sills sit just over two door-heights above it"
  },
  "runs": [
    {
      "area_name": "Front elevation, upstairs",
      "type_code": "double_hung",
      "units": 4,
      "floor": 2,
      "reach_in": 156,
      "width_in": 32,
      "height_in": 60,
      "divided_lites": false,
      "screens_visible": true,
      "condition": "maintenance",
      "confidence": "high",
      "why": "horizontal meeting rail across the middle of each sash, screens on the lower half",
      "watch_for": "could be single-hung — bills the same either way, so it does not matter here"
    }
  ],
  "not_counted": ["the rear and both side elevations", "the inside of every window"],
  "notes": "anything the rep should know that does not belong to one run"
}`
}

// ── normalising what comes back ─────────────────────────────────────────

const clamp = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.min(hi, Math.max(lo, n))
}

const str = (v: unknown, max = 400): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

const tri = (v: unknown): boolean | null => (v === true ? true : v === false ? false : null)

const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T | null): T | null => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return (list as readonly string[]).includes(s) ? (s as T) : fallback
}

/**
 * Turn whatever the model sent into something the count sheet can hold.
 *
 * Nothing here trusts the model. A type_code it invented is refused and
 * remembered; a units of 0 or "lots" becomes 1; a reach of 40 feet on a house
 * is clamped rather than passed to accessFor(), which would quietly put the
 * crew on ropes. The run survives in every case, because a run with a number
 * the rep can correct is worth more than a dropped run nobody knows about.
 */
export function normalizeAnalysis(raw: any, types: any[], scale: any[] = []): PhotoAnalysis {
  const known = new Set((types || []).map((t: any) => String(t.type_code)))
  // The reference the model names is looked up rather than taken on its word,
  // so the inches and the reliability shown to the rep are the table's.
  const scaleByCode = new Map((scale || []).map((s: any) => [String(s.reference_code), s]))

  const runsIn = Array.isArray(raw?.runs) ? raw.runs : []
  const runs: PhotoRun[] = runsIn.slice(0, 40).map((r: any) => {
    const said = str(r?.type_code, 60)
    const ok = said && known.has(said)
    return {
      area_name: str(r?.area_name, 80),
      type_code: ok ? said : null,
      type_code_rejected: ok ? null : said,
      units: clamp(r?.units, 1, 500) ?? 1,
      floor: clamp(r?.floor, 1, 60) ?? 1,
      reach_in: clamp(r?.reach_in, 0, 9600),
      width_in: clamp(r?.width_in, 1, 600),
      height_in: clamp(r?.height_in, 1, 600),
      divided_lites: tri(r?.divided_lites),
      screens_visible: tri(r?.screens_visible),
      condition: oneOf(r?.condition, CONDITIONS, 'maintenance') as Condition,
      confidence: oneOf(r?.confidence, CONFIDENCE, 'low') as Confidence,
      why: str(r?.why, 300),
      watch_for: str(r?.watch_for, 300),
    }
  })

  const refCode = str(raw?.scale?.reference_code, 40)
  const ref: any = refCode ? scaleByCode.get(refCode) : null

  return {
    surface: str(raw?.surface, 200),
    storeys: clamp(raw?.storeys, 1, 60),
    wall_material: str(raw?.wall_material, 60),
    segment_looks_like: oneOf(raw?.segment_looks_like, SEGMENTS, null),
    scale: refCode
      ? {
          reference_code: refCode,
          reference_name: ref ? String(ref.reference_name) : null,
          dimension_in: ref ? Number(ref.dimension_in) : null,
          reliability: ref ? String(ref.reliability) : null,
          how: str(raw?.scale?.how, 300),
        }
      : null,
    runs,
    not_counted: (Array.isArray(raw?.not_counted) ? raw.not_counted : [])
      .slice(0, 12).map((s: any) => str(s, 160)).filter(Boolean) as string[],
    notes: str(raw?.notes, 600),
  }
}

/**
 * Can this proposal be added to the takeoff as it stands?
 *
 * Only once it has a type. The catalogue is where the pane count comes from,
 * and priceTakeoff() flags a type_code it does not KNOW — but a run whose
 * type was refused has no code at all, so it would pass straight through
 * billed at a single pane a unit. Six double-hungs would go on the bid as six
 * panes instead of twelve. The rule lives here rather than in the screen
 * because a screen is exactly the sort of thing that forgets it.
 */
export function runReady(run: PhotoRun | null | undefined): boolean {
  return !!run?.type_code
}

/**
 * A proposed run as a glass_areas row.
 *
 * face and segment come from the REP, not the photograph — an exterior picture
 * says nothing about whether the inside was sold, and the assessment already
 * knows whose building it is. The two fields the photograph does own are
 * translated rather than copied:
 *
 *   divided_lites -> count_lites, the flag rowPanes() reads to bill by the lite
 *   screens_visible -> screens, where FALSE means a hard zero (no screens are
 *     on this house) and TRUE means null — leave it, because the catalogue
 *     knows a slider_3 carries two screens and the photo does not.
 */
export function photoRunToRow(
  run: PhotoRun,
  { face, segment }: { face?: Face | null; segment?: Segment | null } = {},
): Record<string, unknown> {
  return {
    area_name: run.area_name,
    type_code: run.type_code,
    units: run.units,
    face: oneOf(face, FACES, 'both'),
    segment: oneOf(segment, SEGMENTS, 'residential'),
    floor: run.floor,
    condition: run.condition,
    width_in: run.width_in,
    height_in: run.height_in,
    reach_in: run.reach_in,
    count_lites: run.divided_lites,
    screens: run.screens_visible === false ? 0 : null,
    tracks: null,
  }
}
