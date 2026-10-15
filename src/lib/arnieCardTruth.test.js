import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const chat = readFileSync(resolve(here, '../../supabase/functions/arnie-chat/index.ts'), 'utf8').replace(/\r\n/g, '\n')

// Bryce discarded the "missing items" email to Noah, said "it worked" (the
// card had shown up), and was told "Noah's got the list" (2026-10-15). A card
// leaves the waiting list whichever button is pressed; the outcome has to be
// read, not guessed.
describe('he reads what became of a card before saying what it did', () => {
  const block = chat.slice(chat.indexOf('async function cardsTruthBlock'), chat.indexOf('async function memoriesBlock'))
  it('the cards decided in the last few hours are read each turn, with their outcome', () => {
    expect(block).toMatch(/status=neq\.pending&decided_at=gte\.\$\{since\}/)
    expect(block).toMatch(/created_by=eq\.\$\{encodeURIComponent\(email\)\}&status=neq\.pending/)   // only theirs
  })
  it('every status the table holds reads as what actually happened', () => {
    expect(block).toMatch(/x\.status === 'applied' \? 'APPROVED — it was done'/)
    expect(block).toMatch(/x\.status === 'rejected' \? 'DISCARDED — nothing happened, nothing was sent'/)
    expect(block).toMatch(/x\.status === 'rolled_back' \? 'UNDONE/)
  })
  it('and he is told the list outranks his guess', () => {
    expect(block).toMatch(/Never say an email went, a record changed or a job was made unless its card is APPROVED here/)
  })
})
