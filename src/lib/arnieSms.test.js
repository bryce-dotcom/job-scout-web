// Arnie by text.
//
// Bryce, 2026-10-10: a rep built his own cross-tool bot because ours lived in a
// browser tab. The channel is new; what Arnie may DO on it must not be.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const sms = read('../../supabase/functions/_shared/arnieSms.ts')
const headless = read('../../supabase/functions/_shared/arnieHeadless.ts')
const webhook = read('../../supabase/functions/inbound-sms/index.ts')

const mod = (() => {
  const m = { exports: {} }
  const code = transformSync(sms, { loader: 'ts', format: 'cjs' }).code
  const hm = { exports: {} }
  // arnieHeadless imports _shared siblings of its own, so it gets a require too.
  new Function('module', 'exports', 'require', transformSync(headless, { loader: 'ts', format: 'cjs' }).code)(hm, hm.exports, () => ({}))
  new Function('module', 'exports', 'require', code)(m, m.exports, (p) => (p.includes('arnieHeadless') ? hm.exports : {}))
  return m.exports
})()

describe('one number, two jobs', () => {
  it('a customer text still goes to the communications log, untouched', () => {
    // The branch sits ABOVE the log insert and returns; everything below it is
    // the original path for customers and leads.
    expect(webhook).toMatch(/if \(match\.kind === 'employee' && match\.id && !keywordOf\(body\)\)/)
    expect(webhook).toMatch(/communications_log/)
    // (compare against the INSERT, not the import of the same name at the top)
    expect(webhook.indexOf("match.kind === 'employee'")).toBeLessThan(webhook.indexOf('.insert(inboundLogRow('))
  })

  it('only an ACTIVE employee reaches Arnie', () => {
    expect(webhook).toMatch(/\.eq\('active', true\)/)
  })

  it('STOP and START are still consent, never a question for Arnie', () => {
    expect(webhook).toMatch(/!keywordOf\(body\)/)
  })

  it('replies in TwiML, so there is no second credential to hold', () => {
    expect(webhook).toMatch(/const twimlSay = /)
    expect(webhook).toMatch(/<Response><Message>/)
    // And it escapes what it echoes.
    expect(webhook).toMatch(/replace\(\/&\/g, '&amp;'\)/)
  })

  it('an Arnie failure answers the person instead of erroring at Twilio', () => {
    expect(webhook).toMatch(/catch \(e\)/)
    expect(webhook).toMatch(/Something went wrong on my end/)
  })
})

describe('what a text may not approve', () => {
  it('money and people are drafted by text but approved in the app', () => {
    for (const t of ['payment', 'price_book', 'expense_category', 'employee', 'payroll', 'bulk']) {
      expect(mod.APPROVE_IN_APP_ONLY).toContain(t)
    }
  })

  it('says why, rather than failing quietly', () => {
    expect(sms).toMatch(/moves money, so it needs approving in the app/)
  })

  it('and the reason is written down — a phone number is a weak credential', () => {
    expect(sms).toMatch(/can be spoofed/)
  })
})

describe('yes means yes, and only to the card in hand', () => {
  it('reads the obvious words both ways', () => {
    for (const y of ['y', 'yes', 'yep', 'ok', 'approve', 'do it', 'send it', 'go ahead', 'YES!']) {
      expect(mod.YES.test(y), y).toBe(true)
    }
    for (const n of ['n', 'no', 'nope', 'cancel', 'never mind', 'discard']) {
      expect(mod.NO.test(n), n).toBe(true)
    }
  })

  it('does not read a sentence as consent', () => {
    for (const s of ['yes but change the date', 'ok so what about Tuesday', 'go to the Smith job', 'no idea']) {
      expect(mod.YES.test(s) || mod.NO.test(s), s).toBe(false)
    }
  })

  it('applies through arnie-config, not by writing the row itself', () => {
    expect(sms).toMatch(/functions\/v1\/arnie-config/)
    expect(sms).toMatch(/action: 'apply', proposal_id: pending\.id/)
    expect(sms).not.toMatch(/rest\/v1\/arnie_proposals/)
  })

  it('clears what it is holding once it is decided, either way', () => {
    const applied = sms.slice(sms.indexOf('YES.test(said)'), sms.indexOf('NO.test(said)'))
    expect(applied).toMatch(/setPending\(r, channel, companyId, employeeId, employee\.email, null\)/)
  })
})

describe('a text conversation remembers', () => {
  it('keeps turns where the chat history already lives, not in a silo', () => {
    expect(sms).toMatch(/ai_messages/)
    // Per person AND per channel: answering "yes" to a card you were emailed
    // must not apply one you were texted.
    expect(sms).toMatch(/session_id=eq\.\$\{SESSION\(channel, employeeId\)\}/)
    expect(sms).toContain('module_used: `arnie-${channel.key}`')
  })

  it('reads them oldest first, so "that one too" means something', () => {
    expect(sms).toMatch(/order=created_at\.desc/)
    expect(sms).toMatch(/rows\.reverse\(\)/)
  })

  it('holds the pending card on the person’s own session row', () => {
    expect(sms).toMatch(/ai_sessions/)
    expect(sms).toMatch(/pending_action !== 'arnie_proposal'/)
  })
})

