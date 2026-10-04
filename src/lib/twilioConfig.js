// Is this actually a Twilio configuration?
//
// Bryce entered his Twilio details, hit Test, and got "Failed to send test SMS".
// What had been stored was an 18-character Account SID beginning "br", a
// 10-character auth token, and a phone number written "(385) 555-0100". None of
// the three is the shape Twilio accepts, the form took all of them without a
// word, and the real explanation never made it back to the screen.
//
// Twilio's shapes are fixed and cheap to check, so check them here rather than
// discovering it at the API:
//
//   Account SID   starts "AC", 34 characters   (AC + 32 hex)
//   Auth Token    32 characters
//   From number   E.164 — +, country code, digits. "(385) 555-0100" is refused
//                 by Twilio, so normalise it instead of sending it on.
//
// Nothing here logs or returns a credential. The messages describe the SHAPE
// that is wrong, never the value.

export const SID_PREFIX = 'AC'
export const SID_LENGTH = 34
export const TOKEN_LENGTH = 32

/**
 * A phone number as E.164, or null when it cannot be read as one.
 *
 * A bare 10-digit US number gets +1, because that is what every number in this
 * app looks like and refusing it would be pedantry. Anything already carrying a
 * + is trusted as written once the digits look plausible.
 */
export function normalizePhone(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const hadPlus = raw.startsWith('+')
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (hadPlus) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
  if (digits.length === 10) return `+1${digits}`                       // US, as typed in this app
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null
}

/** True when the value is already exactly E.164. */
export function isE164(value) {
  return /^\+[1-9]\d{7,14}$/.test(String(value ?? '').trim())
}

/**
 * Why these credentials cannot work, as a sentence for the person typing them —
 * or null when the shapes are right. Shape only: whether Twilio accepts the
 * account is Twilio's answer to give, and the Test button asks it.
 */
export function twilioConfigProblem(config = {}) {
  const sid = String(config.account_sid ?? '').trim()
  const token = String(config.auth_token ?? '').trim()
  const from = String(config.from_number ?? '').trim()

  if (!sid) return 'Enter your Twilio Account SID.'
  if (!sid.toUpperCase().startsWith(SID_PREFIX)) {
    return `A Twilio Account SID starts with "${SID_PREFIX}". That looks like something else from the Twilio console — check you copied the Account SID.`
  }
  if (sid.length !== SID_LENGTH) {
    return `A Twilio Account SID is ${SID_LENGTH} characters; this one is ${sid.length}.`
  }
  if (!token) return 'Enter your Twilio Auth Token.'
  if (token.length !== TOKEN_LENGTH) {
    return `A Twilio Auth Token is ${TOKEN_LENGTH} characters; this one is ${token.length}. Reveal it in the Twilio console and copy the whole value.`
  }
  if (!from) return 'Enter the Twilio number texts will come from.'
  if (!normalizePhone(from)) {
    return 'That From number cannot be read as a phone number.'
  }
  return null
}

/** The config as it should be stored: trimmed, with the number in E.164. */
export function normalizeTwilioConfig(config = {}) {
  return {
    ...config,
    account_sid: String(config.account_sid ?? '').trim(),
    auth_token: String(config.auth_token ?? '').trim(),
    from_number: normalizePhone(config.from_number) || String(config.from_number ?? '').trim(),
  }
}

// ── What the carrier said, in English ──────────────────────────────────────
//
// Twilio accepting a message ("queued") is not the carrier delivering it. Bryce:
// "the test said it sent but I didnt get it" — both his test and a probe went
// queued and then undelivered with error 30034, and nothing ever looked past the
// queue. These are the codes worth translating, because each has a different
// thing the person has to go and do.
const SMS_ERRORS = {
  30034: 'That number is not registered for A2P 10DLC, so US carriers reject every message from it. Register a Brand and Campaign in Twilio (Messaging → Regulatory Compliance → A2P 10DLC) and attach this number. It is required for business texting in the US and takes a day or two to approve.',
  30032: 'Twilio has blocked this account from sending. Check for a billing or compliance hold in the Twilio console.',
  30007: 'The carrier filtered the message as spam. Shorter, plainer wording with no link usually gets through.',
  30003: 'The handset is unreachable — switched off, or out of coverage.',
  30005: 'That number does not exist, or cannot receive texts.',
  30006: 'That is a landline, or a number that cannot receive texts.',
  21211: 'That phone number is not a valid number Twilio can text.',
  21608: 'On a Twilio trial you can only text numbers you have verified. Verify the number, or upgrade the account.',
  21606: 'The From number cannot send texts. Check it is SMS-capable and on this account.',
  21610: 'That person replied STOP, so Twilio will not text them again until they opt back in.',
}

/** Plain English for a Twilio delivery error code, or null if unmapped. */
export function smsErrorHelp(code) {
  const n = Number(code)
  return Number.isFinite(n) ? (SMS_ERRORS[n] || null) : null
}

/**
 * What to tell someone after a test send, given Twilio's final status.
 *
 * `delivered` is the only success. `sent` means it left Twilio and the carrier
 * has not confirmed. `queued`/`accepted` mean nobody knows yet — which is what
 * used to be reported as "sent successfully".
 */
export function smsTestOutcome({ status, error_code: errorCode } = {}) {
  const s = String(status || '').toLowerCase()
  const help = smsErrorHelp(errorCode)
  const codeNote = errorCode ? ` (Twilio error ${errorCode})` : ''
  if (s === 'delivered') return { ok: true, message: 'Test message delivered.' }
  if (s === 'sent') return { ok: true, message: 'Sent to the carrier. It should arrive shortly.' }
  if (s === 'undelivered' || s === 'failed') {
    return { ok: false, message: `Not delivered${codeNote}. ${help || 'Check the message in the Twilio console for the reason.'}` }
  }
  // queued / accepted / sending / anything unexpected
  return {
    ok: false,
    message: `Twilio accepted it but has not delivered it yet (${s || 'unknown'}). That is not the same as arriving — check the Twilio console if it does not turn up.`,
  }
}
