import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const panel = read('../components/ArnieFloatingPanel.jsx')
const page = read('../pages/agents/arnie/ArnieChatPage.jsx')
const app = read('../App.jsx')

// "From the side panel there should be a button to expand into the actual
// page so a user can have a bigger screen to work from on a laptop... no need
// on the phone" (Bryce, 2026-10-15).
describe('the side panel expands to the full page — on a laptop, not a phone', () => {
  it('there is an expand button, and it is desktop-only (Layout\'s `hidden` class)', () => {
    expect(panel).toMatch(/className="hidden"\n\s+onClick=\{expandToPage\}\n\s+title="Open full screen"/)
    expect(panel).toMatch(/<Maximize2 size=\{17\}/)
  })
  it('it opens the tab you were on, and the chat keeps its conversation', () => {
    expect(panel).toMatch(/const PAGE_FOR_TAB = \{ chat: '\/agents\/arnie', computer: '\/agents\/arnie\/computer', taught: '\/agents\/arnie\/taught', routines: '\/agents\/arnie\/routines' \}/)
    expect(panel).toMatch(/tab === 'chat' && sessionId \? \{ state: \{ sessionId \} \} : undefined/)
    expect(page).toMatch(/const sessionId = location\.state\?\.sessionId \|\| null/)
    for (const p of ['computer', 'routines', 'taught']) expect(app).toMatch(new RegExp(`<Route path="${p}" element=`))
  })
  it('the panel still never imports from Layout (the /payroll crash cycle)', () => {
    expect(panel).not.toMatch(/from ['"]\.\/Layout['"]/)
  })
})
