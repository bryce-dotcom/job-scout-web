// Dougie reads a receipt. One reader behind every place a receipt can be
// handed in — the Expenses page, the job page, Field Scout, a bank row in
// Books — so they all store the photo the same way, read it the same way,
// and fill the same fields.
//
// Bryce, 2026-10-04: "he needs to read receipts and put into the books and
// books need to match it with the transaction … also needs to be in the/on
// the job so in the field it can be attached to the job for job costing."
//
// Before this, the job page and Field Scout uploaded the photo and wrote a
// $0 "Receipt capture" row for someone to type up later; the Expenses page
// read a new receipt but not an edited one, and never a PDF; and nothing
// chose a category. Now: upload, read (image or PDF), map what he read onto
// the expense fields with the company's own category and its tax line, and
// hand back a one-line summary for the toast.
import { supabase } from './supabase'
import { readAttachment } from './chatAttachments'

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null }

/**
 * The company's expense categories — the shared catalogue (no company_id)
 * plus its own — as [{ name, type, default_tax_category }]. Same query Books
 * runs. Cached per company for the page's lifetime.
 */
const catCache = new Map()
export async function loadExpenseCategories(companyId) {
  if (!companyId) return []
  if (catCache.has(companyId)) return catCache.get(companyId)
  const { data, error } = await supabase
    .from('expense_categories')
    .select('name, type, default_tax_category')
    .or(`company_id.is.null,company_id.eq.${companyId}`)
    .order('sort_order')
    .order('name')
  const rows = error ? [] : (data || []).filter(c => c.type !== 'income')
  catCache.set(companyId, rows)
  return rows
}

/** Pure: what Dougie read → the fields an expenses row takes. */
export function expenseFieldsFromReceipt(extracted, categories = []) {
  if (!extracted) return {}
  const cat = extracted.category
    ? (categories.find(c => c.name === extracted.category) || categories.find(c => c.name.toLowerCase() === String(extracted.category).toLowerCase()))
    : null
  const amount = num(extracted.amount)
  const out = {}
  if (extracted.business_name) out.merchant = String(extracted.business_name).trim()
  if (amount != null && amount > 0) out.amount = Math.round(amount * 100) / 100
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(extracted.date || ''))) out.date = extracted.date
  if (extracted.description) out.description = String(extracted.description).trim()
  if (extracted.receipt_number) out.receipt = String(extracted.receipt_number).trim()
  if (cat) {
    out.category = cat.name
    if (cat.default_tax_category) out.tax_category = cat.default_tax_category
  }
  if (Array.isArray(extracted.line_items) && extracted.line_items.length) {
    out.line_items = extracted.line_items
      .filter(li => li && (li.description || li.amount != null))
      .slice(0, 25)
      .map(li => ({ description: String(li.description || '').trim(), quantity: num(li.quantity), amount: num(li.amount) }))
  }
  if (extracted.job_hint) out.job_hint = String(extracted.job_hint).trim()
  return out
}

/** Pure: "Lowes · $389.42 · 2026-09-12 · Job Materials", for a toast. */
export function receiptSummary(fields) {
  if (!fields) return ''
  const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return [fields.merchant, fields.amount != null ? money(fields.amount) : null, fields.date, fields.category]
    .filter(Boolean).join(' · ')
}

/**
 * Pure: fill only what is still blank on a form. Dougie never overwrites
 * something a person typed.
 */
export function fillBlanks(form, fields) {
  const out = { ...form }
  for (const [k, v] of Object.entries(fields || {})) {
    if (k === 'line_items' || k === 'job_hint') continue
    const cur = out[k]
    if (cur == null || cur === '' || (k === 'amount' && !(parseFloat(cur) > 0))) out[k] = k === 'amount' ? String(v) : v
  }
  return out
}

/** Store the file under project-documents and return the row columns. */
export async function uploadReceipt(file, pathPrefix = 'expenses/receipts') {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const receipt_storage_path = `${pathPrefix}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safeName}`
  const { error } = await supabase.storage.from('project-documents').upload(receipt_storage_path, file, { contentType: file.type })
  if (error) throw new Error('Receipt upload failed: ' + error.message)
  const { data } = supabase.storage.from('project-documents').getPublicUrl(receipt_storage_path)
  return { receipt_url: data?.publicUrl || null, receipt_storage_path }
}

/**
 * Dougie reads one file. Image (downscaled on the phone first, like a chat
 * attachment) or PDF. Resolves to the raw extraction or null when the read
 * fails — the caller still has the upload.
 */
export async function readReceipt(file, { companyId, categories = [] } = {}) {
  const att = await readAttachment(file)
  if (att.kind === 'sheet') return null
  const body = {
    mode: 'expense',
    company_id: companyId || null,
    categories: categories.map(c => c.name),
    ...(att.kind === 'pdf' ? { document: { base64: att.data } } : { image: { base64: att.data, mediaType: att.mediaType } }),
  }
  const { data, error } = await supabase.functions.invoke('scan-receipt', { body })
  if (error || !data?.success) {
    console.warn('[Dougie] receipt not read:', error?.message || data?.error)
    return null
  }
  return data.extracted || null
}

/**
 * Upload + read, in that order: the photo is on file even when the read
 * fails. Resolves to { receipt_url, receipt_storage_path, fields, read }.
 */
export async function captureReceipt(file, { companyId, pathPrefix, categories } = {}) {
  const cats = categories || await loadExpenseCategories(companyId)
  const stored = await uploadReceipt(file, pathPrefix)
  let fields = {}
  let read = false
  try {
    const extracted = await readReceipt(file, { companyId, categories: cats })
    if (extracted) { fields = expenseFieldsFromReceipt(extracted, cats); read = true }
  } catch (e) {
    console.warn('[Dougie] receipt read failed:', e?.message)
  }
  return { ...stored, fields, read }
}

export const RECEIPT_ACCEPT = 'image/*,application/pdf'
