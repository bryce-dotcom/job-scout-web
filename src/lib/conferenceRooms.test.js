import { describe, it, expect } from 'vitest'
import { MAIN_ROOM, ROOM_NAMES, nextRoomName, roomMeta, roomId, parseRoomId, occupancyLabel } from './conferenceRooms'

describe('the room id is the tenant boundary', () => {
  // The room id is the ONLY thing separating two companies on one media
  // server. Get it wrong and Summit Field Co joins HHH's conference call.
  it('namespaces every room by company', () => {
    expect(roomId(3, 'the-campfire')).toBe('co3__the-campfire')
    expect(roomId(25, 'the-campfire')).toBe('co25__the-campfire')
    expect(roomId(3, 'the-campfire')).not.toBe(roomId(25, 'the-campfire'))
  })

  it('round-trips, so a log line can be read back', () => {
    expect(parseRoomId(roomId(3, 'the-ridge'))).toEqual({ companyId: 3, slug: 'the-ridge' })
    expect(parseRoomId('nonsense')).toBeNull()
    expect(parseRoomId('')).toBeNull()
  })

  it('refuses a missing or junk company rather than making a shared room', () => {
    for (const bad of [null, undefined, 0, -1, 'abc', NaN]) {
      expect(roomId(bad, 'the-campfire')).toBeNull()
    }
  })

  it('strips anything that is not a slug, so a crafted name cannot escape its company', () => {
    // "../" or a second "__" would be the way out if the slug went through raw
    expect(roomId(3, '../co25__the-campfire')).toBe('co3__co25the-campfire')
    expect(roomId(3, 'BASE CAMP!!')).toBe('co3__basecamp')
    expect(roomId(3, '!!!')).toBeNull()
  })
})

describe('handing out a room name', () => {
  it('gives the first free name, so a team keeps meeting in the same place', () => {
    expect(nextRoomName([]).slug).toBe('the-ridge')
    expect(nextRoomName(['the-ridge']).slug).toBe('switchback')
    expect(nextRoomName(['the-ridge', 'switchback']).slug).toBe('the-overlook')
  })

  it('skips the ones in use whatever order they come in', () => {
    const taken = ['switchback', 'the-ridge', 'trailhead']
    expect(nextRoomName(taken).slug).toBe('the-overlook')
  })

  it('never hands out Base Camp as a side room', () => {
    expect(ROOM_NAMES.some(r => r.slug === MAIN_ROOM.slug)).toBe(false)
  })

  it('keeps going when every name is taken', () => {
    const all = ROOM_NAMES.map(r => r.slug)
    expect(nextRoomName(all).slug).toBe('camp-2')
    expect(nextRoomName([...all, 'camp-2']).slug).toBe('camp-3')
  })

  it('survives junk in the taken list', () => {
    expect(nextRoomName([null, undefined, '']).slug).toBe('the-ridge')
    expect(nextRoomName(null).slug).toBe('the-ridge')
  })
})

describe('what a room is called', () => {
  it('knows the main room and the themed ones', () => {
    expect(roomMeta('the-campfire').name).toBe('The Campfire')
    expect(roomMeta('fire-lookout').name).toBe('Fire Lookout')
  })

  it('makes something readable out of a name it does not know', () => {
    expect(roomMeta('camp-7').name).toBe('Camp 7')
    expect(roomMeta('').name).toBe('Room')
  })

  it('every name carries a blurb — the whole point is that it is fun', () => {
    for (const r of [MAIN_ROOM, ...ROOM_NAMES]) {
      expect(r.blurb, r.slug).toBeTruthy()
      expect(r.slug).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('has no duplicate slugs, or two rooms would be one room', () => {
    const slugs = [MAIN_ROOM, ...ROOM_NAMES].map(r => r.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})

describe('how the lobby reads', () => {
  it('counts people like a person would', () => {
    expect(occupancyLabel(0)).toBe('Empty')
    expect(occupancyLabel(1)).toBe('1 person')
    expect(occupancyLabel(4)).toBe('4 people')
    expect(occupancyLabel(null)).toBe('Empty')
  })
})
