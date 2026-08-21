import * as XLSX from 'xlsx'
import { workbookToText } from './sheetText'

// Attachments for AI chat (Arnie).
//
// ONE definition of what an attachment is: what we accept, how big it may be,
// how it becomes an Anthropic content block, and how long it stays in the
// conversation. The chat UI and the send pipeline both read from here — this
// codebase's recurring failure is one rule written twice and then drifting
// (invoice lines x5, job ownership x4), so the rule is written once.

// Anthropic scales images to fit 1568px on the long edge anyway, so shrinking
// to that here costs no quality and keeps the request small enough for a phone
// on a job site to actually send.
export const MAX_IMAGE_EDGE = 1568
export const JPEG_QUALITY = 0.85

export const MAX_ATTACHMENTS = 4
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024   // pre-downscale; phone photos are big
export const MAX_PDF_BYTES = 10 * 1024 * 1024     // no downscale possible, goes over the wire as-is

// gif/webp are accepted by the API but we keep the picker to what people
// actually paste: screenshots and photos.
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

// Spreadsheets are parsed here rather than uploaded. A model cannot read an
// .xlsx — it is a zip of XML — so the grid is turned into text in the browser
// and sent as text. Supplier price lists are the reason this exists.
export const SHEET_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]
export const MAX_SHEET_BYTES = 15 * 1024 * 1024

export const ACCEPT_ATTR =
  'image/png,image/jpeg,image/gif,image/webp,application/pdf,.csv,.xls,.xlsx'

// How many recent user turns keep their images attached. Images are ~1600
// tokens each; carrying every one forever makes a long conversation cost more
// each turn until it fails. Recent turns cover the follow-up questions people
// actually ask ("what's the third line say?"); older ones degrade to a note so
// Arnie still knows something was shared.
export const ATTACHMENT_HISTORY_TURNS = 3

export function attachmentKind(file) {
  const type = (file?.type || '').toLowerCase()
  if (type === 'application/pdf') return 'pdf'
  if (IMAGE_TYPES.includes(type)) return 'image'
  if (SHEET_TYPES.includes(type)) return 'sheet'
  // Some browsers hand over an empty type for files picked from cloud
  // storage — fall back to the extension rather than rejecting outright.
  const name = (file?.name || '').toLowerCase()
  if (name.endsWith('.pdf')) return 'pdf'
  if (/\.(png|jpe?g|gif|webp)$/.test(name)) return 'image'
  // Windows and several cloud pickers hand over a blank or wrong MIME type for
  // spreadsheets, so the extension is the reliable signal, not the fallback.
  if (/\.(csv|xlsx?|xlsm)$/.test(name)) return 'sheet'
  return null
}

function mediaTypeFor(file, kind) {
  const type = (file?.type || '').toLowerCase()
  if (type) return type
  if (kind === 'pdf') return 'application/pdf'
  const name = (file?.name || '').toLowerCase()
  if (kind === 'sheet') return name.endsWith('.csv') ? 'text/csv' : SHEET_TYPES[2]
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.gif')) return 'image/gif'
  if (name.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

export function formatBytes(bytes) {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Human message, not a code. This is shown to a tech standing in a warehouse.
export function rejectReason(file) {
  const kind = attachmentKind(file)
  if (!kind) return `${file?.name || 'That file'} isn't something I can read — send a photo, a screenshot, a PDF or a spreadsheet.`
  const limit = kind === 'pdf' ? MAX_PDF_BYTES : kind === 'sheet' ? MAX_SHEET_BYTES : MAX_IMAGE_BYTES
  if ((file?.size || 0) > limit) {
    const what = kind === 'pdf' ? 'PDFs' : kind === 'sheet' ? 'spreadsheets' : 'images'
    return `${file.name} is ${formatBytes(file.size)} — too big. Keep ${what} under ${formatBytes(limit)}.`
  }
  return null
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.readAsDataURL(blob)
  })
}

// Shrink only when it's actually oversized. A 1200px screenshot stays a
// pixel-exact PNG; a 12MP phone photo gets scaled and re-encoded. Re-encoding
// a small screenshot to JPEG would soften the text someone is asking us to
// read, which is the whole point of attaching it.
async function normalizeImage(file, mediaType) {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return { data: await blobToBase64(file), mediaType, bytes: file.size }
  }
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // HEIC and friends. iOS converts on pick, so this is rare — but if the
    // browser can't decode it, we can't send it either.
    throw new Error(`I can't open ${file.name} — try a screenshot or a JPG.`)
  }
  const { width, height } = bitmap
  const longest = Math.max(width, height)
  if (longest <= MAX_IMAGE_EDGE && file.size <= 4 * 1024 * 1024) {
    bitmap.close?.()
    return { data: await blobToBase64(file), mediaType, bytes: file.size }
  }
  const scale = Math.min(1, MAX_IMAGE_EDGE / longest)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY))
  if (!blob) return { data: await blobToBase64(file), mediaType, bytes: file.size }
  return { data: await blobToBase64(blob), mediaType: 'image/jpeg', bytes: blob.size }
}

