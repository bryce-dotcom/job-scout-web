// From the bank Plaid already linked to the ACH settings payroll needs.
//
// Bryce: "you have the bank info when it was set up through Plaid — how can
// we make onboarding simple so the user only has to set up the bank info
// once?" Plaid Auth returns each linked account's routing and account number.
// The company's own bank is the ODFI for its payroll file, so its routing
// number is the file's destination, and its account is the offset when the
// bank wants a balanced file. Only the ACH company ID the bank assigns for
// origination cannot come from Plaid; that keeps its 1 + EIN default.
//
// Pure. The page fetches; this only chooses and maps.

/** The account payroll should come out of: a checking account first, then
 *  savings; among several, the one with the largest name match on "operating"
 *  or "business", else the first. Null when nothing is depository. */
export function pickAchAccount(accounts = []) {
  const usable = (accounts || []).filter(a => a && a.routing && a.account)
  if (!usable.length) return null
  const score = (a) => {
    let s = 0
    const sub = String(a.subtype || '').toLowerCase(), name = String(a.name || '').toLowerCase()
    if (sub === 'checking') s += 10
    else if (sub === 'savings') s += 5
    if (/operating|business|payroll/.test(name)) s += 3
    return s
  }
  return [...usable].sort((x, y) => score(y) - score(x))[0]
}

/** ACH settings fields from one Plaid account. Leaves the company ID alone. */
export function achSettingsFromPlaidAccount(acct) {
  if (!acct) return {}
  return {
    destinationName: String(acct.institution_name || '').slice(0, 23),
    odfiRouting: String(acct.routing || '').replace(/\D/g, '').slice(0, 9),
    offsetAccount: String(acct.account || '').trim(),
    offsetAccountType: /sav/i.test(String(acct.subtype || '')) ? 'savings' : 'checking',
    linkedAccountId: acct.account_id || null,
    linkedMask: acct.mask || null,
  }
}

/** One line to show for an account: "Mountain America Credit Union ••••1234 (checking)". */
export function describeAchAccount(acct) {
  if (!acct) return ''
  const mask = acct.mask ? ` ••••${acct.mask}` : ''
  const sub = acct.subtype ? ` (${acct.subtype})` : ''
  return `${acct.institution_name || 'Bank'}${mask}${sub}`
}
