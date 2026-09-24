import { describe, it, expect } from 'vitest'
import {
  deriveBrandKitFromEos, setupProgress, styleExamples, platformProblems,
  composeCaption, buildAyrsharePayload, capturePath,
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
  it('counts a key with no linked account as channels NOT done', () => {
    const p = setupProgress({ brandKit: { voice: 'x', audience: 'y' }, ayrshare: { api_key: 'k', accounts: [] } })
    expect(p.steps.find((s) => s.id === 'channels').done).toBe(false)
    expect(p.done).toBe(1)
  })
  it('a platform-mode profile with a linked account counts as channels done', () => {
    const p = setupProgress({ ayrshare: { profile_key: 'pk', accounts: [{ platform: 'facebook' }] } })
    expect(p.steps.find((s) => s.id === 'channels').done).toBe(true)
  })
  it('completes with a linked account and a scheduled post', () => {
    const p = setupProgress({
      brandKit: { voice: 'x', services: ['LED'] },
      ayrshare: { api_key: 'k', accounts: [{ platform: 'facebook' }] },
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
    const p = platformProblems({ platforms: ['twitter'], caption: 'x'.repeat(281) })
    expect(p[0].reason).toMatch(/280/)
  })
  it('a clean post has no problems', () => {
    expect(platformProblems({ platforms: ['facebook', 'gmb'], caption: 'hi' })).toEqual([])
  })
})

describe('composeCaption + buildAyrsharePayload', () => {
  it('adds # to bare hashtags and separates them with a blank line', () => {
    expect(composeCaption('Done.', ['led', '#utah', 'two words'])).toBe('Done.\n\n#led #utah #twowords')
  })
  it('omits media when there is none and strips milliseconds from scheduleDate', () => {
    const future = new Date(Date.now() + 3600e3).toISOString()
    const body = buildAyrsharePayload({ caption: 'hi', hashtags: [], platforms: ['facebook'], media_urls: [], scheduled_for: future })
    expect(body.mediaUrls).toBeUndefined()
    expect(body.scheduleDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  })
  it('a past scheduled_for means post now (no scheduleDate)', () => {
    const body = buildAyrsharePayload({ caption: 'hi', platforms: ['facebook'], scheduled_for: '2020-01-01T00:00:00Z', media_urls: ['https://a/b.jpg'] })
    expect(body.scheduleDate).toBeUndefined()
    expect(body.mediaUrls).toEqual(['https://a/b.jpg'])
  })
})

describe('capturePath', () => {
  it('starts with the company id folder and sanitises the name', () => {
    const p = capturePath(3, 'my photo (1).JPG', new Date('2026-09-24T10:00:00Z'))
    expect(p.startsWith('3/2026-09/')).toBe(true)
    expect(p.endsWith('_my_photo__1_.JPG')).toBe(true)
  })
})
