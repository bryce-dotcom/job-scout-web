import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXPENSE_CATEGORIES } from './schema.js'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const exp = read('../../supabase/functions/_shared/arnieExpense.ts')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')
const config = read('../../supabase/functions/arnie-config/index.ts')
const chat = read('../pages/agents/arnie/ArnieChat.jsx')
const page = read('../pages/Expenses.jsx')
const engine = read('../pages/agents/arnie/arnieEngine.js')

describe('what Arnie writes is what the page would', () => {
  it('the categories are the page\'s list, exactly', () => {
    const m = exp.match(/export const EXPENSE_CATEGORIES = \[([\s\S]*?)\]/)
    const deno = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
    expect(deno).toEqual(EXPENSE_CATEGORIES)
  })
  it('the receipt lands where the page puts receipts, in the same bucket', () => {
    expect(page).toMatch(/const storagePath = `expenses\/receipts\/\$\{timestamp\}_\$\{safeName\}`/)
    expect(page).toMatch(/\.from\('project-documents'\)/)
    expect(chat).toMatch(/const path = `expenses\/receipts\/arnie_\$\{Date\.now\(\)\}_\$\{safe\}\.\$\{ext\}`/)
    expect(chat).toMatch(/supabase\.storage\.from\('project-documents'\)\.upload\(path/)
  })
  it('Pending, source arnie, the job by the same lookup every rail uses', () => {
    expect(exp).toMatch(/status: 'Pending', source: 'arnie'/)
    expect(exp).toMatch(/const found = await findJob\(r, companyId, f\.job\)/)
  })
})

describe('the photo never rides in the tool call or the proposal', () => {
  it('every model field is column:null; the row is built by prepare', () => {
    const start = create.indexOf('  expense: {')
    const entry = create.slice(start, create.indexOf('\n  },\n', start))
    const cols = [...entry.matchAll(/\{ column: (null|'[^']*')/g)].map((m) => m[1])
    expect(cols.length).toBeGreaterThanOrEqual(8)
    expect(cols.every((c) => c === 'null')).toBe(true)
  })
  it('the client uploads the last photo before the card, only on approve, only for an expense card', () => {
    expect(chat).toMatch(/const attachment = decision === 'apply' && card\?\.preview\?\.label === 'expense' \? await receiptForCard\(msgId\) : null/)
    expect(chat).toMatch(/if \(m\.role !== 'user'\) continue/)
    expect(chat).toMatch(/a\.kind === 'image' && a\.data && a\.mediaType/)
  })
  it('arnie-config takes the URL only for this target, only these keys, only on our storage, only under receipts/', () => {
    expect(config).toMatch(/action === 'apply' && prop\.target === 'expense' && body\.attachment/)
    expect(config).toMatch(/url\.startsWith\(`\$\{SUPABASE_URL\}\/storage\/v1\/object\/`\)/)
    expect(config).toContain('/^expenses\\/receipts\\/[A-Za-z0-9._-]+$/.test(path)')
    expect(config).toMatch(/columns: \{ \.\.\.\(prop\.payload\?\.columns \|\| \{\}\), receipt_url: url, receipt_storage_path: path \}/)
  })
})

describe('refusals over guesses', () => {
  it('no amount, an absurd amount, a future date, the same receipt twice', () => {
    expect(exp).toMatch(/if \(!\(amount > 0\)\) return \{ ok: false as const, error: `I need the total/)
    expect(exp).toMatch(/if \(amount > 50000\) return/)
    expect(exp).toMatch(/if \(date > today\) return/)
    expect(exp).toMatch(/Same receipt twice\?/)
  })
  it('the prompt: read the total off the paper, never invent one, say the amount in words', () => {
    expect(engine).toMatch(/Never invent a figure the paper does not show/)
    expect(engine).toMatch(/say the amount in words as well as figures/)
    expect(engine).toMatch(/never "logged" or "expensed"/)
  })
})
