// Teach Jenny — company rules taught in chat, approved by an admin, followed
// by every assistant (Bryce, 2026-10-20: so nobody trains her in Grok).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseRules, secretIn, prepareCompanyRule, applyCompanyRule, rollbackCompanyRule, rulesPromptBlock } from '../../supabase/functions/_shared/arnieCompanyRules.ts'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const admin = { companyId: 3, level: 3, email: 'cole@hhh.services', employeeId: 16 }
const R = { url: 'https://x', key: 'k' }

afterEach(() => vi.unstubAllGlobals())
const stubRules = (rows) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => rows })))

describe('reading what they taught', () => {
  it('a list, a pasted block of lines, or one sentence', () => {
    expect(parseRules('["Every exterior light is 12/7.","Never use a pole option."]')).toEqual(['Every exterior light is 12/7.', 'Never use a pole option.'])
    expect(parseRules('"Interior offices are 10/5."')).toEqual(['Interior offices are 10/5.'])
    expect(parseRules('1. Sync and Save only.\n- Never Submit in TrakSmart.\n\n• Re-enter watts after picking an option.')).toEqual([
      'Sync and Save only.', 'Never Submit in TrakSmart.', 'Re-enter watts after picking an option.'])
  })
  it('refuses nothing, too much, or a rule too long to be one rule', () => {
    expect(parseRules('[]')).toMatch(/What is the rule/)
    expect(parseRules(JSON.stringify(Array.from({ length: 31 }, (_, i) => `Rule number ${i}`)))).toMatch(/up to 30/)
    expect(parseRules(JSON.stringify(['x'.repeat(401)]))).toMatch(/too long/)
  })
  it('a password or an account number is never a rule everyone reads', () => {
    expect(secretIn('The TrakSmart password is hunter2')).toBe(true)
    expect(secretIn('Our routing number is 124000054')).toBe(true)
    expect(secretIn('Every exterior light uses the 12/7 schedule')).toBe(false)
  })
})

describe('the card', () => {
  it('anyone may suggest; only an admin approves — the drafter is no exception', async () => {
    expect(read('supabase/functions/_shared/arnieCreate.ts')).toMatch(/table: 'company_rules',\n[^\n]*\n\s+minLevel: 0,\n\s+approveLevel: 3,/)
    stubRules([])
    const p = await prepareCompanyRule(R, { ...admin, level: 2 }, { rules: '["Every exterior light uses the 12/7 schedule."]' })
    expect(p.ok).toBe(true)
    expect(p.columns.suggested).toBe(true)
    expect(p.display.find((d) => d.label === 'Suggested').value).toMatch(/An admin approves it on Arnie → Setup/)
    const cfg = read('supabase/functions/arnie-config/index.ts')
    expect(cfg).toMatch(/if \(approve != null\) \{\n\s+return caller\.level >= approve/)
    expect(cfg).toMatch(/const ownWithdraw = action === 'reject'/)
    expect(cfg).toMatch(/prop\.approved_by_email = caller\.email;/)
  })
  it('an admin\'s assistant is told what is waiting; a non-admin\'s says it is a suggestion', () => {
    expect(rulesPromptBlock([], true, [{ id: 9, by: 'london', rules: ['Never pick a pole option.'] }])).toMatch(/london suggested "Never pick a pole option\."/)
    expect(rulesPromptBlock([], false)).toMatch(/what they teach is a SUGGESTION/)
    expect(read('src/pages/agents/arnie/ArnieTeamRules.jsx')).toMatch(/Suggested — waiting for an admin/)
  })
  it('skips what she already follows and shows the rest', async () => {
    stubRules([{ id: 7, rule: 'Every exterior light uses the 12/7 schedule.' }])
    const p = await prepareCompanyRule(R, admin, { rules: JSON.stringify(['every exterior light uses the 12/7 schedule', 'Interior offices are 10/5.']) })
    expect(p.ok).toBe(true)
    expect(p.columns.rules).toEqual(['Interior offices are 10/5.'])
    expect(p.display.find((d) => /Already a rule/.test(d.label)).value).toMatch(/12\/7/)
  })
  it('changing a rule = retire its number and add the new wording', async () => {
    stubRules([{ id: 7, rule: 'Wall packs test 30W against 40W.' }])
    const p = await prepareCompanyRule(R, admin, { rules: '["Wall packs test 30W, 40W and 60W."]', retire: '#7' })
    expect(p.ok).toBe(true)
    expect(p.columns.retire).toEqual([7])
    expect(p.display.map((d) => d.label)).toEqual(['Rule', 'Retire #7', 'Who follows it'])
  })
  it('refuses a rule number that does not exist', async () => {
    stubRules([])
    const p = await prepareCompanyRule(R, admin, { retire: '99' })
    expect(p.error).toMatch(/no active rule #99/)
  })
  it('apply adds and retires; undo takes exactly that back', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calls.push([init?.method || 'GET', url])
      if (init?.method === 'PATCH') return { ok: true, status: 200, json: async () => [{ id: 7 }] }
      if (init?.method === 'POST') return { ok: true, status: 201, json: async () => [{ id: 12 }] }
      return { ok: true, status: 204, json: async () => [] }
    }))
    const prop = { created_by: 'cole@hhh.services', payload: { columns: { rules: ['New wording.'], retire: [7], taught_by: 'cole@hhh.services', source: 'chat' } } }
    const a = await applyCompanyRule(R, 3, prop)
    expect(a).toMatchObject({ ok: true, created: { rule_ids: [12], retired_ids: [7] } })
    calls.length = 0
    const b = await rollbackCompanyRule(R, 3, { payload: { created: a.created } })
    expect(b.ok).toBe(true)
    expect(calls[0][0]).toBe('DELETE')
    expect(calls[0][1]).toMatch(/company_rules\?company_id=eq\.3&id=in\.\(12\)/)
    expect(calls[1][0]).toBe('PATCH')
    expect(calls[1][1]).toMatch(/id=in\.\(7\)/)
  })
})

