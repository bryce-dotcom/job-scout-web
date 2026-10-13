// Record where the phone is, right now.
//
// The background timer (hooks/useLocationTracking) fires every 15 minutes —
// but only while the app is awake. Measured across HHH, 1 Sep to 13 Oct 2026:
//
//   Alayda (office, app open all day)   1,438 pings over 13 shifts   ~110/shift
//   Tracy  (office)                     1,262 over 33               ~38/shift
//   London (field)                        269 over 44                ~6/shift
//   Mike   (field)                        289 over 56                ~5/shift
//   Cameron (field)                        92 over 30                ~3/shift
//
// A 5.6-hour shift of London's recorded two pings; at a true 15-minute cadence
// it would have twenty-two. The interval is not the limit — the phone is. A
// browser suspends timers the moment the app goes to the background or the
// screen locks, and no web app can ask for a position while it is asleep.
// Shortening the interval multiplies pings for the people at desks, adds
// almost nothing in the field, and costs battery on both.
//
// So: take a fix at the moments the app is demonstrably awake, because
// somebody just did something in it. Those are the minutes that matter anyway
// — arriving, starting, photographing, finishing.

import { supabase } from './supabase'

/** Why a fix was taken. Shown on the trail so a dot means something. */
export const PING_REASONS = {
  interval: 'On the clock',
  resume: 'Opened the app',
  clock_in: 'Clocked in',
  clock_out: 'Clocked out',
  job_start: 'Started the job',
  job_complete: 'Completed the job',
  photo: 'Added a photo',
  verification: 'Victor check',
  payment: 'Collected payment',
}

/**
 * Take one position and store it. Never throws, never blocks the caller's
 * work: a tech finishing a job must not see an error because location was
 * refused, and the job must still complete.
 *
 * @returns the inserted row's coordinates, or null if nothing was recorded.
 */
export async function recordPing({ companyId, employeeId, timeClockId = null, reason = 'interval' } = {}) {
  if (!companyId || !employeeId) return null
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        // Same options as the interval ping: a rooftop-accurate fix costs
        // seconds and battery, and a hundred metres is plenty to answer
        // "was he at this job or twenty miles away".
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
      })
    })
    const row = {
      company_id: companyId,
      employee_id: employeeId,
      time_clock_id: timeClockId,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null,
      pinged_at: new Date().toISOString(),
      reason,
    }
    const { error } = await supabase.from('location_pings').insert(row)
    if (error) {
      // An older database without the column must not lose the fix itself.
      if (/reason/.test(error.message || '')) {
        const { reason: _dropped, ...withoutReason } = row
        await supabase.from('location_pings').insert(withoutReason)
      } else {
        return null
      }
    }
    return { lat: row.lat, lng: row.lng, accuracy: row.accuracy }
  } catch {
    // Permission refused, no fix, timeout — all of it is normal in a
    // basement or a steel building. Silence is deliberate.
    return null
  }
}
