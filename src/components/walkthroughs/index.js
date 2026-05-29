// Walkthrough registry.
//
// Each feature in featureCatalog.js can specify `walkthrough: '<id>'` to
// render an in-app animated walkthrough instead of a recorded video.
// The Video Library modal picks the component out of this map.
//
// Adding a new walkthrough = drop a component in this folder, register
// it here, and reference the id from the catalog entry. No re-record
// needed — the animation lives in code and updates with the product.

import YardMeasureWalkthrough     from './YardMeasureWalkthrough'
import ProspectScoutWalkthrough   from './ProspectScoutWalkthrough'
import ZachPropertiesWalkthrough  from './ZachPropertiesWalkthrough'
import ZachVisitsWalkthrough      from './ZachVisitsWalkthrough'
import ZachTreatmentsWalkthrough  from './ZachTreatmentsWalkthrough'
import ZachPricingWalkthrough     from './ZachPricingWalkthrough'

export const WALKTHROUGHS = {
  'yard-measure':    YardMeasureWalkthrough,
  'prospect-scout':  ProspectScoutWalkthrough,
  'zach-properties': ZachPropertiesWalkthrough,
  'zach-visits':     ZachVisitsWalkthrough,
  'zach-treatments': ZachTreatmentsWalkthrough,
  'zach-pricing':    ZachPricingWalkthrough,
}

export function getWalkthrough(id) {
  return id ? WALKTHROUGHS[id] || null : null
}
