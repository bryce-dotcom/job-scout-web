import { describe, it, expect } from 'vitest'
import { isUsableOverrideReason, hrRecipients, overrideEmail, MIN_REASON_LENGTH } from './bonusOverride'

describe('a reason has to say something', () => {
  it('accepts a sentence someone could act on in six months', () => {
    expect(isUsableOverrideReason('Crew clocked to the wrong job, hours confirmed with Doug')).toBe(true)
    expect(isUsableOverrideReason('Allotment was typed wrong on import, 8h is right')).toBe(true)
  })

  it('refuses the words the click already said', () => {
    for (const t of ['ok', 'approved', 'yes', 'verified', 'done', '']) {
      expect(isUsableOverrideReason(t), t).toBe(false)
    }
  })

  it('refuses padding that clears the length bar but says nothing', () => {
    expect(isUsableOverrideReason('approved approved approved')).toBe(false)
    expect(isUsableOverrideReason('ok ok ok ok ok ok ok ok')).toBe(false)
  })

  it('needs at least a few words', () => {
    expect(isUsableOverrideReason('aaaaaaaaaaaaaaaaaaaaaaa')).toBe(false)
    expect(isUsableOverrideReason('x'.repeat(MIN_REASON_LENGTH))).toBe(false)
  })

  it('survives junk instead of throwing', () => {
    expect(isUsableOverrideReason(null)).toBe(false)
    expect(isUsableOverrideReason(undefined)).toBe(false)
    expect(isUsableOverrideReason(12345)).toBe(false)
  })
})

describe('who hears about it', () => {
  const people = [
    { id: 1, name: 'Bryce', email: 'bryce@hhh.services', has_hr_access: true, active: true },
    { id: 2, name: 'Alayda', email: 'alayda@hhh.services', has_hr_access: true, active: true },
    { id: 3, name: 'Doug', email: 'doug@hhh.services', has_hr_access: false, user_role: 'Super Admin', active: true },
    { id: 4, name: 'Old HR', email: 'gone@hhh.services', has_hr_access: true, active: false },
    { id: 5, name: 'No address', email: '', has_hr_access: true, active: true },
  ]

  it('is the people with HR access, not everyone senior', () => {
    // Doug is a Super Admin and runs payroll; HR is its own flag.
    expect(hrRecipients(people)).toEqual(['bryce@hhh.services', 'alayda@hhh.services'])
  })

  it('drops people who have left and people with no address', () => {
    expect(hrRecipients(people)).not.toContain('gone@hhh.services')
    expect(hrRecipients(people)).toHaveLength(2)
  })

  it('includes a developer, who always has HR access', () => {
    expect(hrRecipients([{ email: 'dev@x.com', is_developer: true, active: true }])).toEqual(['dev@x.com'])
  })

  it('never lists the same address twice', () => {
    const dup = [{ email: 'a@b.c', has_hr_access: true }, { email: 'a@b.c', has_hr_access: true }]
    expect(hrRecipients(dup)).toEqual(['a@b.c'])
  })

  it('returns an empty list rather than throwing', () => {
    expect(hrRecipients([])).toEqual([])
    expect(hrRecipients(null)).toEqual([])
    expect(hrRecipients([null, undefined])).toEqual([])
  })
})

describe('the note HR reads', () => {
  const bonus = { job_id: 8747, employee_id: 19, amount: 4235, allotted_hours: 181.2, actual_hours: 0 }

  it('leads with the amount and the job', () => {
    const { subject } = overrideEmail({ bonus, jobLabel: '8747', crewName: 'London Miller', actorName: 'Doug Webb', reason: 'Hours were clocked to the parent job' })
    expect(subject).toBe('Bonus hold released: $4,235 on 8747')
  })

  it('carries the numbers that caused the hold, so it can be judged without the app', () => {
    const { html } = overrideEmail({ bonus, jobLabel: '8747', crewName: 'London Miller', actorName: 'Doug Webb', reason: 'Hours were clocked to the parent job' })
    expect(html).toContain('181.2')
    expect(html).toContain('London Miller')
    expect(html).toContain('Doug Webb')
    expect(html).toContain('Hours were clocked to the parent job')
    expect(html).toContain('$4,235')
  })

  it('says "not recorded" rather than 0 when hours are missing entirely', () => {
    const { html } = overrideEmail({ bonus: { ...bonus, allotted_hours: null, actual_hours: null }, reason: 'x' })
    expect(html).toContain('not recorded')
  })

  it('escapes anything a person typed', () => {
    const { html } = overrideEmail({ bonus, reason: '<script>alert(1)</script> & "quoted"' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('still reads sensibly with nothing but the bonus', () => {
    const { subject, html } = overrideEmail({ bonus })
    expect(subject).toContain('$4,235')
    expect(html).toContain('Job 8747')
    expect(html).toContain('Employee 19')
  })
})
