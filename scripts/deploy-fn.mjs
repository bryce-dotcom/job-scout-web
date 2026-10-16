#!/usr/bin/env node
// npm run deploy:fn -- <slug> — the one way to deploy an edge function.
//
// Why this exists.
//
// `supabase functions deploy` uploads whatever is on YOUR disk and prints
// "Deployed Functions." with exit 0. It does not know or care what is on main,
// whether the file compiles, or whether the gateway will let anyone call it.
// Each of those has cost us production:
//
//   1. STALE DEPLOY. A deploy from a worktree that is behind main ships the
//      OLDER file over what landed since — a silent revert, for every tenant,
//      with no commit to show for it. arnie:deploy did it on 2026-10-14 from a
//      tree 27 commits behind. zach-instant-quote did it on 2026-08-26 from a
//      tree 25 commits behind, undoing a shipped fix so every public quote went
//      back to saving a headline total with zero quote_lines under it. That one
//      was then "discovered" as a fresh bug and investigated from scratch.
//
//   2. IT DOESN'T COMPILE. The upload succeeds and the first request fails to
//      compile, so every reply comes back empty. 2026-09-14: a duplicate
//      `const words` in arnieFollowup.ts went out and Arnie answered nothing.
//      A bundler catches it in five milliseconds.
//
//   3. verify_jwt RESET. A deploy without --no-verify-jwt resets that function's
//      verify_jwt to the default TRUE, and the gateway then 401s every caller
//      that sends no Supabase JWT — Stripe, Resend, the public /quote/:slug page
//      — before the function runs. That silenced Resend on 2026-06-12, Stripe on
//      2026-08-06 and the public quote page until 2026-08-26.
//
// `ship` exists because `git push` lies about landing a commit. This exists for
// the same reason one step later: a zero exit from `functions deploy` is not
// evidence that production improved. It can mean production got older.
//
//   npm run deploy:fn -- zach-instant-quote
//   npm run deploy:fn -- resend-webhook stripe-webhook
//   npm run deploy:fn -- <slug> --dry              preflight only, deploy nothing
//   npm run deploy:fn -- <slug> --require-shipped  refuse code not yet on main
//   npm run deploy:fn -- <slug> --force            deploy a STALE tree anyway

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const indent = (text) => text.split('\n').map((l) => `    ${l}`).join('\n')

class DeployRefused extends Error {}
const refuse = (msg) => { throw new DeployRefused(msg) }

// `npx` is a .cmd on Windows, which Node will not spawn without a shell, so
// these go through the shell as a string the way guard.mjs runs eslint. That
// means slugs are concatenated into a command line: validate them first rather
// than hand the shell whatever was typed. Failing to read the deployed state
// is not a cosmetic problem — it is what turns the proof step into a shrug.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/
const assertSlug = (slug) => {
  if (!SLUG_RE.test(slug)) refuse(`"${slug}" is not a function name — lowercase letters, digits and dashes`)
  return slug
}

// ── which files does this function actually ship? ────────────────────────
// The CLI bundles the entrypoint AND every relative import it reaches, so a
// stale ../_shared/estimateIntake.ts is every bit as damaging as a stale
// index.ts. Checking only the function's own directory would miss it.
const IMPORT_RE = /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g

export function shippedFiles(root, slug) {
  assertSlug(slug)
  const entry = join(root, 'supabase', 'functions', slug, 'index.ts')
  if (!existsSync(entry)) refuse(`no such function: supabase/functions/${slug}/index.ts does not exist`)

  const inside = join(root, 'supabase', 'functions')
  const seen = new Set()
  const queue = [entry]
  while (queue.length) {
    const file = queue.shift()
    if (seen.has(file) || !existsSync(file)) continue
    seen.add(file)
    for (const m of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
      // Only follow imports that stay inside supabase/functions — npm:,  jsr:
      // and https: specifiers are not ours and are not in the repo.
      const target = resolve(dirname(file), m[1])
      if (target.startsWith(inside)) queue.push(target)
    }
  }
  return [...seen].map((f) => relative(root, f).split('\\').join('/')).sort()
}

// ── what does config.toml say this function's gateway should do? ─────────
// true, false, or null when the function is not pinned at all.
export function pinnedVerifyJwt(toml, slug) {
  const lines = toml.split(/\r?\n/)
  const start = lines.findIndex((l) => l.trim() === `[functions.${slug}]`)
  if (start === -1) return null
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('[')) break
    const m = line.match(/^verify_jwt\s*=\s*(true|false)\b/)
    if (m) return m[1] === 'true'
  }
  return null
}

function projectRef(root) {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF.trim()
  const f = join(root, 'supabase', '.temp', 'project-ref')
  if (existsSync(f)) {
    const ref = readFileSync(f, 'utf8').trim()
    if (!/^[a-z0-9]+$/.test(ref)) refuse(`project ref "${ref}" does not look like a project ref`)
    return ref
  }
  refuse('no project ref — link the project, or set SUPABASE_PROJECT_REF')
}

