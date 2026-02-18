// Lamp technology types (shared across FixtureTypes, audit forms)
export const LAMP_TYPES = [
  'T12', 'T8', 'T5', 'HID', 'Metal Halide', 'HPS',
  'Incandescent', 'CFL', 'LED', 'Other'
]

// Fixture categories (shared across FixtureTypes, audit forms)
export const FIXTURE_CATEGORIES = [
  'Linear', 'High Bay', 'Low Bay', 'Outdoor', 'Recessed',
  'Track', 'Wall Pack', 'Flood', 'Area Light', 'Canopy', 'Other'
]

// Common existing wattages by lighting type for quick-select buttons
export const COMMON_WATTAGES = {
  'T12':            [40, 80, 120, 150, 160],
  'T8':             [32, 64, 96, 128],
  'T5':             [28, 54, 108],
  'HID':            [175, 250, 400, 1000],
  'Metal Halide':   [175, 250, 400, 1000],
  'HPS':            [70, 100, 150, 250, 400, 1000],
  'Incandescent':   [60, 75, 100, 150, 200],
  'CFL':            [13, 26, 42],
  'LED':            [10, 20, 30, 50, 100, 150, 200, 300],
  'Other':          []
}

// Map AI fixture_category values to our fixture categories
export const AI_CATEGORY_MAP = {
  'Indoor Linear': 'Linear',
  'Indoor High Bay': 'High Bay',
  'Outdoor': 'Outdoor',
  'Decorative': 'Other',
  'Other': 'Other'
}

// Product filtering keywords by fixture category
export const PRODUCT_CATEGORY_KEYWORDS = {
  'Linear':     ['linear', 'troffer', 'strip', 'tube', 't8', 't5', 't12', 'wrap'],
  'High Bay':   ['high bay', 'highbay', 'ufo'],
  'Low Bay':    ['low bay', 'lowbay'],
  'Outdoor':    ['outdoor', 'exterior'],
  'Recessed':   ['recessed', 'downlight', 'can light'],
  'Track':      ['track'],
  'Wall Pack':  ['wall pack', 'wallpack'],
  'Flood':      ['flood', 'floodlight'],
  'Area Light': ['area light', 'parking', 'pole', 'shoebox'],
  'Canopy':     ['canopy']
}
