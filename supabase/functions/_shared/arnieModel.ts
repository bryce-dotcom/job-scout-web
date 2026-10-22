// Arnie's model — ONE place. arnie-chat, the morning brief push, teach-by-
// demonstration and the settings-list parser all read it, so they cannot
// drift onto different models again (three were left on Sonnet 4.5 after the
// switch on 2026-10-21).
//
// Sonnet 5.5 thinks before it answers, and that thinking counts toward
// max_tokens — a 400-token cap can be spent before a word of the answer. And a
// reply may open with a thinking block, so read text blocks BY TYPE (textOf),
// never content[0].
export const ARNIE_MODEL = 'claude-sonnet-5-5'

// THE LIVE MODEL (Bryce, 2026-10-22: "keep arnie on the best ai possible …
// checks and autoupdates"). The weekly model watch (arnie-model-watch) may move
// Arnie to a better model by writing arnie_model_state — no deploy. Read here,
// cached for five minutes; ARNIE_MODEL above is the fallback if the row is
// missing or unreadable, so Arnie never stops for want of a setting.
let liveCache: { model: string; at: number } | null = null
export async function liveArnieModel(): Promise<string> {
  if (liveCache && Date.now() - liveCache.at < 5 * 60_000) return liveCache.model
  const env = (globalThis as any).Deno?.env
  const url = env?.get?.('SUPABASE_URL'), key = env?.get?.('SUPABASE_SERVICE_ROLE_KEY')
  let model = ARNIE_MODEL
  if (url && key) {
    try {
      const r = await fetch(`${url}/rest/v1/arnie_model_state?select=model&id=eq.1&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
      const row = r.ok ? (await r.json())?.[0] : null
      if (row?.model && /^claude-[a-z0-9-]{3,60}$/.test(row.model)) model = row.model
    } catch { /* the fallback stands */ }
  }
  liveCache = { model, at: Date.now() }
  return model
}

/** A short job — a parse, a brief: little thinking, room for it anyway. On the live model. */
export const quickCall = async (maxTokens: number) => ({
  model: await liveArnieModel(),
  max_tokens: maxTokens,
  output_config: { effort: 'low' },
})

/** Every text block of a reply, in order — skipping thinking blocks. */
export function textOf(data: any): string {
  return (data?.content || []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('\n').trim()
}
