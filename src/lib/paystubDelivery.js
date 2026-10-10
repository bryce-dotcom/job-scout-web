// Paystub delivery: render every stub of a payroll run, store the PDFs, and
// have the server email or text them to the employees.
//
// Bryce, 2026-10-10: "it's gotta be as good as Gusto." Gusto's employees get
// their stub on payday without asking. Here the admin could only download
// one at a time. The PDF is drawn in the browser (paystubPdf.js, jsPDF with
// the company logo), so the browser renders and uploads; the send-paystubs
// function then attaches each file to an email and, if the company has
// Twilio, texts a seven-day link.
//
// Used by Payroll (right after a run) and by the Payroll Inbox (any run,
// any time — a re-send after an employee adds an email).
import { supabase } from './supabase'

const EMP_SELECT = 'id, name, email, phone, role, pay_type, hourly_rate, ssn_last4, home_address, home_city, home_state, home_zip, tax_classification, w9_business_name, w9_legal_name, active'

/**
 * Render and upload the PDFs a run is missing, then send.
 * channels: { email: true, sms: false }
 * Returns { rendered, emailed, texted, skipped: [{ name, why }], failed: [{ name, why }] }
 */
export async function deliverPaystubs({ companyId, runId, company, channels = { email: true, sms: false }, force = false, onProgress }) {
  const [{ data: stubs, error: sErr }, { data: emps, error: eErr }] = await Promise.all([
    supabase.from('paystubs').select('*').eq('company_id', companyId).eq('payroll_run_id', runId),
    supabase.from('employees').select(EMP_SELECT).eq('company_id', companyId),
  ])
  if (sErr) throw new Error('Could not load paystubs: ' + sErr.message)
  if (eErr) throw new Error('Could not load employees: ' + eErr.message)
  const live = (stubs || []).filter(s => (Number(s.gross_pay) || 0) > 0)
  if (!live.length) return { rendered: 0, emailed: 0, texted: 0, skipped: [], failed: [] }
  const empById = Object.fromEntries((emps || []).map(e => [e.id, e]))

  // Year-to-date on the stub needs every stub of that employee.
  const ids = [...new Set(live.map(s => s.employee_id))]
  const { data: allStubs } = await supabase.from('paystubs').select('*').eq('company_id', companyId).in('employee_id', ids)
  const byEmp = {}
  for (const s of allStubs || []) (byEmp[s.employee_id] = byEmp[s.employee_id] || []).push(s)

  const mod = await import('./paystubPdf')
  let rendered = 0
  const failed = []
  for (const stub of live) {
    if (stub.pdf_path && !force) continue
    const emp = empById[stub.employee_id]
    if (!emp) continue
    try {
      const ytd = mod.computePaystubYtd(byEmp[stub.employee_id] || [stub], stub)
      const blob = await mod.generatePaystubPdf({ paystub: stub, employee: emp, company, ytd })
      const path = `paystubs/${companyId}/${runId}/${stub.id}.pdf`
      const { error: upErr } = await supabase.storage.from('project-documents').upload(path, blob, { contentType: 'application/pdf', upsert: true })
      if (upErr) throw upErr
      const { error: pErr } = await supabase.from('paystubs').update({ pdf_path: path }).eq('id', stub.id).eq('company_id', companyId)
      if (pErr) throw pErr
      stub.pdf_path = path
      rendered++
      onProgress && onProgress({ rendered, total: live.length })
    } catch (err) {
      failed.push({ name: emp.name, why: 'PDF: ' + (err.message || err) })
    }
  }

  const { data, error } = await supabase.functions.invoke('send-paystubs', {
    body: { company_id: companyId, payroll_run_id: runId, channels, force },
  })
  if (error) throw new Error('send-paystubs: ' + (error.message || error))
  if (data?.error) throw new Error(data.error)
  return {
    rendered,
    emailed: data?.emailed || 0,
    texted: data?.texted || 0,
    skipped: [...(data?.skipped || [])],
    failed: [...failed, ...(data?.failed || [])],
  }
}

/** One line for the alert after a run. */
export function deliverySummary(r) {
  if (!r) return ''
  const parts = []
  if (r.emailed) parts.push(`emailed to ${r.emailed}`)
  if (r.texted) parts.push(`texted to ${r.texted}`)
  let s = parts.length ? `Paystubs ${parts.join(' and ')}.` : 'No paystubs were sent.'
  if (r.skipped?.length) s += `\nNot sent: ${r.skipped.map(x => `${x.name} (${x.why})`).join(', ')}.`
  if (r.failed?.length) s += `\nFailed: ${r.failed.map(x => `${x.name} (${x.why})`).join(', ')}.`
  return s
}
