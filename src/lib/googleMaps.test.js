import { describe, it, expect, vi } from 'vitest'
import { awaitLibraries } from './googleMaps'

// A rep hit "window.google.maps.Map is not a constructor" on /company-map.
// With loading=async the callback fires when the LOADER is ready, not when the
// classes exist — google.maps is present while google.maps.Map is undefined.

describe('the map promise means the map can be built', () => {
  it('waits for every library the app constructs from', async () => {
    const asked = []
    const google = { maps: { importLibrary: (lib) => { asked.push(lib); return Promise.resolve({}) } } }
    await awaitLibraries(google)
    // maps for Map/Marker/InfoWindow/Polygon, geocoding for Geocoder,
    // places for Autocomplete, drawing for the polygon tool, geometry for area.
    expect(asked).toEqual(expect.arrayContaining(['maps', 'geocoding', 'places', 'drawing', 'geometry']))
  })

  it('does not resolve before the libraries do', async () => {
    let release
    const gate = new Promise(r => { release = r })
    const google = { maps: { importLibrary: () => gate } }
    let settled = false
    const p = awaitLibraries(google).then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)   // still waiting
    release({})
    await p
    expect(settled).toBe(true)
  })

  it('passes the google object straight through for the classic loader', async () => {
    // No importLibrary means the old bootstrap, which had everything ready.
    const google = { maps: { Map: function () {} } }
    await expect(awaitLibraries(google)).resolves.toBe(google)
  })

  it('surfaces a library failure instead of resolving with a half-loaded API', async () => {
    const google = { maps: { importLibrary: () => Promise.reject(new Error('network')) } }
    await expect(awaitLibraries(google)).rejects.toThrow('network')
  })

  it('survives a missing or malformed google object', async () => {
    await expect(awaitLibraries(undefined)).resolves.toBe(undefined)
    await expect(awaitLibraries({})).resolves.toEqual({})
  })
})
