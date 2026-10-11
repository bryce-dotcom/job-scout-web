// Arnie reading the EOS page, and sending the itinerary.
//
// Two things these tests exist to hold: the gate (the page is Manager+, so the
// tool is too) and the silence about numbers (the week's figures are computed
// in the browser, so the server must never imply one).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const src = read('../../supabase/functions/_shared/arnieEos.ts')
const send = read('../../supabase/functions/_shared/l10Send.ts')
const pageFn = read('../../supabase/functions/send-l10-agenda/index.ts')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')
const chat = read('../../supabase/functions/arnie-chat/index.ts')
// The prompt moved to _shared/arniePrompt.ts so a text or an email can build
// it too; read both, so a rule counts wherever it lives.
const engine = read('../pages/agents/arnie/arnieEngine.js') + '\n' + read('../../supabase/functions/_shared/arniePrompt.ts')

// The module, types stripped, with its imports faked so the pure parts run.
const mod = (() => {
  const code = transformSync(src, { loader: 'ts', format: 'cjs' }).code
  const m = { exports: {} }
  const agenda = transformSync(read('../../supabase/functions/_shared/l10Agenda.ts'), { loader: 'ts', format: 'cjs' }).code
  const am = { exports: {} }
  new Function('module', 'exports', agenda)(am, am.exports)
  const render = transformSync(read('../../supabase/functions/_shared/l10AgendaRender.ts'), { loader: 'ts', format: 'cjs' }).code
  const rm = { exports: {} }
  new Function('module', 'exports', render)(rm, rm.exports)
  const req = (p) => {
    if (p.includes('l10AgendaRender')) return rm.exports
    if (p.includes('l10Agenda')) return am.exports
    if (p.includes('l10Send')) return { CHANNELS: ['email', 'app', 'both'], sendAgenda: async () => ({ ok: true, result: { emailed: 1, emailed_to: ['x@y.z'], notified: 1, channel: 'both' } }) }
    if (p.includes('arnieTime')) return { resolveWhenSaid: (said) => (/thursday/i.test(said) ? { date: '2026-10-08', time: null } : null) }
    if (p.includes('arnieRest')) return { readRecordList: async () => [] }
    return {}
  }
  new Function('module', 'exports', 'require', code)(m, m.exports, req)
  return m.exports
})()

describe('the gate is the page’s gate', () => {
  it('refuses a tech by name, and says which level it needs', async () => {
    const out = await mod.eosOverview({ url: 'x', key: 'y' }, { companyId: 25, level: 0 }, {})
    expect(out.refused).toMatch(/manager and up/i)
    expect(out.refused).toMatch(/Management menu/)
    expect(out.scorecard).toBeUndefined()
  })

  it('refuses a team lead too — level 2 is the line', async () => {
    expect((await mod.eosOverview({ url: 'x', key: 'y' }, { companyId: 25, level: 1 }, {})).refused).toBeTruthy()
  })

  it('and the write rail draws the same line', async () => {
    const out = await mod.prepareAgenda({ url: 'x', key: 'y' }, { companyId: 25, level: 1 }, {})
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/manager and up/i)
  })

  it('is registered as Manager+ on the create target, not lower', () => {
    const block = create.slice(create.indexOf('meeting_agenda: {'), create.indexOf('meeting_agenda: {') + 900)
    expect(block).toMatch(/minLevel: 2/)
    expect(block).toMatch(/verb: 'Send'/)
  })
})

