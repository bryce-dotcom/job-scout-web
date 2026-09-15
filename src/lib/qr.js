// Tiny QR helper for "scan to pay" in FieldScout. qrcode-generator has no
// dependencies and renders to a GIF data URL, which an <img> shows anywhere.
import qrcode from 'qrcode-generator'

export function qrDataUrl(text, { cellSize = 6, margin = 2 } = {}) {
  if (!text) return null
  try {
    const qr = qrcode(0, 'M') // type 0 = pick the smallest version that fits
    qr.addData(String(text))
    qr.make()
    return qr.createDataURL(cellSize, margin)
  } catch {
    return null
  }
}
