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
    .select('id,persona,display_name,voice_id,detail')
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
  // Tell everything that renders the assistant to re-read.
  //
  // The corner launcher, the phone tab bar and the avatar all load the
  // persona once, on mount. They sit outside the Arnie workspace, so the
  // route context the settings screen uses to refresh the header never
  // reached them: you could switch to Jenny, watch the page change around
  // you, and the corner still said Arnie until a full reload. Bryce found
  // exactly that — "the little icon still says ask Arnie even whne i change
  // it to Jenny". A window event is the one thing all of them can hear.
  if (!error) {
    try { window.dispatchEvent(new CustomEvent(PERSONA_CHANGED)) } catch { /* SSR / no window */ }
  }
  return { error: error?.message || null }
}

/** Fired after a persona is saved. useAssistant() listens; nothing else should need to. */
export const PERSONA_CHANGED = 'arnie:persona-changed'

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

/**
 * The words on the button that opens the assistant.
 *
 * Two things were wrong with "Ask Arnie". It said Arnie to people who had
 * chosen Jenny — the one place in the app a rename did not reach. And "ask"
 * is help-desk framing: you ask a search box a question and it hands you an
 * answer. This assistant does the work. You put him on it, the way you would
 * with anyone else on the crew, which is also how people actually end up
 * using him.
 *
 * Bryce picked the wording (2026-10-13): "I hate ask Arnie as the phrase...
 * it should be more profound than that."
 *
 * Takes the SHORT name — this sits in a chip about 120px wide, and a long
 * renamed assistant would wrap. assistantShortName() is the matching rule.
 */
export function handOffLabel(shortName) {
  return `Put ${shortName || 'Arnie'} on it`
}

/**
 * The short name for tight spots: what they renamed it to (already short, by
 * the rules that accept it), else the persona's first name.
 */
export function assistantShortName({ personaRow } = {}) {
  const persona = personaFor(personaRow?.persona || DEFAULT_PERSONA)
  if (personaRow?.display_name) {
    const safe = safeDisplayName(personaRow.display_name, persona)
    // safeDisplayName hands back the FULL name when it rejects something —
    // fine where a long name fits, wrong here. "Put Jenny JobScouter on it"
    // does not fit the chip, and a rejected name is not a reason to use the
    // longest form of the real one.
    if (safe && safe !== persona.fullName) return safe
  }
  return persona.shortName || persona.fullName
}
