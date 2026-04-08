import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { toast } from '../lib/toast'
import { maybeCelebrate } from '../lib/celebrate'

// Notification types that trigger a confetti celebration.
// Keep in sync with company_notifications inserts across the app.
const CELEBRATE_TYPES = new Set(['estimate_approved', 'estimate_won'])

export default function CompanyNotifications() {
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const channelRef = useRef(null)

  useEffect(() => {
    if (!companyId) return

    try {
      // Clean up previous channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }

      const channel = supabase
        .channel(`company-notifications-${companyId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'company_notifications',
            filter: `company_id=eq.${companyId}`
          },
          (payload) => {
            const notification = payload.new
            // Don't show a toast to the person who created it — they already
            // get a local toast from the action that fired it. BUT we still
            // want the confetti if they're the owner of an approved quote.
            const isCreator = notification.created_by === user?.id
            if (!isCreator) {
              toast.announcement(
                notification.title,
                notification.message
              )
            }

            // Fire confetti for approvals. maybeCelebrate handles the
            // company-wide toggle + per-employee opt-out internally.
            if (CELEBRATE_TYPES.has(notification.type)) {
              maybeCelebrate(notification)
            }
          }
        )
        .subscribe()

      channelRef.current = channel

      return () => {
        supabase.removeChannel(channel)
      }
    } catch (err) {
      console.warn('[CompanyNotifications] Failed to subscribe:', err.message)
    }
  }, [companyId, user?.id])

  return null
}
