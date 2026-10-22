// The fire itself.
//
// Bryce, 2026-10-22: "get creative — just a coloured fire, and to the side
// title it CampFire and in little letters under that write collaborate."
//
// So this is not an icon-set flame tinted with currentColor. It is drawn:
// a deep ember base, an orange body and a pale yellow core, which is what
// makes a fire read as a fire at 26 pixels instead of an orange blob. The
// whole thing sits in the sidebar against the muted topo green, so the warmth
// is doing the work of telling you it is the one social thing in the product.
//
// It breathes only when somebody is in the room — a flame that flickers at an
// empty room is decoration, and a flame that flickers when London is sitting
// there is information. Anyone who has asked their machine not to animate
// gets the still version.

export default function CampfireMark({ size = 26, live = false, id = 'cf' }) {
  // Unique gradient ids: two of these on one page with the same id would make
  // the second one inherit the first one's fill.
  const body = `${id}-body`
  const core = `${id}-core`

  return (
    <>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={live ? 'campfire-live' : undefined}
        style={{ display: 'block', flexShrink: 0, filter: live ? 'drop-shadow(0 0 5px rgba(249,115,22,0.55))' : 'none' }}
      >
        <defs>
          {/* A fire is DARK at the bottom and almost white where it is
              hottest. The first version ramped amber→orange→red across the
              whole shape, which at 28px averaged out to one flat orange
              blob. The contrast is what makes it read as fire. */}
          <linearGradient id={body} x1="12" y1="22" x2="12" y2="1" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7f1d1d" />
            <stop offset="0.3" stopColor="#dc2626" />
            <stop offset="0.62" stopColor="#f97316" />
            <stop offset="0.88" stopColor="#fbbf24" />
            <stop offset="1" stopColor="#fde68a" />
          </linearGradient>
          <linearGradient id={core} x1="12" y1="20" x2="12" y2="9" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f97316" />
            <stop offset="0.5" stopColor="#fcd34d" />
            <stop offset="1" stopColor="#fffbeb" />
          </linearGradient>
        </defs>

        {/* The body: a tall tongue with a leaning tip and one lick curling off
            the left, because a symmetrical flame reads as a leaf. */}
        <path
          fill={`url(#${body})`}
          d="M13.1 1c.2 2.6-.9 4.3-2.3 5.9-1.7 1.9-3.6 3.8-3.6 6.9a6.2 6.2 0 0 0 12.4 0c0-2.3-1-4.2-2.3-5.7-.2 1.2-.8 2.1-1.8 2.7.6-3.6-.9-7-2.4-9.8Z"
          transform="translate(-1 0)"
        />
        {/* The hot core, low and small: the brightest part of a fire sits just
            above the fuel, not in the middle of the flame. */}
        <path
          fill={`url(#${core})`}
          d="M12 11.7c.8 1.1 1.6 1.9 1.6 3.3a2.5 2.5 0 0 1-5 0c0-1.3.7-2 1.4-2.9.2.5.5.9.9 1.1.2-.6.6-1.1 1.1-1.5Z"
        />
      </svg>
      <style>{`
        @keyframes campfire-flicker {
          0%, 100% { transform: scale(1) translateY(0); opacity: 1; }
          25%      { transform: scale(1.06) translateY(-0.5px); opacity: 0.94; }
          50%      { transform: scale(0.97) translateY(0.5px); opacity: 1; }
          75%      { transform: scale(1.04) translateY(-0.3px); opacity: 0.97; }
        }
        .campfire-live { animation: campfire-flicker 2.1s ease-in-out infinite; transform-origin: 50% 85%; }
        @media (prefers-reduced-motion: reduce) { .campfire-live { animation: none; } }
      `}</style>
    </>
  )
}
