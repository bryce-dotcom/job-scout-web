import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { toast } from '../lib/toast'

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
            // Don't show to the person who created it (they already get a local toast)
            if (notification.created_by === user?.id) return

            toast.announcement(
              notification.title,
              notification.message
            )
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
