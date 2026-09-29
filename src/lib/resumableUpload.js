// Resumable upload to Supabase Storage (the TUS protocol it speaks), with
// progress and per-chunk retry.
//
// Why: a phone video is 60 to 150 MB and the crew is on job-site signal.
// supabase-js's plain upload is one request with no progress and no retry,
// so a dropped connection at 80% starts over and the person sees nothing
// while they wait. This sends 6 MB chunks, reports progress after each,
// and retries a chunk a few times before giving up. Chunk size is fixed by
// the server (6 MB) and must not change.
//
// Only used for files over the plain-upload threshold; small photos still
// go the simple way (see marketingUpload.js).

import { supabase } from './supabase'

export const CHUNK = 6 * 1024 * 1024
export const RESUMABLE_THRESHOLD = 6 * 1024 * 1024

const b64 = (s) => btoa(unescape(encodeURIComponent(s)))

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY
  return { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function resumableUpload({ bucket, path, file, contentType, onProgress, upsert = false }) {
  const base = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`
  const headers = await authHeaders()
  const meta = { bucketName: bucket, objectName: path, contentType: contentType || file.type || 'application/octet-stream', cacheControl: '3600' }
  const metadata = Object.entries(meta).map(([k, v]) => `${k} ${b64(v)}`).join(',')

  // 1. Create the upload; the Location header is where chunks go.
  const create = await fetch(base, {
    method: 'POST',
    headers: { ...headers, 'Tus-Resumable': '1.0.0', 'Upload-Length': String(file.size), 'Upload-Metadata': metadata, 'x-upsert': upsert ? 'true' : 'false' },
  })
  if (!create.ok) throw new Error(`Could not start the upload (${create.status}): ${(await create.text()).slice(0, 160)}`)
  const location = create.headers.get('Location')
  if (!location) throw new Error('The upload started but the server gave no address for it.')
  const url = location.startsWith('http') ? location : `${import.meta.env.VITE_SUPABASE_URL}${location}`

  // 2. Send chunks. On a failure, ask the server where it got to and go on
  //    from there rather than from the start.
  let offset = 0
  let failures = 0
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK, file.size)
    const chunk = file.slice(offset, end)
    let res
    try {
      res = await fetch(url, {
        method: 'PATCH',
        headers: { ...headers, 'Tus-Resumable': '1.0.0', 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' },
        body: chunk,
      })
    } catch (err) {
      res = null
    }
    if (res && res.ok) {
      offset = Number(res.headers.get('Upload-Offset') || end)
      failures = 0
      onProgress?.(Math.min(1, offset / file.size))
      continue
    }
    failures++
    if (failures > 4) throw new Error(res ? `Upload failed at ${Math.round((offset / file.size) * 100)}% (${res.status})` : 'Lost the connection during upload. Try again where there is signal.')
    await sleep(800 * failures)
    try {
      const head = await fetch(url, { method: 'HEAD', headers: { ...headers, 'Tus-Resumable': '1.0.0' } })
      if (head.ok) offset = Number(head.headers.get('Upload-Offset') || offset)
    } catch { /* keep the offset we had */ }
  }
  onProgress?.(1)
  return { path }
}
