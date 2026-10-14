import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')

const stripProse = (src) => src
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('--')
  })
  .join('\n')

const pairFn = read('../../supabase/functions/arnie-pair/index.ts')
const railFn = read('../../supabase/functions/arnie-computer/index.ts')
const agentSrc = read('../../scripts/jobscout-agent.mjs')
const migration = read('../../supabase/migrations/20261012051000_arnie_pairing.sql')
const config = read('../../supabase/config.toml')
const connectPage = read('../pages/ConnectComputer.jsx')

// Every one of these files EXPLAINS the claim split at length in prose, so an
// assertion that reads the comments fails on its own documentation. Strip
// first — the trap the migration, rail and selector tests each fell into.
const pair = stripProse(pairFn)
const rail = stripProse(railFn)
const agent = stripProse(agentSrc)
const sql = stripProse(migration)

// Pairing is the one route into this feature that runs with NO caller
// identity, because the thing being paired has no account yet. That makes it
// the softest surface Arnie has. Each assertion below is a property that, if
// it quietly stopped holding, would let somebody attach their own agent to
// another person's account — or leave a live credential sitting in a table.

describe('the public pairing routes are safe without a caller', () => {
  it('only start, poll and describe are public', () => {
    const actions = [...pair.matchAll(/action === '([a-z_]+)'/g)].map((m) => m[1]).sort()
    expect(actions).toEqual(['describe', 'poll', 'start'])
  })

  it('claiming is NOT reachable here — a public function cannot prove who you are', () => {
    // resolveCaller only DECODES a JWT; the gateway's verify_jwt is what
    // verifies it. On a public function, "who are you" is whatever the caller
    // claims, so the one route that attaches a token must not live here.
    expect(pair).not.toMatch(/resolveCaller/)
    expect(pair).not.toMatch(/action === 'claim'/)
    expect(pair).not.toMatch(/action === 'pair_claim'/)
  })

  it('the claim runs on the authenticated rail instead', () => {
    expect(rail).toMatch(/action === 'pair_claim'/)
    expect(rail).toMatch(/const caller = await resolveCaller\(/)
    expect(connectPage).toMatch(/invoke\('arnie-computer',[\s\S]*?pair_claim/)
    // And the page must not reach for the public function to claim.
    expect(connectPage).not.toMatch(/invoke\('arnie-pair',[\s\S]{0,200}action: 'claim'/)
  })

  it('a claim cannot be applied twice', () => {
    // The PATCH is filtered on claimed_at being null, so the second press
    // updates no row at all rather than overwriting whose token is waiting.
    expect(rail).toMatch(/arnie_pairings\?code=eq\.\$\{[^}]+\}&claimed_at=is\.null/)
    expect(rail).toMatch(/already connected/)
  })
})

describe('knowing the code is not enough', () => {
  it('poll demands the second secret, which never travels in the URL', () => {
    expect(pair).toMatch(/poll_secret/)
    expect(pair).toMatch(/if \(row\.poll_secret !== secret\) return json\(\{ ok: true, status: 'expired' \}\)/)
  })

  it('a wrong secret and a dead code give the same answer', () => {
    // Anything that distinguishes them turns this into a code oracle: call
    // poll with a guess and learn whether a code is real. Both the
    // missing/expired branch and the wrong-secret branch say 'expired', and
    // the test counts them inside poll so the other routes cannot pad it.
    const poll = pair.slice(pair.indexOf("action === 'poll'"), pair.indexOf("action === 'describe'"))
    expect(poll).toMatch(/new Date\(row\.expires_at\) <= new Date\(\)\) return json\(\{ ok: true, status: 'expired' \}\)/)
    expect(poll).toMatch(/row\.poll_secret !== secret\) return json\(\{ ok: true, status: 'expired' \}\)/)
  })

  it('describe names the computer and nothing else', () => {
    const describe_ = pair.slice(pair.indexOf("action === 'describe'"))
    const select = describe_.match(/arnie_pairings\?select=([a-z_,]+)/)
    expect(select, 'describe should select an explicit column list').toBeTruthy()
    expect(select[1]).not.toMatch(/poll_secret|refresh_token/)
    // And it must not hand back the whole row either.
    expect(describe_).not.toMatch(/\.\.\.row/)
  })
})

