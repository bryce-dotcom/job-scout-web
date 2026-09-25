// Pull a poster and a few stills out of a video in the browser.
//
// Why here and not on the server: the edge runtime has no ffmpeg, and the
// drafter needs something to look at. Four frames spread across the clip
// are enough for "what happened in this video"; the poster (about one
// second in, after the shaky start) is the thumbnail everywhere.
//
// Returns { poster: Blob, frames: Blob[], duration }. Blobs are JPEG. On
// anything that cannot decode the file (an odd codec, a huge clip on a
// phone), it resolves with what it managed, possibly nothing, and never
// throws: a video with no frames still uploads; the drafter just gets the
// note.

export const MAX_FRAMES = 4

export function frameTimes(duration, n = MAX_FRAMES) {
  const d = Number(duration)
  if (!isFinite(d) || d <= 0) return [0]
  if (d < 2) return [Math.min(0.5, d / 2)]
  const count = Math.max(1, Math.min(n, Math.floor(d)))
  // Spread through the middle 80% so we skip the fumbling at both ends.
  const start = d * 0.1, span = d * 0.8
  return Array.from({ length: count }, (_, i) => +(start + (count === 1 ? span / 2 : (span * i) / (count - 1))).toFixed(2))
}

export function posterTime(duration) {
  const d = Number(duration)
  if (!isFinite(d) || d <= 0) return 0
  return Math.min(1, d / 2)
}

function grab(video, t, maxW = 1280) {
  return new Promise((resolve) => {
    let done = false
    const finish = (blob) => { if (!done) { done = true; resolve(blob || null) } }
    const onSeeked = () => {
      try {
        const scale = Math.min(1, maxW / (video.videoWidth || maxW))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round((video.videoWidth || 640) * scale))
        c.height = Math.max(1, Math.round((video.videoHeight || 360) * scale))
        c.getContext('2d').drawImage(video, 0, 0, c.width, c.height)
        c.toBlob((b) => finish(b), 'image/jpeg', 0.82)
      } catch { finish(null) }
    }
    video.addEventListener('seeked', onSeeked, { once: true })
    setTimeout(() => finish(null), 4000)
    try { video.currentTime = t } catch { finish(null) }
  })
}

export async function extractVideoFrames(file) {
  if (typeof document === 'undefined' || !file || !String(file.type || '').startsWith('video/')) return { poster: null, frames: [], duration: null }
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url
  try {
    await new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', resolve, { once: true })
      video.addEventListener('error', reject, { once: true })
      setTimeout(reject, 8000)
    })
    const duration = isFinite(video.duration) ? video.duration : null
    const poster = await grab(video, posterTime(duration))
    const frames = []
    for (const t of frameTimes(duration)) {
      const b = await grab(video, t)
      if (b) frames.push(b)
    }
    return { poster, frames, duration }
  } catch {
    return { poster: null, frames: [], duration: null }
  } finally {
    try { video.src = ''; URL.revokeObjectURL(url) } catch { /* ignore */ }
  }
}