describe('every assistant in the company reads them', () => {
  it('the block is there even before the first rule, so she knows she can be taught', () => {
    const empty = rulesPromptBlock([])
    expect(empty).toMatch(/Company rules — what your team has taught you/)
    expect(empty).toMatch(/propose_create target=company_rule/)
    expect(empty).toMatch(/\(None yet\.\)/)
    // A pasted list goes over WHOLE: in the live run she dropped a new rule
    // as a "duplicate" while filtering it herself (2026-10-20).
    expect(empty).toMatch(/send EVERY rule they gave/)
    expect(empty).not.toMatch(/not an admin/)
    expect(rulesPromptBlock([], false)).toMatch(/This person is not an admin, so what they teach is a SUGGESTION/)
  })
  it('lists each rule with its number and who taught it, and never widens access', () => {
    const b = rulesPromptBlock([{ id: 4, rule: 'Every exterior light uses the 12/7 schedule.', taught_by: 'cole@hhh.services', created_at: '2026-10-20T15:00:00Z' }])
    expect(b).toMatch(/^4\. Every exterior light uses the 12\/7 schedule\. \(taught by cole, Oct 20, 2026\)$/m)
    expect(b).toMatch(/a rule never widens what this person may see or do/)
    expect(b).toMatch(/the record is right/)
    expect(b).toMatch(/estimating playbook, not by these rules/)
  })
  it('arnie-chat adds the block to every company prompt and offers the card', () => {
    const chat = read('supabase/functions/arnie-chat/index.ts')
    expect(chat).toMatch(/\+ await playbookBlock\(companyId\)\n\s+\+ await companyRulesBlock\(companyId, caller\.level >= 3\)/)
    expect(chat).toMatch(/'srp_rebate', 'closing_gaps', 'company_rule'\]/)
    expect(chat).toMatch(/'company_rule: rules \(required unless retiring/)
  })
  it('the list is on Arnie → Setup for everyone; only admins retire', () => {
    const setup = read('src/pages/agents/arnie/ArnieSetup.jsx')
    expect(setup).toMatch(/<ArnieTeamRules isAdmin=\{false\} name=\{who\} \/>/)
    expect(setup).toMatch(/<ArnieTeamRules isAdmin=\{isAdmin\} name=\{who\} \/>/)
    const m = read('supabase/migrations/20261020130000_company_rules.sql')
    expect(m).toMatch(/for update to authenticated\n\s+using \(public\.is_company_admin_of\(company_id\)\)/)
    expect(m).not.toMatch(/for insert|for delete/)
  })
})
