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
