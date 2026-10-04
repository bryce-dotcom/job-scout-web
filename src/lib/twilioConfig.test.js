import { describe, it, expect } from 'vitest'
import {
  normalizePhone, isE164, twilioConfigProblem, normalizeTwilioConfig,
  SID_LENGTH, TOKEN_LENGTH,
} from './twilioConfig'

// Bryce entered his Twilio details, pressed Test, and got "Failed to send test
// SMS". What had actually been stored was an 18-character Account SID beginning
// "br", a 10-character auth token, and "(385) 555-0100" as the From number. The
// form accepted all three without a word.
//
// No test here contains a real credential — only shapes.

const SID = 'AC' + 'a'.repeat(32)          // 34 chars
const TOKEN = 'b'.repeat(32)
const good = { account_sid: SID, auth_token: TOKEN, from_number: '+13855550100' }

describe('the shapes Twilio actually requires', () => {
  it('accepts a correct configuration', () => {
    expect(twilioConfigProblem(good)).toBe(null)
  })

  it('catches what was actually stored: an 18-char SID starting br', () => {
    const p = twilioConfigProblem({ ...good, account_sid: 'brand_hhh_services' })
    expect(p).toMatch(/starts with "AC"/)
  })

  it('catches a SID of the wrong length and says both lengths', () => {
    const p = twilioConfigProblem({ ...good, account_sid: 'AC123' })
    expect(p).toMatch(new RegExp(`${SID_LENGTH} characters`))
    expect(p).toMatch(/is 5/)
  })

  it('catches the 10-character auth token', () => {
    const p = twilioConfigProblem({ ...good, auth_token: 'abcdefghij' })
    expect(p).toMatch(new RegExp(`${TOKEN_LENGTH} characters`))
    expect(p).toMatch(/is 10/)
  })

  it('asks for each missing field by name', () => {
    expect(twilioConfigProblem({})).toMatch(/Account SID/)
    expect(twilioConfigProblem({ account_sid: SID })).toMatch(/Auth Token/)
    expect(twilioConfigProblem({ account_sid: SID, auth_token: TOKEN })).toMatch(/number/)
  })

  it('never echoes a credential back in the message', () => {
    const p = twilioConfigProblem({ ...good, auth_token: 'supersecretvalue' })
    expect(p).not.toContain('supersecretvalue')
  })

  it('is not fooled by whitespace from a copy-paste', () => {
    expect(twilioConfigProblem({ ...good, account_sid: `  ${SID}  ` })).toBe(null)
  })
})

describe('the From number becomes E.164', () => {
  it('converts what he actually typed', () => {
    expect(normalizePhone('(385) 555-0100')).toBe('+13855550100')
  })

  it('handles the shapes people type', () => {
    expect(normalizePhone('385-555-0100')).toBe('+13855550100')
    expect(normalizePhone('3855550100')).toBe('+13855550100')
    expect(normalizePhone('1 385 555 0100')).toBe('+13855550100')
    expect(normalizePhone('+1 (385) 555-0100')).toBe('+13855550100')
  })

  it('leaves a non-US number alone beyond adding the plus', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958')
  })

  it('refuses what is not a number', () => {
    expect(normalizePhone('')).toBe(null)
    expect(normalizePhone(null)).toBe(null)
    expect(normalizePhone('not a phone')).toBe(null)
    expect(normalizePhone('12345')).toBe(null)        // too short to be real
  })

  it('recognises E.164 when it sees it', () => {
    expect(isE164('+13855550100')).toBe(true)
    expect(isE164('(385) 555-0100')).toBe(false)
    expect(isE164('13855550100')).toBe(false)
  })
})

describe('what gets stored', () => {
  it('stores the number in the form Twilio accepts, not the form it was typed', () => {
    const out = normalizeTwilioConfig({ ...good, from_number: '(385) 555-0100' })
    expect(out.from_number).toBe('+13855550100')
  })

  it('trims the credentials without altering them', () => {
    const out = normalizeTwilioConfig({ account_sid: ` ${SID} `, auth_token: ` ${TOKEN} `, from_number: '3855550100' })
    expect(out.account_sid).toBe(SID)
    expect(out.auth_token).toBe(TOKEN)
  })

  it('keeps other keys, so the enabled flag survives a save', () => {
    expect(normalizeTwilioConfig({ ...good, enabled: true }).enabled).toBe(true)
  })

  it('keeps an unreadable number as typed rather than losing it', () => {
    // The problem message already refuses the save; do not also discard what
    // they entered, or they cannot see what to correct.
    expect(normalizeTwilioConfig({ ...good, from_number: 'nonsense' }).from_number).toBe('nonsense')
  })
})
