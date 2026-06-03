// Knowledge Card — Inventory
// Multi-location stock tracking with low-stock alerts and transfers.

export default {
  id: 'inventory',
  title: 'Inventory',
  category: 'Operations',
  icon: 'Boxes',
  route: '/inventory',

  summary:
    'Track stock levels across every location — main warehouse, satellite shops, every service truck — with low-stock alerts and one-click transfers. Knows what was pulled into which job so cost-of-goods is real.',

  replaces: ['Sortly', 'Quickbooks Inventory', 'spreadsheet stock tracking', 'tracking only the warehouse'],
  highlights: [
    'Multi-location stock',
    'Truck-level inventory',
    'Low-stock + reorder alerts',
    'Job-linked consumption',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'list',      baseDur: 4500, narration: 'Every product, every location. Warehouse, trucks, satellite shops — one screen.' },
      { id: 'low',       baseDur: 6500, narration: 'Six items below the reorder threshold. Freddy highlights them in red. One click — order placed.' },
      { id: 'transfer',  baseDur: 6500, narration: 'Tech needs parts on a job. Open Transfer. Pull from warehouse to truck twelve. Done.' },
      { id: 'consume',   baseDur: 6500, narration: 'When a job uses parts, inventory ticks down automatically. Cost-of-goods rolls into job costing.' },
      { id: 'count',     baseDur: 5500, narration: 'End of quarter, run a count. Scan barcodes on the phone, adjust variances, sign off.' },
    ],
  },

  setup: {
    overview:
      'Inventory ships ready. Add products, set reorder thresholds, register your locations (warehouse + trucks), and the consumption tracking kicks in automatically when techs use parts on jobs.',
    introBaseDur: 1200,
    introNarration: 'Add products, set thresholds, register locations. The rest happens automatically.',
    steps: [
      {
        icon: 'Package',
        title: 'Stock your catalog',
        body: 'Products & Services → make sure track_inventory is on for everything you stock. Add SKU, cost, vendor, reorder threshold.',
        narration: 'Stock your catalog. Turn on track inventory per product.',
        baseDur: 5000,
      },
      {
        icon: 'Warehouse',
        title: 'Register locations',
        body: 'Settings → Inventory Locations. Add your warehouse, satellite shops, and one entry per service truck.',
        narration: 'Register your locations — warehouse, shops, every service truck.',
        baseDur: 5000,
      },
      {
        icon: 'Bell',
        title: 'Set reorder thresholds',
        body: 'Per-product reorder point + reorder quantity. When stock drops below the point, alert fires.',
        narration: 'Set reorder thresholds. Alerts fire automatically.',
        baseDur: 4500,
      },
      {
        icon: 'Smartphone',
        title: 'Mobile barcode scanning',
        body: 'Field Scout can scan barcodes during counts. Quick way to bring physical and digital stock back in sync.',
        narration: 'Use Field Scout to scan barcodes during counts.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Multi-location stock tracking. Every product flagged track_inventory=true carries quantity_on_hand per inventory_location. Low-stock alerts fire when on_hand drops below reorder_point. Job consumption auto-deducts when techs add line items to a job.",

    howItWorks:
      "Backed by inventory_locations + inventory_stock + inventory_movements tables. inventory_stock keyed on (product_id, location_id) with current quantity. inventory_movements is the append-only ledger (purchase, transfer, consumption, count_adjustment). Job consumption fires via trigger when job_lines.qty_used updates. Reorder alerts via pg_cron nightly scan.",

    examples: [
      '50ft of 12-gauge wire on Truck 7 → tech uses 30ft on JOB-2147 → 20ft remaining, ledger entry recorded',
      'Reorder point 100 → on hand 87 → low-stock alert in inbox + Freddy nudge',
      'Quarter-end count: warehouse 4-ft LED tubes 200 expected → counted 188 → variance entry "-12 unknown"',
    ],

    gotchas: [
      'A product with track_inventory=false will go negative quietly — only tracked products surface alerts.',
      'Transfers between locations write TWO movements (one out, one in). Don\'t adjust the ledger manually unless you understand both sides.',
      'Count variance entries should have a reason — unexplained shrinkage compounds.',
    ],

    faqs: [
      {
        q: 'How does Inventory talk to the catalog?',
        a: 'Every inventory product is a Products & Services row with track_inventory=true. The catalog drives quotes/jobs; inventory drives stock.',
      },
      {
        q: 'Can techs see truck stock from Field Scout?',
        a: 'Yes — Field Scout shows on-hand for the assigned truck location, scoped to the products on their job.',
      },
    ],

    actions: {
      open: { route: '/inventory', label: 'Open Inventory' },
      products: { route: '/products', label: 'Products & Services' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
