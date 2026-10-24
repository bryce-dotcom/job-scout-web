// The drawn menu.
//
// Every mark here is built the way CampfireMark is built — filled paths with
// a material ramp behind them, not a 2px outline tinted with currentColor.
// The reason is the one Bryce gave on 2026-10-23 when he put the outline
// spyglass next to the fire: "your drawing sucks." He was right. A stroke
// icon beside an illustrated one does not read as restraint, it reads as the
// unfinished half.
//
// WHAT MAKES A MARK WORK AT FOURTEEN PIXELS, which is the only size that
// matters — the sidebar draws at 26 and the collapsed rail at 14:
//
//   - One silhouette, filled. Detail inside the silhouette is a bonus that
//     disappears small; the outline has to carry it alone.
//   - Light from above, every time. The ramps in scoutPalette do this, so a
//     mark that looks flat is usually a mark drawn without a ramp.
//   - Diagonals beat uprights. The spyglass and the trail own their frames
//     because they run corner to corner. A centred rectangle does not.
//   - Nothing thinner than ~1px at 24, because 1px at 24 is a seventh of a
//     pixel at 14 and simply is not there.
//
// Each mark declares the materials it is made of and draws with them. The
// material, not the mark, picks the colour — see scoutPalette.

import ScoutMark from './ScoutMark'

/* ── Top of the menu: orientation ───────────────────────────────────────
   Brass and glass. These are the instruments — the things you pick up to
   work out where you are before you do anything else. */

/** The Lookout (was Dashboard). A three-draw ship's glass. */
export function LookoutMark(props) {
  return (
    <ScoutMark {...props} ramps={['brass', 'brassDark', 'glass']}>
      {(m) => (
        // Drawn horizontal and rotated as one group: a stepped tube is hard
        // to get right on a diagonal and trivial to get right flat.
        <g transform="rotate(-35 11.35 12)">
          <rect x="1.5" y="9.6" width="1.6" height="4.8" rx="0.5" fill={m.brassDark} />
          <rect x="2.6" y="10.1" width="4.8" height="3.8" rx="0.5" fill={m.brass} />
          <rect x="7" y="9.4" width="6.8" height="5.2" rx="0.6" fill={m.brass} />
          <rect x="13.4" y="8.6" width="6.4" height="6.8" rx="0.7" fill={m.brass} />
          <rect x="19.4" y="8.1" width="1.8" height="7.8" rx="0.6" fill={m.brassDark} />
          {/* The only cold thing on a warm object, so the eye lands on it. */}
          <ellipse cx="21" cy="12" rx="0.85" ry="3.5" fill={m.glass} />
        </g>
      )}
    </ScoutMark>
  )
}

/** Pipeline Trail (was Pipeline). Start dot, dashed trail, X marks the spot. */
export function TrailMark(props) {
  return (
    <ScoutMark {...props} ramps={['ink', 'signal']}>
      {(m) => (
        <>
          {/* The dot is where the lead comes in, the dashes are the stages,
              the X is the close. The icon is the page. */}
          <circle cx="3.4" cy="20.6" r="1.9" fill={m.ink} />
          <path
            d="M3.4 20.6 C8.4 19.4 8 15.2 6.3 13.2 C4.6 11.2 8.2 9.3 12.4 9.5"
            fill="none" stroke={m.ink} strokeWidth="2.5" strokeLinecap="round"
            // DOTS, not dashes. A dash of 3-ish units with a round cap on each
            // end is a capsule, and five capsules following a curve read as
            // droppings rather than as a trail — which is exactly how the
            // first version looked. A zero-length dash with a round cap is a
            // circle, so this draws evenly spaced dots instead, which is the
            // map convention and survives the shrink because a dot has no
            // orientation to lose.
            strokeDasharray="0.01 4.7"
          />
          <path d="M14.4 3.3 L20.2 9.1 M20.2 3.3 L14.4 9.1" stroke={m.signal} strokeWidth="2.7" strokeLinecap="round" />
        </>
      )}
    </ScoutMark>
  )
}

/** The Cache (was Inventory). One crate, then the small stuff. */
export function CacheMark(props) {
  return (
    <ScoutMark {...props} ramps={['wood', 'woodDark']}>
      {(m) => (
        <>
          <rect x="5" y="2.4" width="14" height="11" rx="1" fill={m.wood} />
          {/* A plank seam and a brace. Without them a crate is just a box. */}
          <path d="M5.4 5.6 H18.6 M6.2 12.4 L17.8 6.4" stroke="#5a3718" strokeWidth="1.05" strokeLinecap="round" opacity="0.75" />
          {/* Three descending, on one baseline. The row is what makes it a
              cache instead of a single carton. */}
          <rect x="2.6" y="15.2" width="7.2" height="6.2" rx="0.8" fill={m.woodDark} />
          <rect x="10.8" y="16.5" width="6.4" height="4.9" rx="0.7" fill={m.woodDark} />
          <rect x="18.2" y="17.6" width="3.4" height="3.8" rx="0.6" fill={m.woodDark} />
        </>
      )}
    </ScoutMark>
  )
}

