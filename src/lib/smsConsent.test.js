import { describe, it, expect } from 'vitest'
import {
  TRANSACTIONAL, MARKETING, CONSENT_SOURCES,
  smsTermsPath, smsTermsUrl, consentDisclosure, recordConsent, smsConsentState,
  mayText, mayTextProblem,
} from './smsConsent'

// Registering for A2P 10DLC asked how recipients consented and the app had no
// answer. marketing_opt_in looked like one, but it is true for 2,687 of HHH's
// 3,376 customers because an import defaulted it — so it is evidence of nothing.

describe('marketing_opt_in is not text consent', () => {
  it('does not let an imported marketing flag authorise a marketing text', () => {
    // The whole reason these columns exist. If this ever passes, 2,687 people
    // are being texted on the strength of an import default.
    const imported = { phone: '801-555-0100', marketing_opt_in: true, sms_consent: false }
    expect(mayText(imported, MARKETING)).toBe(false)
    expect(mayTextProblem(imported, MARKETING)).toMatch(/has not agreed/i)
  })

  it('still allows the transactional texts the app actually sends', () => {
    // Invoice past due, onboarding link, follow-up on an estimate they asked
    // for. Gating these on express consent would silently stop them.
    const c = { phone: '801-555-0100', sms_consent: false }
    expect(mayText(c, TRANSACTIONAL)).toBe(true)
    expect(mayText(c)).toBe(true)
    expect(mayTextProblem(c)).toBe(null)
  })

  it('allows marketing once consent is actually recorded', () => {
    expect(mayText({ phone: '801-555-0100', sms_consent: true }, MARKETING)).toBe(true)
  })

  it('no phone means no text, whatever any box says', () => {
    expect(mayText({ phone: '', sms_consent: true }, MARKETING)).toBe(false)
    expect(mayText({ phone: '   ', sms_consent: true })).toBe(false)
    expect(mayText(null)).toBe(false)
    expect(mayTextProblem({ sms_consent: true })).toMatch(/No phone/)
  })
})

describe('what gets written when the box is ticked', () => {
  const now = new Date('2026-10-04T18:30:00Z')

  it('records the agreement, the date and how it was obtained', () => {
    expect(recordConsent({ on: true, source: 'office', now })).toEqual({
      sms_consent: true,
      sms_consent_at: '2026-10-04T18:30:00.000Z',
      sms_consent_source: 'office',
    })
  })

  it('keeps the ORIGINAL date when consent was already given', () => {
    // Editing a customer's address must not re-date their consent to today.
    // The date is the evidence a reviewer asks for.
    const existing = { sms_consent: true, sms_consent_at: '2026-03-01T10:00:00.000Z', sms_consent_source: 'portal' }
    const out = recordConsent({ on: true, source: 'office', now, existing })
    expect(out.sms_consent_at).toBe('2026-03-01T10:00:00.000Z')
    expect(out.sms_consent_source).toBe('portal')
  })

  it('dates a fresh yes even when an old record is sitting there turned off', () => {
    const existing = { sms_consent: false, sms_consent_at: '2026-03-01T10:00:00.000Z', sms_consent_source: 'portal' }
    expect(recordConsent({ on: true, source: 'office', now, existing }).sms_consent_at)
      .toBe('2026-10-04T18:30:00.000Z')
  })

  it('clears all three when it is unticked', () => {
    expect(recordConsent({ on: false })).toEqual({
      sms_consent: false, sms_consent_at: null, sms_consent_source: null,
    })
  })

  it('defaults to the office source, because that is who ticks it', () => {
    expect(recordConsent({ on: true, now }).sms_consent_source).toBe('office')
    expect(Object.keys(CONSENT_SOURCES)).toContain('office')
  })
})

describe('what it says on screen', () => {
  it('reads as not given when it is not', () => {
    expect(smsConsentState({}).given).toBe(false)
    expect(smsConsentState({}).label).toBe('Not given')
    expect(smsConsentState(null).given).toBe(false)
  })

  it('says when and how', () => {
    const s = smsConsentState({ sms_consent: true, sms_consent_at: '2026-03-01T10:00:00Z', sms_consent_source: 'portal' })
    expect(s.given).toBe(true)
    expect(s.label).toMatch(/Given/)
    expect(s.label).toMatch(/Ticked by the customer/)
  })

  it('survives a consent with no date on it', () => {
    expect(smsConsentState({ sms_consent: true }).label).toBe('Given')
  })
})

describe('the disclosure the customer agrees to', () => {
  it('names the company, not JobScout', () => {
    // A carrier matches the disclosure against the brand that registered, and
    // "JobScout may text you" is not true for a tenant's customer.
    const d = consentDisclosure('HHH Services, LLC')
    expect(d).toMatch(/^HHH Services, LLC may text me/)
    expect(d).not.toMatch(/JobScout/)
  })

  it('carries the four things a campaign review looks for', () => {
    const d = consentDisclosure('Summit Field Co')
    expect(d).toMatch(/estimates, appointments, jobs and invoices/)
    expect(d).toMatch(/frequency varies/i)
    expect(d).toMatch(/message and data rates may apply/i)
    expect(d).toMatch(/STOP/)
    expect(d).toMatch(/HELP/)
  })

  it('still reads as a sentence with no company name', () => {
    expect(consentDisclosure('')).toMatch(/^this company may text me/)
  })
})

describe('the terms URL', () => {
  it('is per company, because each tenant registers its own brand', () => {
    expect(smsTermsPath('hhh-services-llc')).toBe('/sms-terms/hhh-services-llc')
    expect(smsTermsUrl('hhh-services-llc', 'https://jobscout.appsannex.com'))
      .toBe('https://jobscout.appsannex.com/sms-terms/hhh-services-llc')
  })

  it('never produces a broken link when the slug is missing', () => {
    expect(smsTermsPath(null)).toBe('/sms-terms')
    expect(smsTermsPath('  ')).toBe('/sms-terms')
    expect(smsTermsUrl(undefined, 'https://x.test/')).toBe('https://x.test/sms-terms')
  })

  it('escapes a slug rather than trusting it in a path', () => {
    expect(smsTermsPath('a b/c')).toBe('/sms-terms/a%20b%2Fc')
  })
})
