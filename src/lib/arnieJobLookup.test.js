import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const chat = readFileSync(resolve(here, '../../supabase/functions/arnie-chat/index.ts'), 'utf8').replace(/\r\n/g, '\n')

// Alayda asked for the existing fixtures on JOB-MT964ZIZ (2026-10-15). Jenny
// had no way to open one job, invented 140 fixtures it does not have, twice,
// then claimed a screenshot she never took, then said she could not email.
describe('one job, opened from its real lines', () => {
  const start = chat.indexOf("if (name === 'query_jobs' && typeof input?.job === 'string'")
  const branch = chat.slice(start, chat.indexOf("if (name === 'query_jobs') {", start))
  it('is offered on query_jobs, and runs before the counting branch', () => {
    expect(chat).toMatch(/job: \{ type: 'string', description: 'One job to open: its number \(JOB-…\)/)
    expect(start).toBeGreaterThan(-1)
    expect(start).toBeLessThan(chat.indexOf("if (name === 'query_jobs') {"))
  })
  it('finds it by number, or by the business name that lives only on the customer', () => {
    expect(branch).toMatch(/job_id: `ilike\.\$\{clean\}`/)
    expect(branch).toMatch(/sb\('customers'\)[\s\S]{0,120}name: `ilike\.\$\{pat\}`/)
    expect(branch).toMatch(/or\.push\(`customer_id\.in\.\(\$\{custIds\.join\(','\)\}\)`\)/)
  })
  it('every read is this company only', () => {
    expect(branch.match(/company_id: `eq\.\$\{companyId\}`/g).length).toBeGreaterThanOrEqual(4)
  })
  it('returns the lines with their notes, and asks rather than picking when several match', () => {
    expect(branch).toMatch(/select: 'job_id,quantity,item_id,item_name,description,notes,kind,in_utility_scope'/)
    expect(branch).toMatch(/jobs\.length > 3/)
    expect(branch).toMatch(/Do not pick one\./)
    expect(branch).toMatch(/never fill it in from the playbook/)
  })
  it('prices and the job total only for an admin', () => {
    expect(branch).toMatch(/\+ \(isAdmin \? ',job_total' : ''\)/)
    expect(branch).toMatch(/\+ \(isAdmin \? ',price,total' : ''\)/)
    expect(branch).toMatch(/\.\.\.\(isAdmin \? \{ price: l\.price, total: l\.total \} : \{\}\)/)
  })
})

describe('a step on their computer reports back, and he keeps going', () => {
  const ui = chat.slice(chat.indexOf("if (name === 'use_my_computer') {"), chat.indexOf("if (name === 'query_crew') {"))
  it('every action waits for its outcome — not "queued" and silence', () => {
    expect(ui).toMatch(/const done = await waitForDone\(bearer, out\.action_id\)/)
    expect(ui).toMatch(/done\.decision === 'allowed'[\s\S]{0,200}Keep going until what they asked for is done/)
    expect(ui).toMatch(/done\.decision === 'failed'[\s\S]{0,200}why: done\.reason/)
    expect(ui).toMatch(/still_working: true[\s\S]{0,120}Do not say it worked/)
  })
  it('a computer task gets 12 tool rounds, everything else 5', () => {
    expect(chat.match(/< \(used\.has\('use_my_computer'\) \? 12 : 5\)/g).length).toBe(2)
  })
})

describe('email it to me — and only to me', () => {
  const start = chat.indexOf("if (name === 'email_me') {")
  const branch = chat.slice(start, start + 900)
  it('is offered to everyone', () => {
    expect(chat).toMatch(/offered\.push\(EMAIL_ME_TOOL\)/)
    expect(chat).toMatch(/name: 'email_me'/)
  })
  it('the address is the signed-in person\'s, never one the model names', () => {
    expect(branch).toMatch(/await sendArnieEmail\(email, subject, subject, body, who\)/)
    expect(branch).not.toMatch(/input\??\.(to|email|address)/)
    // and the tool does not even take one
    const def = chat.slice(chat.indexOf("name: 'email_me'"), chat.indexOf('function toolsFor'))
    expect(def).not.toMatch(/\bto: \{|recipient|address: \{/)
  })
  it('from their own assistant\'s name', () => {
    expect(branch).toMatch(/const who = await assistantName\(/)
  })
})
