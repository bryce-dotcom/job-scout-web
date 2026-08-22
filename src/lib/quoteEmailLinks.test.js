import { describe, it, expect } from 'vitest'
import { resolveQuoteEmailLinks, renderQuoteEmailLinks } from '../../supabase/functions/_shared/quoteEmailLinks.ts'

const LINKS = JSON.stringify([
  { business_unit: 'Energy Scout', label: 'Energy Scout', url: 'https://example.com/energy-scout' },
  { business_unit: 'Energy Scout', label: 'RMP approved vendors', url: 'https://example.com/rmp-vendors' },
  { label: 'About HHH', url: 'https://example.com/about' },
])

// The whole point of shipping this before the URLs arrive: nothing changes.
describe('no configuration means no change to the email', () => {
  it('returns nothing for null, empty, or junk', () => {
    for (const v of [null, undefined, '', '[]', 'not json', '{}', 42])
      expect(resolveQuoteEmailLinks(v, 'Energy Scout')).toEqual([])
  })

  it('renders an empty string, not an empty row', () => {
    expect(renderQuoteEmailLinks([])).toBe('')
  })
})

describe('links are scoped to their business unit', () => {
  it('gives a lighting quote its own links plus the unscoped one', () => {
    const got = resolveQuoteEmailLinks(LINKS, 'Energy Scout')
    expect(got.map((l) => l.label)).toEqual(['Energy Scout', 'RMP approved vendors', 'About HHH'])
  })

  // Cole's point: an Energy Scout link on a window-cleaning quote reads as a
  // mistake to the customer.
  it('keeps Energy Scout links off an HHH Building Services quote', () => {
    const got = resolveQuoteEmailLinks(LINKS, 'HHH Building Services')
    expect(got.map((l) => l.label)).toEqual(['About HHH'])
  })

  it('matches the unit case-insensitively and ignores stray spacing', () => {
    expect(resolveQuoteEmailLinks(LINKS, '  energy scout ').length).toBe(3)
  })

  it('a quote with no business unit still gets the unscoped links', () => {
    expect(resolveQuoteEmailLinks(LINKS, null).map((l) => l.label)).toEqual(['About HHH'])
  })
})

describe('what goes in a customer email has to be safe', () => {
  it('drops anything that is not http(s)', () => {
    const bad = JSON.stringify([
      { label: 'js', url: 'javascript:alert(1)' },
      { label: 'rel', url: '/internal/page' },
      { label: 'data', url: 'data:text/html,<script>' },
      { label: 'ok', url: 'https://example.com/fine' },
    ])
    expect(resolveQuoteEmailLinks(bad, null).map((l) => l.url)).toEqual(['https://example.com/fine'])
  })

  it('strips characters that would break out of the anchor text', () => {
    const evil = JSON.stringify([{ label: '</a><script>x</script>', url: 'https://example.com/x' }])
    const [link] = resolveQuoteEmailLinks(evil, null)
    expect(link.label).not.toContain('<')
    expect(renderQuoteEmailLinks([link])).not.toContain('<script')
  })

  it('falls back to the url when a label is missing', () => {
    const [link] = resolveQuoteEmailLinks(JSON.stringify([{ url: 'https://example.com/x' }]), null)
    expect(link.label).toBe('https://example.com/x')
  })

  it('does not print the same destination twice', () => {
    const dup = JSON.stringify([
      { label: 'One', url: 'https://example.com/same' },
      { label: 'Two', url: 'https://example.com/same' },
    ])
    expect(resolveQuoteEmailLinks(dup, null).length).toBe(1)
  })
})

describe('the settings table double-encodes sometimes', () => {
  it('reads a value that was JSON.stringify-ed twice', () => {
    expect(resolveQuoteEmailLinks(JSON.stringify(LINKS), 'Energy Scout').length).toBe(3)
  })

  it('reads an already-parsed array', () => {
    expect(resolveQuoteEmailLinks(JSON.parse(LINKS), 'Energy Scout').length).toBe(3)
  })
})
