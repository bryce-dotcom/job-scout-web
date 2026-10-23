import { describe, it, expect } from 'vitest'
import { normalizeName, parseCrew, isOnCrew, resolveCrewIds, formatCrew } from './crewRoster'

// Company 3's real roster, including the two names that broke the old
// matchers: employee 55 was stored as "Robyn Lyman " (trailing space), and
// "Cole Westcott" is a substring of "Nycole Westcott".
const ROSTER = [
  { id: 16, name: 'Cole Westcott' },
  { id: 145, name: 'Nycole Westcott' },
  { id: 55, name: 'Robyn Lyman' },
  { id: 36, name: 'Cameron McDonough' },
  { id: 60, name: 'Kayden Spiker' },
]

describe('normalizeName', () => {
  it('ignores outer whitespace and casing', () => {
    expect(normalizeName('  Robyn Lyman ')).toBe('robyn lyman')
    expect(normalizeName('ROBYN LYMAN')).toBe('robyn lyman')
  })

  it('collapses doubled inner spaces, so a stray keystroke still matches', () => {
    expect(normalizeName('Robyn  Lyman')).toBe('robyn lyman')
  })

  it('is empty for anything that is not a string', () => {
    for (const v of [null, undefined, 42, {}, []]) expect(normalizeName(v)).toBe('')
  })
})

describe('parseCrew', () => {
  it('splits the ordinary comma string', () => {
    expect(parseCrew('Cameron McDonough, Kayden Spiker')).toEqual(['Cameron McDonough', 'Kayden Spiker'])
  })

  it('trims each token — the shape that hid Robyn for 23 jobs', () => {
    expect(parseCrew('Robyn Lyman ')).toEqual(['Robyn Lyman'])
    expect(parseCrew('Cameron McDonough, Kayden Spiker, Robyn Lyman ')).toHaveLength(3)
  })

  it('is empty for an unassigned job', () => {
    for (const v of [null, undefined, '', '   ', ',', ' , , ']) expect(parseCrew(v)).toEqual([])
  })

  it('accepts a real array', () => {
    expect(parseCrew(['Cole Westcott', ' Robyn Lyman '])).toEqual(['Cole Westcott', 'Robyn Lyman'])
  })

  // One job in company 3 literally holds '["HHH Team A"]'.
  it('recovers an array that was JSON-stringified into the text column', () => {
    expect(parseCrew('["HHH Team A"]')).toEqual(['HHH Team A'])
    expect(parseCrew('["Cole Westcott","Robyn Lyman"]')).toEqual(['Cole Westcott', 'Robyn Lyman'])
  })

  it('does not mistake a name in brackets for JSON', () => {
    expect(parseCrew('[not json')).toEqual(['[not json'])
    expect(parseCrew('[Crew A]')).toEqual(['[Crew A]'])
  })
})

describe('isOnCrew', () => {
  it('matches despite the stored trailing space', () => {
    expect(isOnCrew('Robyn Lyman ', { name: 'Robyn Lyman' })).toBe(true)
    expect(isOnCrew('Robyn Lyman', { name: 'Robyn Lyman ' })).toBe(true)
  })

  it('matches regardless of casing', () => {
    expect(isOnCrew('robyn lyman', { name: 'Robyn Lyman' })).toBe(true)
  })

  // The bug the substring matchers had: FieldScout decided which jobs a field
  // employee sees with .includes(), so Nycole's jobs showed up on Cole's.
  it('does NOT match a name that is merely a substring of a crew member', () => {
    expect(isOnCrew('Nycole Westcott', { name: 'Cole Westcott' })).toBe(false)
    expect(isOnCrew('Nycole Westcott', ROSTER.find((e) => e.id === 16))).toBe(false)
  })

  it('still matches the person actually on the crew', () => {
    expect(isOnCrew('Nycole Westcott', { name: 'Nycole Westcott' })).toBe(true)
  })

  it('finds someone in the middle of a multi-person crew', () => {
    const crew = 'Cameron McDonough, Kayden Spiker, Robyn Lyman '
    expect(isOnCrew(crew, { name: 'Kayden Spiker' })).toBe(true)
    expect(isOnCrew(crew, { name: 'Robyn Lyman' })).toBe(true)
    expect(isOnCrew(crew, { name: 'Cole Westcott' })).toBe(false)
  })

  it('accepts a bare name as well as an employee row', () => {
    expect(isOnCrew('Robyn Lyman', 'Robyn Lyman')).toBe(true)
  })

  it('is false rather than throwing on junk', () => {
    expect(isOnCrew(null, { name: 'Cole Westcott' })).toBe(false)
    expect(isOnCrew('Cole Westcott', null)).toBe(false)
    expect(isOnCrew('Cole Westcott', { name: '' })).toBe(false)
    expect(isOnCrew('Cole Westcott', {})).toBe(false)
  })
})

