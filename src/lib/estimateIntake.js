// Estimate intake — re-export shim plus the one client-side writer.
//
// The shape and its invariants live in
// supabase/functions/_shared/estimateIntake.ts so the edge functions and the
// app share ONE copy, the same arrangement as materialLaborSplit/matLabCore.
// Do not reimplement anything here; add to the core instead.
//
// What this file adds is the WRITE, for the two producers that run in the
// browser (Zach and Don). It exists because both of them currently do this:
//
//     const { error } = await supabase.from('quote_lines').insert(lines)
//     if (error) console.warn('quote_lines insert failed:', error.message)
//
// which leaves a quote row with no lines and tells nobody. An estimate is the
// header and its lines together or it is nothing, so a line failure rolls the
// header back and throws.

import {
  intakeQuoteRow,
  intakeLineRows,
  intakeResidual,
  validateIntake,
} from '../../supabase/functions/_shared/estimateIntake.ts'

export {
  round2,
  normalizeExtras,
  intakeLineRows,
  intakeLineSum,
  intakeTotal,
  intakeQuoteRow,
  validateIntake,
  intakeResidual,
} from '../../supabase/functions/_shared/estimateIntake.ts'

/**
 * Create a quote and its lines from an intake, then link it back.
 *
 * @param supabase  a supabase-js client
 * @param intake    an EstimateIntake (see the core module)
 * @param options.advanceLeadTo  lead status to set, or null to leave it alone.
 *        Zach and Don already advance to "Estimate Sent"; Lenard never did,
 *        which is why Lenard leads sat in their old status after quoting.
 * @returns { quote, lineCount, residual }
 */
export async function createEstimateFromIntake(supabase, intake, options = {}) {
  const { advanceLeadTo = 'Estimate Sent' } = options

  const problems = validateIntake(intake)
  if (problems.length) {
    throw new Error(`Cannot create estimate from ${intake?.source || 'unknown'} intake:\n  - ${problems.join('\n  - ')}`)
  }

  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .insert(intakeQuoteRow(intake))
    .select()
    .single()
  if (qErr) throw new Error(`Estimate header failed: ${qErr.message}`)

  const rows = intakeLineRows(intake, quote.id)
  const { data: written, error: lErr } = await supabase.from('quote_lines').insert(rows).select('id')

  // Count what the database confirmed, never what we hoped to send. Reporting
  // "pushed with 5 line items" off the array length made a failed insert read
  // as success. A partial write is also a failure: a headline total with only
  // some of the work itemised under it is worse than no quote, because it
  // looks finished.
  const count = written?.length ?? 0
  if (lErr || count !== rows.length) {
    await supabase.from('quotes').delete().eq('id', quote.id)
    const why = lErr ? lErr.message : `only ${count} of ${rows.length} lines were written`
    throw new Error(`Estimate lines failed, header rolled back: ${why}. Nothing was left half-made.`)
  }

  if (intake.lead_id) {
    const patch = { quote_id: quote.id }
    if (advanceLeadTo) patch.status = advanceLeadTo
    await supabase.from('leads').update(patch).eq('id', intake.lead_id)
  }

  return { quote, lineCount: count, residual: intakeResidual(intake) }
}