/** Field Notes (was Reports). A kraft memo book. */
export function FieldNotesMark(props) {
  return (
    <ScoutMark {...props} ramps={['kraft', 'page']}>
      {(m) => (
        <>
          <rect x="4.2" y="2.4" width="15.4" height="19.2" rx="1.5" fill={m.kraft} />
          {/* Spine and elastic. This mark is the softest silhouette in the
              set — an upright rectangle — so these two dark verticals are
              what stop it reading as a blank card at 14px. */}
          <rect x="4.2" y="2.4" width="2.3" height="19.2" rx="1.1" fill="#4a3a24" />
          <rect x="15.9" y="2.4" width="1.5" height="19.2" fill="#3b2f1f" />
          <rect x="7.6" y="6.4" width="7" height="6.4" rx="0.5" fill={m.page} stroke="#c0a070" strokeWidth="0.6" />
          <path d="M8.7 8.9 H13.5 M8.7 10.9 H12.3" stroke="#a98f5e" strokeWidth="0.85" strokeLinecap="round" />
        </>
      )}
    </ScoutMark>
  )
}

/** Field Scout. A brass compass — the instrument, not a direction. */
export function CompassMark(props) {
  return (
    <ScoutMark {...props} ramps={['brass', 'brassDark', 'page', 'signal', 'steel']}>
      {(m) => (
        <>
          {/* The lug, so it reads as a pocket compass on a lanyard rather
              than as a clock face. */}
          <rect x="10.6" y="0.8" width="2.8" height="2.6" rx="0.9" fill={m.brassDark} />
          <circle cx="12" cy="12.6" r="9.4" fill={m.brass} />
          <circle cx="12" cy="12.6" r="7.1" fill={m.page} />
          <path d="M12 6 L14.3 12.6 L9.7 12.6 Z" fill={m.signal} />
          <path d="M12 19.2 L9.7 12.6 L14.3 12.6 Z" fill={m.steel} />
          <circle cx="12" cy="12.6" r="1.05" fill={m.brassDark} />
        </>
      )}
    </ScoutMark>
  )
}

/** Company Map. A folded paper map with a route inked across it. */
export function MapMark(props) {
  return (
    <ScoutMark {...props} ramps={['page', 'kraft', 'ink']}>
      {(m) => (
        <>
          {/* Three panels, the middle one in shadow. The alternating tilt is
              the fold — a flat rectangle with lines on it is a document. */}
          <path d="M2.5 6.2 L8.5 4 L8.5 19 L2.5 21.2 Z" fill={m.page} />
          <path d="M8.5 4 L15.5 6.2 L15.5 21.2 L8.5 19 Z" fill={m.kraft} />
          <path d="M15.5 6.2 L21.5 4 L21.5 19 L15.5 21.2 Z" fill={m.page} />
          {/* Ink, not red: the signal colour belongs to the trail's X and to
              alerts, and spending it here would make both mean less. */}
          <path
            d="M4.6 17.6 C7.4 15.4 9.8 16.6 11.9 14.2 C14 11.8 16.4 12.2 19.4 9.4"
            fill="none" stroke={m.ink} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2.6 2.2"
          />
        </>
      )}
    </ScoutMark>
  )
}

/** Company Calendar. A wall block on two brass rings. */
export function CalendarMark(props) {
  return (
    <ScoutMark {...props} ramps={['page', 'leather', 'brassDark', 'ink']}>
      {(m) => (
        <>
          <rect x="7.3" y="1.6" width="1.9" height="4.4" rx="0.95" fill={m.brassDark} />
          <rect x="14.8" y="1.6" width="1.9" height="4.4" rx="0.95" fill={m.brassDark} />
          <rect x="3" y="4.2" width="18" height="17" rx="1.7" fill={m.page} />
          <path d="M3 5.9 a1.7 1.7 0 0 1 1.7 -1.7 h14.6 a1.7 1.7 0 0 1 1.7 1.7 v3.3 h-18 Z" fill={m.leather} />
          <g fill={m.ink}>
            <rect x="6.1" y="12" width="3" height="2.5" rx="0.5" />
            <rect x="10.5" y="12" width="3" height="2.5" rx="0.5" />
            <rect x="14.9" y="12" width="3" height="2.5" rx="0.5" />
            <rect x="6.1" y="16.3" width="3" height="2.5" rx="0.5" />
            <rect x="10.5" y="16.3" width="3" height="2.5" rx="0.5" />
          </g>
        </>
      )}
    </ScoutMark>
  )
}

/** Base Camp. The tent. */
export function BaseCampMark(props) {
  return (
    <ScoutMark {...props} ramps={['canvas', 'leather']}>
      {(m) => (
        <>
          <path d="M12 2.8 L21.8 20.8 L2.2 20.8 Z" fill={m.canvas} />
          {/* The door is what makes a triangle a tent. */}
          <path d="M12 8.6 L15.6 20.8 L8.4 20.8 Z" fill={m.leather} />
          {/* Pole tip above the ridge, and the ground it is pitched on. */}
          <path d="M12 1.2 V3.6" stroke="#4c3019" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M1.4 21.4 H22.6" stroke="#4c3019" strokeWidth="1.3" strokeLinecap="round" opacity="0.55" />
        </>
      )}
    </ScoutMark>
  )
}

/* ── Sales: canvas, leather and brass ──────────────────────────────────
   The approach. These are the things a person carries or leaves behind. */

