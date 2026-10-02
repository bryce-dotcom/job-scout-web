// Pull a poster and a few stills out of a video in the browser.
//
// Why here and not on the server: the edge runtime has no ffmpeg, and the
// drafter needs something to look at. Four frames spread across the clip
// are enough for "what happened in this video"; the poster (about one
// second in, after the shaky start) is the thumbnail everywhere.
//
// Takes a File or a URL (a public capture already uploaded, for the
// backfill). Resolves with what it managed, possibly nothing, and never
// throws: a video with no frames still uploads; the drafter gets the note.
//
// iOS Safari, learned the hard way (HHH's first five phone videos had a
// duration and no stills): metadata arrives but a seek before the first
// frame is decoded never fires `seeked`, and `drawImage` paints black
// until the element has actually played. So: wait for `loadeddata`, play
// muted for a moment, then seek, then wait for a frame callback before
// drawing. Cross-origin sources need `crossOrigin` or the canvas taints.

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

const once = (el, ev, ms) => new Promise((resolve) => {
  let done = false
  const fin = (ok) => { if (!done) { done = true; el.removeEventListener(ev, onEv); resolve(ok) } }
  const onEv = () => fin(true)
  el.addEventListener(ev, onEv, { once: true })
  setTimeout(() => fin(false), ms)
})
const nextFrame = (video) => new Promise((resolve) => {
  if (typeof video.requestVideoFrameCallback === 'function') {
    let done = false
    video.requestVideoFrameCallback(() => { done = true; resolve() })
    setTimeout(() => { if (!done) resolve() }, 700)
  } else {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  }
})

function draw(video, maxW = 1280) {
  return new Promise((resolve) => {
    try {
      if (!video.videoWidth) return resolve(null)
      const scale = Math.min(1, maxW / video.videoWidth)
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(video.videoWidth * scale))
      c.height = Math.max(1, Math.round(video.videoHeight * scale))
      const g = c.getContext('2d')
      g.drawImage(video, 0, 0, c.width, c.height)
      // A black frame is what iOS paints before the first decode; treat it as a miss.
      const px = g.getImageData(0, 0, Math.min(16, c.width), Math.min(16, c.height)).data
      let sum = 0
      for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2]
      if (sum < 12 * (px.length / 4)) return resolve(null)
      c.toBlob((b) => resolve(b || null), 'image/jpeg', 0.82)
    } catch { resolve(null) }
  })
}

async function seekAndDraw(video, t) {
  const target = Math.min(t, Math.max(0, (video.duration || t) - 0.05))
  if (Math.abs(video.currentTime - target) > 0.05) {
    const seeked = once(video, 'seeked', 5000)
    try { video.currentTime = target } catch { /* ignore */ }
    await seeked
  }
  await nextFrame(video)
  return draw(video)
}

export async function extractVideoFrames(source) {
  if (typeof document === 'undefined' || !source) return { poster: null, frames: [], duration: null }
  const isFile = typeof source !== 'string'
  if (isFile && !String(source.type || '').startsWith('video/')) return { poster: null, frames: [], duration: null }
  const url = isFile ? URL.createObjectURL(source) : source
  const video = document.createElement('video')
  video.muted = true; video.playsInline = true; video.preload = 'auto'
  video.setAttribute('playsinline', ''); video.setAttribute('muted', '')
  if (!isFile) video.crossOrigin = 'anonymous'
  // Off-screen but in the document: some engines will not decode a detached element.
  video.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0;pointer-events:none'
  document.body.appendChild(video)
  video.src = url
  try {
    video.load()
    const meta = await once(video, 'loadedmetadata', 10000)
    if (!meta) return { poster: null, frames: [], duration: null }
    // A clip the browser just recorded (the editor's output) reports an
    // infinite duration until it has been scanned to the end. Seeking far
    // past the end forces the scan; the real duration follows.
    if (!isFinite(video.duration)) {
      const seeked = once(video, 'seeked', 8000)
      try { video.currentTime = 1e9 } catch { /* ignore */ }
      await seeked
      await once(video, 'durationchange', 1500)
      try { video.currentTime = 0 } catch { /* ignore */ }
      await once(video, 'seeked', 5000)
    }
    const duration = isFinite(video.duration) ? video.duration : null
    // Get a real frame decoded: wait for data, then play muted for a beat.
    await once(video, 'loadeddata', 6000)
    try { await Promise.race([video.play(), new Promise((r) => setTimeout(r, 1500))]); await new Promise((r) => setTimeout(r, 250)); video.pause() } catch { /* autoplay refused: seeking still works on most engines */ }

    let poster = await seekAndDraw(video, posterTime(duration))
    const frames = []
    for (const t of frameTimes(duration)) {
      const b = await seekAndDraw(video, t)
      if (b) frames.push(b)
    }
    if (!poster && frames[0]) poster = frames[0]
    return { poster, frames, duration }
  } catch {
    return { poster: null, frames: [], duration: null }
  } finally {
    try { video.pause(); video.removeAttribute('src'); video.load() } catch { /* ignore */ }
    try { video.remove() } catch { /* ignore */ }
    if (isFile) { try { URL.revokeObjectURL(url) } catch { /* ignore */ } }
  }
}
