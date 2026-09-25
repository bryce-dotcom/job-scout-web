#!/usr/bin/env node
// Get the seeded utility application forms ready to fill.
//
// Seeding (scripts/seed-utility-research.mjs) leaves every form as a URL with
// status 'dev'. A job can only offer a form that is 'published' with the PDF
// in the utility-pdfs bucket and a field_mapping (PDF field -> data path).
// This does, per form, exactly what Data Console > Utilities does by hand:
//
//   1. fetch the PDF through parse-utility-pdf (document_type 'form',
//      stored at <STATE>/<provider-slug>/form/<file>.pdf) -> form_file
//   2. read its fillable fields with pdf-lib
//   3. ask parse-utility-pdf (form_field_analysis) to map them, keeping only
//      paths in src/lib/formDataPaths.js
//   4. save field_mapping; publish when at least --min-mapped fields mapped
//
// A flat PDF (no fields) keeps its file and stays 'dev' — it can be attached
// but not auto-filled. A dead URL is recorded in form_notes and stays 'dev'.
//
//   node scripts/prepare-utility-forms.mjs                       dry run, every shared form without a file
//   node scripts/prepare-utility-forms.mjs --state NV --apply
//   node scripts/prepare-utility-forms.mjs --provider "Rocky Mountain" --apply --concurrency 3
//   node scripts/prepare-utility-forms.mjs --refresh --apply     redo forms that already have a file
import { createClient } from '@supabase/supabase-js'
import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs'
import { isValidDataPath } from '../src/lib/formDataPaths.js'

const argv = process.argv.slice(2)
const flag = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1] }
const has = (n) => argv.includes(n)
const APPLY = has('--apply')
const REFRESH = has('--refresh')
const STATE = (flag('--state') || '').toUpperCase() || null
const providerRx = flag('--provider') ? new RegExp(flag('--provider'), 'i') : null
const CONCURRENCY = Number(flag('--concurrency') || 2)
const MIN_MAPPED = Number(flag('--min-mapped') || 3)
const LIMIT = Number(flag('--limit') || 0)
const UPLOAD_MISSING = has('--upload-missing')

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const URL = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

