import { describe, it, expect } from 'vitest'
import { getAllowedNavSections } from './accessControl'

// The menu reorganisation moved Jobs into the WORK group and split purchasing
// out into SUPPLY. The dangerous part is not the labels — it is that a field
// tech's entire sidebar is selected by SECTION KEY. Get that wrong and every
// tech opens the app to an empty menu.
//
// The WORK group deliberately kept the key 'OPERATIONS'. It is stored data:
// ai_modules rows carry default_menu_section / user_menu_section, and Victor is
// parented under 'Field Scout' inside OPERATIONS for company 3. Renaming the key
// would strand live agents across every tenant.

const tech = { role: 'Field Tech', user_role: 'User' }
const owner = { role: 'Owner', user_role: 'Owner' }
const admin = { role: 'Admin', user_role: 'Admin' }

describe('a field tech still has a menu', () => {
  const sections = getAllowedNavSections(tech)

  it('keeps the WORK group, which is still keyed OPERATIONS', () => {
    // Renaming this key empties every field tech's sidebar.
    expect(sections).toContain('OPERATIONS')
  })

  it('does not get SUPPLY — purchasing was never theirs', () => {
    // They only ever saw Field Scout and Job Board inside Operations, so
    // withholding the catalogue and purchasing takes nothing away.
    expect(sections).not.toContain('SUPPLY')
  })

  it('still has TEAM for My Pay', () => {
    expect(sections).toContain('TEAM')
  })

  it('is not shown the sales flow', () => {
    expect(sections).not.toContain('SALES_FLOW')
    expect(sections).not.toContain('CUSTOMERS')
  })
})

describe('office roles see the full shape', () => {
  it('an owner gets both WORK and SUPPLY', () => {
    const s = getAllowedNavSections(owner)
    expect(s).toContain('OPERATIONS')
    expect(s).toContain('SUPPLY')
    expect(s).toContain('SALES_FLOW')
  })

  it('an admin gets SUPPLY too — they order the parts', () => {
    expect(getAllowedNavSections(admin)).toContain('SUPPLY')
  })

  it('every role keeps a work section, whatever else is filtered', () => {
    for (const u of [tech, admin, owner]) {
      expect(getAllowedNavSections(u)).toContain('OPERATIONS')
    }
  })
})