describe('resolveCrewIds', () => {
  it('resolves the stored string to ids', () => {
    expect(resolveCrewIds('Cameron McDonough, Kayden Spiker', ROSTER)).toEqual(['36', '60'])
  })

  // This is the regression: with "Robyn Lyman " on the employee row and the
  // parser trimming its own side, the old `e.name === n` found nothing, and
  // saving the job wrote the crew back without her.
  it('resolves a name whose stored form has stray whitespace', () => {
    expect(resolveCrewIds('Robyn Lyman ', ROSTER)).toEqual(['55'])
    expect(resolveCrewIds('Robyn Lyman', [{ id: 55, name: 'Robyn Lyman ' }])).toEqual(['55'])
  })

  it('keeps the order the job lists them in', () => {
    expect(resolveCrewIds('Kayden Spiker, Cameron McDonough', ROSTER)).toEqual(['60', '36'])
  })

  it('drops a token matching nobody — "Cameron" alone is in the real data', () => {
    expect(resolveCrewIds('Cameron, Kayden Spiker', ROSTER)).toEqual(['60'])
    expect(resolveCrewIds('["HHH Team A"]', ROSTER)).toEqual([])
  })

  it('does not resolve a substring to the wrong person', () => {
    expect(resolveCrewIds('Nycole Westcott', ROSTER)).toEqual(['145'])
  })

  it('is empty for no crew or no roster', () => {
    expect(resolveCrewIds(null, ROSTER)).toEqual([])
    expect(resolveCrewIds('Cole Westcott', null)).toEqual([])
  })
})

describe('formatCrew', () => {
  it('joins the selected people in order', () => {
    expect(formatCrew(['36', '60'], ROSTER)).toBe('Cameron McDonough, Kayden Spiker')
  })

  it('accepts numeric ids as well as strings', () => {
    expect(formatCrew([36, 60], ROSTER)).toBe('Cameron McDonough, Kayden Spiker')
  })

  it('writes an unassigned crew as null, not an empty string', () => {
    expect(formatCrew([], ROSTER)).toBe(null)
    expect(formatCrew(null, ROSTER)).toBe(null)
    expect(formatCrew(['999'], ROSTER)).toBe(null)
  })

  it('never writes a stray space back out, even from a untidy roster row', () => {
    expect(formatCrew(['55'], [{ id: 55, name: 'Robyn Lyman ' }])).toBe('Robyn Lyman')
  })
})

describe('the edit-form round trip', () => {
  // Open a job, change nothing, save. The crew must come out unchanged —
  // this is the loop that was dropping people.
  const roundTrip = (stored, roster = ROSTER) => formatCrew(resolveCrewIds(stored, roster), roster)

  it('preserves a crew whose stored name has a trailing space', () => {
    expect(roundTrip('Robyn Lyman ')).toBe('Robyn Lyman')
  })

  it('preserves a multi-person crew', () => {
    expect(roundTrip('Cameron McDonough, Kayden Spiker, Robyn Lyman ')).toBe(
      'Cameron McDonough, Kayden Spiker, Robyn Lyman'
    )
  })

  it('is stable — a second save changes nothing', () => {
    const once = roundTrip('Cameron McDonough, Kayden Spiker')
    expect(roundTrip(once)).toBe(once)
  })

  it('does not silently swap Cole for Nycole', () => {
    expect(roundTrip('Nycole Westcott')).toBe('Nycole Westcott')
  })

  // Honest about the limit: a token matching no employee cannot survive a
  // round trip through an id-based multi-select. Worth knowing it drops.
  it('drops an unresolvable token, as the roster is the authority', () => {
    expect(roundTrip('Cameron, Kayden Spiker')).toBe('Kayden Spiker')
  })
})
