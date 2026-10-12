import { describe, it, expect } from 'vitest'
import {
  NORMAL_PRIORITY, DEFAULT_PRIORITIES,
  priorityLevels, priorityOf, showsBadge, priorityBadge,
  comparePriority, sortByPriority, priorityProblem, priorityValue, prioritiesFromSettings,
} from './jobPriority'

const job = (priority) => ({ id: 1, priority })

describe('the badge is absent at normal', () => {
  it('draws nothing for a normal job', () => {
    expect(priorityBadge(job(3))).toBe(null)
    expect(showsBadge(3)).toBe(false)
  })

  it('draws nothing for a job nobody has touched', () => {
    // The whole board is this case on day one. If it badged, it would be
    // wallpaper before anybody set a single priority.
    expect(priorityBadge({ id: 1 })).toBe(null)
    expect(priorityBadge(job(null))).toBe(null)
    expect(priorityBadge(job(undefined))).toBe(null)
  })

  it('draws for anything above or below normal', () => {
    expect(priorityBadge(job(5))?.level).toBe(5)
    expect(priorityBadge(job(4))?.level).toBe(4)
    expect(priorityBadge(job(2))?.level).toBe(2)
    expect(priorityBadge(job(1))?.level).toBe(1)
  })

  it('marks which ones should read as alarming', () => {
    expect(priorityBadge(job(5)).urgent).toBe(true)
    expect(priorityBadge(job(4)).urgent).toBe(true)
    expect(priorityBadge(job(2)).urgent).toBe(false)
  })

  it('names the badge for a screen reader', () => {
    expect(priorityBadge(job(5)).label).toBe('Urgent priority')
  })
})

describe('garbage is normal, never a badge', () => {
  it('ignores values outside 1-5', () => {
    expect(priorityOf(job(0))).toBe(NORMAL_PRIORITY)
    expect(priorityOf(job(6))).toBe(NORMAL_PRIORITY)
    expect(priorityOf(job(-2))).toBe(NORMAL_PRIORITY)
    expect(priorityOf(job('urgent'))).toBe(NORMAL_PRIORITY)
    expect(priorityOf(null)).toBe(NORMAL_PRIORITY)
  })

  it('reads a number that arrived as a string', () => {
    // PostgREST hands smallint back as a number, but a form input does not.
    expect(priorityOf(job('5'))).toBe(5)
  })
})

describe('a company names its own levels', () => {
  it('uses the defaults when nothing is configured', () => {
    expect(priorityLevels(null)).toEqual(DEFAULT_PRIORITIES)
    expect(priorityLevels([])).toEqual(DEFAULT_PRIORITIES)
    expect(priorityLevels('nonsense')).toEqual(DEFAULT_PRIORITIES)
  })

  it('takes the company word over ours', () => {
    const levels = priorityLevels([{ level: 5, name: 'Drop everything', color: '#900' }])
    expect(levels.find(l => l.level === 5)).toEqual({ level: 5, name: 'Drop everything', color: '#900' })
  })

  it('falls back one level at a time, so a bad row cannot empty the picker', () => {
    const levels = priorityLevels([
      { level: 5, name: '  ', color: '' },
      { level: 9, name: 'Nope' },
      { level: 4, name: 'Rush' },
    ])
    expect(levels.find(l => l.level === 5).name).toBe('Urgent')
    expect(levels.find(l => l.level === 4).name).toBe('Rush')
    expect(levels).toHaveLength(5)
  })

  it('always offers five levels, highest first', () => {
    expect(priorityLevels([]).map(l => l.level)).toEqual([5, 4, 3, 2, 1])
  })

  it('uses the company name on the badge', () => {
    const badge = priorityBadge(job(5), [{ level: 5, name: 'Drop everything', color: '#900' }])
    expect(badge.name).toBe('Drop everything')
    expect(badge.color).toBe('#900')
  })
})

describe('reading the levels out of settings', () => {
  it('falls back to the defaults when the company has set none', () => {
    expect(prioritiesFromSettings([])).toEqual(DEFAULT_PRIORITIES)
    expect(prioritiesFromSettings(null)).toEqual(DEFAULT_PRIORITIES)
    expect(prioritiesFromSettings([{ key: 'job_statuses', value: '[]' }])).toEqual(DEFAULT_PRIORITIES)
  })

  it('parses the row the settings table actually stores', () => {
    // settings.value is TEXT holding JSON, the same as job_statuses.
    const rows = [{ key: 'job_priorities', value: '[{"level":5,"name":"Drop everything","color":"#900"}]' }]
    expect(prioritiesFromSettings(rows).find(l => l.level === 5).name).toBe('Drop everything')
  })

  it('treats an unparseable row as no row rather than throwing', () => {
    expect(prioritiesFromSettings([{ key: 'job_priorities', value: '{oops' }])).toEqual(DEFAULT_PRIORITIES)
  })
})

describe('the board sorts by it, or the badge is decoration', () => {
  it('puts urgent first', () => {
    const sorted = sortByPriority([job(3), job(5), job(1), job(4)])
    expect(sorted.map(j => j.priority)).toEqual([5, 4, 3, 1])
  })

  it('leaves the existing order alone inside a level', () => {
    // The list is newest-first already; priority must not scramble that.
    const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' }
    expect(sortByPriority([a, b, c]).map(j => j.id)).toEqual(['a', 'b', 'c'])
  })

  it('treats an unset job as normal when sorting', () => {
    const sorted = sortByPriority([job(2), { id: 'unset' }, job(5)])
    expect(sorted.map(j => j.priority ?? 'unset')).toEqual([5, 'unset', 2])
  })

  it('compares two jobs directly', () => {
    expect(comparePriority(job(5), job(3))).toBeLessThan(0)
    expect(comparePriority(job(3), job(5))).toBeGreaterThan(0)
    expect(comparePriority(job(3), job(3))).toBe(0)
  })
})

describe('what gets written', () => {
  it('stores normal as null, so the column stays mostly empty', () => {
    expect(priorityValue(3)).toBe(null)
    expect(priorityValue(null)).toBe(null)
  })

  it('stores anything else as the number', () => {
    expect(priorityValue(5)).toBe(5)
    expect(priorityValue('1')).toBe(1)
  })

  it('refuses a level nobody offered', () => {
    expect(priorityProblem(0)).toMatch(/1 to 5/)
    expect(priorityProblem(7)).toMatch(/1 to 5/)
    expect(priorityProblem(4)).toBe(null)
  })
})
