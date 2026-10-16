import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const avatar = read('../components/AssistantAvatar.jsx')
const presence = read('../pages/agents/arnie/ArniePresence.jsx')
const workspace = read('../pages/agents/arnie/ArnieWorkspace.jsx')

// "fix the OG Arnie flash on page load" (Bryce, 2026-10-15): Jenny's page
// opened as OG Arnie — name, face, greeting — and "Not on a computer yet"
// with the agent running, then corrected itself a few seconds later.
describe('the page never opens as somebody else', () => {
  it('the persona is remembered per person on the device, and used before the fetch lands', () => {
    expect(avatar).toMatch(/const personaKey = \(id\) => `jobscout_persona:\$\{id\}`/)
    expect(avatar).toMatch(/rememberPersona\(user\.id, r\)/)
    expect(avatar).toMatch(/const row = loaded && loaded\.userId === user\?\.id \? loaded\.row : rememberedPersona\(user\?\.id\)/)
  })
  it('unknown shows nobody — a blank name, an empty badge, no greeting — never Arnie by default', () => {
    expect(avatar).toMatch(/name: known \? assistantName\(/)
    expect(avatar).toMatch(/!personaKey && !loaded\.known \?/)
    expect(presence).toMatch(/const firstName = \(assistant\?\.name \|\| ''\)/)
    expect(presence).toMatch(/\{assistant\.known !== false && \(/)
  })
  it('the workspace header uses the remembered persona until its own load lands', () => {
    expect(workspace).toMatch(/const personaRow = loadedRow !== undefined \? loadedRow : remembered\.personaRow/)
    expect(workspace).toMatch(/const name = personaKnown \? assistantName\(/)
  })
  it('the computer card says it is checking, not "not on a computer", while it checks', () => {
    expect(presence).toMatch(/status == null \? 'Checking for your computer…'/)
  })
})
