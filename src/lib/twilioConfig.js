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
