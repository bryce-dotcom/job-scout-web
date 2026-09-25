import { describe, it, expect } from 'vitest'
import {
  deriveBrandKitFromEos, setupProgress, styleExamples, platformProblems,
  composeCaption, buildPublishPayload, capturePath, brandsFrom, brandKey, brandProfileUsername, brandForUnit,
  postDay, postsByDay, weekOf, weekProgress, monthGrid,
} from './marketing'

const eos = {
  core_values: [{ value: 'Honest' }, { value: 'Humble' }, { value: 'Helpful' }],
  core_focus: { purpose: 'to make buildings cheaper to run', niche: 'Commercial LED retrofits' },
  marketing: { target_market: 'Utah warehouses', three_uniques: ['Utility rebates handled', '', 'Same-week install'], guarantee: 'Savings or we pay the difference' },
}
const company = { company_name: 'HHH', website: 'https://hhh.services', logo_url: 'https://x/logo.png', city: 'Ogden', state: 'UT' }

describe('deriveBrandKitFromEos', () => {
  it('fills a blank kit from EOS and the company row', () => {
    const kit = deriveBrandKitFromEos({ eos, company })
    expect(kit.values).toEqual(['Honest', 'Humble', 'Helpful'])
    expect(kit.uniques).toEqual(['Utility rebates handled', 'Same-week install'])
    expect(kit.audience).toBe('Utah warehouses')
    expect(kit.tagline).toBe('Commercial LED retrofits')
    expect(kit.service_area).toBe('Ogden, UT')
    expect(kit.voice).toContain('make buildings cheaper to run')
    expect(kit.tone_words).toEqual(['honest', 'humble', 'helpful'])
    expect(kit.derived_from_eos_at).toBeTruthy()
  })
  it('never overwrites what the user already typed', () => {
    const existing = { voice: 'We are blunt.', audience: 'Everyone', values: ['Speed'] }
    const kit = deriveBrandKitFromEos({ eos, company, existing })
    expect(kit.voice).toBe('We are blunt.')
    expect(kit.audience).toBe('Everyone')
    expect(kit.values).toEqual(['Speed'])
    expect(kit.guarantee).toBe('Savings or we pay the difference') // blank got filled
  })
  it('survives an empty EOS', () => {
    const kit = deriveBrandKitFromEos({ eos: {}, company: {} })
    expect(kit.voice).toBe('')
    expect(kit.values).toEqual([])
  })
})

describe('setupProgress', () => {
  it('is 0/3 for a fresh company', () => {
    expect(setupProgress({}).done).toBe(0)
  })
  it('counts a profile with no linked account as channels NOT done', () => {
    const p = setupProgress({ brandKit: { voice: 'x', audience: 'y' }, publisher: { profile_username: 'jobscout-25', accounts: [] } })
    expect(p.steps.find((s) => s.id === 'channels').done).toBe(false)
    expect(p.done).toBe(1)
  })
  it('completes with a linked account and a scheduled post', () => {
    const p = setupProgress({
      brandKit: { voice: 'x', services: ['LED'] },
      publisher: { profile_username: 'jobscout-25', accounts: [{ platform: 'facebook' }] },
      posts: [{ status: 'scheduled' }],
    })
    expect(p.complete).toBe(true)
  })
})

describe('styleExamples', () => {
  const posts = [
    { status: 'posted', caption: 'A', ai_draft: 'A', approved_at: '2026-09-01' },
    { status: 'posted', caption: 'B edited', ai_draft: 'B', approved_at: '2026-09-03' },
    { status: 'draft', caption: 'C', ai_draft: 'C', approved_at: '2026-09-04' },
    { status: 'failed', caption: 'D', ai_draft: 'Dx', approved_at: '2026-09-05' },
    { status: 'approved', caption: 'E', ai_draft: null, approved_at: '2026-09-02' },
  ]
  it('uses only approved/scheduled/posted captions, newest first', () => {
    const { approved } = styleExamples(posts)
    expect(approved).toEqual(['B edited', 'E', 'A'])
  })
  it('an edit pair needs a draft that differs from the caption', () => {
    const { edits } = styleExamples(posts)
    expect(edits).toEqual([{ before: 'B', after: 'B edited' }])
  })
  it('honours the caps', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ status: 'posted', caption: `c${i}`, ai_draft: `d${i}`, approved_at: `2026-01-${String(i + 1).padStart(2, '0')}` }))
    const { approved, edits } = styleExamples(many, { maxApproved: 5, maxEdits: 2 })
    expect(approved.length).toBe(5)
    expect(edits.length).toBe(2)
  })
})

describe('platformProblems', () => {
  it('instagram without media is refused', () => {
    const p = platformProblems({ platforms: ['instagram', 'facebook'], caption: 'hi' })
    expect(p.map((x) => x.platform)).toEqual(['instagram'])
  })
  it('tiktok with a photo is refused', () => {
    const p = platformProblems({ platforms: ['tiktok'], caption: 'hi', mediaUrls: ['u'], mediaType: 'image' })
    expect(p[0].reason).toMatch(/video only/)
  })
  it('twitter over 280 characters is refused', () => {
    const p = platformProblems({ platforms: ['x'], caption: 'x'.repeat(281) })
    expect(p[0].reason).toMatch(/280/)
  })
  it('a clean post has no problems', () => {
    expect(platformProblems({ platforms: ['facebook', 'google_business'], caption: 'hi' })).toEqual([])
  })
})

