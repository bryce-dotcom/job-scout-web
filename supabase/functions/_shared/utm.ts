// Tagged links — twin of src/lib/utm.js. Keep the two in step.
// Every URL JobScout publishes or emails says where it came from, so a
// visit on the tenant's site (site_hits) can be credited to the post or
// the campaign that sent it.

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g

export function tagUrl(url: string, tags: Record<string, string | number | null | undefined> = {}): string {
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

export function tagLinks(text: string, tags: Record<string, string | number | null | undefined> = {}): string {
  return String(text || '').replace(URL_RE, (m) => {
    const trail = m.match(/[.,;:!?]+$/)?.[0] || ''
    const core = trail ? m.slice(0, -trail.length) : m
    return tagUrl(core, tags) + trail
  })
}

export const campaignTags = (campaignId: number | string, touchIndex: number, kind: string) => ({
  utm_source: 'jobscout', utm_medium: kind === 'text' ? 'sms' : 'email', utm_campaign: `campaign-${campaignId}`, utm_content: `touch-${Number(touchIndex) + 1}`,
})

export const postTags = (postId: number | string, platform?: string | null) => ({
  utm_source: platform || 'social', utm_medium: 'social', utm_campaign: `post-${postId}`,
})
