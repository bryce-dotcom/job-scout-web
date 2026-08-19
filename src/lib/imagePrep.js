// Get a photo ready to send to Don's readers.
//
// Phone cameras produce 4000px 6MB JPEGs. Sending those raw makes the request
// slow on a job-site LTE connection and buys nothing — the model reads a
// well-scaled 1800px image as well as a huge one, and plan sheets photographed
// at an angle benefit more from being held steady than from more pixels.
//
// Plan sheets get more resolution than field notes because a pipe schedule's
// 6pt type is the whole point of reading the sheet.

const MAX_EDGE = { notes: 1600, plan: 2200 }

export async function prepImage(file, mode = 'notes') {
  const maxEdge = MAX_EDGE[mode] || MAX_EDGE.notes
  const dataUrl = await readAsDataUrl(file)
  const img = await loadImage(dataUrl)

  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
  // Already small enough — don't re-encode and lose a generation of quality.
  if (scale >= 1 && file.size < 1_500_000) {
    return {
      base64: dataUrl.split(',')[1],
      mediaType: file.type || 'image/jpeg',
      preview: dataUrl,
      width: img.width,
      height: img.height,
      bytes: file.size,
    }
  }

  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)

  const out = canvas.toDataURL('image/jpeg', 0.85)
  return {
    base64: out.split(',')[1],
    mediaType: 'image/jpeg',
    preview: out,
    width: w,
    height: h,
    bytes: Math.round((out.length - out.indexOf(',') - 1) * 0.75),
  }
}

export async function prepImages(files, mode = 'notes') {
  const out = []
  for (const f of files) {
    if (!f.type?.startsWith('image/')) continue
    out.push(await prepImage(f, mode))
  }
  return out
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = src
  })
}
