// How a county parcel becomes a lead row. Used by the drop form (one lead)
// and the cloverleaf panel (a street's worth at once) so both write the same
// thing: owner as customer or business, situs address, notes a rep can read,
// the parcel kept on enrichment_data for later.

import { parcelSummary } from '../../lib/parcels'

export const isCompanyName = n => /\b(llc|inc|corp|church|properties|holdings|trust|city|town|county|state|school|district|association|hoa)\b/i.test(n || '')

export const parcelAddress = pc => pc ? [pc.address, pc.city, pc.zip].filter(Boolean).join(', ') : ''

export function parcelNotes(pc) {
  if (!pc) return null
  return [
    `${pc.source_label}${pc.parcel_id ? ` parcel ${pc.parcel_id}` : ''}: ${parcelSummary(pc) || 'on record'}`,
    pc.owner_name ? `Owner of record: ${pc.owner_name}${pc.mail_address ? ` (mail: ${pc.mail_address})` : ''}` : null,
    pc.last_sale_date ? `Last sale: ${pc.last_sale_date}${pc.last_sale_price ? ` $${pc.last_sale_price.toLocaleString()}` : ''}` : null,
    pc.source_url ? `Source: ${pc.source_url}` : null
  ].filter(Boolean).join('\n')
}

export function leadRowFromParcel({ companyId, user, pc, lat, lng, leadSource = 'Door Knock', notes = null }) {
  const owner = pc?.owner_name || ''
  const address = parcelAddress(pc)
  return {
    company_id: companyId,
    customer_name: (owner && !isCompanyName(owner) ? owner : '') || address || 'Neighbor',
    business_name: owner && isCompanyName(owner) ? owner : null,
    address: address || null,
    latitude: lat, longitude: lng, geocoded_at: new Date().toISOString(),
    status: 'New', lead_source: leadSource,
    lead_owner_id: user?.id || null, salesperson_id: user?.id || null,
    ...(pc ? { enrichment_data: { parcel: { ...pc, geometry: undefined } }, notes: [notes, parcelNotes(pc)].filter(Boolean).join('\n\n') } : {})
  }
}
