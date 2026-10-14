// "JobScout Agent.command Not Opened — Apple could not verify JobScout is
// free of malware that may harm your Mac or compromise your privacy."
//
// London, on a Mac, following our own instructions. Two separate failures:
//
// 1. The instructions were out of date. They said to Control-click and choose
//    Open, and Apple REMOVED that in macOS Sequoia — their words: users "will
//    no longer be able to Control-click to override Gatekeeper" and must use
//    System Settings > Privacy & Security instead. We sent him to a menu item
//    that no longer exists.
//
// 2. There was no way round it at all. The paste-the-command fallback was
//    Windows-only, which left the platform with the STRICTEST gatekeeping as
//    the only one with no escape hatch.
//
// Both hold until the agent is signed by Apple, which is a $99/yr developer
// account and notarisation, not a code change.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const page = readFileSync(resolve(here, '../pages/agents/arnie/ArnieComputer.jsx'), 'utf8').replace(/\r\n/g, '\n')
const code = page.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/[^\n]*$/gm, '')

describe('what we tell a Mac to do', () => {
  it('sends them to System Settings, which is where the button actually is', () => {
    expect(code).toMatch(/System Settings → Privacy/)
    expect(code).toMatch(/Open\s*<\/strong>\s*\n?\s*Anyway<\/strong>|Open\n? *Anyway/)
  })

  it('no longer claims Control-click opens it', () => {
    // The old line, verbatim, must not come back.
    expect(code).not.toMatch(/hold Control and click it, then choose Open/)
  })

  it('warns that the button disappears after about an hour', () => {
    // Apple's own documented behaviour, and the reason somebody looks in
    // Settings, sees nothing, and concludes it is broken.
    expect(code).toMatch(/about\s*\n?\s*an hour/)
  })

  it('says the refusal is expected rather than a fault', () => {
    expect(code).toMatch(/not signed by Apple yet, not because anything is wrong/)
  })
})

describe('the way round it', () => {
  it('the paste fallback is offered on the Mac, not just Windows', () => {
    expect(code).toMatch(/<PasteInstead open=\{dl === 'blocked'\} mac=\{mac\} \/>/)
    expect(code).not.toMatch(/!mine\.signed && !mac && <PasteInstead/)
  })

  it('the Mac command fetches with curl, which carries no quarantine flag', () => {
    // That is the whole reason it works: Gatekeeper has nothing to refuse
    // because the file was never marked as downloaded by a browser.
    expect(code).toMatch(/curl -fsSL "\$\{releaseBase\}\/JobScout%20Agent\.command"/)
    expect(code).toMatch(/bash "\$TMPDIR\/jobscout-agent\.command"/)
  })

  it('and sends them to Terminal rather than PowerShell', () => {
    expect(code).toMatch(/<strong>Terminal<\/strong>/)
    expect(code).toMatch(/Command and Space/)
  })

  it('the Windows one is untouched', () => {
    expect(code).toMatch(/irm "\$\{releaseBase\}\/JobScout%20Agent\.cmd"/)
    // Two literal backslashes in the source — a single one is a JS escape and
    // the path comes out as $env:TEMPJobScoutAgent.cmd.
    expect(code).toMatch(/\$env:TEMP\\\\JobScoutAgent\.cmd/)
  })
})
