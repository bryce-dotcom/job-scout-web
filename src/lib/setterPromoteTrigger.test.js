import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const migDir = resolve(here, '../../supabase/migrations')

// The LAST migration to define each function is the one the database runs.
// Normalised to LF: this repo checks out CRLF on Windows.
function latestDefinition(fnName) {
  const files = readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()
  let found = null
  for (const f of files) {
    const src = readFileSync(resolve(migDir, f), 'utf8').replace(/\r\n/g, '\n')
    // Built from pieces rather than a template so the escapes read literally.
    const re = new RegExp('create or replace function public[.]' + fnName + '[(][)][^]*?[$][$];', 'i')
    const m = src.match(re)
    if (m) found = { file: f, body: m[0] }
  }
  expect(found, `${fnName} is defined in no migration`).toBeTruthy()
  return found
}

// Tracy set the Halifax Flooring appointment. Noah quoted from a duplicate
// lead one letter off. She relinked the quote to her lead and her $75 stayed
// pending — and worse, it turned out that since the pay guard landed on
// Aug 27, a Manager creating a quote on ANY lead with a pending setter fee
// got "Only an admin can change payment_status" and no quote at all. The
// trigger that promotes the fee runs as the person inserting the quote.

describe('the promote trigger fires on relink, not only on insert', () => {
  const { body } = latestDefinition('promote_setter_commissions_on_quote')
  const trigger = (() => {
    const files = readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()
    let last = ''
    for (const f of files) {
      const src = readFileSync(resolve(migDir, f), 'utf8').replace(/\r\n/g, '\n')
      const m = src.match(/create trigger quotes_promote_setter_commissions[\s\S]*?;/i)
      if (m) last = m[0]
    }
    return last
  })()

  it('is wired to UPDATE OF lead_id as well as INSERT', () => {
    expect(trigger).toMatch(/after insert or update of lead_id on public\.quotes/i)
  })

  it('promotes the lead the quote arrives at', () => {
    expect(body).toMatch(/lead_id = new\.lead_id[\s\S]*?payment_status = 'pending'/i)
  })

  it('demotes the lead the quote left — earned only, never paid', () => {
    expect(body).toMatch(/tg_op = 'UPDATE'/i)
    expect(body).toMatch(/lead_id = old\.lead_id[\s\S]*?payment_status = 'earned'/i)
    // A paid row is history. Nothing in the demotion may match on 'paid'.
    const demote = body.slice(body.indexOf("tg_op = 'UPDATE'"))
    expect(demote).not.toMatch(/payment_status = 'paid'/)
  })

  it('only demotes when no other quote remains on the old lead', () => {
    expect(body).toMatch(/not exists \(select 1 from public\.quotes where lead_id = old\.lead_id and id <> new\.id\)/i)
  })
})

describe('the pay guard lets the trigger through and nobody else', () => {
  const trig = latestDefinition('promote_setter_commissions_on_quote').body
  const guard = latestDefinition('guard_commission_amounts').body

  it('the trigger marks its own writes with a transaction-local flag and clears it', () => {
    expect(trig).toMatch(/set_config\('jobscout\.trusted_write', 'setter_promote', true\)/)
    expect(trig).toMatch(/set_config\('jobscout\.trusted_write', '', true\)/)
    // set, then cleared — in that order
    expect(trig.indexOf("'setter_promote', true")).toBeLessThan(trig.indexOf("'', true"))
  })

  it('the guard honours exactly that flag value', () => {
    expect(guard).toMatch(/current_setting\('jobscout\.trusted_write', true\) = 'setter_promote'/)
  })

  it('the guard still blocks payment_status on lead_commissions for a person below Admin', () => {
    expect(guard).toMatch(/when 'lead_commissions'[^\n]*'payment_status'/)
    expect(guard).toMatch(/current_user_access_level\(\) >= 3 then return new/)
    expect(guard).toMatch(/raise exception 'Only an admin can change/)
  })

  it('the guard definition that wins is the one that knows about the flag', () => {
    const { file } = latestDefinition('guard_commission_amounts')
    expect(file >= '20260911120000').toBe(true)
  })
})