/** Customers. A card file — the people already on the books. */
export function CustomersMark(props) {
  return (
    <ScoutMark {...props} ramps={['kraft', 'page', 'ink']}>
      {(m) => (
        <>
          {/* A record OF PEOPLE. Leads are tracks; customers are filed, and
              the two must not look alike. The bust is load-bearing: the first
              version was cream cards in a kraft tray, and with no edge on the
              cards they vanished against a white sidebar and the whole mark
              read as a cardboard box. */}
          <rect x="5.3" y="3.6" width="10.6" height="11.6" rx="0.9" fill={m.page} stroke="#8a6a44" strokeWidth="0.5" transform="rotate(-10 12 10)" />
          <rect x="8.1" y="3.6" width="10.6" height="11.6" rx="0.9" fill={m.page} stroke="#8a6a44" strokeWidth="0.5" transform="rotate(10 12 10)" />
          <rect x="6.7" y="2.9" width="10.6" height="12.4" rx="0.9" fill={m.page} stroke="#8a6a44" strokeWidth="0.5" />
          <circle cx="12" cy="7" r="2.15" fill={m.ink} />
          <path d="M8.6 13.4 a3.4 3.4 0 0 1 6.8 0" fill={m.ink} />
          <rect x="2.6" y="13.3" width="18.8" height="7.9" rx="1.3" fill={m.kraft} />
          <path d="M3.1 16 H20.9" stroke="#7d5733" strokeWidth="1" opacity="0.55" />
        </>
      )}
    </ScoutMark>
  )
}

/** My Crew. A stitched patch — the badge a crew wears, not a list of faces. */
export function MyCrewMark(props) {
  return (
    <ScoutMark {...props} ramps={['leather', 'canvas', 'brass']}>
      {(m) => (
        <>
          <circle cx="12" cy="12" r="9.7" fill={m.leather} />
          <circle cx="12" cy="12" r="7.9" fill={m.canvas} />
          <circle cx="12" cy="12" r="8.8" fill="none" stroke="#f2e8cf" strokeWidth="0.75" strokeDasharray="1.5 1.3" opacity="0.8" />
          <path
            d="M12 8.1 L12.97 10.67 L15.71 10.8 L13.57 12.51 L14.29 15.16 L12 13.65 L9.71 15.16 L10.43 12.51 L8.29 10.8 L11.03 10.67 Z"
            fill={m.brass}
          />
        </>
      )}
    </ScoutMark>
  )
}

/** Marketing. A brass speaking trumpet — being found starts with being heard. */
export function MarketingMark(props) {
  return (
    <ScoutMark {...props} ramps={['brass', 'brassDark']}>
      {(m) => (
        <g transform="rotate(-20 11 12)">
          <rect x="1.8" y="10.2" width="2.8" height="3.6" rx="1" fill={m.brassDark} />
          <path d="M4.2 10.2 L18 6.4 L18 17.6 L4.2 13.8 Z" fill={m.brass} />
          {/* The bell, as its own ellipse: a flat trapezoid end reads as a
              funnel, and the rim is what makes it a horn. */}
          <ellipse cx="18" cy="12" rx="1.5" ry="5.6" fill={m.brassDark} />
          <ellipse cx="18.1" cy="12" rx="1" ry="4.5" fill={m.brass} />
        </g>
      )}
    </ScoutMark>
  )
}

/** Leads. Fresh tracks — somebody came through here and you have not met them. */
export function LeadsMark(props) {
  return (
    <ScoutMark {...props} ramps={['ink', 'leather']}>
      {(m) => (
        <>
          <g transform="rotate(-14 8.4 16.2)" fill={m.ink}>
            <ellipse cx="8.4" cy="14.8" rx="3.1" ry="4.3" />
            <ellipse cx="8.4" cy="20.2" rx="2.4" ry="2.1" />
          </g>
          <g transform="rotate(-14 15.6 8.4)" fill={m.leather}>
            <ellipse cx="15.6" cy="7" rx="3.1" ry="4.3" />
            <ellipse cx="15.6" cy="12.4" rx="2.4" ry="2.1" />
          </g>
        </>
      )}
    </ScoutMark>
  )
}

/** Lead Setter. The headset — this is the page where you call people. */
export function LeadSetterMark(props) {
  return (
    <ScoutMark {...props} ramps={['canvas', 'leather']}>
      {(m) => (
        <>
          <path d="M3.6 14.4 A8.4 8.4 0 0 1 20.4 14.4" fill="none" stroke={m.canvas} strokeWidth="2.6" strokeLinecap="round" />
          <rect x="1.6" y="12.6" width="4.4" height="7" rx="2.2" fill={m.leather} />
          <rect x="18" y="12.6" width="4.4" height="7" rx="2.2" fill={m.leather} />
          <path d="M19.4 19.8 Q19 22.6 15.4 22.1" fill="none" stroke={m.leather} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="14.8" cy="22" r="1.5" fill={m.leather} />
        </>
      )}
    </ScoutMark>
  )
}

/** Appointments. A note pinned down — a slot somebody is holding for you. */
export function AppointmentsMark(props) {
  return (
    <ScoutMark {...props} ramps={['page', 'ink', 'brass', 'brassDark']}>
      {(m) => (
        <>
          <g transform="rotate(-7 12 13)">
            <rect x="4.8" y="5.6" width="14.4" height="15.2" rx="1" fill={m.page} />
            <path d="M7.6 11.4 H16.4 M7.6 14.2 H15 M7.6 17 H13" stroke={m.ink} strokeWidth="1.05" strokeLinecap="round" />
          </g>
          <circle cx="11.4" cy="5.4" r="2.6" fill={m.brass} />
          <circle cx="11.4" cy="5.4" r="1" fill={m.brassDark} />
        </>
      )}
    </ScoutMark>
  )
}

