// The L10 itinerary — re-export shim.
//
// The rule lives in supabase/functions/_shared/l10Agenda.ts so the app, the
// PDF, the email and Arnie all build the SAME document from one definition.
// Four renderers were the whole risk here; do not reimplement any of it in the
// browser — add to the shared module instead.

export {
  L10_SECTIONS,
  L10_MINUTES,
  EOS_SETTING_KEYS,
  dayStr,
  parseDay,
  calDay,
  nextMeetingDay,
  meetingWhenLabel,
  buildL10Agenda,
  agendaSummaryLines,
} from '../../supabase/functions/_shared/l10Agenda.ts'