let seq = 0

// File -> attachment record. Throws with a sentence a person can act on.
export async function readAttachment(file) {
  const reason = rejectReason(file)
  if (reason) throw new Error(reason)
  const kind = attachmentKind(file)
  const mediaType = mediaTypeFor(file, kind)

  if (kind === 'sheet') {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
    const sheets = wb.SheetNames.map(name => ({
      name,
      // raw:false gives the value as DISPLAYED — a date reads as a date and a
      // price keeps its formatting, instead of arriving as a serial number
      // nobody can interpret.
      rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' }),
    }))
    const { text, truncated, dataRows } = workbookToText(file.name, sheets)
    return {
      id: `att_${Date.now()}_${seq++}`,
      name: file.name, kind, mediaType, text, truncated, dataRows,
      bytes: file.size, previewUrl: null,
    }
  }

  if (kind === 'pdf') {
    const data = await blobToBase64(file)
    return { id: `att_${Date.now()}_${seq++}`, name: file.name, kind, mediaType, data, bytes: file.size, previewUrl: null }
  }
  const img = await normalizeImage(file, mediaType)
  return {
    id: `att_${Date.now()}_${seq++}`,
    name: file.name,
    kind,
    mediaType: img.mediaType,
    data: img.data,
    bytes: img.bytes,
    previewUrl: `data:${img.mediaType};base64,${img.data}`,
  }
}

export function attachmentBlock(att) {
  // Already text by the time it gets here — the parsing happened on the way in.
  if (att.kind === 'sheet') return { type: 'text', text: att.text || '' }
  if (att.kind === 'pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.data } }
  }
  return { type: 'image', source: { type: 'base64', media_type: att.mediaType, data: att.data } }
}

export function describeAttachments(attachments = []) {
  return attachments.map(a => a.name).filter(Boolean).join(', ')
}

// The text that gets stored in ai_messages and shown when a session is
// reopened. The files themselves aren't persisted, so the transcript has to say
// what was there or the conversation reads as a non-sequitur later.
export function attachmentNote(attachments = []) {
  if (!attachments.length) return ''
  return `_[attached: ${describeAttachments(attachments)}]_`
}

// text + files -> what the API takes. A plain string when there's nothing
// attached, so the overwhelmingly common path is byte-identical to before.
export function buildMessageContent(text, attachments = []) {
  const trimmed = (text || '').trim()
  if (!attachments.length) return trimmed
  const blocks = attachments.map(attachmentBlock)
  // Naming the file before the image gives Arnie something to refer back to,
  // and gives an empty-text message a turn that isn't just a bare image.
  const label = `[${describeAttachments(attachments)}]`
  blocks.push({ type: 'text', text: trimmed || `${label} — take a look at this.` })
  return blocks
}

// ArnieChat pushes the user's message into state before it reads the history
// ref, so the history handed to the sender usually ALREADY ends with this turn.
// Appending it again sent Claude the same text twice; the edge function glued
// the copies back together, which hid it. With an attachment the two turns
// can't be glued, so the duplicate has to go. Replace when it's already there,
// append when the ref hasn't caught up — correct under both timings.
export function withCurrentTurn(history = [], message, attachments = []) {
  const turn = { role: 'user', content: message, attachments }
  const last = history[history.length - 1]
  const isDuplicate = last?.role === 'user'
    && !last.attachments?.length
    && String(last.content || '').trim() === String(message || '').trim()
  return isDuplicate ? [...history.slice(0, -1), turn] : [...history, turn]
}

// Conversation -> API messages. Does the block building AND the age-out in one
// pass so the two can't disagree about which turn keeps its images.
export function toApiMessages(messages = [], { attachmentTurns = ATTACHMENT_HISTORY_TURNS } = {}) {
  const withFiles = []
  messages.forEach((m, i) => {
    if (m?.role === 'user' && m.attachments?.length) withFiles.push(i)
  })
  const keep = new Set(withFiles.slice(-attachmentTurns))

  const out = []
  messages.forEach((m, i) => {
    const text = typeof m?.content === 'string' ? m.content : String(m?.content ?? '')
    const files = m?.attachments || []
    if (!text.trim() && !files.length) return          // drops the empty assistant placeholder
    const role = m.role === 'user' ? 'user' : 'assistant'
    if (role !== 'user' || !files.length) {
      out.push({ role, content: text })
    } else if (keep.has(i)) {
      out.push({ role, content: buildMessageContent(text, files) })
    } else {
      const note = `[earlier in this chat I attached: ${describeAttachments(files)}]`
      out.push({ role, content: text.trim() ? `${text}\n\n${note}` : note })
    }
  })
  return out
}
