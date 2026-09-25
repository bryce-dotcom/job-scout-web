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

// Supabase's project-wide object cap; a phone clip over this fails at the
// gateway with a message nobody can act on, so say it up front.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export async function uploadCapture({ companyId, employeeId = null, jobId = null, file, note = '', source = 'shared', brand = null }) {
  if (!file) throw new Error('No file')
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name || 'That file'} is ${Math.round(file.size / 1024 / 1024)} MB; the limit is 50 MB. Trim the clip or pick a shorter one.`)
  const isVideo = String(file.type || '').startsWith('video/')
  const contentType = file.type || (isVideo ? 'video/mp4' : 'image/jpeg')
  const path = capturePath(companyId, file.name)
  const { error: upErr } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType, upsert: false })
  if (upErr) throw upErr
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
    poster_url, frames, duration_s,
  }).select('*').maybeSingle()
  if (dbErr) throw dbErr
  return row
}

// The picture to show for a capture: a video's poster, a photo's own url.
export function captureThumb(c) {
  if (!c) return null
  return c.media_type === 'video' ? (c.poster_url || (c.frames || [])[0] || null) : (c.url || null)
}
