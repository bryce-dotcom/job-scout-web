// How urgent a job is, and how to show it.
//
// Bryce (2026-10-12): "You know how on an app you get the little red circle
// that tells you how many messages you have… on jobs and on the job board we
// want that… 1-5, five being the highest level."
//
// Two rules carry the whole feature.
//
// ONE: the badge is ABSENT at normal. That is what makes a notification dot
// readable — you never see one when there is nothing to see. If every job
// defaults to 3 and every row wears a grey 3, the badge is wallpaper within a
// week and nobody looks at it again. So normal renders nothing, and the only
// circles on the board are the jobs that actually want attention.
//
// TWO: a level is 1-5 everywhere, but what each number is CALLED belongs to
// the company. A plumber's "urgent" and a lighting retrofit's "urgent" are not
// the same thing, and this is sold to thousands of businesses. The names and
// colours below are defaults that work with nothing configured; a tenant can
// override them in settings.job_priorities, exactly the way job_statuses
// already works (id + name + colour, see lib/jobStatus).
//
// Deliberately NOT derived from the job. An earlier sketch had urgency guessed
// from the status or the title ("Emergency…" comes in hot), which is the same
// string-matching that gave "sold" three different answers. Priority is what a
// person set, or it is normal.

/** 3 is normal. It is the middle of 1-5 and it renders no badge. */
export const NORMAL_PRIORITY = 3

export const MIN_PRIORITY = 1
export const MAX_PRIORITY = 5

/**
 * Defaults, highest first — the order a picker should offer them in.
 * Colours are the theme's own semantic set so the badge means the same thing
 * here as a red total does everywhere else.
 */
export const DEFAULT_PRIORITIES = [
  { level: 5, name: 'Urgent', color: '#ef4444' },
  { level: 4, name: 'High', color: '#eab308' },
  { level: 3, name: 'Normal', color: '#7d8a7f' },
  { level: 2, name: 'Low', color: '#3b82f6' },
  { level: 1, name: 'Whenever', color: '#7d8a7f' },
]

const clampLevel = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const i = Math.round(n)
  if (i < MIN_PRIORITY || i > MAX_PRIORITY) return null
  return i
}

/**
 * The levels this company uses: its own if it has configured any, otherwise
 * the defaults. A partial or broken config falls back per level rather than
 * wholesale, so one bad row cannot empty the picker.
 */
export function priorityLevels(configured) {
  const byLevel = new Map()
  if (Array.isArray(configured)) {
    for (const row of configured) {
      const level = clampLevel(row?.level)
      if (level == null) continue
      const fallback = DEFAULT_PRIORITIES.find(d => d.level === level)
      byLevel.set(level, {
        level,
        name: String(row?.name || '').trim() || fallback.name,
        color: String(row?.color || '').trim() || fallback.color,
      })
    }
  }
  return DEFAULT_PRIORITIES.map(d => byLevel.get(d.level) || d)
}

/** The settings key a company stores its own level names under. */
export const PRIORITY_SETTING_KEY = 'job_priorities'

/**
 * Pull the levels out of the raw settings rows the store already holds, so
 * no page has to know the key or parse the JSON itself. A row that will not
 * parse is the same as no row: the defaults.
 */
export function prioritiesFromSettings(settings) {
  const row = (settings || []).find(s => s?.key === PRIORITY_SETTING_KEY)
  if (!row?.value) return DEFAULT_PRIORITIES
  try {
    const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
    return priorityLevels(parsed)
  } catch {
    return DEFAULT_PRIORITIES
  }
}

/** What a job's priority is. Anything missing or nonsense is normal. */
export function priorityOf(job) {
  return clampLevel(job?.priority) ?? NORMAL_PRIORITY
}

/** Normal wears no badge — see rule ONE at the top. */
export function showsBadge(level) {
  return (clampLevel(level) ?? NORMAL_PRIORITY) !== NORMAL_PRIORITY
}

/**
 * Everything a badge needs, or null when there is nothing to draw.
 * `urgent` marks the levels that should read as alarming, so a renderer can
 * fill them solid instead of tinting them.
 */
export function priorityBadge(job, configured) {
  const level = priorityOf(job)
  if (!showsBadge(level)) return null
  const meta = priorityLevels(configured).find(p => p.level === level)
  return {
    level,
    name: meta.name,
    color: meta.color,
    urgent: level > NORMAL_PRIORITY,
    label: `${meta.name} priority`,
  }
}

/**
 * Sort comparator: urgent first, then the rest in the order they already had.
 * Returns 0 for equal priorities so a caller's existing sort survives — the
 * board still reads newest-first inside each level.
 */
export function comparePriority(a, b) {
  return priorityOf(b) - priorityOf(a)
}

/** Sort without disturbing the order within a level. */
export function sortByPriority(jobs) {
  return (jobs || [])
    .map((job, i) => ({ job, i }))
    .sort((x, y) => comparePriority(x.job, y.job) || x.i - y.i)
    .map(x => x.job)
}

/** Why this level cannot be saved, as a sentence — or null. */
export function priorityProblem(level) {
  return clampLevel(level) == null
    ? `Priority is ${MIN_PRIORITY} to ${MAX_PRIORITY}.`
    : null
}

/** What to write. Normal is stored as null so the column stays mostly empty. */
export function priorityValue(level) {
  const n = clampLevel(level)
  return n == null || n === NORMAL_PRIORITY ? null : n
}
