// A stored file link → a link that actually opens.
//
// audit-photos went PRIVATE on 2026-10-20 (Bryce: "make the audit photos
// fully private too"). Its links were stored as public URLs in
// quote_lines.photos, job_lines.photos and audit_areas.photos, and built from
// file_attachments rows, and a /object/public/ URL to a private bucket is a
// 400. The stored values stay as they are — they are the file's identity —
// and every place that SHOWS or FETCHES one asks this for a short-lived
// signed URL instead. The signed-in person's own access decides: the bucket's
// policies only sign their own company's files.
//
// Public buckets (product images, logos, marketing) pass through untouched.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/** Buckets whose files need a signed link to open. */
export const PRIVATE_BUCKETS = new Set(['audit-photos', 'project-documents', 'employee-photos'])

const EXPIRES = 3600
const cache = new Map() // `${bucket}/${path}` → { url, until } | Promise
const pending = new Map() // bucket → { paths:Set, waiters:Map(path→[resolve]) , timer }

/**
 * Which bucket and path a stored value points at, or null.
 * Takes a full storage URL (public, authenticated or already-signed) or a
 * bare path (with `bucket` saying which).
 */
export function storageRef(value, bucket = null) {
  const s = String(value || '').trim()
  if (!s) return null
  const m = s.match(/\/storage\/v1\/object\/(?:public|authenticated|sign)\/([^/]+)\/([^?#]+)/)
  if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) }
  if (/^(https?:|data:|blob:)/i.test(s)) return null // not ours
  return bucket ? { bucket, path: s.replace(/^\/+/, '') } : null
}

/** Does this value need signing before it can be shown? */
export function needsSigning(value, bucket = null) {
  const ref = storageRef(value, bucket)
  if (!ref || !PRIVATE_BUCKETS.has(ref.bucket)) return false
  // A link that is already signed carries its own token.
  return !/\/object\/sign\/|[?&]token=/.test(String(value))
}

function flush(bucket) {
  const p = pending.get(bucket)
  pending.delete(bucket)
  if (!p) return
  const paths = [...p.paths]
  supabase.storage.from(bucket).createSignedUrls(paths, EXPIRES).then(({ data }) => {
    const until = Date.now() + (EXPIRES - 120) * 1000
    const byPath = new Map((data || []).map((d) => [d.path, d.signedUrl || null]))
    for (const path of paths) {
      const url = byPath.get(path) || null
      if (url) cache.set(`${bucket}/${path}`, { url, until })
      for (const done of p.waiters.get(path) || []) done(url)
    }
  }).catch(() => {
    for (const path of paths) for (const done of p.waiters.get(path) || []) done(null)
  })
}

/**
 * A URL that opens. Signed (cached ~an hour, batched with any others asked for
 * in the same moment) when the file is in a private bucket; the value itself
 * otherwise. Resolves to null only when a private file cannot be signed for
 * this person.
 */
export function signedUrlFor(value, bucket = null) {
  if (!needsSigning(value, bucket)) return Promise.resolve(value || null)
  const ref = storageRef(value, bucket)
  const key = `${ref.bucket}/${ref.path}`
  const hit = cache.get(key)
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.url)
  return new Promise((resolve) => {
    let p = pending.get(ref.bucket)
    if (!p) {
      p = { paths: new Set(), waiters: new Map(), timer: null }
      pending.set(ref.bucket, p)
      p.timer = setTimeout(() => flush(ref.bucket), 15)
    }
    p.paths.add(ref.path)
    p.waiters.set(ref.path, [...(p.waiters.get(ref.path) || []), resolve])
  })
}

/** React: the openable URL for a stored value (null while signing). */
export function useSignedUrl(value, bucket = null) {
  const direct = !needsSigning(value, bucket)
  const [url, setUrl] = useState(direct ? (value || null) : null)
  useEffect(() => {
    let live = true
    if (!needsSigning(value, bucket)) { setUrl(value || null); return }
    setUrl(null)
    signedUrlFor(value, bucket).then((u) => { if (live) setUrl(u) })
    return () => { live = false }
  }, [value, bucket])
  return url
}

/** <img> for a stored file link. Renders nothing until the link opens. */
export function SignedImg({ src, bucket = null, ...rest }) {
  const url = useSignedUrl(src, bucket)
  if (!url) return null
  return <img src={url} {...rest} />
}

/** <a> for a stored file link (opens the signed URL). */
export function SignedLink({ href, bucket = null, children, ...rest }) {
  const url = useSignedUrl(href, bucket)
  return <a href={url || undefined} {...rest}>{children}</a>
}
