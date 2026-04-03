import { supabase } from './supabase'

/**
 * Send a company-wide notification.
 * All users in the company will see a toast announcement via Supabase Realtime.
 */
export async function companyNotify({ companyId, type, title, message, metadata = {}, createdBy = null }) {
  if (!companyId) return

  await supabase.from('company_notifications').insert({
    company_id: companyId,
    type,
    title,
    message,
    metadata,
    created_by: createdBy
  })
}