describe('the words that go out', () => {
  it('strips markdown, because a phone cannot render it', () => {
    const t = mod.forSms('## Heading\n**bold** and *italic*\n- one\n| a | b |')
    expect(t).not.toMatch(/\*\*|^#|\|/m)
    expect(t).toContain('bold')
    expect(t).toContain('Heading')
  })

  it('truncates rather than letting a carrier chop it badly', () => {
    const long = mod.forSms('x'.repeat(4000))
    expect(long.length).toBeLessThanOrEqual(mod.SMS_MAX)
    expect(long).toMatch(/more in the app/)
  })

  it('reads the card out, since it cannot be drawn', () => {
    const said = mod.cardAsText({ label: 'quote', fields: [{ label: 'For', value: 'Halifax' }, { label: 'Total', value: '$1,200' }] })
    expect(said).toContain('QUOTE')
    expect(said).toContain('For: Halifax')
    expect(said).toContain('Total: $1,200')
  })
})

describe('the channel changes nothing about what Arnie is', () => {
  it('runs through arnie-chat, with the same tools and rails', () => {
    expect(headless).toMatch(/functions\/v1\/arnie-chat/)
    expect(headless).toMatch(/buildArniePrompt\(/)
    // No second tool list, no second dispatch, no second set of gates.
    expect(headless).not.toMatch(/execTool|TOOLS =|propose_create:/)
  })

  it('streams, because the card only comes that way', () => {
    expect(headless).toMatch(/stream: true/)
    expect(headless).toMatch(/would silently lose every proposal/)
  })

  it('gets the static knowledge, and says plainly that the index is browser-side', () => {
    expect(headless).toMatch(/ARNIE_STATIC_KNOWLEDGE/)
    expect(headless).toMatch(/Background degrades; rules do not/)
  })
})

describe('the card survives the round trip', () => {
  // ai_sessions.pending_data is a TEXT column, so an object written to it comes
  // back as a JSON string. Spreading that gave character keys, `pending.id` was
  // undefined, and "yes" silently answered nothing. A live probe caught it on
  // 2026-10-10 — no unit test would have, because the shape only changes in
  // the database.
  it('parses a stored card whichever shape the column returns', () => {
    const fn = sms.slice(sms.indexOf('export async function pendingProposal'), sms.indexOf('export async function setPending'))
    expect(fn).toMatch(/if \(typeof data === 'string'\) \{ try \{ data = JSON\.parse\(data\) \}/)
    expect(fn).toMatch(/return data && typeof data === 'object'/)
  })

  it('writes it the same way it reads it', () => {
    expect(sms).toMatch(/pending_data: data \? JSON\.stringify\(data\) : null/)
  })

  it('a card that cannot be parsed is treated as no card, not as a broken one', () => {
    expect(sms).toMatch(/catch \{ return null \}/)
  })
})

describe('the same Arnie, by email', () => {
  const email = read('../../supabase/functions/inbound-email/index.ts')
  const webhook2 = read('../../supabase/functions/_shared/inboundWebhook.ts')

  it('mail to arnie@ is a conversation, not something to file', () => {
    expect(webhook2).toMatch(/if \(local === 'arnie' \|\| local\.startsWith\('arnie\+'\)\) return 'arnie'/)
    expect(email).toMatch(/if \(kindEarly === 'arnie'\)/)
  })

  it('only an active employee gets an answer — the address is the whole credential', () => {
    expect(email).toMatch(/employeeByContact\(rest, \{ email: sender \}\)/)
    expect(email).toMatch(/arnie_unknown_sender/)
  })

  it('everything else the webhook does is left alone', () => {
    // The branch returns before any of the filing below it.
    expect(email.indexOf("kindEarly === 'arnie'")).toBeLessThan(email.indexOf('isAutoReply(mail.subject'))
    expect(email).toMatch(/estimates/)
    expect(email).toMatch(/feedback/)
  })

  it('answers the question, not the quoted thread below it', () => {
    expect(email).toMatch(/On \.\+ wrote:/)
    expect(email).toMatch(/Original Message/)
  })

  it('shares the handshake with text rather than repeating it', () => {
    expect(sms).toMatch(/export function arnieByEmail/)
    expect(sms).toMatch(/export async function arnieConverse/)
    // One core; the channel only decides the thread and the length.
    expect(sms).toMatch(/export const EMAIL_CHANNEL: Channel = \{ key: 'email', max: 6000/)
    expect(sms).toMatch(/export const SMS_CHANNEL: Channel = \{ key: 'sms', max: SMS_MAX/)
  })

  it('an email is not truncated to a text message', () => {
    const long = mod.fit(mod.EMAIL_CHANNEL, 'x'.repeat(3000))
    expect(long.length).toBe(3000)
    expect(mod.fit(mod.SMS_CHANNEL, 'x'.repeat(3000)).length).toBeLessThanOrEqual(mod.SMS_MAX)
  })
})

describe('how anyone finds out he can be texted', () => {
  const send = read('../../supabase/functions/_shared/arnieSend.ts')

  it('every brief and nudge invites a reply, on the channel where replying now works', () => {
    // The capability shipped and nobody could have known. These messages
    // already land in the one place a reply reaches him, so they say so.
    expect(send).toMatch(/export const REPLY_HINT_SMS/)
    expect(send).toMatch(/export const REPLY_HINT_EMAIL/)
    expect(send).toMatch(/withHint = text\.includes\(REPLY_HINT_SMS\) \? text/)
    expect(send).toMatch(/esc\(REPLY_HINT_EMAIL\)/)
  })

  it('does not repeat itself when the caller already said it', () => {
    expect(send).toMatch(/text\.includes\(REPLY_HINT_SMS\)/)
  })

  it('the brief comes FROM an address that reaches him', () => {
    // A reply to invoices@ went nowhere; recipientKind routes arnie@ to the
    // conversation branch.
    expect(send).toMatch(/from: 'OG Arnie <arnie@appsannex\.com>', reply_to: 'arnie@appsannex\.com'/)
    expect(send).not.toMatch(/from: 'OG Arnie <invoices@/)
  })

  it('and the comment no longer claims inbound SMS does not exist', () => {
    expect(send).not.toMatch(/there is no inbound SMS/)
    expect(send).toMatch(/As of 2026-10-10 there is/)
  })
})
