// Tagged links: every URL JobScout publishes or emails says where it came
// from, so a visit on the tenant's site can be credited to the post or the
// campaign that sent it. Twin of supabase/functions/_shared/utm.ts — keep
// the two in step.
//
// utm_source  = jobscout (email, text) or the network (facebook, instagram…)
// utm_medium  = email | sms | social
// utm_campaign= campaign-<id> | post-<id>
// utm_content = touch-<n> | <platform>

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g

/** Add the tags to one URL, keeping any it already has. */
export function tagUrl(url, tags = {}) {
  try {
    const u = new URL(url)
    for (const [k, v] of Object.entries(tags)) {
      if (v == null || v === '') continue
      if (!u.searchParams.has(k)) u.searchParams.set(k, String(v))
    }
    return u.toString()
  } catch {
    return url
  }
}

/** Tag every URL in a block of text. Trailing punctuation stays outside the link. */
export function tagLinks(text, tags = {}) {
  return String(text || '').replace(URL_RE, (m) => {
    const trail = m.match(/[.,;:!?]+$/)?.[0] || ''
    const core = trail ? m.slice(0, -trail.length) : m
    return tagUrl(core, tags) + trail
  })
}

/** The tags for a campaign touch. */
export const campaignTags = (campaignId, touchIndex, kind) => ({
  utm_source: 'jobscout', utm_medium: kind === 'text' ? 'sms' : 'email', utm_campaign: `campaign-${campaignId}`, utm_content: `touch-${Number(touchIndex) + 1}`,
})

/** The tags for a published post on one network. */
export const postTags = (postId, platform) => ({
  utm_source: platform || 'social', utm_medium: 'social', utm_campaign: `post-${postId}`,
})

/** A human label for a traffic source, for the "what sent people" list. */
export function sourceLabel(hit = {}) {
  const c = String(hit.utm_campaign || '')
  if (/^campaign-\d+$/.test(c)) return { kind: 'campaign', id: Number(c.slice(9)), label: 'Campaign' }
  if (/^post-\d+$/.test(c)) return { kind: 'post', id: Number(c.slice(5)), label: `Post on ${hit.utm_source || 'social'}` }
  if (hit.utm_source) return { kind: 'utm', id: null, label: `${hit.utm_source}${hit.utm_medium ? ' · ' + hit.utm_medium : ''}` }
  const r = String(hit.referrer_host || '').replace(/^www\./, '')
  if (!r) return { kind: 'direct', id: null, label: 'Typed the address or a saved link' }
  if (/google\./.test(r)) return { kind: 'google', id: null, label: 'Google search' }
  if (/facebook\.|fb\.com|instagram\.|linkedin\.|tiktok\.|x\.com|twitter\./.test(r)) return { kind: 'social', id: null, label: r }
  return { kind: 'referrer', id: null, label: r }
}
