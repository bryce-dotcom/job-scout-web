// One way to put a photo or video into the Marketing inbox, used by Field
// Scout (Share / Snap for Marketing) and the Marketing page's Upload.
//
// A photo is one object in the public marketing-media bucket. A video is
// the clip plus a poster and a few stills pulled out here in the browser
// (see videoFrames.js), because the drafter cannot read video and the
// queue needs a thumbnail. Every path starts with the company id: the
// bucket policy checks it.

import { supabase } from './supabase'
import { MEDIA_BUCKET, capturePath } from './marketing'
import { extractVideoFrames } from './videoFrames'
import { resumableUpload, RESUMABLE_THRESHOLD } from './resumableUpload'

// The project's storage cap (raised from 50 MB to 500 MB on 2026-09-29 so a
// phone video fits). Say it up front rather than let the gateway refuse.
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

// onProgress(fraction 0..1) fires as a large file goes up; small files jump
// straight to 1.
// A phone JPEG carries its rotation as an EXIF flag, not in the pixels.
// Facebook (through the publisher) ignored the flag and showed HHH's first
// post sideways. Re-encode through a canvas with the orientation applied
// so the pixels are upright everywhere, and cap the long edge at 2048px so
// a 12 MP shot does not cost 6 MB of upload on job-site signal. Anything
// that cannot be decoded (HEIC on a desktop browser) goes up as it came.
export async function normalizePhoto(file, maxEdge = 2048) {
  if (typeof document === 'undefined' || !String(file.type || '').startsWith('image/')) return file
  if (/gif|svg/.test(file.type)) return file
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale))
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d').drawImage(bmp, 0, 0, w, h)
    bmp.close?.()
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9))
    if (!blob) return file
    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified || Date.now() })
  } catch {
    return file
  }
}

// storyboard: for a video the AI made, the plan + soundtrack settings used, so it can be reopened and edited.
export async function uploadCapture({ companyId, employeeId = null, jobId = null, file: original, note = '', source = 'shared', brand = null, storyboard = null, onProgress = null }) {
  if (!original) throw new Error('No file')
  if (original.size > MAX_UPLOAD_BYTES) throw new Error(`${original.name || 'That file'} is ${Math.round(original.size / 1024 / 1024)} MB; the limit is 500 MB. Trim the clip or pick a shorter one.`)
  const file = await normalizePhoto(original)
  const isVideo = String(file.type || '').startsWith('video/')
  const contentType = file.type || (isVideo ? 'video/mp4' : 'image/jpeg')
  const path = capturePath(companyId, file.name)
  if (file.size > RESUMABLE_THRESHOLD) {
    await resumableUpload({ bucket: MEDIA_BUCKET, path, file, contentType, onProgress })
  } else {
    const { error: upErr } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType, upsert: false })
    if (upErr) throw upErr
    onProgress?.(1)
  }
  const { data: pub } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path)

  let poster_url = null, frames = [], duration_s = null
  if (isVideo) {
    const got = await extractVideoFrames(file)
    duration_s = got.duration
    const stem = path.replace(/\.[^.]+$/, '')
    const putStill = async (blob, name) => {
      const p = `${stem}_${name}.jpg`
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(p, blob, { contentType: 'image/jpeg', upsert: true })
      if (error) return null
      return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(p).data.publicUrl
    }
    if (got.poster) poster_url = await putStill(got.poster, 'poster')
    for (const [i, b] of got.frames.entries()) {
      const u = await putStill(b, `f${i + 1}`)
      if (u) frames.push(u)
    }
    if (!poster_url && frames[0]) poster_url = frames[0]
  }

  const { data: row, error: dbErr } = await supabase.from('marketing_captures').insert({
    company_id: companyId, employee_id: employeeId, job_id: jobId, bucket: MEDIA_BUCKET, path, url: pub.publicUrl,
    media_type: isVideo ? 'video' : 'image', note: note?.trim() || null, source, brand,
    poster_url, frames, duration_s, storyboard: storyboard || null,
  }).select('*').maybeSingle()
  if (dbErr) throw dbErr
  return row
}

// The picture to show for a capture: a video's poster, a photo's own url.
export function captureThumb(c) {
  if (!c) return null
  return c.media_type === 'video' ? (c.poster_url || (c.frames || [])[0] || null) : (c.url || null)
}

// A video that went up without a poster (HHH's first phone videos: the
// iOS extraction failed) gets one made from its public URL on whatever
// device opens the page next. Three at a time, newest first, so a page
// open never turns into a batch job.
export async function backfillVideoPosters(captures, { max = 3 } = {}) {
  const todo = (captures || []).filter((c) => c?.media_type === 'video' && !c.poster_url && c.url && c.bucket === MEDIA_BUCKET).slice(0, max)
  let fixed = 0
  for (const c of todo) {
    try {
      const got = await extractVideoFrames(c.url)
      if (!got.poster && !got.frames.length) continue
      const stem = c.path.replace(/\.[^.]+$/, '')
      const put = async (blob, name) => {
        const p = `${stem}_${name}.jpg`
        const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(p, blob, { contentType: 'image/jpeg', upsert: true })
        return error ? null : supabase.storage.from(MEDIA_BUCKET).getPublicUrl(p).data.publicUrl
      }
      const poster_url = got.poster ? await put(got.poster, 'poster') : null
      const frames = []
      for (const [i, b] of got.frames.entries()) { const u = await put(b, `f${i + 1}`); if (u) frames.push(u) }
      const patch = { poster_url: poster_url || frames[0] || null, frames }
      if (got.duration && !c.duration_s) patch.duration_s = got.duration
      const { error } = await supabase.from('marketing_captures').update(patch).eq('id', c.id)
      if (!error) fixed++
    } catch (err) {
      console.warn('[marketing] poster backfill failed', c.id, err)
    }
  }
  return fixed
}
