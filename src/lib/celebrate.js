// Confetti celebration helper for estimate approvals.
//
// Gating (in order):
//   1. Company default — `settings` table row with key='celebration_enabled'
//      (default ON when missing).
//   2. Per-employee opt-out — `employees.celebration_opt_out` boolean on the
//      logged-in user's record.
//
// If either says off, we silently skip and let the toast handle the rest.
// Dynamic import keeps the canvas-confetti bundle out of the initial load
// and never crashes if it fails to fetch.

import { useStore } from './store'

function isCelebrationEnabled() {
  const state = useStore.getState()
  const settings = state.settings || []
  const row = settings.find((s) => s.key === 'celebration_enabled')
  // Default ON when the setting row is missing entirely
  if (!row) return true
  const v = row.value
  if (v === undefined || v === null || v === '') return true
  return v === true || v === 'true' || v === 1 || v === '1'
}

function isEmployeeOptedOut() {
  const state = useStore.getState()
  return !!state.user?.celebration_opt_out
}

/**
 * Maybe fire confetti for an incoming notification payload.
 *
 * @param {Object} notif - The row from company_notifications.
 *        Shape: { type, metadata: { owner_employee_id, ... }, ... }
 * @param {Object} [opts]
 * @param {boolean} [opts.forceOwnerBurst] - Fire the louder owner burst
 *        regardless of the metadata owner id. Used by callers that already
 *        know the current user is the owner.
 */
export async function maybeCelebrate(notif, opts = {}) {
  try {
    if (!isCelebrationEnabled()) return
    if (isEmployeeOptedOut()) return

    const state = useStore.getState()
    const user = state.user
    const ownerId = notif?.metadata?.owner_employee_id || null
    const isOwner = opts.forceOwnerBurst || (!!user?.id && !!ownerId && Number(user.id) === Number(ownerId))

    // Lazy import so the confetti bundle only ships when it's actually used
    const mod = await import('canvas-confetti')
    const confetti = mod.default || mod
    if (!confetti) return

    // Base burst — everyone in the company sees this on an approval
    confetti({
      particleCount: isOwner ? 220 : 80,
      spread: isOwner ? 90 : 55,
      startVelocity: isOwner ? 55 : 40,
      origin: { y: 0.6 },
      colors: ['#5a6349', '#4a7c59', '#d4af37', '#f0c674', '#ffffff'],
      scalar: isOwner ? 1.1 : 0.9,
      disableForReducedMotion: true,
    })

    // Owner gets a second and third shower from the sides for extra drama
    if (isOwner) {
      setTimeout(() => {
        confetti({
          particleCount: 140,
          spread: 100,
          origin: { x: 0.1, y: 0.7 },
          colors: ['#d4af37', '#f0c674', '#5a6349', '#ffffff'],
          disableForReducedMotion: true,
        })
      }, 280)
      setTimeout(() => {
        confetti({
          particleCount: 140,
          spread: 100,
          origin: { x: 0.9, y: 0.7 },
          colors: ['#d4af37', '#f0c674', '#4a7c59', '#ffffff'],
          disableForReducedMotion: true,
        })
      }, 560)
    }
  } catch (err) {
    // Never block the toast path on a confetti error
    console.warn('[celebrate] skipped:', err?.message || err)
  }
}

/**
 * Quick manual trigger for use on the in-app approve button (EstimateDetail)
 * when the current user just approved their own estimate. Treats them as owner.
 */
export function celebrateOwnApproval() {
  return maybeCelebrate({ metadata: {} }, { forceOwnerBurst: true })
}
