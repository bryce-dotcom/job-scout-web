/**
 * Centralized access control for JobScout.
 *
 * Access hierarchy (lowest → highest):
 *   User (0) → Team Lead (1) → Manager (2) → Admin (3) → Super Admin (4) → Developer (5)
 *
 * Two employee fields matter:
 *   - user_role  – access level string (controls permissions)
 *   - role       – job title string (e.g. "Field Tech", "Sales") used only for
 *                  job-title-specific UI restrictions, NOT for access control
 */

export const ACCESS_LEVELS = {
  USER: 0,
  TEAM_LEAD: 1,
  MANAGER: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
  DEVELOPER: 5,
}

const ROLE_MAP = {
  'User': ACCESS_LEVELS.USER,
  'Team Lead': ACCESS_LEVELS.TEAM_LEAD,
  'Manager': ACCESS_LEVELS.MANAGER,
  'Admin': ACCESS_LEVELS.ADMIN,
  'Super Admin': ACCESS_LEVELS.SUPER_ADMIN,
  'Developer': ACCESS_LEVELS.DEVELOPER,
  // Legacy — treat Owner as Super Admin
  'Owner': ACCESS_LEVELS.SUPER_ADMIN,
}

/** Resolve numeric access level from a user/employee object. */
export function getAccessLevel(user) {
  if (!user) return ACCESS_LEVELS.USER
  // is_developer boolean overrides everything (legacy compat)
  if (user.is_developer) return ACCESS_LEVELS.DEVELOPER
  const ur = user.user_role || user.userRole
  if (ur && ROLE_MAP[ur] !== undefined) return ROLE_MAP[ur]
  // Legacy fallback: check the role (job-title) field for admin-ish titles
  const r = user.role
  if (r && ROLE_MAP[r] !== undefined && ROLE_MAP[r] >= ACCESS_LEVELS.ADMIN) return ROLE_MAP[r]
  return ACCESS_LEVELS.USER
}

/** True when user's access level is at or above the required level. */
export function hasMinAccess(user, requiredLevel) {
  return getAccessLevel(user) >= requiredLevel
}

// ── Convenience checks ──────────────────────────────────────────────

/** Field Tech = job title "Field Tech" AND low access level (User). */
export function isFieldTech(user) {
  if (!user) return false
  const jobTitle = (user.role || '').toLowerCase()
  return jobTitle === 'field tech' && getAccessLevel(user) <= ACCESS_LEVELS.USER
}

export function isAdmin(user) {
  return hasMinAccess(user, ACCESS_LEVELS.ADMIN)
}

export function isManager(user) {
  return hasMinAccess(user, ACCESS_LEVELS.MANAGER)
}

export function isTeamLead(user) {
  return hasMinAccess(user, ACCESS_LEVELS.TEAM_LEAD)
}

export function canViewFinancials(user) {
  return hasMinAccess(user, ACCESS_LEVELS.ADMIN)
}

export function canEditPipelineStages(user) {
  return hasMinAccess(user, ACCESS_LEVELS.SUPER_ADMIN)
}

export function canAccessDevTools(user) {
  return hasMinAccess(user, ACCESS_LEVELS.DEVELOPER)
}

export function canManageTeam(user) {
  return hasMinAccess(user, ACCESS_LEVELS.MANAGER)
}

export function canViewTeamData(user) {
  return hasMinAccess(user, ACCESS_LEVELS.TEAM_LEAD)
}

// ── Nav section helpers ─────────────────────────────────────────────

/**
 * Return the list of nav section keys the user should see.
 * Used by Layout.jsx to filter sidebar items.
 */
export function getAllowedNavSections(user) {
  const level = getAccessLevel(user)
  const ft = isFieldTech(user)

  const sections = ['DASHBOARD']

  if (!ft) sections.push('SALES_FLOW')
  if (!ft) sections.push('CUSTOMERS')

  // Operations: everyone, but Field Techs get filtered items inside
  sections.push('OPERATIONS')

  // Financial: Admin+
  if (level >= ACCESS_LEVELS.ADMIN) sections.push('FINANCIAL')

  // Team: everyone sees some variant
  sections.push('TEAM')

  // AI Crew: everyone
  sections.push('AI_CREW')

  // Admin section: Admin+
  if (level >= ACCESS_LEVELS.ADMIN) sections.push('ADMIN')

  // Dev section: Developer only
  if (level >= ACCESS_LEVELS.DEVELOPER) sections.push('DEV')

  return sections
}

/**
 * Filter team-section items based on access level.
 * Field Techs see Time Clock + Payroll (own data). Users see Time Clock + Payroll (own).
 * Team Lead+ see Employees too.
 */
export function getAllowedTeamItems(user) {
  const level = getAccessLevel(user)
  const ft = isFieldTech(user)

  const items = []

  // Team Lead+ see Employees
  if (level >= ACCESS_LEVELS.TEAM_LEAD) items.push('/employees')

  // Everyone sees Time Clock
  items.push('/time-clock')

  // Payroll: Admin+ only
  if (level >= ACCESS_LEVELS.ADMIN) items.push('/payroll')

  return items
}

/**
 * Filter operations items for Field Techs.
 */
export function getAllowedOperationsItems(user, allItems) {
  if (!isFieldTech(user)) return allItems
  const allowed = ['/field-scout', '/job-board']
  return allItems.filter(item => {
    const path = typeof item === 'string' ? item : item.path
    return allowed.some(a => path?.includes(a))
  })
}