/** Estimates. The sealed proposal — a page that has been finished and sent. */
export function EstimatesMark(props) {
  return (
    <ScoutMark {...props} ramps={['page', 'ink', 'copper']}>
      {(m) => (
        <>
          <rect x="4.4" y="2.4" width="15.2" height="19.2" rx="1.1" fill={m.page} />
          <path d="M7.2 7 H16.8 M7.2 10 H16.8 M7.2 13 H13.4" stroke={m.ink} strokeWidth="1.05" strokeLinecap="round" />
          {/* The seal is copper, not signal red: red belongs to the trail's X
              and to alerts, and a document is neither. */}
          <circle cx="16.3" cy="17.3" r="3.6" fill={m.copper} />
          <circle cx="16.3" cy="17.3" r="2.1" fill="none" stroke="#5e3214" strokeWidth="0.8" opacity="0.55" />
        </>
      )}
    </ScoutMark>
  )
}

/* ── Work / Operations: steel and hi-vis ───────────────────────────────
   Cool metal, so the half of the menu about DOING the work never competes
   with the warm half for attention. Hi-vis is the only accent, and it only
   ever lands on the part a hand touches. */

/** Jobs. The toolbox — work that was sold and is now yours to do. */
export function JobsMark(props) {
  return (
    <ScoutMark {...props} ramps={['steel', 'hiVis']}>
      {(m) => (
        <>
          <path d="M8.4 9.6 V7.6 a3.6 3.6 0 0 1 7.2 0 V9.6" fill="none" stroke={m.steel} strokeWidth="2" strokeLinecap="round" />
          <rect x="2.4" y="9.2" width="19.2" height="11.4" rx="1.3" fill={m.steel} />
          <path d="M2.9 13.2 H21.1" stroke="#39434c" strokeWidth="1.1" opacity="0.65" />
          <rect x="10.4" y="12.1" width="3.2" height="2.6" rx="0.6" fill={m.hiVis} />
        </>
      )}
    </ScoutMark>
  )
}

/** Job Board. The clipboard that goes out with the crew. */
export function JobBoardMark(props) {
  return (
    <ScoutMark {...props} ramps={['steel', 'page', 'ink', 'hiVis']}>
      {(m) => (
        <>
          <rect x="3.8" y="3.4" width="16.4" height="18" rx="1.3" fill={m.steel} />
          <rect x="5.6" y="6.6" width="12.8" height="13.2" rx="0.7" fill={m.page} />
          <path d="M7.6 10 H16.4 M7.6 12.8 H16.4 M7.6 15.6 H13.4" stroke={m.ink} strokeWidth="1.05" strokeLinecap="round" />
          <rect x="8.8" y="1.8" width="6.4" height="3.8" rx="1.1" fill={m.hiVis} />
        </>
      )}
    </ScoutMark>
  )
}

/** Recurring Jobs. The loop — work that comes back around on its own. */
export function RecurringMark(props) {
  return (
    <ScoutMark {...props} ramps={['steel']}>
      {(m) => (
        <g fill={m.steel}>
          <path d="M4.71 10.71 A7.4 7.4 0 0 1 19.29 10.71" fill="none" stroke={m.steel} strokeWidth="2.6" strokeLinecap="butt" />
          <path d="M19.81 13.67 L21.46 10.33 L17.12 11.09 Z" />
          <path d="M19.29 13.29 A7.4 7.4 0 0 1 4.71 13.29" fill="none" stroke={m.steel} strokeWidth="2.6" strokeLinecap="butt" />
          <path d="M4.19 10.33 L6.88 12.91 L2.54 13.67 Z" />
        </g>
      )}
    </ScoutMark>
  )
}

/** Service Visits. The wrench — going back out to something already built. */
export function ServiceVisitsMark(props) {
  return (
    <ScoutMark {...props} ramps={['steel', 'hiVis']}>
      {(m) => (
        <g transform="rotate(-40 12 12)">
          <rect x="4" y="10.6" width="12" height="2.8" rx="1.4" fill={m.steel} />
          <rect x="3.6" y="10.6" width="5.8" height="2.8" rx="1.4" fill={m.hiVis} />
          {/* An open-end head: a closed ring reads as a washer. */}
          <path d="M15.6 8.8 H21.4 V10.6 H18.6 V13.4 H21.4 V15.2 H15.6 Z" fill={m.steel} />
        </g>
      )}
    </ScoutMark>
  )
}

/* ── Supply: timber ────────────────────────────────────────────────────
   What you sell and what you buy. The Cache set the material; everything
   that holds, moves or orders stock is made of the same wood. */

