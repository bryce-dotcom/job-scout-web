// =====================================================================
// Engine hours, idle hours, odometer — derived in exactly one place.
//
// Every screen that talks about the cost of owning a machine needs these
// three numbers, and they are easy to get subtly wrong in four different
// ways. So the arithmetic lives here and nowhere else.
//
// What the provider actually gives us:
//   /devices/{id}/engine_change_logs   ignition on/off EVENTS, newest ~30
//   /devices/{id}/trips                movement, with start/end times
//   trip summary.ending_mileage        a cumulative odometer
//
// Note what is NOT given: an hour meter. Watchdog reports ignition
// transitions, so hours have to be reconstructed by pairing them. And since
// only the most recent events come back, anything not persisted before it
// rolls off the end is gone permanently — which is why fleet_engine_events
// stores the raw events and this module recomputes from the stored copy
// rather than from whatever the last poll happened to return.
//
// IMPORTANT — these are OBSERVED hours, not lifetime hours. A tracker knows
// only what it has watched since it was installed. Lifetime meter reading =
// a human-entered anchor (fleet_meter_readings.source='manual') plus observed
// hours accrued after it. Never present observed hours as the machine's hour
// meter; a buyer reads the meter on the dash, not our database.
// =====================================================================

export interface EngineEvent {
  engine_on: boolean
  occurred_at: string
}

export interface Interval { start: number; end: number }

export interface MeterResult {
  engineHours: number
  /**
   * Engine-on time during which NO trip was recorded at all.
   *
   * This is a FLOOR on idling, not idling. A trip's window runs from first
   * movement to last movement, so a machine sitting at a job site with the
   * engine running mid-trip is inside the trip window and invisible here.
   * Measured on live data this reads 0.00 for a road truck, which is true
   * for the thing it measures and badly false for the thing people will
   * assume it measures.
   *
   * Real idle needs per-second speed, which means trip breadcrumbs
   * (/trips/{id}/locations) or dense position sampling. Until one of those
   * feeds exists, present this as "engine on, not on a trip" or not at all.
   */
  idleFloorHours: number
  /** engineHours - idleFloorHours. Inherits the caveat above. */
  movingHours: number
  /** Set when the engine is still running: the ISO time it started. */
  openSince: string | null
  /** Events that could not be paired. Non-zero is normal; large is a signal. */
  unpaired: number
  /** Window the numbers cover, so callers don't imply more than we watched. */
  observedFrom: string | null
  observedTo: string | null
}

const HOUR = 3_600_000

/**
 * Pair ignition events into engine-on intervals.
 *
 * The messy realities this has to survive, all of which occur in live data:
 *   - duplicate consecutive states (on,on) — a re-report, not a second start
 *   - an `off` with no preceding `on` — the `on` rolled off the API's window
 *   - a trailing `on` with no `off` — the engine is running right now
 *   - events arriving out of chronological order
 *
 * A leading orphan `off` is discarded rather than assumed to have started at
 * the beginning of the window. Assuming would silently invent hours, and
 * invented hours become invented depreciation.
 */
export function toEngineIntervals(events: EngineEvent[], now = Date.now()): {
  intervals: Interval[]
  openSince: number | null
  unpaired: number
} {
  const sorted = [...events]
    .filter(e => e && e.occurred_at)
    .map(e => ({ on: !!e.engine_on, t: new Date(e.occurred_at).getTime() }))
    .filter(e => Number.isFinite(e.t))
    .sort((a, b) => a.t - b.t)

  const intervals: Interval[] = []
  let openAt: number | null = null
  let unpaired = 0

  for (const e of sorted) {
    if (e.on) {
      // Already running: a repeat report. Keep the ORIGINAL start — taking the
      // later one would quietly shorten every interval it touches.
      if (openAt !== null) { unpaired++; continue }
      openAt = e.t
    } else {
      if (openAt === null) { unpaired++; continue }   // orphan off; see above
      if (e.t > openAt) intervals.push({ start: openAt, end: e.t })
      openAt = null
    }
  }

  // Engine still running. Counted up to now so a machine idling since
  // yesterday morning shows up today rather than after someone shuts it off.
  if (openAt !== null && now > openAt) intervals.push({ start: openAt, end: now })

  return { intervals, openSince: openAt, unpaired }
}

