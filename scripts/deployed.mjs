#!/usr/bin/env node
// npm run deployed -- "<marker>" — wait until THIS build is actually serving.
//
// Two ways I have gotten this wrong and reported "LIVE" when it wasn't:
//
//   1. Comparing bundle hashes to a local build. Vercel bakes env vars in, so
//      the hashes never match and the check is meaningless.
//   2. Grepping for a string that already existed. `account_name` and `T12:00`
//      were both already in the bundle, so the poller said LIVE on the first
//      try while the old build was still serving.
//
// So this records the hash that is serving BEFORE waiting, refuses a marker
// that is already present (that check cannot distinguish old from new), and
// only reports success when the hash has changed AND the marker is there.
//
//   node scripts/deployed.mjs "jump straight to one"
//   node scripts/deployed.mjs "some string" --host https://staging.example.com

const argv = process.argv.slice(2)
const marker = argv.find(a => !a.startsWith('--'))
const hostFlag = argv.indexOf('--host')
const HOST = hostFlag === -1 ? 'https://jobscout.appsannex.com' : argv[hostFlag + 1]
const TRIES = 30
const WAIT_MS = 20000

if (!marker) {
  console.error('usage: node scripts/deployed.mjs "<a string that exists ONLY in this commit>"')
  process.exit(1)
}

async function fetchBundle() {
  const html = await (await fetch(`${HOST}/?cachebust=${Date.now()}`)).text()
  const entries = [...html.matchAll(/\/assets\/[A-Za-z0-9._-]+\.js/g)].map(m => m[0])
  let text = ''
  for (const a of entries) text += await (await fetch(HOST + a)).text()
  // Entry chunks pull the rest lazily; walk one level so a marker inside a
  // route chunk is still found.
  const nested = [...new Set([...text.matchAll(/["'`](\/assets\/[A-Za-z0-9._-]+\.js)["'`]/g)].map(m => m[1]))]
  for (const a of nested.slice(0, 90)) { try { text += await (await fetch(HOST + a)).text() } catch { /* chunk may 404 mid-deploy */ } }
  return { entry: entries[0] || '(none)', text }
}

const before = await fetchBundle()

if (before.text.includes(marker)) {
  console.error(`\nThat marker is ALREADY in the build that is serving right now (${before.entry}).`)
  console.error('It cannot tell the old build from the new one — pick a string that exists only in this commit.')
  console.error('Comments do not survive minification; use user-visible copy or a distinctive literal.\n')
  process.exit(2)
}

console.log(`serving now: ${before.entry}`)
console.log(`waiting for a new build containing: ${JSON.stringify(marker)}`)

for (let i = 1; i <= TRIES; i++) {
  await new Promise(r => setTimeout(r, WAIT_MS))
  let now
  try { now = await fetchBundle() } catch { console.log(`  ${i}/${TRIES} fetch failed, retrying`); continue }
  const changed = now.entry !== before.entry
  if (changed && now.text.includes(marker)) {
    console.log(`\nLIVE: ${now.entry} (was ${before.entry})`)
    process.exit(0)
  }
  console.log(`  ${i}/${TRIES} ${now.entry}${changed ? ' — new bundle, marker not in it' : ''}`)
}

console.error('\nGave up. The build did not reach production. Check the Vercel deployment log before assuming the code is wrong.')
process.exit(1)
