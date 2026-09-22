// Booking an appointment on a lead, in one place.
//
// The Lead Setter did this inline: insert the appointment, point the lead at
// it (status, time, rep, owner), then the setter commission, the lead-source
// commission and the legacy setter_commissions row. The Liahona lead card
// books from the map too, so the whole sequence lives here and both call it.
// Pay rows are written exactly as the setter wrote them; nothing here
// decides a rate, it reads the employee's configured one.

import { supabase } from './supabase'

export async function bookAppointment({
  companyId, company, lead, setterId,
  startTime, durationMinutes = 60, salespersonIds = [], location = null, notes = null, title = null
}) {
  const start = new Date(startTime)
  const end = new Date(start.getTime() + durationMinutes * 60000)
  const ids = (salespersonIds || []).filter(Boolean)
  const primaryId = ids[0] || null

  const { data: apt, error } = await supabase
    .from('appointments')
    .insert({
      company_id: companyId,
      lead_id: lead.id,
      title: title || `${lead.customer_name} - ${lead.service_type || 'Consultation'}`,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_minutes: durationMinutes,
      location: location || lead.address || null,
      salesperson_id: primaryId,
      salesperson_ids: ids,
      setter_id: setterId || null,
      lead_owner_id: lead.lead_owner_id || null,
      status: 'Scheduled',
      notes: notes || null
    })
    .select()
    .single()
  if (error) return { error }

  // Link the lead and hand it to the rep so it shows in their lists.
  const { error: leadError } = await supabase
    .from('leads')
    .update({
      status: 'Appointment Set',
      appointment_time: start.toISOString(),
      appointment_id: apt.id,
      salesperson_id: primaryId,
      salesperson_ids: ids,
      lead_owner_id: primaryId,
      updated_at: new Date().toISOString()
    })
    .eq('id', lead.id)
  if (leadError) console.error('Error updating lead after booking:', leadError)

  // The setter's fee is written by the DB (trigger appointments_setter_fee,
  // migration 20260922170000) the moment the appointment above lands. It used
  // to be an insert right here, inside a try/catch that only logged: when it
  // did not land there was no trace, and 31 appointments across three setters
  // were left with no pay row at all (Tracy, 0d53fc00). A fee that depends on
  // the page holding the appointment is a fee that goes missing.

  // Lead-source commission, when someone sourced the lead.
  try {
    if (lead.lead_source_employee_id) {
      const { data: sourceEmployee } = await supabase
        .from('employees').select('commission_leads_rate, commission_leads_type').eq('id', lead.lead_source_employee_id).single()
      const sourceRate = sourceEmployee?.commission_leads_rate || company?.source_pay_per_lead || 0
      if (sourceRate > 0) {
        await supabase.from('lead_commissions').insert({
          company_id: companyId, lead_id: lead.id, appointment_id: apt.id,
          commission_type: 'lead_source', employee_id: lead.lead_source_employee_id,
          amount: sourceRate, rate_type: sourceEmployee?.commission_leads_type || 'flat', payment_status: 'pending'
        })
      }
    }
  } catch (err) { console.log('Lead source commission not created:', err) }

  // Legacy setter_commissions table, kept for anything still reading it.
  try {
    if (setterId && company?.setter_pay_per_appointment > 0) {
      await supabase.from('setter_commissions').insert({
        company_id: companyId, lead_id: lead.id, appointment_id: apt.id,
        setter_id: setterId, setter_amount: company?.setter_pay_per_appointment || 25, payment_status: 'pending'
      })
    }
  } catch { /* legacy table may not exist */ }

  return { appointment: apt }
}