async function parsePdf(body) {
  const r = await fetch(`${URL}/functions/v1/parse-utility-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, apikey: env.VITE_SUPABASE_ANON_KEY || KEY },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  let data = null
  try { data = JSON.parse(text.trim()) } catch { /* below */ }
  if (!data) throw new Error(`parse-utility-pdf HTTP ${r.status}: ${text.slice(0, 160)}`)
  if (!data.success) throw new Error(data.error || `parse-utility-pdf HTTP ${r.status}`)
  return data
}

const slug = (s) => String(s || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
function storagePathFor(form, provider) {
  let filename = 'document.pdf'
  try {
    const last = new globalThis.URL(form.form_url).pathname.split('/').pop()
    if (last) filename = decodeURIComponent(last)
  } catch { /* default */ }
  if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf'
  return `${provider.state || 'XX'}/${slug(provider.provider_name)}/form/${filename.replace(/[^A-Za-z0-9._-]+/g, '_')}`
}

// The parser returns the bytes; we store them (its own upload failed silently
// until 2026-09-25, and a path is only a file once the object really exists).
const publicUrl = (p) => `${URL}/storage/v1/object/public/utility-pdfs/${p.split('/').map(encodeURIComponent).join('/')}`
async function objectExists(storage_path) {
  const r = await fetch(publicUrl(storage_path), { method: 'HEAD' })
  return r.ok
}
async function uploadPdf(storage_path, base64) {
  const { error } = await sb.storage.from('utility-pdfs').upload(storage_path, Buffer.from(base64, 'base64'), { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(`storage upload failed: ${error.message}`)
  if (!(await objectExists(storage_path))) throw new Error('stored object not readable')
  return storage_path
}

async function fieldsOf(base64) {
  const doc = await PDFDocument.load(Buffer.from(base64, 'base64'), { ignoreEncryption: true })
  return doc.getForm().getFields().map(f => f.getName())
}

async function runWithConcurrency(items, limit, fn) {
  const out = new Array(items.length); let next = 0
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i) } }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}

// ── select the work ─────────────────────────────────────────────────────────
let q = sb.from('utility_forms')
  .select('id, form_name, form_type, form_url, form_file, status, field_mapping, form_notes, provider:utility_providers!utility_forms_provider_id_fkey(id, provider_name, state)')
  .is('company_id', null).not('form_url', 'is', null)
if (UPLOAD_MISSING) q = q.not('form_file', 'is', null)
else if (!REFRESH) q = q.is('form_file', null)
const { data: forms, error } = await q.order('id')
if (error) { console.error(error.message); process.exit(1) }
let work = forms.filter(f => f.provider && (!STATE || f.provider.state === STATE) && (!providerRx || providerRx.test(f.provider.provider_name)))
if (LIMIT) work = work.slice(0, LIMIT)
console.log(`${APPLY ? 'PREPARING' : 'DRY RUN'}: ${work.length} form(s)${STATE ? ' in ' + STATE : ''}`)

const tally = { published: 0, flat: 0, unmapped: 0, failed: 0, uploaded: 0, present: 0 }

// --upload-missing: restore the object for a form whose recorded file is not
// in the bucket. Mapping and status are kept.
async function uploadMissing(form) {
  const p = form.provider
  const label = `${p.state} ${p.provider_name} / ${form.form_name}`
  if (await objectExists(form.form_file)) { tally.present++; return }
  if (!APPLY) { console.log(`  missing   ${label} -> ${form.form_file}`); tally.uploaded++; return }
  try {
    const fetched = await parsePdf({ pdf_url: form.form_url, document_type: 'form', store_in_storage: false, provider_name: p.provider_name, program_name: null })
    if (!fetched.pdf_base64) throw new Error('parser returned no PDF bytes')
    await uploadPdf(form.form_file, fetched.pdf_base64)
    tally.uploaded++
    console.log(`  uploaded  ${label} -> ${form.form_file}`)
  } catch (err) {
    tally.failed++
    console.log(`  failed    ${label}: ${err.message.slice(0, 120)}`)
  }
}

async function prepare(form) {
  if (UPLOAD_MISSING) return uploadMissing(form)
  const p = form.provider
  const label = `${p.state} ${p.provider_name} / ${form.form_name}`
  if (!APPLY) { console.log(`  would fetch ${label}\n      ${form.form_url}`); return }
  const note = (msg) => `${(form.form_notes || '').replace(/\s*\[auto[^\]]*\][^\n]*/g, '').trim()}\n[auto ${new Date().toISOString().slice(0, 10)}] ${msg}`.trim()
  try {
    const storage_path = storagePathFor(form, p)
    const fetched = await parsePdf({ pdf_url: form.form_url, document_type: 'form', store_in_storage: false, provider_name: p.provider_name, program_name: null })
    if (!fetched.pdf_base64) throw new Error('parser returned no PDF bytes')
    const form_file = await uploadPdf(storage_path, fetched.pdf_base64)
    const fields = fetched.pdf_base64 ? await fieldsOf(fetched.pdf_base64) : []
    if (fields.length === 0) {
      tally.flat++
      await sb.from('utility_forms').update({ form_file, form_notes: note('PDF stored; no fillable fields (flat PDF) — attach only') }).eq('id', form.id)
      console.log(`  flat      ${label} -> ${form_file}`)
      return
    }
    const mapped = await parsePdf({ document_type: 'form_field_analysis', field_names: fields, provider_name: p.provider_name, pdf_url: form.form_url })
    const suggestions = mapped.results?.field_mappings || {}
    const field_mapping = {}
    for (const [field, path] of Object.entries(suggestions)) if (isValidDataPath(path)) field_mapping[field] = path
    const n = Object.keys(field_mapping).length
    const publish = n >= MIN_MAPPED
    if (publish) tally.published++; else tally.unmapped++
    await sb.from('utility_forms').update({
      form_file, field_mapping: n ? field_mapping : null,
      status: publish ? 'published' : form.status,
      form_notes: note(`${fields.length} fields, ${n} mapped${publish ? ', published' : ' — review mapping before publishing'}`),
    }).eq('id', form.id)
    console.log(`  ${publish ? 'published' : 'review   '} ${label} -> ${fields.length} fields, ${n} mapped`)
  } catch (err) {
    tally.failed++
    await sb.from('utility_forms').update({ form_notes: note(`download/mapping failed: ${err.message.slice(0, 160)}`) }).eq('id', form.id)
    console.log(`  failed    ${label}: ${err.message.slice(0, 120)}`)
  }
}

await runWithConcurrency(work, CONCURRENCY, prepare)
if (APPLY) console.log(`\ndone: ${JSON.stringify(tally)}`)
else console.log('\nre-run with --apply to fetch, map and publish')
