import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const appt = read('../../supabase/functions/_shared/arnieAppointment.ts')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')
const booking = read('./bookAppointment.js')   // the page and the Liahona lead card both book through this

// Booking through Arnie has to do everything the Lead Setter page does, or
// Arnie becomes a new way to orphan a setter's fee. These hold the two in
// step: whatever the page writes when a person books, the rail writes too.

const applyFn = appt.slice(appt.indexOf('export async function applyAppointment'), appt.indexOf('export async function rollbackAppointment'))
const rollbackFn = appt.slice(appt.indexOf('export async function rollbackAppointment'))
const prepareFn = appt.slice(appt.indexOf('export async function prepareAppointment'), appt.indexOf('export async function applyAppointment'))
const pageBooking = booking.slice(booking.indexOf('export async function bookAppointment'))

const setter = read('../pages/LeadSetter.jsx')
const leadCard = read('../components/liahona/LeadCard.jsx')

describe('every door a person books through uses the one booking function', () => {
  it('the Lead Setter page calls bookAppointment with the setter, and writes none of the pay rows itself', () => {
    expect(setter).toMatch(/await bookAppointment\(\{[\s\S]*setterId: user\?\.id/)
    expect(setter).not.toMatch(/from\('lead_commissions'\)/)
    expect(setter).not.toMatch(/commission_type: 'appointment_set'/)
  })
  it('the Liahona lead card calls bookAppointment with the setter, and writes none of the rows itself', () => {
    expect(leadCard).toMatch(/await bookAppointment\(\{[\s\S]*setterId: employeeId/)
    expect(leadCard).not.toMatch(/from\('appointments'\)/)
    expect(leadCard).not.toMatch(/lead_commissions/)
  })
})

describe('the five writes the page makes, the rail makes too', () => {
  it('1. the appointment, Scheduled, with the setter recorded', () => {
    expect(applyFn).toMatch(/ins\(r, 'appointments', \{[\s\S]*setter_id: setterId[\s\S]*status: 'Scheduled'/)
    expect(pageBooking).toMatch(/setter_id: setterId \|\| null/)
    expect(pageBooking).toMatch(/status: 'Scheduled'/)
  })

  it('2. the lead: Appointment Set, time, id, rep — and ownership to the rep', () => {
    expect(applyFn).toMatch(/patchRow\(r, 'leads', companyId, c\.lead_id, \{\s*status: 'Appointment Set', appointment_time: c\.start_time, appointment_id: apt\.id,\s*salesperson_id: c\.salesperson_id, salesperson_ids: c\.salesperson_ids, lead_owner_id: c\.salesperson_id/)
    expect(pageBooking).toMatch(/status: 'Appointment Set'/)
    expect(pageBooking).toMatch(/lead_owner_id: primaryId/)
  })

  // 3. The setter's fee is no longer either path's to write: the DB writes it
  // when the appointment lands (trigger appointments_setter_fee). Both paths
  // wrote it by hand before, inside a swallow-everything try/catch, and 31
  // appointments ended up with no fee row at all (Tracy, 0d53fc00).
  it('3. neither path writes the setter fee by hand any more', () => {
    expect(applyFn).not.toMatch(/commission_type: 'appointment_set'/)
    expect(pageBooking).not.toMatch(/commission_type: 'appointment_set'/)
    expect(applyFn).not.toMatch(/commission_setter_rate/)
    expect(pageBooking).not.toMatch(/commission_setter_rate/)
  })

  it('3b. the rail reads the fee back so an unbook can still find it', () => {
    // Deleting the appointment only SETs lead_commissions.appointment_id NULL,
    // so a rollback that does not delete the fee leaves one nobody can see.
    expect(applyFn).toMatch(/lead_commissions\?select=id[^`]*appointment_id=eq\.\$\{apt\.id\}[^`]*commission_type=eq\.appointment_set/)
    expect(applyFn).toMatch(/if \(fee\?\.id\) \(created\.commission_ids as number\[\]\)\.push\(fee\.id\)/)
  })

  it('4. the lead-source fee when the lead has a source employee', () => {
    expect(applyFn).toMatch(/if \(c\.lead_source_employee_id\)/)
    expect(applyFn).toMatch(/commission_type: 'lead_source'/)
    expect(pageBooking).toMatch(/commission_type: 'lead_source'/)
  })

  it('5. the legacy setter_commissions row, while the page still writes it', () => {
    expect(applyFn).toMatch(/ins\(r, 'setter_commissions'/)
    expect(pageBooking).toMatch(/from\('setter_commissions'\)/)
  })
})

describe('booked means a real appointment, not a status', () => {
  it('refuses when the calendar has one, and books when only the status says so', () => {
    expect(prepareFn).toMatch(/appointments\?select=id,start_time,status[^`]*lead_id=eq\.\$\{lead\.id\}&status=neq\.Cancelled&end_time=gt\./)
    expect(prepareFn).toMatch(/if \(lead\.appointment_id \|\| existing\.length\)/)
    expect(prepareFn).toMatch(/marked Appointment Set but nothing is on the calendar/)
  })

  it('apply re-checks, so an approve that raced a booking from the page refuses', () => {
    expect(applyFn).toMatch(/stale: true/)
    expect(applyFn).toMatch(/got an appointment since I drafted this/)
  })

  it('ambiguity is a question: the lead and the rep both go through needs_choice', () => {
    expect((prepareFn.match(/needs_choice/g) || []).length).toBeGreaterThanOrEqual(2)
  })

  it('a clash is said, not blocked', () => {
    expect(prepareFn).toMatch(/label: 'Clash'/)
    expect(prepareFn).not.toMatch(/clash\.length\) return \{ ok: false/)
  })
})

describe('unbooking', () => {
  it('undoes all five, in reverse, and puts the lead back exactly', () => {
    expect(rollbackFn).toMatch(/del\(r, 'lead_commissions'/)
    expect(rollbackFn).toMatch(/del\(r, 'setter_commissions'/)
    expect(rollbackFn).toMatch(/patchRow\(r, 'leads', companyId, c\.lead_id, c\.lead_before\)/)
    expect(rollbackFn).toMatch(/del\(r, 'appointments'/)
    expect(prepareFn).toMatch(/lead_before: \{ status: lead\.status, appointment_time: lead\.appointment_time, appointment_id: lead\.appointment_id/)
  })

  it('refuses once a fee has moved past pending', () => {
    expect(rollbackFn).toMatch(/payment_status !== 'pending'/)
    expect(rollbackFn).toMatch(/Can't unbook/)
  })

  it('is wired through the create rail as the custom apply and rollback', () => {
    expect(create).toMatch(/appointment: \{[\s\S]*applyCustom: applyAppointment,\s*rollbackCustom: rollbackAppointment/)
    expect(create).toMatch(/if \(target\.rollbackCustom\) return await target\.rollbackCustom\(r, companyId, prop\)/)
  })
})
