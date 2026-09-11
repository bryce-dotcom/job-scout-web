import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const money = read('../../supabase/functions/_shared/arnieMoney.ts')
const chatTs = read('../../supabase/functions/arnie-chat/index.ts')
const engine = read('../pages/agents/arnie/arnieEngine.js')

// Some money is only for admins. These assert the shape that keeps it that
// way: the gate is decided from the JWT inside the tool, and there is no
// input the model could use to widen it.

const toolDef = (name) => {
  const i = chatTs.indexOf(`name: '${name}'`)
  expect(i, `${name} not defined`).toBeGreaterThan(-1)
  return chatTs.slice(i, chatTs.indexOf('\n  },\n', i))
}

describe('own pay cannot be pointed at someone else', () => {
  it('query_my_pay has no employee input of any kind', () => {
    const def = toolDef('query_my_pay')
    expect(def).not.toMatch(/employee/i)
  })

  it('myPay() scopes to the caller\'s employee id and refuses a login with none', () => {
    const fn = money.slice(money.indexOf('export async function myPay'), money.indexOf('async function earningsFor'))
    expect(fn).toMatch(/caller\.employeeId == null/)
    expect(fn).toMatch(/earningsFor\(r, companyId, caller\.employeeId, opts\)/)
    expect(fn).not.toMatch(/opts\.employee|input\.employee/)
  })
})

describe('each gated tool checks the gate the app itself uses', () => {
  it('payroll: HR access, like the Payroll page', () => {
    const fn = money.slice(money.indexOf('export async function payroll'), money.indexOf('export async function payments'))
    expect(fn).toMatch(/if \(!access\.hr\)/)
    expect(fn).toMatch(/restricted:/)
  })

  it('payments: owner only, like revenue', () => {
    const fn = money.slice(money.indexOf('export async function payments'), money.indexOf('export async function purchaseOrders'))
    expect(fn).toMatch(/if \(!access\.isOwner\)/)
  })

  it('purchase orders: admin and above, like product cost', () => {
    const fn = money.slice(money.indexOf('export async function purchaseOrders'))
    expect(fn).toMatch(/if \(!access\.isAdmin\)/)
  })

  it('HR is read from the employee row, not trusted from anywhere the model can reach', () => {
    const fn = money.slice(money.indexOf('export async function moneyAccess'), money.indexOf('const num ='))
    expect(fn).toMatch(/employees\?select=has_hr_access,is_developer/)
    expect(fn).toMatch(/id=eq\.\$\{caller\.employeeId\}/)
  })

  it('a refused gate is a restricted note, not an exception, so Arnie explains instead of guessing', () => {
    expect(money.match(/restricted:/g).length).toBeGreaterThanOrEqual(4)
  })
})

describe('no tool returns a pay rate at any level', () => {
  it('nothing in the money module selects hourly_rate, salary or a commission rate', () => {
    const selects = [...money.matchAll(/select=([a-z_,]+)/g)].map(m => m[1])
    expect(selects.length).toBeGreaterThan(5)
    for (const s of selects) {
      expect(s, s).not.toMatch(/hourly_rate|salary|commission_[a-z]*_rate|pay_type/)
    }
  })

  it('the prompt says so, and says where rates live', () => {
    const block = engine.slice(engine.indexOf('## Money — who may see what'), engine.indexOf('## You have a voice'))
    expect(block).toMatch(/You never have pay RATES/)
    expect(block).toMatch(/Employees page/)
    expect(block).toMatch(/A number that sounds like someone's pay is a leak even when it is wrong/)
  })
})
