// The materials every Job Scout mark is made of.
//
// Bryce, 2026-10-23, after being shown a 2px-stroke outline next to the
// CampFire flame: "your drawing sucks… build all the rest of the menu with
// coloured icons that match the style."
//
// THE PROBLEM WITH FORTY-FIVE COLOURED ICONS, and why this file exists.
//
// The fire works because it is the ONE warm thing in a column of muted grey
// line icons. Make all forty-five full-colour and nothing stands out, because
// everything does — the sidebar becomes confetti and the eye has nowhere to
// land. What keeps a large set coherent is not restraint in the colour count,
// it is MATERIAL: every mark is made of something, the somethings come from
// one world, and a section shares a material. Brass looks and measures. Wood
// holds stock. Kraft is what you write on. Steel is the work. Canvas is
// people. Enamel green is money.
//
// So a mark never picks a colour. It picks a material, and the material
// decides the colour. That is the whole rule, and it is why adding the
// forty-sixth icon later will not drift.
//
// HOW A RAMP IS SHAPED. Light comes from above, always, so every ramp runs
// top (offset 0) to bottom (offset 1). A cylinder is not a flat fill with a
// darker line under it: it is dark at the top edge where the surface rolls
// away, bright in a band just below that, then falling to its deepest value
// at the bottom. Skipping the top-edge darkening is what made the first
// spyglass look like a sticker.
//
// Ramps are plain data with no React in them on purpose — ScoutMark renders
// them, and a test can read them.

/**
 * Each ramp is a list of [offset, colour] stops running top to bottom.
 * `x` tilts the gradient axis slightly off vertical where a material reads
 * better lit from the upper left (wood grain, paper); 0 is straight down.
 */
export const RAMPS = {
  // Optics, instruments, anything that looks or measures. The Lookout.
  brass: { x: 0, stops: [[0, '#b8862b'], [0.2, '#fbe7a8'], [0.45, '#dca62c'], [0.75, '#8f5c14'], [1, '#53330a']] },
  // Brass in shadow — flanges, rims, the parts that step back.
  brassDark: { x: 0, stops: [[0, '#8a6320'], [0.22, '#e3c173'], [0.5, '#a87a1e'], [1, '#3d2607']] },
  // The one cold material in the set, so it only ever appears as a lens or a
  // window. Used sparingly it tells you where to look.
  glass: { x: 0.4, stops: [[0, '#eafaff'], [0.45, '#7fc8e8'], [1, '#1e5f7e']] },

  // Drawn lines: trails, routes, handwriting. Sepia, never black — black on
  // cream reads as a UI stroke, sepia reads as ink.
  ink: { x: 0.25, stops: [[0, '#9c7542'], [1, '#4f3820']] },
  // Paper you write on and keep. Records, notes, documents.
  kraft: { x: 0.3, stops: [[0, '#e8cb97'], [0.45, '#c79a5c'], [1, '#9a6a35']] },
  // The pale label or page laid on top of kraft.
  page: { x: 0.3, stops: [[0, '#fdf6e6'], [1, '#e7d7b4']] },

  // Crates, shelving, anything that holds stock.
  wood: { x: 0.25, stops: [[0, '#e4c391'], [0.45, '#b8864c'], [1, '#6b4423']] },
  // The smaller stock behind the hero crate — same timber, stepped back so
  // the stack reads as depth rather than as five equal boxes.
  woodDark: { x: 0.25, stops: [[0, '#c49e68'], [0.4, '#966c3a'], [1, '#53351a']] },

  // Tools and the work itself. Cool, so it never competes with the warm half
  // of the set for attention.
  steel: { x: 0.2, stops: [[0, '#d7dee4'], [0.4, '#8c99a4'], [1, '#414b55']] },
  // The safety accent that sits on steel — a handle, a stripe, a hard hat.
  hiVis: { x: 0, stops: [[0, '#ffd166'], [0.5, '#f0a500'], [1, '#b06f00']] },

  // People: packs, tents, bags, the things somebody carries.
  canvas: { x: 0.25, stops: [[0, '#e3d6b8'], [0.45, '#bda87e'], [1, '#7d6c47']] },
  // Straps and trim on canvas.
  leather: { x: 0.25, stops: [[0, '#b07c4c'], [0.5, '#8a5a34'], [1, '#4c3019']] },

  // Money. Enamel green reads as a ledger and a bank without using a dollar
  // sign, which is what four separate money items were all doing before.
  enamel: { x: 0.2, stops: [[0, '#8fb98a'], [0.45, '#4f8057'], [1, '#27432e']] },
  // Coin and fittings beside enamel.
  copper: { x: 0.2, stops: [[0, '#f0bb8a'], [0.45, '#c87b43'], [1, '#79421d']] },

  // Settings, diagnostics, the machinery under the floor.
  gunmetal: { x: 0.2, stops: [[0, '#aab4bf'], [0.45, '#67727e'], [1, '#2f3740']] },

  // Signals. Used only where something means stop, done, or here — the X on
  // the trail, an alert dot. Never as a surface.
  signal: { x: 0, stops: [[0, '#f05252'], [0.45, '#dc2626'], [1, '#7f1d1d']] },
}

/**
 * The material each menu section is made of. A new item inherits its
 * section's material unless it has a reason not to, which is what stops the
 * set drifting as the menu grows.
 */
export const SECTION_MATERIAL = {
  TOP: 'brass',
  SALES: 'canvas',
  OPERATIONS: 'steel',
  SUPPLY: 'wood',
  FINANCIAL: 'enamel',
  TEAM: 'canvas',
  ADMIN: 'gunmetal',
  MANAGEMENT: 'brass',
  SUPPORT: 'kraft',
  DEV: 'gunmetal',
}
