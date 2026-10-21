// The receipt under an Arnie reply — what the SERVER saw him look up and
// draft that turn (supabase/functions/_shared/arnieReceipt.ts writes it).
//
// It is saved inside the reply, behind RECEIPT_MARK, so a reopened chat still
// shows it and — the point — so it goes back to him as history: an earlier
// answer whose receipt says "No lookups" reads as unverified on the next turn.
// The bubble never shows the mark; it draws the receipt as a footer.

export const RECEIPT_MARK = '⟦receipt⟧'

/** A saved reply → the words, and the receipt if it has one. */
export function splitReceipt(content) {
  const s = typeof content === 'string' ? content : String(content ?? '')
  const at = s.lastIndexOf(RECEIPT_MARK)
  if (at < 0) return { text: s, receipt: null }
  return { text: s.slice(0, at).trimEnd(), receipt: s.slice(at + RECEIPT_MARK.length).trim() || null }
}

/** The words with their receipt, as saved and as sent back as history. */
export function withReceipt(text, receipt) {
  const t = String(text ?? '')
  return receipt ? `${t}\n\n${RECEIPT_MARK} ${receipt}` : t
}
