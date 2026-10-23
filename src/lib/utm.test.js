import { describe, it, expect } from 'vitest'
import { tagUrl, tagLinks, campaignTags, postTags, sourceLabel } from './utm'

describe('utm', () => {
  it('tagUrl adds tags and keeps existing ones', () => {
    expect(tagUrl('https://hhh.services/lighting', postTags(12, 'facebook'))).toBe('https://hhh.services/lighting?utm_source=facebook&utm_medium=social&utm_campaign=post-12')
    expect(tagUrl('https://hhh.services/?utm_source=mine', postTags(12, 'facebook'))).toContain('utm_source=mine')
    expect(tagUrl('not a url', postTags(1, 'x'))).toBe('not a url')
  })

  it('tagLinks tags every link in prose and leaves the full stop outside', () => {
    const out = tagLinks('See https://hhh.services/lighting. Or https://energyscout.services, today!', campaignTags(7, 0, 'email'))
    expect(out).toBe('See https://hhh.services/lighting?utm_source=jobscout&utm_medium=email&utm_campaign=campaign-7&utm_content=touch-1. Or https://energyscout.services/?utm_source=jobscout&utm_medium=email&utm_campaign=campaign-7&utm_content=touch-1, today!')
  })

  it('sourceLabel reads the tag first, then the referrer', () => {
    expect(sourceLabel({ utm_campaign: 'campaign-7' })).toMatchObject({ kind: 'campaign', id: 7 })
    expect(sourceLabel({ utm_campaign: 'post-3', utm_source: 'instagram' })).toMatchObject({ kind: 'post', id: 3, label: 'Post on instagram' })
    expect(sourceLabel({ referrer_host: 'www.google.com' }).kind).toBe('google')
    expect(sourceLabel({ referrer_host: 'l.facebook.com' }).kind).toBe('social')
    expect(sourceLabel({}).kind).toBe('direct')
  })
})
