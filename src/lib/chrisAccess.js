// What it costs to REACH the roofline.
//
// Phase 1 priced the feet. The feet are not the job: the same 180 ft is a
// morning off a step ladder on a ranch house and a day with a lift on a
// two-storey with a steep pitch over a conservatory. Bryce: "look to see if
// its a two story or if a lift will be needed".
//
// Everything here is a rate the tenant sets. The defaults below are STARTERS
// so a company that has configured nothing still sees a believable number,
// and every one of them is surfaced as "change this" rather than buried —
// an invented rate that reaches a customer is worse than a blank field.
//
// Height is not read from a map. A roof's storey count comes from a picture
// of the front of the house, because that is the thing a human can check and
// a plan view cannot show. The aerial pass offers a guess; a photo settles it.

/** Starter rates. Every one is overridable per company. */
export const ACCESS_DEFAULTS = {
  install_ft_per_hour: 40,     // a two-person crew, clips on a single-storey eave
  two_storey_factor: 1.6,      // ladder resets, safety, a spotter who is not clipping
  steep_pitch_factor: 1.25,    // walking a 8/12 is slower than a 4/12
  lift_day_rate: 350,          // towable boom, local hire, one day
  lift_delivery: 150,
}

const num = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

export const STOREYS = ['1', '2', '3+', 'unsure']

/**
 * Does this job need a lift?
 *
 * Two storeys alone does not: plenty of installers do a second storey off a
 * 28ft extension ladder. A lift becomes the answer when the ladder cannot be
 * FOOTED — over a conservatory, a steep bank, water, a flat roof below — or
 * at three storeys where no ladder reaches safely.
 *
 * The honest default for an unsure read is "ask", never "yes" and never "no":
 * guessing cheap loses money and guessing dear loses the job.
 */
export function liftDecision({ storeys, obstructions = [], pitch } = {}) {
  const s = String(storeys ?? '').trim()
  const blocked = (obstructions || []).filter(Boolean).length > 0

  if (s === '3+') return { lift: true, why: 'Three storeys or more — no ladder reaches that safely.', certain: true }
  if (blocked) {
    return {
      lift: true,
      certain: true,
      why: `A ladder cannot be footed here (${obstructions.filter(Boolean).join(', ')}), so the run needs a lift.`,
    }
  }
  if (s === '2' && String(pitch ?? '').toLowerCase() === 'steep') {
    return { lift: true, certain: false, why: 'Two storeys with a steep pitch — price the lift unless the crew says otherwise.' }
  }
  if (s === '2') return { lift: false, certain: true, why: 'Two storeys off ladders. No lift priced.' }
  if (s === '1') return { lift: false, certain: true, why: 'Single storey. No lift priced.' }
  return { lift: false, certain: false, why: 'Height unclear from the picture — check on site before this goes out.' }
}

/** Crew hours for a run of this length at this height. */
export function installHours({ feet, storeys, pitch, rates = {} } = {}) {
  const r = { ...ACCESS_DEFAULTS, ...rates }
  const ft = Math.max(0, num(feet))
  const perHour = num(r.install_ft_per_hour, ACCESS_DEFAULTS.install_ft_per_hour)
  if (ft <= 0 || perHour <= 0) return 0
  let hours = ft / perHour
  const s = String(storeys ?? '')
  if (s === '2' || s === '3+') hours *= num(r.two_storey_factor, ACCESS_DEFAULTS.two_storey_factor)
  if (String(pitch ?? '').toLowerCase() === 'steep') hours *= num(r.steep_pitch_factor, ACCESS_DEFAULTS.steep_pitch_factor)
  return Math.round(hours * 10) / 10
}

/**
 * The extra lines access adds to the estimate.
 *
 * A single-storey job adds nothing — the per-foot rate already covers it, and
 * a zero line on a customer's estimate is noise. Everything above that is
 * named, so the customer can see what they are paying for and the rep can
 * argue it.
 */
export function accessLines({ feet, storeys, pitch, obstructions = [], laborRate, rates = {} } = {}) {
  const r = { ...ACCESS_DEFAULTS, ...rates }
  const decision = liftDecision({ storeys, obstructions, pitch })
  const lines = []

  const baseHours = installHours({ feet, storeys: '1', pitch: null, rates: r })
  const realHours = installHours({ feet, storeys, pitch, rates: r })
  const extraHours = Math.round((realHours - baseHours) * 10) / 10
  const rate = num(laborRate)

  if (extraHours > 0 && rate > 0) {
    const why = String(pitch ?? '').toLowerCase() === 'steep' && (storeys === '2' || storeys === '3+')
      ? 'Two-storey work on a steep pitch'
      : (storeys === '2' || storeys === '3+') ? 'Two-storey work' : 'Steep pitch'
    lines.push({
      item_name: 'Height and access',
      description: `${why} — ${extraHours} extra crew hours over a single-storey run of the same length.`,
      quantity: extraHours,
      price: Math.round(rate * 100) / 100,
      unit_of_measure: 'hr',
      kind: 'service',
    })
  }

  if (decision.lift) {
    const total = num(r.lift_day_rate, ACCESS_DEFAULTS.lift_day_rate) + num(r.lift_delivery, ACCESS_DEFAULTS.lift_delivery)
    lines.push({
      item_name: 'Lift hire',
      description: `${decision.why} Hire and delivery for the install day; taken down the same way.`,
      quantity: 1,
      price: Math.round(total * 100) / 100,
      unit_of_measure: 'ea',
      kind: 'equipment',
    })
  }
  return lines
}

/** What the rep should be told before this goes to a customer, or null. */
export function accessWarning(decision) {
  if (!decision) return null
  if (decision.certain) return null
  return `${decision.why} This estimate is a guess until someone confirms it.`
}
