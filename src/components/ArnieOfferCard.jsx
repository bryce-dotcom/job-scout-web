// "Arnie offers, you accept."
//
// ONE card, drawn wherever an offer can appear — in the conversation where he
// asked, and on the Computer tab where a person goes looking. Two cards would
// be two answers to "what is he asking me", and the one that got updated
// would not be the one somebody read.
//
// WHAT IT IS FOR. Permission used to be a form: program name, site, and a
// choice between watch, click and full. Nobody can weigh that question cold,
// so nobody answered it, and every feature behind it sat unreachable. Here the
// permission and the thing it is for arrive together — "I need Chrome on
// rockymountainpower.net to open the project list" — which is a question with
// an obvious answer.
//
// WHAT IT NEVER DOES. It does not decide anything. Accepting tells the rail a
// person said yes; the leash then decides again with the new permission in
// hand, and can still say no. A browser that could mark something allowed
// would be a browser worth attacking.

import { useState, useEffect } from 'react'
import { ShieldQuestion, Eye, MousePointerClick, Keyboard, Hand, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { acceptOffer, declineOffer } from '../lib/arnieComputer'

const t = {
  card: '#ffffff', card2: '#f0ebdd', ink: '#2c3530', sub: '#4d5a52', muted: '#7d8a7f',
  line: '#d6cdb8', accent: '#5a6349', amber: '#b45309', amberBg: 'rgba(180,83,9,0.10)',
  rm: '#b91c1c', rmBg: 'rgba(185,28,28,0.08)',
}

const TIER = {
  watch: { icon: Eye, says: 'look at it, and nothing else' },
  click: { icon: MousePointerClick, says: 'look and click, never type' },
  full: { icon: Keyboard, says: 'look, click and type' },
}

/** What he is about to do, in the words a person would use. */
const inPlainWords = (o) => {
  const where = o.target?.label || o.target?.text || o.target?.name
  const place = o.host && o.host !== '*' ? `${o.app} on ${o.host}` : o.app
  switch (o.kind) {
    case 'screenshot': return `Look at ${place}`
    case 'read_text': return `Read what is on screen in ${place}`
    case 'launch': return `Open ${place}`
    case 'type': return `Type into ${where || place}`
    case 'scroll': return `Scroll ${place}`
    default: return `${where ? `Click ${where}` : 'Click'} in ${place}`
  }
}

/**
 * Takes either the row (the Computer tab has already read a list of them) or
 * just an id (the conversation is told one happened and nothing more). Reading
 * it here means the card always shows what the TABLE says — including an offer
 * already answered in the other place, which is the whole reason there is one
 * card and not two.
 */
export default function ArnieOfferCard({ offer: given, offerId, onAnswered }) {
  const [offer, setOffer] = useState(given || null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')

  useEffect(() => {
    if (given) { setOffer(given); return }
    if (!offerId) return
    let alive = true
    supabase
      .from('arnie_computer_actions')
      .select('id,kind,app,host,target,decision,reason,wants_tier,expires_at')
      .eq('id', offerId)
      .maybeSingle()
      .then(({ data }) => { if (alive && data) setOffer(data) }, () => {})
    return () => { alive = false }
  }, [given, offerId])

  if (!offer) return null
  // Answered somewhere else, or it ran out of time while the page sat open.
  if (!['needs_grant', 'needs_approval', 'awaiting_human'].includes(offer.decision) && !done) {
    return (
      <Shell tone="plain" icon={Check} title="Already answered">
        <p style={p}>This one is {offer.decision === 'expired' ? 'past its time' : offer.decision}.</p>
      </Shell>
    )
  }

  const answer = async (what) => {
    setBusy(what); setErr('')
    try {
      if (what === 'no') await declineOffer(offer.id)
      else await acceptOffer(offer.id, what)
      setDone(what)
      onAnswered?.(offer.id, what)
    } catch (e) { setErr(String(e.message || e)) } finally { setBusy('') }
  }

  // Something he will not do however it is answered. There is no button here
  // on purpose: an "allow anyway" on a password box would be the one thing
  // this whole design exists to make impossible.
  if (offer.decision === 'awaiting_human') {
    return (
      <Shell tone="amber" icon={Hand} title="This one is yours">
        <p style={p}>{offer.reason}</p>
        <p style={{ ...p, color: t.muted, fontSize: 12.5 }}>
          {inPlainWords(offer)} — he has stopped here and will not do it himself.
        </p>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell tone="plain" icon={done === 'no' ? X : Check} title={done === 'no' ? 'Turned down' : 'Allowed'}>
        <p style={p}>
          {done === 'no'
            ? 'He will not do that one. Nothing was allowed.'
            : done === 'always'
              ? `${offer.app} stays allowed until you revoke it on the Computer tab.`
              : `Allowed once — he will ask again next time.`}
        </p>
      </Shell>
    )
  }

  const tier = TIER[offer.wants_tier] || TIER.watch
  const needsPermission = offer.decision === 'needs_grant'

  return (
    <Shell tone="accent" icon={ShieldQuestion} title={needsPermission ? 'Arnie needs your say-so' : 'Arnie is checking with you'}>
      <p style={{ ...p, color: t.ink, fontWeight: 600 }}>{inPlainWords(offer)}</p>
      {offer.target?.why && <p style={{ ...p, color: t.sub }}>{offer.target.why}</p>}

      {needsPermission && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', background: t.card2,
          borderRadius: 9, padding: '9px 11px', margin: '9px 0 11px',
        }}>
          <tier.icon size={15} style={{ color: t.accent, flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12.5, color: t.sub, lineHeight: 1.5 }}>
            He is asking to <strong style={{ color: t.ink }}>{tier.says}</strong> in{' '}
            <strong style={{ color: t.ink }}>{offer.host && offer.host !== '*' ? `${offer.app} on ${offer.host}` : offer.app}</strong>.
            {' '}He still cannot type a password or press anything that cannot be taken back.
          </div>
        </div>
      )}
      {!needsPermission && offer.reason && <p style={{ ...p, color: t.sub }}>{offer.reason}</p>}

      {err && <p style={{ ...p, color: t.rm }}>{err}</p>}

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        <button onClick={() => answer('once')} disabled={!!busy} style={btn(t.accent, '#fff')}>
          {busy === 'once' ? 'One moment…' : 'Let him, this once'}
        </button>
        {needsPermission && (
          <button onClick={() => answer('always')} disabled={!!busy} style={btn(t.card2, t.sub)}>
            {busy === 'always' ? '…' : 'Always allow'}
          </button>
        )}
        <button onClick={() => answer('no')} disabled={!!busy} style={btn(t.card2, t.sub)}>No</button>
      </div>
    </Shell>
  )
}

const TONE = {
  accent: { bg: 'rgba(90,99,73,0.06)', line: 'rgba(90,99,73,0.35)', fg: '#5a6349' },
  amber: { bg: 'rgba(180,83,9,0.07)', line: 'rgba(180,83,9,0.30)', fg: '#b45309' },
  plain: { bg: '#f0ebdd', line: '#d6cdb8', fg: '#4d5a52' },
}

function Shell({ tone, icon, title, children }) {
  const c = TONE[tone] || TONE.plain
  const Icon = icon
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.line}`, borderRadius: 12,
      padding: '12px 13px', margin: '8px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <Icon size={16} style={{ color: c.fg, flexShrink: 0 }} />
        <strong style={{ fontSize: 13.5, color: t.ink }}>{title}</strong>
      </div>
      {children}
    </div>
  )
}

const p = { margin: '0 0 6px', fontSize: 13, lineHeight: 1.55, color: t.sub }

const btn = (bg, fg) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
  background: bg, color: fg, border: '1px solid transparent', borderRadius: 9,
  padding: '8px 12px', fontSize: 13, fontWeight: 600, minHeight: 40,
})
