// The first employee, by voice.
//
// "Add Jordan Reyes, field tech, jordan@summitfieldco.com, 801-555-0142,
// $28 an hour, starts Monday" — the card shows the row the Employees page
// would write, and on approve the row exists and the invite goes out the
// same way the page's Add & Invite button sends it (invite-employee).
//
// Money is the guarded part. The Employees page hides pay behind the HR
// flag even for Admins, and Arnie holds the same line: an owner (level 4)
// or anyone with has_hr_access can set a rate on the card; an Admin
// without it gets the employee created and a line saying the rate is
// waiting on the Employees page — never a refusal of the whole thing,
// never a rate written by someone the page would not let see it.
//
// Who: Admin+ (level 3) — the page's Add Employee button is admin-only.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList } from './arnieRest.ts'
import { resolveWhenSaid } from './arnieTime.ts'

const hdr = (r: Rest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' })

// Access levels the card may grant. Never Super Admin or Developer from a
// conversation — those are Settings decisions with a second person looking.
const GRANTABLE: Record<string, number> = { 'User': 0, 'Team Lead': 1, 'Manager': 2, 'Admin': 3 }

// The page's job titles, so "field tech" files as Field Tech and the roster groups.
const JOB_TITLES = ['Field Tech', 'Installer', 'Sales', 'Setter', 'Office', 'Manager', 'Project Manager', 'Admin']
const titleCase = (s: string) => JOB_TITLES.find((t) => t.toLowerCase() === s.toLowerCase()) || s.replace(/\b\w/g, (c) => c.toUpperCase())

const money = (s: string | undefined) => {
  const n = Number(String(s || '').replace(/[$,\s]/g, '').replace(/\/?(hr|hour|yr|year|an hour|a year)$/i, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

export async function prepareEmployee(r: Rest, caller: Caller, f: Record<string, string>) {
  const companyId = caller.companyId as number
  if (caller.level < 3) return { ok: false as const, error: 'Adding people to the team is an admin\'s job. Ask them, or ask me to draft a note to them.' }
  const name = String(f.name || '').trim().replace(/\s+/g, ' ')
  if (name.length < 2 || !/\s/.test(name)) return { ok: false as const, error: 'I need their full name — first and last.' }
  const email = String(f.email || '').trim().toLowerCase()
  const phone = String(f.phone || '').trim()

  // Already on the roster? The page would make a second row; Arnie will not.
  const roster = await readRecordList(r, `employees?select=id,name,email,active&company_id=eq.${companyId}`)
  const sameEmail = email ? roster.find((e: any) => String(e.email || '').toLowerCase() === email) : null
  if (sameEmail) return { ok: false as const, error: `${sameEmail.name} already has that email on the roster${sameEmail.active === false ? ' (inactive — reactivate them on the Employees page)' : ''}.` }
  const sameName = roster.find((e: any) => String(e.name || '').toLowerCase().replace(/\s+/g, ' ') === name.toLowerCase())
  if (sameName && sameName.active !== false) return { ok: false as const, error: `${sameName.name} is already on the team. A second ${name}? Give me an email or a phone that tells them apart, and say it's a different person.` }

  // Access: at most the caller's own level, and never above Admin.
  const wantRole = String(f.user_role || 'User')
  const level = GRANTABLE[wantRole]
  if (level == null) return { ok: false as const, error: `Access is one of: User, Team Lead, Manager, Admin. Super Admin is set from Settings, not from a conversation.` }
  if (level > caller.level) return { ok: false as const, error: `You can't grant ${wantRole} — it's above your own access.` }

  // Pay: only someone the Employees page would show pay to may set it.
  const [me] = caller.employeeId != null ? await readRecordList(r, `employees?select=has_hr_access&id=eq.${caller.employeeId}&limit=1`) : [null]
  const canSetPay = caller.level >= 4 || me?.has_hr_access === true
  const hourly = money(f.hourly_rate), salary = money(f.annual_salary)
  if (hourly && salary) return { ok: false as const, error: 'Hourly or salary — which is it?' }
  if (hourly && hourly > 500) return { ok: false as const, error: `$${hourly} an hour? Say it again with the number you mean.` }
  if (salary && salary < 5000) return { ok: false as const, error: `$${salary} a year reads like a monthly or hourly figure. Say it again.` }

  const [co] = await readRecordList(r, `companies?select=timezone,pay_frequency&id=eq.${companyId}&limit=1`)
  const tz = co?.timezone || 'America/Denver'
  let hire: string | null = null
  if (String(f.hire_date || '').trim()) {
    const when = resolveWhenSaid(f.hire_date, tz, 'forward')
    if (!when) return { ok: false as const, error: `I couldn't read "${f.hire_date}" as a start date. Say it like "Monday" or "October 1".` }
    hire = when.date
  }

  const role = titleCase(String(f.role || 'Field Tech').trim())
  const tax = /1099|contractor/i.test(String(f.tax_classification || '')) ? '1099' : 'W2'
  const invite = !!email && !/^(no|false|off|0)$/i.test(String(f.invite || ''))

  const row: Record<string, unknown> = {
    name, email: email || null, phone: phone || null,
    role, user_role: wantRole, active: true,
    tax_classification: tax,
    business_unit: String(f.business_unit || '').trim() || null,
    hire_date: hire,
    is_hourly: false, is_salary: false, is_commission: false,
    hourly_rate: 0, annual_salary: 0,
  }
  const display: { label: string; value: string }[] = [
    { label: 'Name', value: name },
    { label: 'Job title', value: role },
    { label: 'Access', value: wantRole + (wantRole === 'User' ? ' (their own jobs, hours and pay; nothing else)' : '') },
  ]
  if (email) display.push({ label: 'Email', value: email })
  if (phone) display.push({ label: 'Phone', value: phone })
  display.push({ label: 'Tax', value: tax === '1099' ? '1099 contractor — W-9 on the Employees page' : 'W-2 employee — W-4 on the Employees page' })
  if (hire) display.push({ label: 'Starts', value: hire })
  if (hourly || salary) {
    if (canSetPay) {
      if (hourly) { row.is_hourly = true; row.hourly_rate = hourly; display.push({ label: 'Pay', value: `$${hourly.toFixed(2)} an hour` }) }
      else { row.is_salary = true; row.annual_salary = salary; display.push({ label: 'Pay', value: `$${(salary as number).toLocaleString()} a year` }) }
    } else {
      display.push({ label: 'Pay', value: 'not set — pay needs HR access. Whoever has it sets the rate on the Employees page.' })
    }
  } else {
    display.push({ label: 'Pay', value: 'not set yet — say a rate, or set it on the Employees page' + (canSetPay ? '' : ' (needs HR access)') })
  }
  display.push({ label: 'Invite', value: invite ? `an email to ${email} with their login link, the moment you approve` : email ? 'not sent — say "invite them" when you want it to go' : 'no email, so no login yet — add one on the Employees page when you have it' })

  return { ok: true as const, columns: { row, invite }, display }
}

export async function applyEmployee(r: Rest, companyId: number, prop: any) {
  const c = prop.payload?.columns || {}
  const row = { company_id: companyId, ...(c.row || {}), updated_at: new Date().toISOString() }
  // Re-check the roster: the page may have added them since the draft.
  if (row.email) {
    const dup = await readRecordList(r, `employees?select=id,name&company_id=eq.${companyId}&email=eq.${encodeURIComponent(String(row.email))}&limit=1`)
    if (dup.length) return { ok: false as const, stale: true, error: `${dup[0].name} was added with that email after I drafted this. Nothing changed.` }
  }
  const ins = await fetch(`${r.url}/rest/v1/employees`, { method: 'POST', headers: { ...hdr(r), Prefer: 'return=representation' }, body: JSON.stringify(row) })
  if (!ins.ok) return { ok: false as const, error: `Could not add them: ${ins.status} ${await ins.text()}` }
  const [emp] = await ins.json()

  // The invite is the page's: invite-employee finds the row we just made
  // (employeeExisted), writes the invitation, and sends the auth email.
  let invitationId: number | null = null, emailSent = false
  if (c.invite && row.email) {
    try {
      const res = await fetch(`${r.url}/functions/v1/invite-employee`, { method: 'POST', headers: hdr(r), body: JSON.stringify({ companyId, email: row.email, name: row.name, role: row.role, userRole: row.user_role, invitedById: prop.payload?.proposer_employee_id ?? null }) })
      const j = await res.json().catch(() => ({}))
      invitationId = j.invitationId ?? null; emailSent = j.emailSent === true
    } catch (e) { console.error('[arnieEmployee] invite failed (row kept):', e) }
  }
  return { ok: true as const, id: emp.id, label: `${row.name} — added${emailSent ? ', invited' : ''}`, created: { employee_id: emp.id, invitation_id: invitationId, email_sent: emailSent } }
}

/** Take the row away — unless they have already clocked in, in which case it stays and is deactivated instead. */
export async function rollbackEmployee(r: Rest, companyId: number, prop: any) {
  const id = Number(prop.payload?.created?.employee_id ?? prop.payload?.created_id)
  if (!id) return { ok: false as const, error: 'This draft never added anyone.' }
  const shifts = await readRecordList(r, `time_clock?select=id&company_id=eq.${companyId}&employee_id=eq.${id}&limit=1`)
  if (shifts.length) {
    await fetch(`${r.url}/rest/v1/employees?id=eq.${id}&company_id=eq.${companyId}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ active: false, updated_at: new Date().toISOString() }) })
    return { ok: true as const, deleted: 0 }
  }
  // The invite made an auth login for them. If they never used it, it goes too.
  const email = String(prop.payload?.columns?.row?.email || '')
  if (email && prop.payload?.created?.email_sent) {
    try {
      const list = await (await fetch(`${r.url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=10`, { headers: hdr(r) })).json()
      const u = (list?.users || []).find((x: any) => String(x.email || '').toLowerCase() === email.toLowerCase())
      if (u && !u.last_sign_in_at) await fetch(`${r.url}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: hdr(r) })
    } catch (e) { console.error('[arnieEmployee] auth cleanup skipped:', e) }
  }
  const inv = prop.payload?.created?.invitation_id
  if (inv) await fetch(`${r.url}/rest/v1/employee_invitations?id=eq.${inv}&company_id=eq.${companyId}`, { method: 'DELETE', headers: { ...hdr(r), Prefer: 'return=minimal' } })
  const del = await fetch(`${r.url}/rest/v1/employees?id=eq.${id}&company_id=eq.${companyId}`, { method: 'DELETE', headers: { ...hdr(r), Prefer: 'return=minimal' } })
  if (!del.ok) return { ok: false as const, error: `Could not remove them: ${del.status} ${await del.text()}` }
  return { ok: true as const, deleted: 1 }
}