/** Merge overlapping intervals so shared time is never counted twice. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].filter(i => i.end > i.start).sort((a, b) => a.start - b.start)
  const out: Interval[] = []
  for (const cur of sorted) {
    const last = out[out.length - 1]
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end)
    else out.push({ ...cur })
  }
  return out
}

/** Total milliseconds of `a` that no interval in `b` covers. */
export function subtractCoverage(a: Interval[], b: Interval[]): number {
  const cover = mergeIntervals(b)
  let uncovered = 0
  for (const iv of mergeIntervals(a)) {
    let cursor = iv.start
    for (const c of cover) {
      if (c.end <= cursor) continue
      if (c.start >= iv.end) break
      if (c.start > cursor) uncovered += c.start - cursor
      cursor = Math.max(cursor, c.end)
      if (cursor >= iv.end) break
    }
    if (cursor < iv.end) uncovered += iv.end - cursor
  }
  return uncovered
}

/**
 * Engine, idle and working hours for one asset.
 *
 * idle = engine-on time that no trip accounts for. This is the number the
 * whole lifecycle argument rests on: hours accumulated while parked wear the
 * machine and depreciate it exactly as fast as hours spent working, but earn
 * nothing. Fuel burned idling is the small half of that cost; resale value
 * burned is the large half, and nobody bills for it because nobody sees it.
 *
 * Trips are trusted as the definition of "moving". Where a machine works
 * without moving — an excavator digging in one spot, a bucket truck with the
 * boom up — this over-reports idle. That is a real limitation and belongs in
 * the UI copy rather than being papered over here; PTO-style assets need a
 * different signal than GPS displacement.
 */
export function computeMeters(
  events: EngineEvent[],
  tripIntervals: Interval[],
  now = Date.now(),
): MeterResult {
  const { intervals, openSince, unpaired } = toEngineIntervals(events, now)
  const merged = mergeIntervals(intervals)

  const engineMs = merged.reduce((sum, i) => sum + (i.end - i.start), 0)
  const idleMs = subtractCoverage(merged, tripIntervals)

  const round = (ms: number) => Math.round((ms / HOUR) * 100) / 100
  const engineHours = round(engineMs)
  const idleFloorHours = Math.min(round(idleMs), engineHours)   // a subset of engine time

  return {
    engineHours,
    idleFloorHours,
    movingHours: Math.round((engineHours - idleFloorHours) * 100) / 100,
    openSince: openSince === null ? null : new Date(openSince).toISOString(),
    unpaired,
    observedFrom: merged.length ? new Date(merged[0].start).toISOString() : null,
    observedTo: merged.length ? new Date(merged[merged.length - 1].end).toISOString() : null,
  }
}

/**
 * Trip rows -> MOVEMENT intervals.
 *
 * A trip carries two different windows and picking the wrong one silently
 * destroys the idle metric:
 *
 *   start_time / end_time            the ignition cycle
 *   summary.start_time / end_time    when the vehicle was actually moving
 *
 * Measured against live data, the outer window runs ~0.5h longer than the
 * summary on every single trip — a constant tail, which is the provider's
 * trip-close timeout rather than anything the machine did. Using the outer
 * window makes trips cover every ignition-on minute, so idle computes to
 * exactly zero on every asset forever, and reads as a real answer.
 *
 * So movement is the summary window. The outer window is used only when no
 * summary exists yet (trips finalise late), where over-reporting movement is
 * the safer error: it under-reports idle rather than inventing it.
 */
export function tripsToIntervals(trips: any[]): Interval[] {
  const out: Interval[] = []
  for (const t of trips || []) {
    const sm = t?.summary
    const rawStart = sm?.start_time ?? t?.start_time ?? t?.started_at
    const rawEnd = sm?.end_time ?? t?.end_time ?? t?.ended_at
    const s = new Date(rawStart ?? 0).getTime()
    const e = new Date(rawEnd ?? 0).getTime()
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) out.push({ start: s, end: e })
  }
  return out
}

/**
 * Highest cumulative odometer seen across trips.
 *
 * Deliberately a max rather than a sum: ending_mileage is already cumulative,
 * so adding trips together would multiply the reading. Guards against the
 * occasional zero/negative a provider emits mid-trip.
 */
export function odometerFromTrips(trips: any[]): number | null {
  let best: number | null = null
  for (const t of trips || []) {
    const raw = t?.summary?.ending_mileage ?? t?.ending_mileage
    const n = raw === null || raw === undefined ? NaN : Number(raw)
    if (Number.isFinite(n) && n > 0 && (best === null || n > best)) best = n
  }
  return best === null ? null : Math.round(best * 10) / 10
}
