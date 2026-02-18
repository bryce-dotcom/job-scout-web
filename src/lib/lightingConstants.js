// Lamp technology types (shared across FixtureTypes, audit forms)
export const LAMP_TYPES = [
  'T12', 'T8', 'T5', 'T5HO', 'Metal Halide', 'HPS',
  'Mercury Vapor', 'Halogen', 'Incandescent', 'CFL', 'LED', 'Other'
]

// Fixture categories (shared across FixtureTypes, audit forms)
export const FIXTURE_CATEGORIES = [
  'Linear', 'High Bay', 'Low Bay', 'Surface Mount', 'Outdoor', 'Recessed',
  'Track', 'Wall Pack', 'Flood', 'Area Light', 'Canopy', 'Other'
]

// Common existing SYSTEM wattages by lighting type for quick-select buttons
// These are TOTAL fixture wattages including ballast losses (not just lamp watts)
export const COMMON_WATTAGES = {
  'T12':            [46, 72, 86, 128, 158, 172],
  'T8':             [32, 59, 85, 112, 118],
  'T5':             [28, 58, 84],
  'T5HO':           [118, 234, 348, 464],
  'Metal Halide':   [85, 120, 185, 210, 290, 455, 1080],
  'HPS':            [85, 120, 185, 240, 295, 465, 1100],
  'Mercury Vapor':  [200, 290, 455, 1075],
  'Halogen':        [50, 75, 90, 150, 300, 500],
  'Incandescent':   [40, 60, 75, 100, 150],
  'CFL':            [13, 18, 26, 32, 42],
  'LED':            [10, 20, 30, 50, 100, 150, 200, 300, 400],
  'Other':          []
}

// Map AI fixture_category values to our fixture categories
export const AI_CATEGORY_MAP = {
  'Indoor Linear': 'Linear',
  'Indoor High Bay': 'High Bay',
  'Indoor Surface Mount': 'Surface Mount',
  'Indoor Recessed': 'Recessed',
  'Outdoor': 'Outdoor',
  'Decorative': 'Other',
  'Other': 'Other'
}

// Map AI lamp_type values to our dropdown values
export const AI_LAMP_TYPE_MAP = {
  'T12': 'T12',
  'T8': 'T8',
  'T5': 'T5',
  'T5HO': 'T5HO',
  'MH': 'Metal Halide',
  'Metal Halide': 'Metal Halide',
  'HPS': 'HPS',
  'MV': 'Mercury Vapor',
  'Mercury Vapor': 'Mercury Vapor',
  'Halogen': 'Halogen',
  'Incandescent': 'Incandescent',
  'CFL': 'CFL',
  'LED': 'LED',
  'Other': 'Other'
}

// Product filtering keywords by fixture category
export const PRODUCT_CATEGORY_KEYWORDS = {
  'Linear':        ['linear', 'troffer', 'strip', 'tube', 't8', 't5', 't12', 'wrap'],
  'High Bay':      ['high bay', 'highbay', 'ufo'],
  'Low Bay':       ['low bay', 'lowbay'],
  'Surface Mount': ['surface', 'flush', 'ceiling', 'drum', 'disc'],
  'Outdoor':       ['outdoor', 'exterior'],
  'Recessed':      ['recessed', 'downlight', 'can light'],
  'Track':         ['track'],
  'Wall Pack':     ['wall pack', 'wallpack'],
  'Flood':         ['flood', 'floodlight'],
  'Area Light':    ['area light', 'parking', 'pole', 'shoebox'],
  'Canopy':        ['canopy']
}
