// Driver credentials — who may operate what, and whether the paperwork holds.
//
// The bias these tests enforce: unknown is never fine. An unrecorded expiry is
// the commonest way a lapsed licence stays invisible — nobody deleted the
// date, it was simply never entered — and a system that reads absence as
// compliance reports a clean fleet right up until a roadside inspection.

import { describe, it, expect } from 'vitest'
import {
  daysUntil, today, credentialStatus, canOperate, complianceIssues,
  LICENSE_CLASSES, OPERATOR_ROLES, EXPIRING_SOON_DAYS,
} from './driverCredentials'

const NOW = new Date('2026-08-20T14:00:00')
const offset = days => {
  const d = new Date(Date.UTC(2026, 7, 20) + days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

const driver = (over = {}) => ({
  id: 1, name: 'Test', operator_role: 'driver',
  license_class: 'C', license_expires: offset(365), medical_card_expires: null, ...over,
})
const asset = (cls) => ({ id: 10, asset_class: cls })

describe('date arithmetic', () => {
  it('counts whole days, negative once past', () => {
    expect(daysUntil(offset(10), NOW)).toBe(10)
    expect(daysUntil(offset(-3), NOW)).toBe(-3)
    expect(daysUntil(offset(0), NOW)).toBe(0)
  })

  it('is not thrown off by the time of day', () => {
    // An expiry is a day, not an instant. Subtracting Date objects makes the
    // answer depend on the runtime's timezone, and west of UTC a licence would
    // read as expiring a day early.
    for (const hour of ['00:01:00', '12:00:00', '23:59:00']) {
      expect(daysUntil(offset(5), new Date(`2026-08-20T${hour}`))).toBe(5)
    }
  })

  it('returns null for a missing or malformed date', () => {
    expect(daysUntil(null)).toBeNull()
    expect(daysUntil('not-a-date')).toBeNull()
  })

  it('reports today as a local calendar day', () => {
    expect(today(NOW)).toBe('2026-08-20')
  })
})

describe('credential status', () => {
  it('says nothing about someone who is not a driver', () => {
    expect(credentialStatus({ operator_role: null }, NOW).status).toBe('not_a_driver')
  })

  it('does not demand a road licence from an equipment operator', () => {
    // Demanding one generates a warning nobody can act on.
    expect(credentialStatus({ operator_role: 'operator' }, NOW).severity).toBe('ok')
  })

  it('treats a missing expiry as a warning, never as fine', () => {
    const r = credentialStatus(driver({ license_expires: null }), NOW)
    expect(r.status).toBe('unknown')
    expect(r.severity).toBe('warn')
  })

  it('errors on a lapsed licence and says how long', () => {
    const r = credentialStatus(driver({ license_expires: offset(-12) }), NOW)
    expect(r.status).toBe('expired')
    expect(r.severity).toBe('error')
    expect(r.message).toMatch(/12 days ago/)
  })

  it('warns inside the renewal window', () => {
    expect(credentialStatus(driver({ license_expires: offset(EXPIRING_SOON_DAYS - 1) }), NOW).status).toBe('expiring')
  })

  it('reports an expired medical card even when the licence is fine', () => {
    // A two-year cycle nobody gets a reminder for, and it grounds a commercial
    // driver exactly as firmly as an expired licence.
    const r = credentialStatus(driver({ medical_card_expires: offset(-5) }), NOW)
    expect(r.status).toBe('medical_expired')
    expect(r.severity).toBe('error')
  })

  it('leads with the licence when both have lapsed', () => {
    const r = credentialStatus(driver({ license_expires: offset(-40), medical_card_expires: offset(-5) }), NOW)
    expect(r.status).toBe('expired')
  })

  it('calls a current licence current', () => {
    expect(credentialStatus(driver(), NOW).status).toBe('ok')
  })
})

describe('assignment checks', () => {
  it('refuses an unassigned asset without pretending it is a problem', () => {
    const r = canOperate(null, asset('pickup'), NOW)
    expect(r.ok).toBe(false)
    expect(r.severity).toBe('info')
  })

  it('lets an ordinary licence take a pickup', () => {
    expect(canOperate(driver(), asset('pickup'), NOW).ok).toBe(true)
  })

  it('refuses a class C driver a dump truck', () => {
    const r = canOperate(driver({ license_class: 'C' }), asset('dump_truck'), NOW)
    expect(r.ok).toBe(false)
    expect(r.status).toBe('insufficient_class')
    expect(r.message).toMatch(/CDL B/)
  })

  it('accepts a higher class for a lower requirement', () => {
    // An A covers what a B covers; rank ordering, not string equality.
    expect(canOperate(driver({ license_class: 'CDL-A' }), asset('box_truck'), NOW).ok).toBe(true)
  })

  it('refuses a driver with no class recorded where one is required', () => {
    const r = canOperate(driver({ license_class: null }), asset('dump_truck'), NOW)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/No licence class recorded/)
  })

  it('blocks an expired licence regardless of class', () => {
    expect(canOperate(driver({ license_class: 'CDL-A', license_expires: offset(-1) }), asset('pickup'), NOW).ok).toBe(false)
  })

  it('blocks an unknown expiry rather than waving it through', () => {
    expect(canOperate(driver({ license_expires: null }), asset('pickup'), NOW).ok).toBe(false)
  })

  it('allows an expiring licence but still says so', () => {
    const r = canOperate(driver({ license_expires: offset(10) }), asset('pickup'), NOW)
    expect(r.ok).toBe(true)
    expect(r.severity).toBe('warn')
  })

  it('wants an operator on equipment, not a driver', () => {
    expect(canOperate(driver({ operator_role: 'driver' }), asset('excavator'), NOW).ok).toBe(false)
    expect(canOperate(driver({ operator_role: 'operator' }), asset('excavator'), NOW).ok).toBe(true)
    expect(canOperate(driver({ operator_role: 'both' }), asset('excavator'), NOW).ok).toBe(true)
  })

  it('does not require a licence expiry for equipment', () => {
    // The relevant document for a skid steer is training, not a DMV class.
    expect(canOperate({ operator_role: 'operator', license_expires: null }, asset('skid_steer'), NOW).ok).toBe(true)
  })

  it('refuses an office employee any asset', () => {
    expect(canOperate({ operator_role: null }, asset('pickup'), NOW).ok).toBe(false)
    expect(canOperate({ operator_role: null }, asset('excavator'), NOW).ok).toBe(false)
  })
})

describe('fleet-wide triage', () => {
  it('lists problems worst first and omits what is fine', () => {
    const issues = complianceIssues([
      { asset: asset('pickup'), employee: driver({ id: 1 }) },                                  // ok
      { asset: asset('pickup'), employee: driver({ id: 2, license_expires: offset(10) }) },      // warn
      { asset: asset('pickup'), employee: driver({ id: 3, license_expires: offset(-2) }) },      // error
    ], NOW)
    expect(issues.map(i => i.employee.id)).toEqual([3, 2])
  })

  it('copes with an empty fleet', () => {
    expect(complianceIssues([], NOW)).toEqual([])
  })
})

describe('vocabularies', () => {
  it('orders licence classes so higher covers lower', () => {
    const ranks = LICENSE_CLASSES.map(c => c.rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('offers exactly the roles the checks understand', () => {
    expect(OPERATOR_ROLES.map(r => r.value).sort()).toEqual(['both', 'driver', 'operator'])
  })
})