describe('a token in flight does not linger', () => {
  it('is deleted in the same request that hands it over', () => {
    const poll = pair.slice(pair.indexOf("action === 'poll'"))
    const del = poll.indexOf('method: \'DELETE\'')
    const give = poll.indexOf("status: 'connected'")
    expect(del).toBeGreaterThan(-1)
    expect(give).toBeGreaterThan(-1)
    expect(del, 'the delete must happen BEFORE the token is returned').toBeLessThan(give)
  })

  it('lives two minutes at most, and uncollected rows are swept', () => {
    expect(sql).toMatch(/expires_at\s+timestamptz not null default \(now\(\) \+ interval '2 minutes'\)/)
    expect(sql).toMatch(/create or replace function public\.arnie_sweep_pairings/)
    expect(pair).toMatch(/rpc\/arnie_sweep_pairings/)
  })

  it('cannot be read through the API by anybody signed in', () => {
    expect(sql).toMatch(/alter table public\.arnie_pairings enable row level security/)
    // service_role only. A policy granting `authenticated` anything would put
    // a live refresh token one API call away from every user in the tenant.
    expect(sql).toMatch(/for all to service_role/)
    expect(sql).not.toMatch(/to authenticated/)
  })
})

describe('the gateway settings this depends on are pinned', () => {
  it('arnie-pair is pinned public, because a deploy resets verify_jwt to true', () => {
    expect(config).toMatch(/\[functions\.arnie-pair\]\nverify_jwt = false/)
  })

  it('and arnie-computer is still left alone, so it stays authenticated', () => {
    expect(config).not.toMatch(/\[functions\.arnie-computer\]/)
  })
})

