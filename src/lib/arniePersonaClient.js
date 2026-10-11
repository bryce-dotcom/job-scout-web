// The browser's side of the persona: read it, save it, and decide the name.
//
// The personas themselves live in supabase/functions/_shared/arniePersona.ts
// so the prompt, a text message and this screen all agree about who Jenny is.
// This file only fetches the row and resolves the display name.

import { supabase } from './supabase'
import {
  PERSONA_LIST, DEFAULT_PERSONA, personaFor, safeDisplayName,
} from '../../supabase/functions/_shared/arniePersona.ts'

export { PERSONA_LIST, DEFAULT_PERSONA, personaFor, safeDisplayName }

/** This person's persona row, or null if they have never chosen. */
export async function loadPersona(employeeId) {
  if (!employeeId) return null
  const { data } = await supabase
    .from('arnie_personas')
    .select('id,persona,display_name,voice_id')
    .eq('employee_id', employeeId)
    .maybeSingle()
  return data || null
}

/**
 * Save it. One row per person, so this upserts on employee_id.
 *
 * Note the conflict target is the plain unique index on employee_id — a
 * partial index cannot be an onConflict target and the write would vanish
 * with a 42P10, which this project has been bitten by before.
 */
export async function savePersona(employeeId, companyId, patch) {
  if (!employeeId || !companyId) return { error: 'no employee' }
  const { error } = await supabase
    .from('arnie_personas')
    .upsert({
      employee_id: employeeId,
      company_id: companyId,
      ...patch,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'employee_id' })
  return { error: error?.message || null }
}

/**
 * What to call the assistant on screen.
 *
 * The order is the point: what THIS PERSON chose, then what the COMPANY
 * renamed it to, then the persona's own name. A tenant-wide rename used to be
 * the only option, so it has to keep working — it just no longer overrules
 * somebody's own choice.
 */
export function assistantName({ personaRow, companyCustomName, agentFullName }) {
  const persona = personaFor(personaRow?.persona || DEFAULT_PERSONA)
  if (personaRow?.display_name) {
    const safe = safeDisplayName(personaRow.display_name, persona)
    if (safe) return safe
  }
  // A person who picked Jenny and never renamed her should see Jenny, not the
  // company's nickname for Arnie.
  if (personaRow?.persona && personaRow.persona !== DEFAULT_PERSONA) return persona.fullName
  return companyCustomName || agentFullName || persona.fullName
}
