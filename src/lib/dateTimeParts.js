// Splitting a datetime-local value into the date and the time.
//
// Christopher: "It feels like a glitch having to take the extra step to close
// the text box after picking a start and end date for a job. once a date is
// picked the box has to be closed so other details can be added to the job."
//
// The cause is the input type, not our code. Chrome closes the picker for
// <input type="date"> the moment you click a day, because the answer is
// complete. For <input type="datetime-local"> it stays open — it still wants a
// time — and nothing on our side can dismiss a native picker; there is no API
// for it. So the field becomes two fields: pick the day and the calendar
// closes itself, then set the time beside it.
//
// The value the form holds does not change shape. Everything downstream —
// fromZonedInput, the timezone resolution, the calendar sync — keeps receiving
// exactly the same 'YYYY-MM-DDTHH:mm' string it received before.

/** 'YYYY-MM-DDTHH:mm' -> { date: 'YYYY-MM-DD', time: 'HH:mm' }. */
export function splitDateTimeInput(value) {
  const s = String(value ?? '')
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  if (m) return { date: m[1], time: m[2] }
  // A date with no time is a legitimate half-filled state while typing.
  const d = s.match(/^(\d{4}-\d{2}-\d{2})$/)
  if (d) return { date: d[1], time: '' }
  return { date: '', time: '' }
}

/**
 * Put the halves back together.
 *
 * A date with no time gets 08:00 rather than nothing, because a job with a day
 * and no time is what someone means by "that Tuesday" — and returning '' there
 * would silently discard the day they just picked, which is the same class of
 * bug as the line-item draft. A time with no date is not a moment, so it stays
 * empty until a day is chosen.
 */
export function joinDateTimeInput(date, time, defaultTime = '08:00') {
  const d = String(date ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return ''
  const t = String(time ?? '').trim()
  const useTime = /^\d{2}:\d{2}$/.test(t) ? t : defaultTime
  return `${d}T${useTime}`
}
