import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

// deploy:fn (and arnie:deploy, which is only a list on top of it) must refuse
// to deploy ANY function until EVERY function asked for bundles — a broken file
// must not leave the others half-deployed. This drives the real deployFunctions
// against a scratch tree with git and the supabase CLI faked, and watches which
// deploy commands it would have run.

const root = mkdtempSync(join(tmpdir(), 'deployfn-'))
const fn = (slug, src) => {
  mkdirSync(join(root, 'supabase', 'functions', slug), { recursive: true })
  writeFileSync(join(root, 'supabase', 'functions', slug, 'index.ts'), src)
}
mkdirSync(join(root, 'supabase'), { recursive: true })
writeFileSync(join(root, 'supabase', 'config.toml'), '')
fn('good-fn', 'export const ok = 1\n')
fn('broken-fn', 'const words = 1\nconst words = 2\n')   // the 2026-09-14 duplicate const
afterAll(() => rmSync(root, { recursive: true, force: true }))

const deployed = []
vi.mock('node:child_process', () => ({
  // git: rev-parse --show-toplevel is the scratch root; every log/status is empty.
  execFileSync: (cmd, args) => (args[0] === 'rev-parse' && args[1] === '--show-toplevel' ? root : ''),
  execSync: (cmd) => {
    if (cmd.includes('functions deploy')) { deployed.push(cmd.split(' ')[4]); return '' }
    throw Object.assign(new Error('offline'), { stdout: '', stderr: 'offline' })   // functions list
  },
}))

process.env.SUPABASE_PROJECT_REF = 'testref'
const quiet = { log: () => {} }

beforeEach(() => { deployed.length = 0 })

describe('deploy:fn deploys nothing until everything bundles', () => {
  it('one broken function stops the whole batch, before any deploy', async () => {
    const { deployFunctions } = await import('../../scripts/deploy-fn.mjs')
    await expect(deployFunctions(['good-fn', 'broken-fn'], quiet))
      .rejects.toThrow(/broken-fn does not build\. Nothing was deployed/)
    expect(deployed).toEqual([])
  })

  it('the broken one listed first stops it too', async () => {
    const { deployFunctions } = await import('../../scripts/deploy-fn.mjs')
    await expect(deployFunctions(['broken-fn', 'good-fn'], quiet)).rejects.toThrow(/does not build/)
    expect(deployed).toEqual([])
  })

  it('a batch that bundles is deployed', async () => {
    const { deployFunctions } = await import('../../scripts/deploy-fn.mjs')
    // The fake CLI cannot report a new version, so the post-deploy proof
    // refuses — after the deploy ran, which is what this checks.
    await deployFunctions(['good-fn'], quiet).catch(() => {})
    expect(deployed).toEqual(['good-fn'])
  })

  it('no esbuild means no unchecked deploy', async () => {
    vi.resetModules()
    vi.doMock('esbuild', () => { throw new Error('Cannot find package esbuild') })
    const { deployFunctions } = await import('../../scripts/deploy-fn.mjs')
    await expect(deployFunctions(['broken-fn'], quiet)).rejects.toThrow(/cannot bundle-check.*Nothing was deployed/)
    expect(deployed).toEqual([])
    vi.doUnmock('esbuild')
  })
})

describe('arnie:deploy has no deploy path of its own', () => {
  it('goes through deployFunctions, so the bundle gate covers it', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../../scripts/arnie-deploy.mjs', import.meta.url), 'utf8')
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
    expect(pkg.scripts['arnie:deploy']).toBe('node scripts/arnie-deploy.mjs')
    expect(src).toMatch(/import \{ deployFunctions \} from '\.\/deploy-fn\.mjs'/)
    expect(src).not.toMatch(/functions deploy|child_process/)
  })
})
