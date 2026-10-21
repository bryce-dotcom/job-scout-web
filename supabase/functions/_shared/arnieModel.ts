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

/** A short job — a parse, a brief: little thinking, room for it anyway. */
export const quickCall = (maxTokens: number) => ({
  model: ARNIE_MODEL,
  max_tokens: maxTokens,
  output_config: { effort: 'low' },
})

/** Every text block of a reply, in order — skipping thinking blocks. */
export function textOf(data: any): string {
  return (data?.content || []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('\n').trim()
}