/** Products & Services. The price tag — the catalogue is a list of prices. */
export function ProductsMark(props) {
  return (
    <ScoutMark {...props} ramps={['kraft', 'brass', 'ink']}>
      {(m) => (
        <>
          <path d="M8.4 4.2 H20.4 a1.3 1.3 0 0 1 1.3 1.3 V18.5 a1.3 1.3 0 0 1 -1.3 1.3 H8.4 L2.9 12 Z" fill={m.kraft} />
          <circle cx="7.1" cy="12" r="1.75" fill={m.brass} />
          <circle cx="7.1" cy="12" r="0.7" fill="#3d2607" />
          <path d="M11.8 9.4 H18.4 M11.8 14.6 H16.2" stroke={m.ink} strokeWidth="1.1" strokeLinecap="round" />
        </>
      )}
    </ScoutMark>
  )
}

/** Vendors. The depot you buy from. */
export function VendorsMark(props) {
  return (
    <ScoutMark {...props} ramps={['wood', 'woodDark', 'canvas']}>
      {(m) => (
        <>
          {/* A PITCHED ROOF, not an awning. The first version put a flat
              canvas band across the top of a box and it read as an open
              carton with its flaps up — the opposite of a place you buy
              from. A roof over a wall is a building and nothing else. */}
          <rect x="4" y="9.6" width="16" height="11.2" rx="0.6" fill={m.wood} />
          <path d="M1.8 10 L12 3.2 L22.2 10 Z" fill={m.canvas} />
          <rect x="9.8" y="13.8" width="4.4" height="7" rx="0.4" fill={m.woodDark} />
          <rect x="15.8" y="13.4" width="2.8" height="2.8" rx="0.3" fill={m.woodDark} />
          <rect x="5.4" y="13.4" width="2.8" height="2.8" rx="0.3" fill={m.woodDark} />
        </>
      )}
    </ScoutMark>
  )
}

/** Procurement Queue. The hand truck — stock that is on its way. */
export function ProcurementMark(props) {
  return (
    <ScoutMark {...props} ramps={['wood', 'steel']}>
      {(m) => (
        <>
          <rect x="7.4" y="5" width="11.4" height="9.4" rx="0.8" fill={m.wood} />
          <path d="M7.8 9.6 H18.4" stroke="#5a3718" strokeWidth="1" opacity="0.6" />
          <rect x="4.2" y="3" width="2.2" height="15.4" rx="1" fill={m.steel} />
          <rect x="4.2" y="16.6" width="9.4" height="2.1" rx="0.7" fill={m.steel} />
          <circle cx="6.9" cy="20.3" r="2.5" fill={m.steel} />
          <circle cx="6.9" cy="20.3" r="0.9" fill="#39434c" />
        </>
      )}
    </ScoutMark>
  )
}

/** Purchase Orders. The order form, with what it orders sat on top of it. */
export function PurchaseOrdersMark(props) {
  return (
    <ScoutMark {...props} ramps={['kraft', 'ink', 'wood']}>
      {(m) => (
        <>
          <rect x="3.4" y="2.6" width="15.4" height="18.8" rx="1.1" fill={m.kraft} />
          <path d="M6.2 6.6 H15.8 M6.2 9.4 H15.8 M6.2 12.2 H12.6" stroke={m.ink} strokeWidth="1.05" strokeLinecap="round" />
          {/* The crate is what separates an ORDER from the four other pages in
              this menu. A form on its own would be a fifth document. */}
          <rect x="11.6" y="13.6" width="9.6" height="7.6" rx="0.8" fill={m.wood} />
          <path d="M12 16.1 H20.8 M12.6 20.5 L20.2 16.6" stroke="#5a3718" strokeWidth="0.95" strokeLinecap="round" opacity="0.7" />
        </>
      )}
    </ScoutMark>
  )
}

/* ── Money: enamel green and copper ────────────────────────────────────
   Five of these screens were all drawing a dollar sign or a page, which is
   how Invoices, Bills, Expenses, My Pay and Payroll ended up as the same
   glyph four times over. Each one gets its own OBJECT instead: what you
   send, what you owe, what you spent, what you keep, what you hand out. */

/** Invoices. The page with a coin on it — what you are asking to be paid. */
export function InvoicesMark(props) {
  return (
    <ScoutMark {...props} ramps={['page', 'ink', 'copper', 'enamel']}>
      {(m) => (
        <>
          <rect x="3" y="2.6" width="15" height="18.8" rx="1.1" fill={m.page} />
          <path d="M5.8 6.6 H15.2 M5.8 9.4 H15.2 M5.8 12.2 H12" stroke={m.ink} strokeWidth="1.05" strokeLinecap="round" />
          {/* An ENAMEL total bar, because the first version was a page with a
              copper disc on it and so is Estimates — side by side in the menu
              they were the same picture. Green is the money material, and an
              invoice is the money half of that pair. */}
          <rect x="5.8" y="15.2" width="9.4" height="2.6" rx="1.3" fill={m.enamel} />
          <circle cx="17.8" cy="18.4" r="3.6" fill={m.copper} />
        </>
      )}
    </ScoutMark>
  )
}

/** Deposits. The tin with a slot — money going in before the work. */
export function DepositsMark(props) {
  return (
    <ScoutMark {...props} ramps={['enamel', 'copper']}>
      {(m) => (
        <>
          {/* The coin is HALF IN. Floating it clear of the tin made a green
              body with an orange head above it — the icon read as a person,
              which is the one thing a deposit is not. Overlapping the rim is
              what turns two shapes into one action. */}
          <circle cx="15.4" cy="7.4" r="3.1" fill={m.copper} />
          <circle cx="15.4" cy="7" r="1.6" fill="none" stroke="#5e3214" strokeWidth="0.8" opacity="0.5" />
          <rect x="2.4" y="8.8" width="19.2" height="12.2" rx="1.5" fill={m.enamel} />
          <rect x="12.2" y="10.6" width="6.4" height="1.6" rx="0.8" fill="#1d3323" />
          <rect x="5.2" y="15.4" width="3.2" height="2.8" rx="0.6" fill={m.copper} />
        </>
      )}
    </ScoutMark>
  )
}