describe('no number it was not given', () => {
  it('the read says where the figures live instead of carrying one', () => {
    expect(src).toMatch(/Not in this read/)
    expect(src).toMatch(/computed on the EOS page/)
  })

  it('the read never touches a money table — no second copy of the metrics', () => {
    for (const t of ['payments?', 'invoices?', 'jobs?select', 'time_clock?', 'expenses?', 'plaid_transactions?']) {
      expect(src).not.toContain(t)
    }
  })

  it('the tool description tells the model the same thing', () => {
    const decl = chat.slice(chat.indexOf("name: 'query_eos'"), chat.indexOf("name: 'query_employees'"))
    expect(decl).toMatch(/does NOT return the week's scorecard FIGURES/)
    expect(decl).toMatch(/Manager and up/)
  })

  it('and the prompt forbids filling the gap from another tool', () => {
    expect(engine).toMatch(/## The EOS page/)
    expect(engine).toMatch(/never state a figure you were not given/)
    expect(engine).toMatch(/never work one out from another tool/)
  })
})

describe('who the agenda goes to', () => {
  const employees = [
    { id: 1, name: 'Doug Webb', email: 'doug@hhh.services' },
    { id: 2, name: 'Cole Westcott', email: 'cole@hhh.services' },
    { id: 3, name: 'No Email', email: '' },
  ]
  const agenda = { attendees: [{ employee_id: 1, name: 'Doug Webb', email: 'doug@hhh.services', why: 'a rock' }] }

  it('defaults to the room the agenda itself describes', () => {
    for (const word of ['', 'the team', 'everyone', 'the room', 'attendees']) {
      const { picked, missing } = mod.resolveRecipients(agenda, employees, word)
      expect(picked.map((p) => p.name), `for "${word}"`).toEqual(['Doug Webb'])
      expect(missing).toEqual([])
    }
  })

  it('honours a named list, matching a first name or a full name', () => {
    const { picked, missing } = mod.resolveRecipients(agenda, employees, 'Cole and Doug Webb')
    expect(picked.map((p) => p.name).sort()).toEqual(['Cole Westcott', 'Doug Webb'])
    expect(missing).toEqual([])
    // Someone invited who owns nothing on the agenda is still told why.
    expect(picked.find((p) => p.name === 'Cole Westcott').why).toBe('invited')
  })

  it('reports a name it could not place rather than dropping it', () => {
    const { picked, missing } = mod.resolveRecipients(agenda, employees, 'Doug Webb, Nobody Here')
    expect(picked.map((p) => p.name)).toEqual(['Doug Webb'])
    expect(missing).toEqual(['nobody here'])
  })

  it('carries null, not an empty string, for somebody with no email', () => {
    const { picked } = mod.resolveRecipients(agenda, employees, 'No Email')
    expect(picked[0].email).toBeNull()
  })

  it('a named person who is not on the team is refused, not guessed at', async () => {
    // prepareAgenda reads through a faked REST that returns nothing, so the
    // refusal we are testing is the recipient one, reached with a stub agenda.
    const out = await mod.prepareAgenda({ url: 'x', key: 'y' }, { companyId: 25, level: 4 }, { to: 'Nobody Here' })
    expect(out.ok).toBe(false)
    // With an empty EOS page it stops earlier, at "nobody owns anything" —
    // either refusal is honest, and neither one invents a recipient.
    expect(out.error).toMatch(/could not find|do not know who/)
  })
})

describe('sending leaves the building', () => {
  it('rollback refuses, and says what already went where', async () => {
    const out = await mod.rollbackAgenda({ url: 'x', key: 'y' }, 25, { payload: { created: { emailed: 3, notified: 4 } } })
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/cannot be unsent/)
    expect(out.error).toMatch(/3/)
    expect(out.error).toMatch(/4/)
  })

  it('the card warns before anybody approves it', () => {
    expect(src).toMatch(/Once it goes out it cannot be unsent/)
  })

  it('the prompt makes Arnie say so too, and never claim it is sent early', () => {
    expect(engine).toMatch(/It leaves the building/)
    expect(engine).toMatch(/Never say it has been sent until the card is approved/)
  })

  it('the in-app copy is deduped per person per meeting, so asking twice does not stack', () => {
    expect(send).toMatch(/dedupe_key: `l10:\$\{agenda\.meeting_on\}/)
    expect(send).toMatch(/resolution=merge-duplicates/)
  })

  it('a mailer that answers 200 with success:false is still a failure', () => {
    // send-email always returns 200 so the body reaches the caller; trusting
    // the status here would report a send that never happened.
    expect(send).toMatch(/body\?\.success === false/)
  })

  it('an email that fails while the app copy lands is reported, not swallowed', () => {
    expect(send).toMatch(/email_failed: emailError/)
  })
})

describe('one builder, not a second agenda', () => {
  it('Arnie renders the shared document and composes nothing', () => {
    expect(src).toMatch(/from '\.\/l10Agenda\.ts'/)
    expect(src).toMatch(/from '\.\/l10AgendaRender\.ts'/)
    expect(src).toMatch(/buildL10Agenda\(/)
    // No section titles typed in here — they belong to L10_SECTIONS.
    expect(src).not.toMatch(/Segue|Rock Review|Conclude/)
  })

  it('the prompt tells the model the agenda is built, not written', () => {
    expect(engine).toMatch(/The agenda is BUILT, not written/)
    expect(engine).toMatch(/Do not compose an agenda yourself/)
  })

  it('points at the page for paper', () => {
    expect(engine).toMatch(/Itinerary → Print/)
  })
})

describe('the shared propose_create field map', () => {
  it('declares every field meeting_agenda needs', () => {
    const props = chat.slice(chat.indexOf('properties: {', chat.indexOf("name: 'propose_create'")), chat.indexOf('confirm_new:'))
    for (const f of ['when:', 'to:', 'how:', 'unit:']) expect(props).toContain(f)
  })

  it('declares each of them exactly once — a duplicate key silently wins', () => {
    // `trade` and `when` were each declared twice, so diagnosis carried
    // company_setup's instructions and appointment's `when` guidance was dead.
    const props = chat.slice(chat.indexOf('properties: {', chat.indexOf("name: 'propose_create'")), chat.indexOf('confirm_new:'))
    for (const key of ['when', 'trade', 'to', 'how', 'unit', 'job', 'notes']) {
      const hits = [...props.matchAll(new RegExp(`(^|[\\s,{])${key}: \\{`, 'g'))].length
      expect(hits, `${key} declared ${hits} times`).toBe(1)
    }
  })
})

describe('the page’s Send button cannot be used to email anything it likes', () => {
  it('builds the agenda server-side and never accepts one from the browser', () => {
    // If this took the document, any login could have arbitrary text emailed to
    // the whole leadership team from the company's own address.
    expect(pageFn).toMatch(/buildL10Agenda\(\{ eos, employees, day, entity, numbers \}\)/)
    expect(pageFn).not.toMatch(/body\.agenda|body\.html|body\.subject|body\.sections/)
  })

  it('is manager and up, and signed in at all', () => {
    expect(pageFn).toMatch(/if \(!caller \|\| caller\.companyId == null\)/)
    expect(pageFn).toMatch(/if \(caller\.level < 2\)/)
    expect(pageFn).toMatch(/resolveCaller\(req, SUPABASE_URL, SERVICE_KEY\)/)
  })

  it('takes numbers only for metrics this company actually measures, coerced', () => {
    expect(pageFn).toMatch(/const ids = new Set\(\(eos\.scorecard \|\| \[\]\)\.map/)
    expect(pageFn).toMatch(/if \(!ids\.has\(String\(k\)\)/)
    expect(pageFn).toMatch(/Number\.isFinite\(tw\) \? tw : null/)
  })

  it('sends through the one sender, not its own copy', () => {
    expect(pageFn).toMatch(/from '\.\.\/_shared\/l10Send\.ts'/)
    expect(pageFn).toMatch(/await sendAgenda\(/)
    // Prose about them is fine; a second copy of the writes is not.
    expect(pageFn).not.toMatch(/functions\/v1\/send-email/)
    expect(pageFn).not.toMatch(/rest\/v1\/employee_notifications/)
  })

  it('and the page asks that function rather than writing notifications itself', () => {
    const page = read('../pages/admin/EOS.jsx')
    expect(page).toMatch(/supabase\.functions\.invoke\('send-l10-agenda'/)
    expect(page).not.toMatch(/from\('employee_notifications'\)/)
    // The printed copy is the browser's job, and the only one.
    expect(page).toMatch(/generateL10AgendaPdf\(/)
    expect(page).toMatch(/buildL10Agenda\(/)
  })
})

describe('a field the tool advertises must actually reach the server', () => {
  // The quarterly came back as a weekly L10 on its first live try because
  // `type` was in propose_create's schema but not in the target's `fields`,
  // and anything not declared there is dropped before prepare ever sees it.
  // Arnie noticed and said so in the reply, which is the only reason it was
  // caught at all.
  const target = create.slice(create.indexOf('meeting_agenda: {'), create.indexOf('labelOf:', create.indexOf('meeting_agenda: {')))

  it('declares every meeting_agenda field the schema mentions', () => {
    const schema = chat.slice(chat.indexOf("'meeting_agenda:"), chat.indexOf("'followup: quote"))
    const advertised = ['type', 'days', 'ends', 'when', 'to', 'how', 'unit'].filter((f) => schema.includes(f))
    expect(advertised).toContain('type')
    // The registry aligns its columns, so collapse the padding first.
    const flat = target.replace(/\s+/g, ' ')
    for (const f of advertised) expect(flat, `${f} missing from the target's fields`).toContain(`${f}: {`)
  })

  it('pins the meeting type to the three EOS meetings', () => {
    expect(target).toMatch(/oneOf: \['l10', 'weekly', 'quarterly', 'annual'\]/)
  })

  it('and the card says which meeting it is, so a wrong one is visible', () => {
    const label = create.slice(create.indexOf('labelOf:', create.indexOf('meeting_agenda: {')), create.indexOf('prepare: prepareAgenda'))
    expect(label).toMatch(/Quarterly session/)
    expect(label).toMatch(/Annual session/)
  })
})

describe('the quarterly rail', () => {
  const eosSrc = read('../../supabase/functions/_shared/arnieEos.ts')

  it('builds the session shape, not a longer L10', () => {
    expect(eosSrc).toMatch(/from '\.\/quarterlyAgenda\.ts'/)
    expect(eosSrc).toMatch(/buildSessionAgenda\(\{ type: kind as 'quarterly' \| 'annual'/)
  })

  it('refuses a meeting EOS does not have', () => {
    expect(eosSrc).toMatch(/EOS has three meetings/)
  })

  it('asks for the day rather than guessing one — the EOS page only knows the L10 day', () => {
    expect(eosSrc).toMatch(/Which day does the \$\{kind\} session start\?/)
  })

  it('takes the finish times as said, and reads a bare "3" as the afternoon', () => {
    expect(eosSrc).toMatch(/function endTime/)
    expect(eosSrc).toMatch(/nobody finishes at 3am/)
  })

  it('sends through the one session sender', () => {
    expect(eosSrc).toMatch(/await sendSession\(/)
    expect(send).toMatch(/export async function sendSession/)
    expect(send).toMatch(/dedupe_key: `eos-session:/)
  })
})

describe('the in-app copy is the whole document', () => {
  it('does not cut a two-day session off before its scorecard', () => {
    // 1800 characters suited a 90-minute L10 and truncated a six-page session
    // at the V/TO — the eval caught it because "NO GOAL SET" never arrived.
    const l10Slice = send.slice(send.indexOf('type: \'l10_agenda\''), send.indexOf('type: \'l10_agenda\'') + 400)
    const sessionSlice = send.slice(send.indexOf('type: \'eos_session\''), send.indexOf('type: \'eos_session\'') + 700)
    expect(l10Slice).toContain('text.slice(0, 1800)')
    expect(sessionSlice).toContain('text.slice(0, 12000)')
  })
})
