// Bundle lib/payrollRehearsal for the Vercel cron.
//
// api/cron/payroll-rehearsal.js runs on Node without Vite, and src/lib uses
// extensionless imports that only Vite resolves. So the build writes one
// self-contained CommonJS file the cron can require. Runs as part of
// `npm run build`, which Vercel runs before it packages the functions; the
// output is not committed.

import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('api/_lib', { recursive: true })
await build({
  entryPoints: ['src/lib/payrollRehearsal.js'],
  outfile: 'api/_lib/payrollRehearsal.bundle.cjs',
  bundle: true, platform: 'node', target: 'node20', format: 'cjs', logLevel: 'silent',
  banner: { js: '// Built by scripts/build-rehearsal.mjs from src/lib/payrollRehearsal.js. Do not edit; do not commit.' },
})
console.log('rehearsal bundle: api/_lib/payrollRehearsal.bundle.cjs')
