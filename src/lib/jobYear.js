// Which year a job belongs to on the Jobs page.
//
// Alayda, 24 Aug: "Active is reading 266 jobs under completed but isn't
// accurate, even if you click through all the years on the job menu tab."
//
// She was right, and the cause was this question being answered twice, two
// different ways, in the same file:
//
//   the year BUTTONS were built from ANY of start_date / completed_at /
//   created_at, then clamped to `y <= this year`
//   the row FILTER dated a job by the FIRST of those three that was set,
//   with no clamp
//
// So a job scheduled into next year got no button — the clamp removed it —
// while still being counted by the Active view. On HHH that hid 48 jobs, 47
// of them dated 2027 and one 2032, and 35 of those were Completed: the
// Completed chip read 233 while clicking through every year reached 198.
//
// One definition now, used for both. The guarantee that matters: every job
// this returns a year for has a button, so the years always add up to the
// total.

import { parseLocalDate } from './localDate'

// A date far enough outside any real schedule that it is data damage rather
// than a job — a typo'd year, an epoch zero. Those get no button, and no
// button is correct: there is nothing useful to click.
const MIN_YEAR = 1990
const MAX_YEAR = 2100

/**
 * The single date that decides a job's year: when the work happens. Scheduled
 * start, else when it was completed, else when the record was created.
 * @returns {number|null} the year, or null when the job has no usable date.
 */
export function jobYear(job) {
  const effective = job?.start_date || job?.completed_at || job?.created_at
  if (!effective) return null
  // parseLocalDate, not new Date(): a bare 'YYYY-MM-DD' parses as UTC
  // midnight, which west of Greenwich is the evening BEFORE — so a job dated
  // 2023-01-01 would read as 2023 in London and 2022 here, and land under the
  // wrong button. Same trap the dashboard hit; same helper fixes it.
  const parsed = parseLocalDate(effective)
  if (!parsed) return null
  const year = parsed.getFullYear()
  if (!Number.isFinite(year) || year < MIN_YEAR || year > MAX_YEAR) return null
  return year
}

/**
 * The years to offer as buttons: every year the filter can actually match,
 * newest first. Deliberately NOT clamped to the current year — a job
 * scheduled for next spring is a real job someone needs to find.
 */
export function availableJobYears(jobs) {
  const years = new Set()
  for (const j of jobs || []) {
    const y = jobYear(j)
    if (y !== null) years.add(y)
  }
  return [...years].sort((a, b) => b - a)
}
