// Gemini image generation, once. marketing-image (a person asks for a
// picture) and marketing-suggest (the nightly pass, for a finished job with
// no photo) both paint through here.
//
// Models: gemini-3.1-flash-image at 1K (~7 cents a picture); the retiring
// 2.5 model is the fallback when a key cannot reach 3.1 yet.

export const IMAGE_MODELS = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image']
let current = IMAGE_MODELS[0]
export const ASPECT: Record<string, string> = { vertical: '9:16', square: '1:1', landscape: '16:9' }

export function geminiKey(): string | null {
  const k = Deno.env.get('GEMINI_API_KEY') || ''
  return k ? k : null
}

export type Painted = { bytes: Uint8Array; mime: string; model: string }
export type PaintError = { error: string; status: number; needs_key?: boolean; needs_billing?: boolean }

/** A photorealistic picture for a brand: what the field would have shot, had someone been there with a phone. */
export function picturePrompt(kit: Record<string, unknown>, description: string, style = ''): string {
  const services = Array.isArray(kit.services) ? (kit.services as string[]).slice(0, 6).join(', ') : ''
  const area = String(kit.service_area || '').slice(0, 80)
  return [
    `A photorealistic marketing photograph for ${kit.company_name || 'a field-services company'}${services ? ` (${services})` : ''}${area ? ` in ${area}` : ''}.`,
    `Scene: ${description}.`,
    `Style: ${style || 'natural daylight, documentary, shot on a phone by the crew, true to life'}. Real job site, real materials, believable people seen from behind or at a distance, no faces in close-up.`,
    'No text, no captions, no logos, no watermarks, no borders. Any signs, shirts, vehicles, windows and labels are blank, with no readable lettering anywhere. Vertical social-media framing with room for a headline at the top.',
  ].join(' ')
}

export async function paintPicture(key: string, prompt: string, aspect = 'vertical', model = current): Promise<Painted | PaintError> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: ASPECT[aspect] || '9:16', ...(model.startsWith('gemini-3') ? { imageSize: '1K' } : {}) } },
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = j?.error?.message || `Gemini ${r.status}`
    if (model === IMAGE_MODELS[0] && IMAGE_MODELS[1] && (r.status === 404 || /not found|not supported|unsupported/i.test(msg))) {
      current = IMAGE_MODELS[1]
      return paintPicture(key, prompt, aspect, IMAGE_MODELS[1])
    }
    if (r.status === 400 && /API key/i.test(msg)) return { error: 'The Gemini API key on the server is not valid.', status: 400, needs_key: true }
    if (/prepayment credits|billing|RESOURCE_EXHAUSTED|quota/i.test(msg)) return { error: 'AI pictures are paused: the Google AI Studio project that paints them has run out of prepaid credits. The owner adds credits at ai.studio/projects (Billing); a small top-up covers hundreds of pictures. Real photos still work.', status: 402, needs_billing: true }
    return { error: msg, status: r.status }
  }
  const part = (j.candidates?.[0]?.content?.parts || []).find((p: Record<string, unknown>) => p.inlineData)
  if (!part) return { error: j.candidates?.[0]?.finishReason ? `No picture (${j.candidates[0].finishReason}).` : 'No picture came back.', status: 502 }
  const bin = atob(part.inlineData.data as string)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, mime: String(part.inlineData.mimeType || 'image/png'), model }
}
