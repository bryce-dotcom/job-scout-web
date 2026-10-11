import { describe, it, expect } from 'vitest'
import { prettyPhone, arnieTextNumber, ARNIE_EMAIL } from './arnieReach'

describe('arnieReach', () => {
  it('formats E.164 and bare digits', () => {
    expect(prettyPhone('+18019998430')).toBe('(801) 999-8430')
    expect(prettyPhone('8019998430')).toBe('(801) 999-8430')
    expect(prettyPhone('')).toBe('')
  })
  it('reads the number from the twilio_config settings row, JSON or object', () => {
    expect(arnieTextNumber([{ key: 'twilio_config', value: JSON.stringify({ from_number: '+18019998430' }) }])?.pretty).toBe('(801) 999-8430')
    expect(arnieTextNumber([{ key: 'twilio_config', value: { from_number: '+18019998430' } }])?.raw).toBe('+18019998430')
    expect(arnieTextNumber([{ key: 'other', value: '{}' }])).toBeNull()
    expect(arnieTextNumber([{ key: 'twilio_config', value: '{bad' }])).toBeNull()
    expect(arnieTextNumber([])).toBeNull()
  })
  it('has one email address', () => { expect(ARNIE_EMAIL).toBe('arnie@appsannex.com') })
})
