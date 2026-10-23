// The rooms people meet in.
//
// JobScout's world is topographic — contour lines, trails, the scout who
// walks the ground before the work starts. The rooms are named from that
// world rather than "Room 2", because a team that says "I'm on the Ridge"
// is a team that uses the thing.
//
// The main room always exists and is always The Campfire. Huddles are made
// on the spot and take the next unused name, so nobody has to invent one
// mid-conversation.

// NOT "Base Camp" — /base-camp is already the AI Crew page where you recruit
// agents, and two things with one name in one product is how people end up in
// the wrong place. The Campfire is where everyone gathers anyway.
export const MAIN_ROOM = { slug: 'the-campfire', name: 'The Campfire', blurb: 'Everyone gathers here' }

/**
 * A FireSide's name is the creator's, not ours.
 *
 * Bryce, 2026-10-22: "the creator can choose the name, like FireSide-Sales".
 * A room called The Ridge is charming and useless for a standing meeting —
 * the sales team wants to see the word Sales. So the typed word becomes the
 * name and the FireSide- prefix is applied for them, which keeps every room
 * in the list reading as one family without anybody having to type it.
 */
export const FIRESIDE_PREFIX = 'FireSide'

/** 'sales' -> 'FireSide-Sales'. Already-prefixed input is not doubled. */
export function fireSideName(input: any): string {
  const raw = String(input || '').trim().replace(/^fireside[-\s]*/i, '')
  if (!raw) return ''
  const cleaned = raw.replace(/[^A-Za-z0-9 &'-]/g, '').trim().slice(0, 32)
  if (!cleaned) return ''
  const titled = cleaned.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return `${FIRESIDE_PREFIX}-${titled}`
}

/** 'FireSide-Sales' -> 'fireside-sales'. Stable, so the room id is stable. */
export function fireSideSlug(input: any): string {
  const name = fireSideName(input)
  if (!name) return ''
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Fallback names, for when somebody cannot think of one. */
export const ROOM_NAMES = [
  { slug: 'the-ridge', name: 'The Ridge', blurb: 'Up where you can see the whole job' },
  { slug: 'switchback', name: 'Switchback', blurb: 'For the problem you have to come at twice' },
  { slug: 'the-overlook', name: 'The Overlook', blurb: 'Quiet corner, long view' },
  { slug: 'trailhead', name: 'Trailhead', blurb: 'Start of something new' },
  { slug: 'timberline', name: 'Timberline', blurb: 'Where the trees give up' },
  { slug: 'fire-lookout', name: 'Fire Lookout', blurb: 'Someone is watching the horizon' },
  { slug: 'echo-canyon', name: 'Echo Canyon', blurb: 'Say it twice, hear it four times' },
  { slug: 'north-face', name: 'North Face', blurb: 'The hard side' },
  { slug: 'the-bivouac', name: 'The Bivouac', blurb: 'Quick stop, not staying long' },
  { slug: 'compass-rose', name: 'Compass Rose', blurb: 'For deciding which way' },
  { slug: 'dry-creek', name: 'Dry Creek', blurb: 'Bring your own water' },
  { slug: 'high-meadow', name: 'High Meadow', blurb: 'Room to spread out' },
  { slug: 'saddle-pass', name: 'Saddle Pass', blurb: 'Between two summits' },
  { slug: 'boulder-field', name: 'Boulder Field', blurb: 'Watch your step' },
  { slug: 'the-cairn', name: 'The Cairn', blurb: 'Someone marked this spot' },
  { slug: 'still-water', name: 'Still Water', blurb: 'Deep and quiet' },
  { slug: 'lantern-hollow', name: 'Lantern Hollow', blurb: 'Late work, warm light' },
  { slug: 'granite-bench', name: 'Granite Bench', blurb: 'Sit a while' },
]

/**
 * The next room name nobody is using.
 *
 * Takes the first free name rather than a random one, so the same team keeps
 * meeting on the Ridge instead of somewhere new every time — a name only
 * becomes shorthand if it comes back. Falls through to a numbered camp if a
 * company somehow fills all eighteen at once; a party that size has bigger
 * problems than the name.
 */
export function nextRoomName(takenSlugs: any[] = []) {
  const taken = new Set((takenSlugs || []).filter(Boolean))
  const free = ROOM_NAMES.find(r => !taken.has(r.slug))
  if (free) return free
  let n = 2
  while (taken.has(`camp-${n}`)) n++
  return { slug: `camp-${n}`, name: `Camp ${n}`, blurb: 'Overflow' }
}

/** A room's display details, whether it is the main room or a side room. */
export function roomMeta(slug: string) {
  if (slug === MAIN_ROOM.slug) return MAIN_ROOM
  const known = ROOM_NAMES.find(r => r.slug === slug)
  if (known) return known
  // A named FireSide, rebuilt from its slug. Without this the generic
  // titleize turns 'fireside-sales' into "Fireside Sales", so the sidebar
  // and the lobby disagreed about the name of the same room — and the one
  // the creator actually typed was the one that got lost.
  if (/^fireside-/i.test(slug)) {
    return { slug, name: fireSideName(slug.replace(/^fireside-/i, '').replace(/-/g, ' ')), blurb: '' }
  }
  return { slug, name: titleize(slug), blurb: '' }
}

function titleize(slug: string) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Room'
}

/**
 * The LiveKit room a client is allowed to join.
 *
 * ALWAYS namespaced by company. The room id is the only thing standing
 * between two tenants on the same media server, and it is built on the
 * server from the caller's own JWT — never from anything the browser sends.
 * A bare slug like "base-camp" would put every company on the planet in one
 * call together.
 */
export function roomId(companyId: any, slug: any): string | null {
  const c = parseInt(companyId)
  if (!Number.isFinite(c) || c <= 0) return null
  const s = String(slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!s) return null
  return `co${c}__${s}`
}

/** Reads a room id back, for logging and for tests. */
export function parseRoomId(id: any) {
  const m = /^co(\d+)__([a-z0-9-]+)$/.exec(String(id || ''))
  return m ? { companyId: Number(m[1]), slug: m[2] } : null
}

/** How a name reads in the lobby when people are in it. */
export function occupancyLabel(count: any) {
  const n = Number(count) || 0
  if (n === 0) return 'Empty'
  if (n === 1) return '1 person'
  return `${n} people`
}
