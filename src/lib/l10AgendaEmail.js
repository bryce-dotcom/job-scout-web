// The itinerary as words — re-export shim.
//
// Lives in supabase/functions/_shared/l10AgendaRender.ts because Arnie sends
// this email from an edge function and the EOS page sends it from the browser.
// An email whose wording depends on who pressed the button is exactly the bug
// this prevents.

export { agendaHtml, agendaText, agendaSubject, goalText } from '../../supabase/functions/_shared/l10AgendaRender.ts'
