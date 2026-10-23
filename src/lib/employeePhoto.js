// Getting an employee's photo to actually appear.
//
// Every employees.headshot_url in the database is a PUBLIC storage URL:
//
//   https://<ref>.supabase.co/storage/v1/object/public/employee-photos/3/1773328317321.png
//
// and the employee-photos bucket is private. Supabase answers a public path
// on a private bucket with "Bucket not found", so every one of them 400s.
// They have presumably been broken since the bucket was closed; nothing
// rendered them anywhere prominent enough to notice until faces appeared at
// the campfire, where a broken image shows the browser's broken-icon and the
// alt text inside a circle. It looked like a bug in the circle. It was not.
//
// The bucket stays private — these are photographs of people, and the fix
// for "the URL does not work" is not "let anyone with the URL have it".
// A signed URL is read with the viewer's own session, so storage policy
// still decides who may see what.

import { supabase } from './supabase'

export const EMPLOYEE_PHOTO_BUCKET = 'employee-photos'

/**
 * '…/object/public/employee-photos/3/x.png' -> '3/x.png'
 *
 * Tolerates the signed and authenticated shapes too, so a row that was fixed
 * by some other route still resolves instead of silently returning null.
 */
export function storagePathFromUrl(url, bucket = EMPLOYEE_PHOTO_BUCKET) {
  const s = String(url || '')
  if (!s) return null
  for (const kind of ['public', 'sign', 'authenticated']) {
    const marker = `/object/${kind}/${bucket}/`
    const i = s.indexOf(marker)
    if (i !== -1) {
      const rest = s.slice(i + marker.length)
      // A signed URL carries ?token=…; the path stops at the query.
      return decodeURIComponent(rest.split('?')[0]) || null
    }
  }
  return null
}

/**
 * A URL that will actually load, or null.
 *
 * Returns null rather than throwing or handing back the broken original:
 * callers draw initials when there is no photo, and a null is the same
 * answer as "this person has not uploaded one". A broken <img> is the one
 * outcome nobody wants.
 */
export async function signedPhotoUrl(headshotUrl, { expiresIn = 3600 } = {}) {
  const path = storagePathFromUrl(headshotUrl)
  if (!path) return null
  try {
    const { data, error } = await supabase.storage
      .from(EMPLOYEE_PHOTO_BUCKET)
      .createSignedUrl(path, expiresIn)
    if (error) return null
    return data?.signedUrl || null
  } catch {
    return null
  }
}

/** Several at once, as { [headshotUrl]: signedUrl }. Failures are omitted. */
export async function signedPhotoUrls(headshotUrls = [], opts) {
  const unique = [...new Set((headshotUrls || []).filter(Boolean))]
  const out = {}
  await Promise.all(unique.map(async (u) => {
    const signed = await signedPhotoUrl(u, opts)
    if (signed) out[u] = signed
  }))
  return out
}
