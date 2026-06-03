// Knowledge Card — Products & Services
// The catalog that drives quotes, jobs, and inventory.

export default {
  id: 'products-services',
  title: 'Products & Services',
  category: 'Operations',
  icon: 'Package',
  route: '/products',

  summary:
    "The catalog that drives every quote, every job, every invoice. SKU-level pricing, cost, descriptions, BOM/kit assembly. Inventory and accounting tie back to it.",

  replaces: ['HousecallPro price book', 'Jobber pricing', 'ServiceTitan price book', 'static spreadsheet'],
  highlights: [
    'BOMs / kits',
    'Cost vs price tracking',
    'Per-customer overrides',
    'Image library',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'catalog',  baseDur: 4500, narration: 'Your full catalog. Every product, every service, with cost, price, image, vendor.' },
      { id: 'edit',     baseDur: 6500, narration: 'Edit a product. Cost two dollars eighty cents, price six bucks. Margin shows live. Adjust pricing without guessing.' },
      { id: 'bom',      baseDur: 6500, narration: 'Build a kit. The "Bay LED Retrofit" kit bundles a fixture, drivers, brackets, and wire — one click adds the whole bundle to a quote.' },
      { id: 'override', baseDur: 6500, narration: 'Per-customer price overrides. Big accounts get the volume rate. Surfaces automatically on their quotes.' },
      { id: 'use',      baseDur: 5500, narration: 'Quote builder pulls right from here. Type the SKU, line drops in with the right cost and price.' },
    ],
  },

  setup: {
    overview:
      "Products & Services is the spine of pricing. Import from a CSV, an existing HCP price book, or build by hand. Once it's seeded, every quote, job, and invoice flows from it.",
    introBaseDur: 1200,
    introNarration: 'Seed the catalog once. Quotes, jobs, invoices all flow from it.',
    steps: [
      {
        icon: 'Upload',
        title: 'Import or hand-build',
        body: 'Bulk import from CSV or paste from your existing price book. Each row: SKU, name, description, unit cost, unit price, category, vendor.',
        narration: 'Import from CSV or hand-build. SKU, cost, price, vendor.',
        baseDur: 5000,
      },
      {
        icon: 'Image',
        title: 'Add product images',
        body: 'Drop a photo per product. Images flow into quotes, customer portal, and proposal PDFs — buyers want to see what they\'re getting.',
        narration: 'Add product images. Buyers want to see what they are getting.',
        baseDur: 5000,
      },
      {
        icon: 'Layers',
        title: 'Bundle into kits',
        body: 'Build BOMs / kits — one line item that resolves into N components. Pricing rolls up. Saves time on quotes with repeat package deals.',
        narration: 'Bundle into kits. One line, multiple components.',
        baseDur: 5500,
      },
      {
        icon: 'UserCog',
        title: 'Per-customer overrides',
        body: 'On the Customer page → Pricing tab, override prices for big accounts. Their quotes auto-pull the overridden numbers.',
        narration: 'Override prices per customer. Big accounts get their rate.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The catalog of everything you sell. Each row carries a SKU, name, description, unit cost, unit price, category, vendor, image. Optional: track_inventory flag, BOM/kit components, per-customer price overrides.",

    howItWorks:
      "products table (multi-tenant, company_id scoped). product_components for BOM assembly (parent product → component products with quantities). customer_pricing for per-customer overrides. Estimates + jobs + invoices all denormalize the snapshot at line-creation time so historical records don't drift when you bump a price.",

    examples: [
      'New product → 4-ft LED tube → cost $4.80, price $14, image, category Lighting',
      'Kit: "Bay LED Retrofit" → 1 fixture + 4 tubes + 2 brackets + 25ft wire, total cost auto-rolls',
      'Northbridge gets 18% off on all LED — set once, applies to every quote going forward',
    ],

    gotchas: [
      'Editing a product price does NOT change old quotes/invoices — they snapshot pricing at creation. Intentional, but surprises some users.',
      'BOM components must themselves be products. You can\'t nest a kit-of-kits two levels deep.',
      'Per-customer overrides apply to the unit price only. Cost stays at the catalog cost so margin math stays honest.',
    ],

    faqs: [
      {
        q: 'How do I import from HousecallPro?',
        a: 'Data Console → HCP Import → Products. Maps HCP fields to Job Scout fields. Re-runnable safely (source_system traceability).',
      },
      {
        q: 'Can a service have inventory?',
        a: 'No — track_inventory only applies to physical products. Services (labor by the hour, retrofit consultation) skip the stock table.',
      },
    ],

    actions: {
      open: { route: '/products', label: 'Open Products & Services' },
      inventory: { route: '/inventory', label: 'Open Inventory' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