describe('what a customer downloads', () => {
  const cmd = read('../../scripts/agent/launch/jobscout-agent.cmd')
  const command = read('../../scripts/agent/launch/jobscout-agent.command')
  const builder = read('../../scripts/build-agent-release.mjs')
  const bucket = stripProse(read('../../supabase/migrations/20261012061000_agent_releases_bucket.sql'))

  it('both launchers are published with every placeholder filled', () => {
    // The repo's copies are environment-agnostic on purpose; the build fills
    // them. A placeholder that reaches a customer is a launcher that tries to
    // download from the literal string __BASE__.
    for (const [name, src] of [['cmd', cmd], ['command', command]]) {
      const holes = [...new Set((src.match(/__[A-Z_]+__/g) || []))]
      expect(holes.sort(), name).toEqual(['__ANON_KEY__', '__APP__', '__BASE__', '__SUPABASE_URL__'])
    }
    expect(builder).toMatch(/replaceAll\('__BASE__'/)
    expect(builder).toMatch(/if \(left\) die\(/)   // refuses to publish one it missed
  })

  it('the published agent resolves nothing at runtime', () => {
    // A downloaded agent has no checkout around it. If the bundle still had a
    // dynamic import, the leash would be the thing that failed to load.
    expect(builder).toMatch(/await import\\\(/)   // the guard's own pattern
    expect(builder).toMatch(/die\('the bundle still resolves something at runtime/)
    expect(builder).toMatch(/die\('the leash is not in the bundle'\)/)
    expect(agent).toMatch(/^import \{ decideAction \} from '\.\.\/supabase\/functions\/_shared\/computerGrants\.ts'$/m)
  })

  it('the release bucket is readable by anyone and writable by nobody', () => {
    expect(bucket).toMatch(/'agent-releases', 'agent-releases', true/)
    expect(bucket).toMatch(/for select to anon, authenticated/)
    // These are programs other people then run. An insert policy here would
    // let a browser session publish one.
    expect(bucket).not.toMatch(/for insert/)
    expect(bucket).not.toMatch(/for update/)
  })

  it('a half-finished download never replaces a working agent', () => {
    expect(cmd).toMatch(/agent\.mjs\.new/)
    expect(cmd).toMatch(/move \/y/)
    expect(command).toMatch(/mv -f/)
  })
})

describe('nobody is asked to copy anything', () => {
  it('the agent connects itself when it has no token', () => {
    expect(agent).toMatch(/if \(!TOKEN\) TOKEN = readSavedToken\(\)/)
    expect(agent).toMatch(/if \(!TOKEN\) TOKEN = await pair\(\)/)
    expect(agent).toMatch(/openBrowser\(url\)/)
  })

  it('and saves the token as a key, not a config value', () => {
    expect(agent).toMatch(/writeFileSync\(TOKEN_FILE, t, \{ mode: 0o600 \}\)/)
  })

  it('a refused token reconnects once, instead of sending anyone to a settings page', () => {
    expect(agent).toMatch(/if \(repaired\) die\(/)
    expect(agent).toMatch(/TOKEN = await pair\(\)[\s\S]{0,80}return freshAccess\(\)/)
  })

  it('and the page no longer hands anybody a token to paste', () => {
    // The whole reason this feature was unreachable. If a copy button for a
    // refresh token ever comes back, so does the dead end.
    const page = stripProse(read('../pages/agents/arnie/ArnieComputer.jsx'))
    expect(page).not.toMatch(/refresh_token/)
    expect(page).not.toMatch(/JOBSCOUT_AGENT_TOKEN/)
    // The page may put something on the clipboard again — it offers a command
    // to paste when a browser refuses to keep the download, which is how one
    // person got "nothing happened". What it must never copy is a CREDENTIAL.
    // So the ban is on the secret, not on the verb.
    const copied = page.match(/writeText\(([^)]*)\)/g) || []
    for (const c of copied) {
      expect(c, 'nothing token-shaped may reach the clipboard').not.toMatch(/token|secret|key|session/i)
    }
    expect(page).toMatch(/writeText\(cmd\)/)
    // Where the download lives moved into lib/agentRelease when the staleness
    // check needed the same answer. The page still offers it.
    expect(page).toMatch(/releaseBase/)
    expect(read('./agentRelease.js')).toMatch(/agent-releases/)
  })

  it('a vanished session is recovered once, not printed forever', () => {
    // It used to print the raw server error every few seconds until the
    // window was closed. Found by deleting a session under a running agent.
    expect(agent).toMatch(/if \(got\.status === 404\)/)
    expect(agent).toMatch(/if \(resumed\) await stop\(/)
    expect(agent).toMatch(/resumed = true/)
  })
})

describe('the signed executable, when there is a certificate for one', () => {
  const builder = read('../../scripts/build-agent-release.mjs')
  const workflow = read('../../.github/workflows/agent-release.yml')

  it('an unsigned executable is never published', () => {
    // It is WORSE than the launcher: Windows shows "protected your PC" with
    // the publisher unknown, and the people most likely to stop there are
    // exactly who this is for.
    expect(builder).toMatch(/signed === 'Valid'/)
    expect(builder).toMatch(/built, NOT published/)
    // The push into the publish list happens only on the Valid branch.
    const branch = builder.slice(builder.indexOf("if (signed === 'Valid')"), builder.indexOf('} else {', builder.indexOf("if (signed === 'Valid')")))
    expect(branch).toMatch(/files\.push\(\{ key: 'JobScoutAgent\.exe'/)
    expect(builder.match(/files\.push\(\{ key: 'JobScoutAgent\.exe'/g)?.length).toBe(1)
  })

  it('and "is it signed" is asked of Windows, not assumed from an exit code', () => {
    expect(builder).toMatch(/Get-AuthenticodeSignature/)
    expect(workflow).toMatch(/Get-AuthenticodeSignature/)
    expect(workflow).toMatch(/if \(\$sig\.Status -ne 'Valid'\) \{ throw/)
  })

  it('publishing cannot compile a fresh unsigned binary over the signed one', () => {
    // Signing happens between building and publishing, so the publish run
    // uses what is already there.
    expect(builder).toMatch(/const prebuilt = process\.argv\.includes\('--exe-prebuilt'\)/)
    expect(builder).toMatch(/if \(prebuilt\) readFileSync\(exePath\)/)
    expect(workflow).toMatch(/--exe --exe-prebuilt/)
  })

  it('node_modules stays out of it', () => {
    // Without this the binary is 515 MB rather than 76 MB — nobody downloads
    // that onto a job site.
    expect(builder).toMatch(/'--node-modules-dir=none'/)
  })

  it('publishing is never automatic', () => {
    // It replaces the program customers run on their own machines.
    expect(workflow).toMatch(/on:\n {2}workflow_dispatch:/)
    expect(workflow).not.toMatch(/on:[\s\S]{0,200}\bpush:/)
    expect(workflow).toMatch(/if: \$\{\{ inputs\.publish \}\}/)
  })

  it('the recorder is handed to a shell as a file a shell can open', () => {
    // Inside the compiled binary the recorders live in deno's virtual
    // filesystem: statSync says the file is there and readFileSync returns
    // the whole script, and then PowerShell cannot see it at all. Every check
    // from inside the agent passes while the recording never starts.
    expect(agent).toMatch(/const materialised = new Map\(\)/)
    expect(agent).toMatch(/writeFileSync\(real, body\)/)
    expect(agent).toMatch(/join\(tmpdir\(\), `jobscout-\$\{process\.pid\}-\$\{file\}`\)/)
    // The old test — does the path exist — is what made it look fine.
    expect(agent).not.toMatch(/statSync\(p\)\.isFile\(\)/)
  })
})

describe('the Mac half', () => {
  const builder = read('../../scripts/build-agent-release.mjs')
  const workflow = read('../../.github/workflows/agent-release.yml')
  const plist = read('../../scripts/agent/mac/Info.plist')
  // The KEYS, with the prose taken out. That file explains at length why
  // disable-library-validation and allow-unsigned-executable-memory are not
  // in it, so an assertion that reads the comments fails on the very
  // documentation that makes the point. Fourth time this trap has been hit.
  const ents = read('../../scripts/agent/mac/entitlements.plist').replace(/<!--[\s\S]*?-->/g, '')

  it('both architectures, because an Intel Mac cannot run an arm64 binary', () => {
    expect(builder).toMatch(/aarch64-apple-darwin/)
    expect(builder).toMatch(/x86_64-apple-darwin/)
    expect(workflow).toMatch(/runs-on: macos-latest/)
  })

  it('it is an .app, not a loose binary', () => {
    // A bare binary cannot be stapled, and Screen Recording / Accessibility
    // are granted per APPLICATION — run loose from Terminal, the person ends
    // up granting Terminal the right to watch their screen.
    expect(builder).toMatch(/Contents\/MacOS/)
    expect(plist).toMatch(/<key>CFBundleExecutable<\/key>\s*\n\s*<string>jobscout-agent<\/string>/)
    expect(plist).toMatch(/services\.hhh\.jobscout\.agent/)
  })

  it('the one entitlement a JavaScript runtime structurally needs, and no more', () => {
    // allow-jit or V8 cannot allocate executable memory under the hardened
    // runtime and the binary dies on launch — AFTER notarizing cleanly,
    // because notarization never runs the program.
    expect(ents).toMatch(/com\.apple\.security\.cs\.allow-jit/)
    expect(ents).not.toMatch(/disable-library-validation/)
    expect(ents).not.toMatch(/allow-unsigned-executable-memory/)
  })

  it('signed with the hardened runtime, innermost code first', () => {
    const sign = workflow.slice(workflow.indexOf('name: Sign'), workflow.indexOf('name: Notarize'))
    expect(sign).toMatch(/--options runtime/)
    expect(sign).toMatch(/--entitlements scripts\/agent\/mac\/entitlements\.plist/)
    expect(sign.indexOf('Contents/MacOS/jobscout-agent')).toBeLessThan(sign.lastIndexOf('--sign "$IDENTITY" "$APP"'))
  })

  it('archived with ditto, which keeps a signature intact', () => {
    // A plain zip drops the symlinks and xattrs a signature is made of, and
    // what arrives at Apple is no longer signed.
    expect(workflow).toMatch(/ditto -c -k --keepParent/)
    expect(builder).toMatch(/run\('ditto', \['-c', '-k', '--keepParent'/)
    expect(workflow).toMatch(/xcrun stapler staple/)
  })

  it('and Gatekeeper is asked, not codesign', () => {
    // codesign --verify passes on builds macOS still refuses to open.
    expect(workflow).toMatch(/spctl --assess --type execute/)
    expect(builder).toMatch(/run\('spctl', \['--assess'/)
    expect(builder).toMatch(/built, NOT published/)
  })

  it('the certificate never lands in the runner’s login keychain', () => {
    expect(workflow).toMatch(/security create-keychain/)
    expect(workflow).toMatch(/\$RUNNER_TEMP\/signing\.keychain-db/)
    expect(workflow).toMatch(/rm -f "\$RUNNER_TEMP\/cert\.p12"/)
    expect(workflow).toMatch(/rm -f "\$RUNNER_TEMP\/AuthKey\.p8"/)
  })
})

describe('the page offers what is really published', () => {
  const builder = read('../../scripts/build-agent-release.mjs')
  const page = read('../pages/agents/arnie/ArnieComputer.jsx')

  it('the manifest can only name a file that is actually being uploaded', () => {
    expect(builder).toMatch(/const has = \(key\) => files\.some\(\(f\) => f\.key === key\)/)
    expect(builder).toMatch(/installer: has\('JobScoutAgent\.exe'\) \? 'JobScoutAgent\.exe' : null/)
    expect(builder).toMatch(/installer: has\('JobScoutAgent-mac\.zip'\) \? 'JobScoutAgent-mac\.zip' : null/)
  })

  it('and the page reads it, so signing needs no deploy', () => {
    // The fetch moved into lib/agentRelease when the staleness check needed
    // the same answer — two fetches would be two answers about what is
    // published. The page still reads it and still picks from it.
    expect(read('./agentRelease.js')).toMatch(/fetch\(`\$\{BASE\}\/release\.json`/)
    expect(page).toMatch(/useRelease\(\)/)
    expect(page).toMatch(/r\?\.installer \|\| r\?\.launcher \|\| fallback/)
  })

  it('a missing manifest still gets somebody the launcher', () => {
    expect(page).toMatch(/const fallback = which === 'mac' \? 'JobScout Agent\.command' : 'JobScout Agent\.cmd'/)
  })

  it('and a signed build is not warned about', () => {
    // Warning people about a box that will not appear teaches them to expect
    // trouble.
    expect(page).toMatch(/mine\.signed/)
    expect(page).toMatch(/It is signed by Hollow Hills Holdings, so it opens normally\./)
  })
})

describe('a stale agent is visible', () => {
  const lib = read('./agentRelease.js')
  const builder = read('../../scripts/build-agent-release.mjs')
  const agent = read('../../scripts/jobscout-agent.mjs')
  const page = read('../pages/agents/arnie/ArnieComputer.jsx')

  it('what is compared is derived, not typed by a person', () => {
    // A version only changes when somebody remembers, and somebody did not: a
    // build WITH eyes and one without both called themselves 0.4.0, so a
    // person running the old one had allowed screenshots coming back with no
    // picture and nothing could say why.
    expect(builder).toMatch(/const AGENT_BUILD = createHash\('sha256'\)/)
    expect(builder).toMatch(/'scripts\/agent\/hands\.mjs'/)
    expect(builder).toMatch(/agent_build: AGENT_BUILD/)
    expect(agent).toMatch(/typeof __AGENT_BUILD__ === 'string'/)
    expect(agent).toMatch(/agent_build: BUILD/)
  })

  it('and it says nothing unless it is sure', () => {
    // Nagging somebody whose agent is fine is worse than silence, and an
    // agent too old to report a build is left alone rather than accused.
    expect(lib).toMatch(/if \(!running \|\| !published\) return false/)
    expect(lib).toMatch(/return running !== published/)
  })
})

describe('the download that cannot be blocked', () => {
  const page = read('../pages/agents/arnie/ArnieComputer.jsx')

  it('offers a pasteable command when the file will not download', () => {
    // Nobody at the company had ever completed a connect, and one person
    // clicked the button and nothing happened. A browser refusing to keep a
    // downloaded .cmd looks exactly like that: no error, no file.
    expect(page).toMatch(/function PasteInstead\(\{ open: openByDefault = false, mac = false \}\)/)
    expect(page).toMatch(/Download blocked, or nothing happened\?/)
  })

  it('and the command actually works', () => {
    // A single backslash here is a JS escape, and the path silently becomes
    // $env:TEMPJobScoutAgent.cmd — broken in a way nobody could debug from
    // the error.
    // Two literal backslashes in the SOURCE, which is one at runtime.
    expect(page).toMatch(/\$env:TEMP\\\\JobScoutAgent\.cmd/)
    // And never just one, which is the broken form.
    expect(page).not.toMatch(/[^\\]\\JobScoutAgent\.cmd/)
  })

  it('it is the fallback, not the path', () => {
    // It IS a terminal, which is the thing the download flow exists to
    // avoid — so it stays behind a link, and disappears entirely once there
    // is a signed installer that browsers do not fight.
    //
    // The !mac half is GONE, and excluding the Mac was a real mistake: it
    // left the platform with the STRICTEST gatekeeping as the only one with
    // no way round it. London hit exactly that — macOS refused the download
    // outright and there was nothing else to offer him.
    expect(page).toMatch(/\{!mine\.signed && <PasteInstead open=\{dl === 'blocked'\} mac=\{mac\} \/>\}/)
  })
})

describe('he talks while he thinks', () => {
  const chat = read('../pages/agents/arnie/ArnieChat.jsx')

  it('speech follows the stream instead of waiting for the end', () => {
    // He used to write the WHOLE answer and only then start speaking: a long
    // silence, then a wall of speech, to somebody holding a phone in a truck.
    expect(chat).toMatch(/speakAsItArrives\(partialText\)/)
    expect(chat).not.toMatch(/Speak the full response after streaming completes/)
  })

  it('only complete sentences are spoken', () => {
    // Half a sentence read aloud and continued a second later sounds broken,
    // and "Dr" and "$1.5" both look like the end of one until the next word.
    expect(chat).toMatch(/for \(const m of fresh\.matchAll\(/)
    expect(chat).toMatch(/speakAsItArrives\(fullResponse, true\)/)
  })

  it('stopping stops all of it, not just the sentence playing', () => {
    const stop = chat.slice(chat.indexOf('const handleStopSpeaking'))
    expect(stop.slice(0, 400)).toMatch(/speechQueue\.current = \[\]/)
  })

  it('and a new answer speaks from its own beginning', () => {
    expect(chat).toMatch(/resetSpeech\(\)/)
  })

  it('stopping also silences the sentences still on their way', () => {
    const stop = chat.slice(chat.indexOf('const handleStopSpeaking'))
    expect(stop.slice(0, 500)).toMatch(/hushedRef\.current = true/)
    expect(chat).toMatch(/if \(!voiceOn \|\| hushedRef\.current\) return/)
  })

  it('the Stop button lasts the whole answer, not one sentence', () => {
    // Live, 2026-10-14: Stop vanished six seconds into an eight-sentence
    // answer, because `speaking` went false at the end of every clip.
    const drain = chat.slice(chat.indexOf('const drainSpeech'), chat.indexOf('const speakAsItArrives'))
    expect(drain).toMatch(/if \(streamDoneRef\.current\) setSpeaking\(false\)/)
    // The per-sentence end hands straight on to the next — no setSpeaking(false).
    const perSentence = drain.slice(drain.indexOf('speak(next'))
    expect(perSentence).not.toMatch(/setSpeaking\(false\)/)
  })
})

describe('the button can no longer fail in silence', () => {
  const page = read('../pages/agents/arnie/ArnieComputer.jsx')

  it('the download is fetched by us, not left to a cross-origin link', () => {
    // Alayda clicked it and NOTHING happened — no file, no error, no network
    // request. The download attribute is ignored on a cross-origin link (the
    // file is on supabase.co, the page is not) and browsers quietly discard a
    // .cmd. Between them the click produced nothing a person could read.
    expect(page).toMatch(/const grab = async \(name\) => \{/)
    expect(page).toMatch(/URL\.createObjectURL\(blob\)/)
    expect(page).toMatch(/a\.download = name/)
    expect(page).not.toMatch(/<a href=\{href\} download=\{file\}/)
  })

  it('and every outcome is said out loud', () => {
    // A success now opens a live "waiting for your computer" panel rather
    // than a line of text, so the flow does not just stop with the file in
    // their Downloads and no idea whether it worked.
    expect(page).toMatch(/dl === 'done' \? \(/)
    expect(page).toMatch(/Waiting for your computer/)
    expect(page).toMatch(/dl === 'blocked' &&/)
    expect(page).toMatch(/would not keep that file/)
  })

  it('and the moment it connects is shown, not left to be discovered', () => {
    // The old flow ended at "it is in your Downloads". You ran it, something
    // happened somewhere, and you went looking for whether it had worked.
    expect(page).toMatch(/const arrived = connected && dl !== 'idle'/)
    expect(page).toMatch(/>Connected\.</)
  })

  it('the wait is polled fast enough to watch', () => {
    // Twenty seconds is a long time to stare at a spinner that is not moving.
    expect(page).toMatch(/live \? 4000 : waiting \? 2000 : 20000/)
    expect(page).toMatch(/onWaiting\?\.\(true\)/)
  })

  it('the caveats are folded away until they are wanted', () => {
    // Leading with "your browser will block this, Windows will warn you, a
    // black window appears" is what made the whole thing read as a bodge.
    expect(page).toMatch(/What to expect/)
    expect(page).toMatch(/\{\(help \|\| dl === 'blocked'\) && \(/)
  })

  it('a refusal opens the fallback by itself', () => {
    // Making somebody find the workaround after the thing already failed them
    // once is how you lose them twice.
    expect(page).toMatch(/<PasteInstead open=\{dl === 'blocked'\} mac=\{mac\} \/>/)
  })
})

describe('you can see when he is working', () => {
  const panel = read('../pages/agents/arnie/MachinePanel.jsx')

  it('the scout walks while an action is running', () => {
    // "If Arnie is working there is no indication." The panel looked identical
    // whether he was mid-action or idle, which is unnerving for a thing with
    // hands on your machine.
    expect(panel).toMatch(/import ScoutLoader from/)
    expect(panel).toMatch(/status\?\.state === 'working' \?/)
  })

  it('and Check says it is checking', () => {
    // Its OWN state, not the page's shared `busy` — which the refresh never
    // set, so the spinner it already had could never spin and Check looked
    // dead. Reported twice before this was believed.
    expect(panel).toMatch(/\{checking \? 'Checking…' : 'Check'\}/)
    // And it says what it found, because "no change" and "never ran" look
    // identical otherwise.
    expect(panel).toMatch(/Checked just now — still nothing from that computer/)
    expect(panel).toMatch(/animation: 'jsSpin/)
    // Declared in the component, because it renders in the drawer as well as
    // the page and a keyframe defined elsewhere goes missing in one of them.
    expect(panel).toMatch(/@keyframes jsSpin/)
  })
})

describe('getting back into the app when the browser hop lands elsewhere', () => {
  const manifest = JSON.parse(read('../../public/manifest.json'))
  const agent = read('../../scripts/jobscout-agent.mjs')
  const page = read('../pages/agents/arnie/ArnieComputer.jsx')

  it('the installed app asks to handle its own links', () => {
    // The agent opens /connect in the DEFAULT browser, which drops somebody
    // who started in the PWA into Chrome halfway through setting up.
    expect(manifest.handle_links).toBe('preferred')
    expect(manifest.launch_handler?.client_mode).toBe('navigate-existing')
  })

  it('and the agent prints the CODE, not only a link', () => {
    // Link handling depends on an OS setting not everybody has on, so the
    // code is the way that always works.
    expect(agent).toMatch(/Your code:\s+\$\{started\.code\}/)
    expect(agent).toMatch(/Arnie → Computer and type that code/)
  })

  it('typing it routes to the same connect page, not a second way in', () => {
    // One claim path. A box that claimed the pairing itself would be a second
    // route to the thing that attaches a token to a computer.
    expect(page).toMatch(/navigate\(`\/connect\?code=\$\{encodeURIComponent\(c\)\}`\)/)
    expect(page).toMatch(/Code from the agent window/)
  })
})
