// Who can be handed a lead.
//
// Four screens each kept their own list of "sales" roles, and none of them
// agreed. Lead Setter's said Sales / Salesman / Manager / Admin — so
// Christopher Lyman, a Project Manager who sells HHH Building Services work
// and had eight leads assigned in the last ninety days, could not be chosen
// on Lead Setter at all, and his appointments had no calendar overlay. Tracy
// (11 Aug): "the lead setter is not showing the reps I have assigned the
// leads to. You can't choose them right now."
//
// One list. Anyone who sells, runs a crew that sells, or owns the place.
// Field techs and installers are deliberately not on it — assigning them a
// lead is the mistake this list exists to prevent.
export const LEAD_OWNER_ROLES = ['Sales', 'Salesman', 'Setter', 'Manager', 'Project Manager', 'Owner', 'Admin']

export function canOwnLeads(employee) {
  return LEAD_OWNER_ROLES.includes(String(employee?.role || ''))
}

export function leadOwners(employees = []) {
  return (employees || []).filter(canOwnLeads)
}

/**
 * Who actually sells.
 *
 * Narrower than canOwnLeads, which includes the Admin and the Owner because
 * they can be HANDED a lead. This is the list you want for "all the
 * salesmen" — commissions, a sales FireSide, a rep leaderboard.
 *
 * Bryce, 2026-10-23: "fix his role so it stops happening." Christopher Lyman
 * is a Project Manager who sells, so every query that said role = 'Sales'
 * missed him — the same shape as the commission bug that cost us a day.
 *
 * The tempting fix was to change his role to Sales. That breaks him: the Job
 * Board picks project managers with role.includes('Project Manager'), so he
 * would vanish from the PM picker and from Gantt grouping on jobs he runs.
 * A person with two jobs cannot be fixed by overwriting the field that holds
 * one of them.
 *
 * So the rule is a selling-capable ROLE plus the thing that proves they sell
 * for a living: they earn commission. London Miller is the proof it
 * discriminates — also a Project Manager, no commission, correctly not a
 * salesman. Alayda and Tracy carry commission but are Admin and Office, and
 * are correctly out.
 */
export const SELLING_ROLES = ['Sales', 'Salesman', 'Setter', 'Project Manager', 'Manager']

export function sells(employee) {
  if (!employee) return false
  if (!SELLING_ROLES.includes(String(employee.role || ''))) return false
  return employee.is_commission === true || String(employee.pay_type || '') === 'commission'
}

export function sellers(employees = []) {
  return (employees || []).filter(sells)
}