/** Expenses. The receipt, torn off at the bottom. */
export function ExpensesMark(props) {
  return (
    <ScoutMark {...props} ramps={['page', 'ink', 'enamel']}>
      {(m) => (
        <>
          <path d="M5 2.4 H19 V19.4 L16.67 21.4 L14.33 19.4 L12 21.4 L9.67 19.4 L7.33 21.4 L5 19.4 Z" fill={m.page} />
          <path d="M7.4 6.6 H16.6 M7.4 9.2 H16.6 M7.4 11.8 H13.6" stroke={m.ink} strokeWidth="1.05" strokeLinecap="round" />
          <path d="M7.4 15.4 H16.6" stroke={m.enamel} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </ScoutMark>
  )
}

/** Bills. The envelope — what somebody else sent YOU. */
export function BillsMark(props) {
  return (
    <ScoutMark {...props} ramps={['kraft', 'page', 'copper']}>
      {(m) => (
        <>
          <rect x="2.2" y="5.6" width="19.6" height="13.4" rx="1.2" fill={m.kraft} />
          <path d="M2.2 6.6 L12 14 L21.8 6.6" fill="none" stroke="#7d5733" strokeWidth="1.3" strokeLinejoin="round" opacity="0.75" />
          <rect x="16.4" y="7.4" width="4" height="3.2" rx="0.5" fill={m.copper} />
        </>
      )}
    </ScoutMark>
  )
}

/** Books. The bound ledger — all of it, closed, on the shelf. */
export function BooksMark(props) {
  return (
    <ScoutMark {...props} ramps={['enamel', 'copper', 'page']}>
      {(m) => (
        <>
          <rect x="3.4" y="2.6" width="17.2" height="18.8" rx="1.3" fill={m.enamel} />
          <rect x="3.4" y="2.6" width="2.8" height="18.8" rx="1.2" fill="#1d3323" />
          <rect x="8.6" y="7" width="9.2" height="5.4" rx="0.6" fill={m.copper} />
          <path d="M9.6 16.2 H16.8" stroke={m.page} strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
        </>
      )}
    </ScoutMark>
  )
}

/* ── Team: canvas, leather and the machines people clock into ──────────── */

/** Employees. The badge on a lanyard. */
export function EmployeesMark(props) {
  return (
    <ScoutMark {...props} ramps={['canvas', 'page', 'ink', 'steel']}>
      {(m) => (
        <>
          <path d="M8.6 1.4 L12 6.2 L15.4 1.4" fill="none" stroke={m.canvas} strokeWidth="2" strokeLinecap="round" />
          <rect x="10.4" y="4.6" width="3.2" height="2.6" rx="0.7" fill={m.steel} />
          <rect x="4.4" y="6.8" width="15.2" height="14.6" rx="1.3" fill={m.page} />
          <rect x="6.6" y="9.2" width="5.4" height="5.4" rx="0.7" fill={m.canvas} />
          <path d="M13.8 10.4 H17.6 M13.8 13.2 H17.2 M6.6 17.4 H17.6" stroke={m.ink} strokeWidth="1.05" strokeLinecap="round" />
        </>
      )}
    </ScoutMark>
  )
}

/** Time Clock. The punch clock on the wall. */
export function TimeClockMark(props) {
  return (
    <ScoutMark {...props} ramps={['steel', 'page', 'ink']}>
      {(m) => (
        <>
          <rect x="2.8" y="2.4" width="18.4" height="19.2" rx="1.7" fill={m.steel} />
          <circle cx="12" cy="10.2" r="5.8" fill={m.page} />
          <path d="M12 6.6 V10.4 L14.8 12" fill="none" stroke={m.ink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="6.8" y="17.8" width="10.4" height="1.9" rx="0.8" fill="#39434c" />
        </>
      )}
    </ScoutMark>
  )
}

/** My Pay. The wallet — the one money screen that is yours, not the company's. */
export function MyPayMark(props) {
  return (
    <ScoutMark {...props} ramps={['leather', 'enamel', 'copper']}>
      {(m) => (
        <>
          <rect x="6.4" y="3.8" width="11.2" height="4.4" rx="0.6" fill={m.enamel} />
          <rect x="2.6" y="6.6" width="18.8" height="13.6" rx="1.7" fill={m.leather} />
          <path d="M2.6 11 H21.4" stroke="#3b2512" strokeWidth="1.1" opacity="0.65" />
          <circle cx="17.4" cy="15.6" r="2.3" fill={m.copper} />
        </>
      )}
    </ScoutMark>
  )
}

/** Payroll. The stack that gets handed out. */
export function PayrollMark(props) {
  return (
    <ScoutMark {...props} ramps={['copper', 'enamel']}>
      {(m) => (
        <>
          {/* A TILL, not a coin stack. Stacked ellipses are exactly what the
              EOS cairn is, and two marks sharing one silhouette is one mark.
              A drawer with compartments is what paying everybody looks
              like. */}
          <rect x="2.2" y="7.4" width="19.6" height="5.6" rx="1" fill="#1d3323" />
          <circle cx="7.4" cy="10.2" r="2.1" fill={m.copper} />
          <circle cx="12" cy="10.2" r="2.1" fill={m.copper} />
          <circle cx="16.6" cy="10.2" r="2.1" fill={m.copper} />
          <rect x="2.2" y="12.4" width="19.6" height="8.4" rx="1.3" fill={m.enamel} />
          <rect x="9.4" y="15.8" width="5.2" height="2.2" rx="1.1" fill="#1d3323" />
        </>
      )}
    </ScoutMark>
  )
}

/** Payroll Inbox. The wire tray — what is waiting on you today. */
export function PayrollInboxMark(props) {
  return (
    <ScoutMark {...props} ramps={['steel', 'page', 'ink']}>
      {(m) => (
        <>
          <rect x="6" y="3.4" width="12" height="10.8" rx="0.8" fill={m.page} />
          <path d="M8.2 6.6 H15.8 M8.2 9.2 H14.2" stroke={m.ink} strokeWidth="1.05" strokeLinecap="round" />
          <path d="M2.4 13.4 H21.6 V19.4 a1.4 1.4 0 0 1 -1.4 1.4 H3.8 a1.4 1.4 0 0 1 -1.4 -1.4 Z" fill={m.steel} />
          <path d="M2.4 16.2 H21.6" stroke="#39434c" strokeWidth="1" opacity="0.6" />
        </>
      )}
    </ScoutMark>
  )
}

/** A gear, built from four crossed bars plus a disc — eight teeth without
    eight separate rotated shapes. Used twice, so it lives here once. */
function Gear({ fill, hub, cx, cy, r }) {
  return (
    <g>
      {[0, 45, 90, 135].map((a) => (
        <rect
          key={a} x={cx - r * 1.4} y={cy - r * 0.3} width={r * 2.8} height={r * 0.6} rx={r * 0.22}
          fill={fill} transform={`rotate(${a} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      <circle cx={cx} cy={cy} r={r * 0.4} fill={hub} />
    </g>
  )
}

/** Payroll setup. The form, and the machinery behind it. */
export function PayrollSetupMark(props) {
  return (
    <ScoutMark {...props} ramps={['page', 'ink', 'gunmetal']}>
      {(m) => (
        <>
          <rect x="2.6" y="2.4" width="13.4" height="16.6" rx="1.1" fill={m.page} />
          <path d="M5 6 H13.6 M5 8.8 H13.6 M5 11.6 H10.8" stroke={m.ink} strokeWidth="1.05" strokeLinecap="round" />
          <Gear fill={m.gunmetal} hub="#1e242a" cx={16.2} cy={16.2} r={5.1} />
        </>
      )}
    </ScoutMark>
  )
}

/* ── Admin, management, support and dev ─────────────────────────────── */

/** Settings. The gear on its own. */
export function SettingsMark(props) {
  return (
    <ScoutMark {...props} ramps={['gunmetal']}>
      {(m) => <Gear fill={m.gunmetal} hub="#1e242a" cx={12} cy={12} r={6.4} />}
    </ScoutMark>
  )
}

/** Document Rules. The page, and the clamp that says how it must be built. */
export function DocumentRulesMark(props) {
  return (
    <ScoutMark {...props} ramps={['page', 'ink', 'gunmetal']}>
      {(m) => (
        <>
          <rect x="6" y="2.6" width="14.4" height="18.8" rx="1.1" fill={m.page} />
          <path d="M9 7 H17.8 M9 9.8 H17.8 M9 12.6 H14.6 M9 15.4 H16.4" stroke={m.ink} strokeWidth="1.05" strokeLinecap="round" />
          <rect x="2.6" y="5.4" width="4.6" height="13.2" rx="1.3" fill={m.gunmetal} />
          <rect x="3.9" y="10.4" width="2" height="3.2" rx="0.6" fill="#1e242a" />
        </>
      )}
    </ScoutMark>
  )
}

/** Sign Up a Customer. The pass you hand somebody on the way in. */
export function SignUpCustomerMark(props) {
  return (
    <ScoutMark {...props} ramps={['brass', 'brassDark', 'page']}>
      {(m) => (
        <>
          <rect x="2.6" y="6.6" width="18.8" height="11" rx="1.7" fill={m.brass} />
          <circle cx="6.8" cy="12.1" r="1.8" fill={m.page} />
          <path d="M11 10 H18.4 M11 14.2 H16.2" stroke={m.brassDark} strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </ScoutMark>
  )
}

/** Sales Performance. The gauge — one number, and whether it is good. */
export function SalesPerformanceMark(props) {
  return (
    <ScoutMark {...props} ramps={['brass', 'brassDark', 'page', 'signal']}>
      {(m) => (
        <>
          <path d="M2.8 17.4 A9.2 9.2 0 0 1 21.2 17.4 Z" fill={m.brass} />
          <path d="M5.6 17.4 A6.4 6.4 0 0 1 18.4 17.4 Z" fill={m.page} />
          <path d="M12 17.4 L17.4 10.6" fill="none" stroke={m.signal} strokeWidth="2.1" strokeLinecap="round" />
          <circle cx="12" cy="17.4" r="1.8" fill={m.brassDark} />
          <rect x="2.4" y="17.2" width="19.2" height="2.2" rx="1.1" fill={m.brassDark} />
        </>
      )}
    </ScoutMark>
  )
}

/** EOS. A cairn. EOS calls its quarterly priorities rocks, and a cairn is
    what a pile of rocks is FOR on a trail — the marker that says the route
    is real and somebody came this way on purpose. */
export function EosMark(props) {
  return (
    <ScoutMark {...props} ramps={['steel']}>
      {(m) => (
        <g fill={m.steel}>
          <ellipse cx="12" cy="19.6" rx="6.6" ry="2.7" />
          <ellipse cx="11.3" cy="15.3" rx="5.2" ry="2.5" />
          <ellipse cx="12.5" cy="11.4" rx="4" ry="2.2" />
          <ellipse cx="11.7" cy="7.8" rx="2.8" ry="1.9" />
          <ellipse cx="12.2" cy="4.8" rx="1.8" ry="1.4" />
        </g>
      )}
    </ScoutMark>
  )
}

/** Help. The guide, open. Field Notes is a closed book; this one is being
    read, which is the whole difference between a record and a manual. */
export function HelpMark(props) {
  return (
    <ScoutMark {...props} ramps={['page', 'kraft', 'ink']}>
      {(m) => (
        <>
          <path d="M12 6.6 C9.3 4.5 5.7 4.1 2.6 4.5 V18.9 C5.7 18.5 9.3 18.9 12 21 Z" fill={m.page} />
          <path d="M12 6.6 C14.7 4.5 18.3 4.1 21.4 4.5 V18.9 C18.3 18.5 14.7 18.9 12 21 Z" fill={m.kraft} />
          <path d="M5 8.6 C7 8.5 9 8.9 10.4 9.8 M5 12.4 C7 12.3 9 12.7 10.4 13.6" fill="none" stroke={m.ink} strokeWidth="0.95" strokeLinecap="round" opacity="0.75" />
        </>
      )}
    </ScoutMark>
  )
}

/** Video Library. The reel. */
export function VideoLibraryMark(props) {
  return (
    <ScoutMark {...props} ramps={['gunmetal', 'steel']}>
      {(m) => (
        <>
          {/* The clapper, hinged open. The first version was a reel whose
              cutouts were DARKER than the disc, which at 18px read as a
              bowling ball — holes only read as holes when they are lighter. */}
          <g transform="rotate(-10 3.5 8.8)">
            <rect x="2.6" y="4.4" width="18.8" height="4.4" rx="0.8" fill={m.steel} />
            <polygon points="3.9,8.8 5.6,8.8 7.1,4.4 5.4,4.4" fill={m.gunmetal} />
            <polygon points="8.5,8.8 10.2,8.8 11.7,4.4 10.0,4.4" fill={m.gunmetal} />
            <polygon points="13.1,8.8 14.8,8.8 16.3,4.4 14.6,4.4" fill={m.gunmetal} />
            <polygon points="17.7,8.8 19.4,8.8 20.9,4.4 19.2,4.4" fill={m.gunmetal} />
          </g>
          <rect x="2.6" y="9.2" width="18.8" height="11.2" rx="1.3" fill={m.gunmetal} />
          <polygon points="10.1,12.9 10.1,17.9 14.7,15.4" fill={m.steel} />
        </>
      )}
    </ScoutMark>
  )
}

/** Advanced Tools. Crossed tools — a toolbox is Jobs, a gear is Settings,
    so this one has to be the tools themselves. */
export function AdvancedToolsMark(props) {
  return (
    <ScoutMark {...props} ramps={['gunmetal', 'steel']}>
      {(m) => (
        <>
          <g transform="rotate(40 12 12)">
            <rect x="2.4" y="9.9" width="7.4" height="4.2" rx="1.7" fill={m.steel} />
            <rect x="9.4" y="11.3" width="9.4" height="1.4" rx="0.4" fill={m.gunmetal} />
            <rect x="18.2" y="10.8" width="2.6" height="2.4" rx="0.3" fill={m.gunmetal} />
          </g>
          <g transform="rotate(-40 12 12)">
            <rect x="3.4" y="10.8" width="12" height="2.4" rx="1.2" fill={m.gunmetal} />
            <path d="M15.2 9.3 H20.9 V11 H18.4 V13 H20.9 V14.7 H15.2 Z" fill={m.gunmetal} />
          </g>
        </>
      )}
    </ScoutMark>
  )
}

/** Data Console. The cabinet everything is actually filed in. */
export function DataConsoleMark(props) {
  return (
    <ScoutMark {...props} ramps={['gunmetal', 'steel']}>
      {(m) => (
        <>
          <rect x="2.8" y="2.8" width="18.4" height="18.4" rx="1.5" fill={m.gunmetal} />
          {[5, 10.2, 15.4].map((y) => (
            <g key={y}>
              <rect x="4.6" y={y} width="14.8" height="4" rx="0.7" fill={m.steel} />
              <rect x="10.2" y={y + 1.4} width="3.6" height="1.2" rx="0.6" fill="#1e242a" />
            </g>
          ))}
        </>
      )}
    </ScoutMark>
  )
}