// The CLI prints deprecation WARNs before its JSON, so take the JSON only.
function deployedState(root, ref) {
  let raw
  try {
    raw = execSync(`npx supabase functions list --project-ref ${ref}`, {
      cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) {
    return { error: ((e.stdout || '') + (e.stderr || '')).trim().split('\n').pop() || String(e.message) }
  }
  const i = raw.indexOf('{"functions"')
  if (i === -1) return { error: 'no JSON in `functions list` output' }
  try {
    const byslug = new Map()
    for (const f of JSON.parse(raw.slice(i)).functions) byslug.set(f.slug, f)
    return { byslug }
  } catch (e) {
    return { error: `could not parse \`functions list\` JSON: ${e.message}` }
  }
}

// Bundle check. esbuild arrives as a vite transitive dependency rather than a
// declared one, so a worktree without node_modules simply skips this rather
// than blocking a deploy over a missing dev tool.
async function bundles(root, slugs) {
  let build
  try { ({ build } = await import('esbuild')) } catch { return { skipped: true } }
  for (const slug of slugs) {
    try {
      await build({
        entryPoints: [join(root, 'supabase', 'functions', slug, 'index.ts')],
        bundle: true, write: false, platform: 'neutral', format: 'esm', logLevel: 'silent',
        external: ['jsr:*', 'npm:*', 'https://*', 'node:*'],
      })
    } catch (e) {
      const errs = (e.errors || [{ text: e.message }])
        .map((err) => `${err.location ? err.location.file + ':' + err.location.line + '  ' : ''}${err.text}`)
      return { failed: slug, errs }
    }
  }
  return { ok: true }
}

/**
 * Deploy edge functions, refusing the deploys above. Returns nothing; throws
 * DeployRefused with a printable message when it will not proceed.
 */
export async function deployFunctions(slugs, opts = {}) {
  const { dry = false, force = false, requireShipped = false, log = console.log } = opts

  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const ref = projectRef(root)
  const toml = readFileSync(join(root, 'supabase', 'config.toml'), 'utf8')
  // What main thinks the gateway should be, for the stale-config check below.
  let mainToml = toml
  try { mainToml = git(['show', 'origin/main:supabase/config.toml']) } catch { /* no origin/main yet */ }

  log(`worktree    ${root}`)
  log(`branch      ${git(['rev-parse', '--abbrev-ref', 'HEAD'])} @ ${git(['rev-parse', '--short', 'HEAD'])}`)
  let offline = false
  try { git(['fetch', '--quiet', 'origin', 'main']) } catch { offline = true }
  log(`origin/main ${git(['rev-parse', '--short', 'origin/main'])}${offline ? '  (could not fetch — may be out of date)' : ''}`)
  log(`project     ${ref}`)

  const before = deployedState(root, ref)
  if (before.error) log(`\nwarning: could not read the deployed state (${before.error})`)

  const plan = []
  for (const slug of slugs) {
    const files = shippedFiles(root, slug)
    const pin = pinnedVerifyJwt(toml, slug)
    const live = before.byslug?.get(slug)

    log(`\n── ${slug} ${'─'.repeat(Math.max(0, 44 - slug.length))}`)
    log(`  ships ${files.length} file(s): ${files.map((f) => f.replace('supabase/functions/', '')).join(', ')}`)
    log(`  config.toml verify_jwt: ${pin === null ? 'not pinned (a deploy sets it true)' : pin}`)
    if (live) log(`  deployed now: v${live.version}, verify_jwt=${live.verify_jwt}, ${new Date(live.updated_at).toISOString()}`)

    // Gate 1 — STALE. Commits on origin/main touching these files that this
    // tree does not have. Deploying would ship the older copy over them. This
    // is the one that reverts production, so it is a wall, not a warning.
    const stale = git(['log', '--oneline', 'HEAD..origin/main', '--', ...files])
    if (stale) {
      const detail = `\n  origin/main has commit(s) to these files that your tree does not:\n${indent(stale)}\n` +
        `\n  Deploying would ship your OLDER copy over them and roll production back.` +
        `\n  Cut a fresh worktree from current main and deploy from there:` +
        `\n    npm run fresh -- <short-name>`
      if (!force) refuse(`${slug} is STALE.${detail}`)
      log(`  FORCED past a STALE tree.${detail}`)
    }

    // Gate 2 — not on main. Deploying a work-in-progress to test it is normal,
    // so this says so out loud rather than blocking. --require-shipped makes it
    // a wall for the deploys that are meant to be a release.
    const unshipped = git(['log', '--oneline', 'origin/main..HEAD', '--', ...files])
    const dirty = git(['status', '--porcelain', '--', ...files])
    if (unshipped || dirty) {
      const detail = (unshipped ? `\n  commit(s) not on origin/main:\n${indent(unshipped)}` : '') +
        (dirty ? `\n  uncommitted:\n${indent(dirty)}` : '')
      if (requireShipped) {
        refuse(`${slug} is not on main.${detail}\n\n  Ship it first: npm run ship`)
      }
      log(`  NOT ON MAIN — this deploys code main does not have.${detail}`)
    }

    // Gate 3 — the verify_jwt trap. Public in production, pinned nowhere: this
    // deploy would quietly take the endpoint dark and nothing would say so.
    if (live && live.verify_jwt === false && pin === null) {
      refuse(`${slug} is deployed with verify_jwt=false but is NOT pinned in supabase/config.toml.\n\n` +
             `  Deploying would reset it to true and 401 every caller that sends no\n` +
             `  Supabase JWT. Pin it first, alongside the other public functions:\n\n` +
             `    [functions.${slug}]\n    verify_jwt = false`)
    }
    if (pin === true && live?.verify_jwt === false) {
      log(`  note: config pins verify_jwt=true but production has it false — this deploy CLOSES the gateway.`)
    }

    // config.toml is not bundled, so Gate 1 does not cover it — but a stale
    // copy of it sets the gateway from out-of-date knowledge. Only this slug's
    // pin matters, so compare that rather than the whole file, which other
    // functions' pins would otherwise make noisy.
    const mainPin = pinnedVerifyJwt(mainToml, slug)
    if (mainPin !== pin) {
      const show = (v) => (v === null ? 'not pinned' : String(v))
      const detail = `\n  your config.toml: ${show(pin)}\n  origin/main's:    ${show(mainPin)}`
      if (!force) {
        refuse(`${slug}'s verify_jwt pin disagrees with origin/main.${detail}\n\n` +
               `  The deploy sets the gateway from YOUR copy, so this would apply the\n` +
               `  wrong one. Bring config.toml up to date, or ship your pin first.`)
      }
      log(`  FORCED past a config.toml pin that disagrees with main.${detail}`)
    }

    plan.push({ slug, pin, liveVersion: live?.version ?? null })
  }

  // Gate 4 — it has to compile. Nothing is deployed unless everything asked
  // for bundles, so a broken file cannot take a good one down with it.
  const bundle = await bundles(root, slugs)
  if (bundle.failed) {
    refuse(`${bundle.failed} does not build. Nothing was deployed.\n\n${indent(bundle.errs.join('\n'))}`)
  }
  log(`\nbundle check: ${bundle.skipped ? 'SKIPPED (no esbuild — run npm install for it)' : 'all ' + slugs.length + ' bundle'}`)

  if (dry) { log('\n--dry: preflight only, nothing deployed'); return }

  for (const { slug, pin } of plan) {
    // Pass the flag the config asks for rather than trusting whoever typed the
    // command to remember it. Forgetting it is trap 3.
    const cmd = `npx supabase functions deploy ${slug} --project-ref ${ref}` +
      (pin === false ? ' --no-verify-jwt' : '')
    log(`\n$ ${cmd}`)
    try {
      execSync(cmd, { cwd: root, stdio: 'inherit' })
    } catch {
      refuse(`the CLI failed deploying ${slug}. Fix the error and re-run.`)
    }
  }

  // ── prove it ───────────────────────────────────────────────────────────
  // The whole point. "Deployed Functions." is the CLI talking about itself.
  const after = deployedState(root, ref)
  if (after.error) {
    refuse(`the CLI reported success but the deploy could NOT be verified (${after.error}).\n` +
           `  Treat production as unconfirmed and check the dashboard.`)
  }

  const problems = []
  for (const { slug, pin, liveVersion } of plan) {
    const live = after.byslug.get(slug)
    if (!live) { problems.push(`${slug}: not in the function list after deploying`); continue }
    const want = pin === null ? true : pin
    if (liveVersion !== null && live.version <= liveVersion) {
      problems.push(`${slug}: still v${live.version} — the deploy did not take`)
    } else if (live.verify_jwt !== want) {
      problems.push(`${slug}: verify_jwt is ${live.verify_jwt}, config.toml says ${want}`)
    } else {
      log(`\nCONFIRMED ${slug}: v${liveVersion ?? '?'} -> v${live.version}, verify_jwt=${live.verify_jwt} as config.toml asks`)
    }
  }
  if (problems.length) {
    refuse(`${problems.length} check(s) failed after deploying. Do not trust the deploy.\n${indent(problems.join('\n'))}`)
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (invokedDirectly) {
  const argv = process.argv.slice(2)
  const slugs = argv.filter((a) => !a.startsWith('-'))
  if (!slugs.length) {
    console.error(`\nusage: npm run deploy:fn -- <slug> [more slugs] [--dry] [--require-shipped] [--force]

  Deploys supabase/functions/<slug> after proving your tree is not older than
  origin/main for that function and every _shared file it imports, that it
  bundles, and that the gateway ends up the way config.toml asks.\n`)
    process.exit(2)
  }
  try {
    await deployFunctions(slugs, {
      dry: argv.includes('--dry'),
      force: argv.includes('--force'),
      requireShipped: argv.includes('--require-shipped'),
    })
  } catch (e) {
    if (e instanceof DeployRefused) { console.error(`\ndeploy:fn — ${e.message}\n`); process.exit(1) }
    throw e
  }
}
