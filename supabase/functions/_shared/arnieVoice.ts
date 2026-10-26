// "Hey Jenny" on an iPhone — the rules (Bryce, 2026-10-26).
//
// An iPhone Shortcut, started by Vocal Shortcuts, listens, sends the words to
// arnie-voice with the person's voice key, and reads the answer aloud. Pure
// helpers here: the key, what an answer must look like to be HEARD, and when
// the conversation is over.

/** A new voice key: "jsv_" and 32 random bytes, URL-safe. Shown once. */
export function newVoiceKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return 'jsv_' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const looksLikeVoiceKey = (k: unknown) => /^jsv_[A-Za-z0-9_-]{40,}$/.test(String(k || '').trim())

/** Only this is stored: the key itself is never kept. */
export async function hashVoiceKey(key: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(key).trim()))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The last four, so a person can tell their keys apart. */
export const keyHint = (key: string) => `…${String(key).trim().slice(-4)}`

/** The turn's note: the answer will be read aloud on a phone. */
export const VOICE_NOTE = [
  'THIS ANSWER WILL BE READ ALOUD on their phone — they are talking to you hands-free (a "Hey" voice shortcut), probably driving or on a ladder.',
  'So: plain spoken sentences. No tables, no bullet lists, no markdown, no links or web addresses, no emoji. Two to four short sentences unless they ask for more; the most important thing first. Say numbers the way a person says them ("about twenty-two thousand", "three fifteen p.m.").',
  'If you draft a card, say it is waiting for them to approve in the JobScout app — nothing is done until they do. If something needs a screen (a list longer than a few items, a document), say the short version and that the full one is in the app.',
].join('\n')

/** An answer made fit to be heard: no markdown, no links, no receipt line. */
export function speakable(text: string): string {
  return String(text || '')
    .replace(/⟦receipt⟧[\s\S]*$/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/https?:\/\/\S+/g, 'the link in the app')
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\s)[*_](?!\s)(.+?)(?<!\s)[*_]/g, '$1$2')
    .replace(/^\s*[-•*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/`/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** "Thanks", "that's all", "bye" — the conversation is over. */
export function isGoodbye(said: string): boolean {
  const t = String(said || '').trim().toLowerCase().replace(/[^a-z' ]/g, '').trim()
  if (!t) return true
  return /^(ok(ay)? )?(thanks?( you)?|thank you( jenny| arnie)?|that'?s (all|it)|nothing( else)?|bye|goodbye|stop|cancel|never ?mind|i'?m good|all good|no thanks?|nope)( jenny| arnie| very much)?$/.test(t)
}

/** The voice conversation picks up where it left off for this long. */
export const VOICE_SESSION_MINUTES = 15
/** A key's calls in one day, so a looping Shortcut cannot run up a bill. */
export const VOICE_DAILY_CAP = 300
