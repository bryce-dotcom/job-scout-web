import { describe, it, expect } from 'vitest'
import {
  TILE_PX, ATTRIBUTION, tileUrl, geocodeUrl, tileXY, tilePlan, firstGeocodeMatch, geocodeProblem,
} from './aerialTile'

// Bryce: "is there another way to do it for all the users for free". Yes —
// Esri's World geocoder and World Imagery, both keyless, both CORS-enabled so
// the browser calls them directly. Verified live against 6395 W 10400 N,
// Highland UT: score 100, and the zoom-20 tile came back as a real JPEG.
//
// The Census geocoder was the first choice and had to be dropped: it sends no
// Access-Control-Allow-Origin, so a browser cannot call it at all. Checked
// with curl rather than discovered in the console.

describe('the free sources', () => {
  it('asks Esri for the tile in z/y/x order, which is what ArcGIS serves', () => {
    expect(tileUrl(20, 400, 300)).toBe(
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/20/400/300',
    )
  })

  it('credits the imagery, because their terms ask for it', () => {
    expect(ATTRIBUTION).toMatch(/Esri/)
  })

  it('builds a geocode lookup that needs no key', () => {
    const u = geocodeUrl('6395 W 10400 N, Highland, UT 84003')
    expect(u).toMatch(/geocode\.arcgis\.com/)
    expect(u).not.toMatch(/key=|api_key|token=/)
    expect(u).toMatch(/6395%20W%2010400%20N/)
  })
})

describe('where a property sits on the map', () => {
  const LAT = 40.420771, LNG = -111.810966

  it('puts a known address in the tile it really belongs to', () => {
    const t = tileXY(LAT, LNG, 20)
    // Not hand-written: computed, then the tile at exactly these coordinates
    // was fetched and came back as a real JPEG from Esri.
    expect(Math.floor(t.x)).toBe(198614)
    expect(Math.floor(t.y)).toBe(395364)
  })

  it('refuses a latitude Mercator cannot express', () => {
    expect(tileXY(89, 0, 20)).toBe(null)
    expect(tileXY('nonsense', 0, 20)).toBe(null)
  })
})

describe('the stitch plan', () => {
  const plan = tilePlan(40.420771, -111.810966, 20, 3)

  it('is a 3x3 of 256px tiles — 768px, about 280ft across up here', () => {
    expect(plan.tiles).toHaveLength(9)
    expect(plan.size).toBe(3 * TILE_PX)
  })

  it('lays every tile at its own place on the canvas', () => {
    const spots = plan.tiles.map((t) => `${t.dx},${t.dy}`)
    expect(new Set(spots).size).toBe(9)
    expect(spots).toContain('0,0')
    expect(spots).toContain('512,512')
  })

  it('marks where the ADDRESS is, not the middle of the picture', () => {
    // The house is rarely centred in its own tile, so a pin dropped at the
    // image centre would sit on the neighbour as often as not.
    expect(plan.center.x).toBeGreaterThan(TILE_PX)
    expect(plan.center.x).toBeLessThan(TILE_PX * 2)
    expect(plan.center.y).toBeGreaterThan(TILE_PX)
    expect(plan.center.y).toBeLessThan(TILE_PX * 2)
  })

  it('forces an odd grid so a centre tile exists', () => {
    expect(tilePlan(40, -111, 20, 4).tiles).toHaveLength(9)
    expect(tilePlan(40, -111, 20, 1).tiles).toHaveLength(1)
  })

  it('returns nothing rather than a broken plan', () => {
    expect(tilePlan(91, 0, 20)).toBe(null)
  })
})

describe('reading the geocoder back', () => {
  // The shape Esri actually replied with, copied from a live call.
  const ok = {
    candidates: [{
      address: '6395 W 10400 N, American Fork, Utah, 84003',
      location: { x: -111.811200811306, y: 40.420801137117 },
      score: 100,
      attributes: { Match_addr: '6395 W 10400 N, American Fork, Utah, 84003' },
    }],
  }

  it('takes the best candidate', () => {
    const m = firstGeocodeMatch(ok)
    expect(m.lat).toBeCloseTo(40.4208, 4)
    expect(m.lng).toBeCloseTo(-111.8112, 4)
    expect(m.matched).toMatch(/6395 W 10400 N/)
    expect(m.score).toBe(100)
  })

  it('treats no match as no match, not as 0,0', () => {
    expect(firstGeocodeMatch({ candidates: [] })).toBe(null)
    expect(firstGeocodeMatch({})).toBe(null)
    expect(firstGeocodeMatch(null)).toBe(null)
  })

  it('says what to do about each failure', () => {
    expect(geocodeProblem('', ok)).toMatch(/Type the property address/)
    expect(geocodeProblem('12 Elm St', null)).toMatch(/Could not reach/)
    expect(geocodeProblem('12 Elm St', { candidates: [] })).toMatch(/without the unit number/)
    expect(geocodeProblem('12 Elm St', ok)).toBe(null)
  })
})
