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
    expect(applied).toMatch(/setPending\(r, companyId, employeeId, employee\.email, null\)/)
  })
})

describe('a text conversation remembers', () => {
  it('keeps turns where the chat history already lives, not in a silo', () => {
    expect(sms).toMatch(/ai_messages/)
    expect(sms).toMatch(/session_id=eq\.\$\{SESSION\(employeeId\)\}/)
    expect(sms).toMatch(/module_used: 'arnie-sms'/)
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