describe('composeCaption + buildPublishPayload', () => {
  it('adds # to bare hashtags and separates them with a blank line', () => {
    expect(composeCaption('Done.', ['led', '#utah', 'two words'])).toBe('Done.\n\n#led #utah #twowords')
  })
  it('omits photos when there is none and sets scheduled_date only for the future', () => {
    const future = new Date(Date.now() + 3600e3).toISOString()
    const body = buildPublishPayload({ caption: 'hi', hashtags: [], platforms: ['facebook'], media_urls: [], scheduled_for: future })
    expect(body.photos).toBeUndefined()
    expect(body.scheduled_date).toBe(future)
  })
  it('a past scheduled_for means post now (no scheduled_date)', () => {
    const body = buildPublishPayload({ caption: 'hi', platforms: ['facebook'], scheduled_for: '2020-01-01T00:00:00Z', media_urls: ['https://a/b.jpg'] })
    expect(body.scheduled_date).toBeUndefined()
    expect(body.photos).toEqual(['https://a/b.jpg'])
  })
})

describe('capturePath', () => {
  it('starts with the company id folder and sanitises the name', () => {
    const p = capturePath(3, 'my photo (1).JPG', new Date('2026-09-24T10:00:00Z'))
    expect(p.startsWith('3/2026-09/')).toBe(true)
    expect(p.endsWith('_my_photo__1_.JPG')).toBe(true)
  })
})

describe('brands', () => {
  const co = { company_name: 'HHH', logo_url: 'l' }
  it('no setting = one default brand named after the company', () => {
    const b = brandsFrom(null, co)
    expect(b).toEqual([{ id: '', name: 'HHH', unit: null, logo_url: 'l' }])
    expect(brandKey('marketing_brand_kit', b[0].id)).toBe('marketing_brand_kit')
    expect(brandProfileUsername(3, b[0].id)).toBe('jobscout-3')
  })
  it('derives ids, keys and profile names from brand names', () => {
    const b = brandsFrom([{ name: 'Energy Scout', unit: 'Energy Scout' }, { name: 'JobScout' }], co)
    expect(b.map((x) => x.id)).toEqual(['energy-scout', 'jobscout'])
    expect(brandKey('marketing_publisher', 'energy-scout')).toBe('marketing_publisher:energy-scout')
    expect(brandProfileUsername(3, 'jobscout')).toBe('jobscout-3-jobscout')
  })
  it('a job feeds the brand that names its unit; unmatched waits for a human', () => {
    const b = brandsFrom([{ name: 'HHH Building Services', unit: 'HHH Building Services' }, { name: 'Energy Scout', unit: 'Energy Scout' }, { name: 'JobScout' }], co)
    expect(brandForUnit(b, 'energy scout')).toBe('energy-scout')
    expect(brandForUnit(b, 'Landscaping')).toBeNull()
    expect(brandForUnit(b, null)).toBeNull()
  })
  it('a single-brand company routes every job to it', () => {
    expect(brandForUnit(brandsFrom(null, co), 'whatever')).toBe('')
  })
})

describe('calendar & cadence', () => {
  const mk = (status, at) => ({ status, posted_at: status === 'posted' ? at : null, scheduled_for: status === 'scheduled' ? at : null, created_at: at })
  it('a post lands on the day it went out, is due, or was written', () => {
    expect(postDay(mk('posted', '2026-09-22T15:00:00'))).toBe('2026-09-22')
    expect(postDay(mk('scheduled', '2026-09-27T09:00:00'))).toBe('2026-09-27')
    expect(postDay(mk('draft', '2026-09-24T08:00:00'))).toBe('2026-09-24')
  })
  it('groups by day and counts the Monday-start week against the target', () => {
    const wed = new Date('2026-09-23T12:00:00')
    const posts = [mk('posted', '2026-09-21T10:00:00'), mk('scheduled', '2026-09-26T10:00:00'), mk('draft', '2026-09-24T10:00:00'), mk('posted', '2026-09-14T10:00:00')]
    expect(Object.keys(postsByDay(posts)).sort()).toEqual(['2026-09-14', '2026-09-21', '2026-09-24', '2026-09-26'])
    expect(weekOf(wed)[0]).toBe('2026-09-21')
    expect(weekOf(wed)[6]).toBe('2026-09-27')
    expect(weekProgress(posts, 3, wed)).toEqual({ counted: 2, drafts: 1, target: 3, remaining: 1, met: false })
    expect(weekProgress(posts, 0, wed).met).toBe(true)
  })
  it('month grid starts under the right weekday and pads to full weeks', () => {
    const g = monthGrid(2026, 8) // September 2026 starts on a Tuesday
    expect(g[0]).toBeNull()
    expect(g[1]).toEqual({ key: '2026-09-01', day: 1 })
    expect(g.length % 7).toBe(0)
    expect(g.filter(Boolean).length).toBe(30)
  })
})
