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
