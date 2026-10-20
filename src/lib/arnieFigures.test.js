// Figures nobody looked up (London's Arizona revenue, 2026-10-20).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { figuresIn, untracedFigures, fabricationIn, correctionFor } from '../../supabase/functions/_shared/arnieTruth.ts'

const toolResult = JSON.stringify({ groupBy: 'status', totalRecords: 12, groups: { Chillin: { count: 5, total_job_total: 29236.56 }, 'Need To Order': { count: 4, total_job_total: 32861.74 }, 'Pre Inspection (Req)': { count: 2, total_job_total: 14571.98 }, 'Needs scheduling': { count: 1, total_job_total: 3390 } }, total_jobs: 12, total_job_total: 80060.28 })
const convo = [{ role: 'user', content: 'how many jobs in arizona and how much rev to install still' }, { role: 'user', content: [{ type: 'tool_result', content: toolResult }] }]
const ctx = 'You are Jenny.\n' + JSON.stringify(convo)

describe('reading figures out of a reply', () => {
  it('dollars (with k/M) and noun counts', () => {
    const f = figuresIn('You have 12 open jobs and 31 stale estimates, $80,060 to install, about $80k, and $1.2M in the pipeline.')
    expect(f.money).toEqual([80060, 80000, 1200000])
    expect(f.counts).toEqual([12, 31])
  })
})

describe('what London was told', () => {
  const invented = '**Arizona Jobs: 18 total**\n- **Chillin (not scheduled):** 11 jobs — **$88,450 revenue** waiting\n- **Scheduled:** 4 jobs — **$34,200 revenue**\nThat is $135,450 still to install.'
  it('is caught: none of the dollars came from anything she was given', () => {
    expect(untracedFigures(invented, ctx, JSON.stringify(convo))).toEqual(['$88,450', '$34,200', '$135,450'])
    expect(fabricationIn(invented, ['query_jobs'])).toBeNull() // the old check let it through
  })
  it('the real answer passes — exact, rounded, "eighty grand"-style and a two-group sum', () => {
    const real = '**12 open jobs in Arizona**, **$80,060** still to install. Chillin 5 jobs, $29,237; Need To Order 4, $32,862 — together $62,098. About $80k in all.'
    expect(untracedFigures(real, ctx, JSON.stringify(convo))).toEqual([])
  })
  it('prices from its instructions and figures the person said are not flagged', () => {
    const c = 'Playbook: SMBE 60/80/100W Cobra Head LOW WATT $417 with lift, $297 without.\n' + JSON.stringify([{ role: 'user', content: 'the rebate is $6,000' }])
    expect(untracedFigures('Four cobras at $417 is $1,668, and the $6,000 rebate covers it.', c, '')).toEqual([])
    expect(untracedFigures('Four cobras at $417 is $1,900.', c, '')).toEqual(['$1,900'])
  })
  it('small counts are not checked — they match by coincidence', () => {
    expect(untracedFigures('You have 3 jobs today.', 'nothing', '')).toEqual([])
  })
})

describe('the correction', () => {
  it('names the figures and offers the two honest ways out', () => {
    const c = correctionFor('figures', true, ['$88,450', '$34,200'])
    expect(c).toMatch(/\$88,450, \$34,200\. You made them up/)
    expect(c).toMatch(/CALL the query tool that answers it/)
    expect(c).toMatch(/never estimate/)
    expect(c).toMatch(/ALREADY READ/)
  })
  it('arnie-chat runs it at the end of every reply, streamed or not', () => {
    const chat = readFileSync(new URL('../../supabase/functions/arnie-chat/index.ts', import.meta.url), 'utf8')
    expect((chat.match(/untracedFiguresOf\(text, systemPrompt, convo\)/g) || []).length).toBe(2)
    expect((chat.match(/if \(!claim && untraced\.length\) claim = 'figures'/g) || []).length).toBe(2)
  })
})

describe('figures read off a picture are not checked', () => {
  it('a conversation with an image or a document skips the trace', () => {
    const chat = readFileSync(new URL('../../supabase/functions/arnie-chat/index.ts', import.meta.url), 'utf8')
    expect(chat).toMatch(/b\?\.type === 'image' \|\| b\?\.type === 'document'\)\)\) return \[\]/)
  })
})
