import { describe, it, expect } from 'vitest'
import { canOwnLeads, leadOwners, LEAD_OWNER_ROLES } from './leadOwnerRoles'

describe('who can be handed a lead', () => {
  it('includes the people who actually sell, whatever their title', () => {
    for (const role of ['Sales', 'Salesman', 'Setter', 'Manager', 'Project Manager', 'Owner', 'Admin']) {
      expect(canOwnLeads({ role })).toBe(true)
    }
  })
  it('keeps the crew off the list', () => {
    for (const role of ['Field Tech', 'Installer', 'Office', '', null, undefined]) {
      expect(canOwnLeads({ role })).toBe(false)
    }
    expect(canOwnLeads(null)).toBe(false)
  })
  it('filters a roster', () => {
    const roster = [{ name: 'Christopher', role: 'Project Manager' }, { name: 'Cameron', role: 'Field Tech' }, { name: 'Cole', role: 'Sales' }]
    expect(leadOwners(roster).map(e => e.name)).toEqual(['Christopher', 'Cole'])
  })
  it('is the one list', () => {
    expect(LEAD_OWNER_ROLES).toContain('Project Manager')
  })
})

describe('who actually sells', () => {
  // The real HHH roster, which is what made this rule necessary.
  const roster = [
    { name: 'Christopher Lyman', role: 'Project Manager', is_commission: true },
    { name: 'Cole Westcott', role: 'Sales', is_commission: true },
    { name: 'London Miller', role: 'Project Manager', is_commission: false },
    { name: 'Alayda Westcott', role: 'Admin', is_commission: true },
    { name: 'Tracy Clark', role: 'Office', is_commission: true },
    { name: 'Cameron McDonough', role: 'Field Tech', is_commission: false },
  ]

  it('counts the Project Manager who sells', async () => {
    const { sells } = await import('./leadOwnerRoles.js')
    expect(sells(roster[0])).toBe(true)
  })

  it('does NOT count the Project Manager who does not', async () => {
    const { sells } = await import('./leadOwnerRoles.js')
    // London is the whole reason this is not just "role is a PM".
    expect(sells(roster[2])).toBe(false)
  })

  it('leaves out commission-bearing office staff', async () => {
    const { sells } = await import('./leadOwnerRoles.js')
    expect(sells(roster[3])).toBe(false)   // Admin
    expect(sells(roster[4])).toBe(false)   // Office
  })

  it('is narrower than canOwnLeads, which includes whoever can be handed one', async () => {
    const { sells, canOwnLeads } = await import('./leadOwnerRoles.js')
    expect(canOwnLeads(roster[3])).toBe(true)
    expect(sells(roster[3])).toBe(false)
  })

  it('returns the six sellers and nobody else', async () => {
    const { sellers } = await import('./leadOwnerRoles.js')
    expect(sellers(roster).map(e => e.name)).toEqual(['Christopher Lyman', 'Cole Westcott'])
  })

  it('takes pay_type commission as proof too, and survives junk', async () => {
    const { sells } = await import('./leadOwnerRoles.js')
    expect(sells({ role: 'Sales', pay_type: 'commission' })).toBe(true)
    expect(sells({ role: 'Sales' })).toBe(false)
    expect(sells(null)).toBe(false)
    expect(sells({})).toBe(false)
  })
})
