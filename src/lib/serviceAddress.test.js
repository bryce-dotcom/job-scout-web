import { describe, it, expect } from 'vitest'
import { serviceAddressToShow } from './serviceAddress'

describe('an account with several sites', () => {
  it('shows the site when it differs from where the bill goes', () => {
    expect(serviceAddressToShow('2488 S 1620 W, Ogden', '6395 W 10400 N, Highland'))
      .toBe('2488 S 1620 W, Ogden')
  })

  it('keeps the job address exactly as entered', () => {
    expect(serviceAddressToShow('  Unit 4, 2488 S 1620 W  ', 'elsewhere')).toBe('Unit 4, 2488 S 1620 W')
  })
})

// Printing the same address twice under two headings makes an invoice look
// confused, and most customers are single-site.
describe('a single-site customer sees it once', () => {
  it('says nothing when the two match', () => {
    expect(serviceAddressToShow('6395 W 10400 N', '6395 W 10400 N')).toBeNull()
  })

  it('ignores casing and stray whitespace when comparing', () => {
    expect(serviceAddressToShow('6395 w 10400 n', '  6395   W  10400 N ')).toBeNull()
  })
})

describe('it never prints an empty heading', () => {
  it('says nothing without a job address', () => {
    for (const v of ['', '   ', null, undefined]) expect(serviceAddressToShow(v, 'anywhere')).toBeNull()
  })

  it('still shows the site when no billing address is on file', () => {
    expect(serviceAddressToShow('2488 S 1620 W', null)).toBe('2488 S 1620 W')
    expect(serviceAddressToShow('2488 S 1620 W', '')).toBe('2488 S 1620 W')
  })
})
