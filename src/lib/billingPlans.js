// JobScout subscription plan definitions.
//
// One source of truth — used by the signup flow, the Settings billing
// panel, and the Stripe products setup script. Update prices here, run
// scripts/setup-stripe-products.cjs to push to Stripe.

export const PLANS = [
  {
    id: 'field_crew',
    name: 'Field Crew',
    tagline: 'Solo operator or 2-3 person crew',
    monthly_price: 99,
    annual_price: 990,         // 2 months free
    user_cap: 3,
    agent_cap: 1,
    storage_gb: 5,
    features: [
      'Up to 3 users',
      '1 AI agent included',
      'Customers, Leads, Pipeline',
      'Quotes, Jobs, Job Board',
      'Field Scout, Time Clock, MyPay',
      'Invoices + Payments',
      'Books with Plaid + Stripe sync',
      'Customer Portal',
      '5 GB document storage',
      'Email support',
    ],
  },
  {
    id: 'field_pro',
    name: 'Field Pro',
    tagline: 'Established business, 5-10 employees',
    monthly_price: 249,
    annual_price: 2490,
    user_cap: 10,
    agent_cap: 5,
    storage_gb: 25,
    popular: true,
    features: [
      'Up to 10 users',
      '5 AI agents included',
      'Everything in Field Crew, plus:',
      'Lighting Audits + Utility Rebates',
      'Fleet management',
      'Email campaigns (Conrad)',
      'Quality verification (Victor)',
      'Lead Setter + Routes',
      'Payment Plans + Refunds',
      '25 GB storage',
      'Priority email + chat support',
    ],
  },
  {
    id: 'field_boss',
    name: 'Field Boss',
    tagline: 'Multi-crew, multi-BU operation',
    monthly_price: 599,
    annual_price: 5990,
    user_cap: null,            // unlimited
    agent_cap: null,           // all 19 agents + future
    storage_gb: 100,
    features: [
      'Unlimited users',
      'All AI agents + early access to new ones',
      'Everything in Field Pro, plus:',
      'Payroll runs + paystubs',
      'PTO + HR workflow',
      'Reports + tax exports',
      'Multi-business-unit support',
      'Custom domain (e.g., quotes.acme.com)',
      'White-label customer portal + emails',
      'Data Console (admin)',
      '100 GB storage',
      'Phone support + onboarding session',
    ],
  },
]

export const ADDONS = [
  { id: 'extra_agent',    name: 'Extra AI Agent',     price: 19, unit: 'each / month' },
  { id: 'extra_user',     name: 'Extra User',         price: 12, unit: 'each / month' },
  { id: 'extra_storage',  name: 'Extra 25 GB',        price: 15, unit: 'each / month' },
]

export const TRIAL_DAYS = 30

// Returns the plan record for a given id; falls back to Crew if unknown.
export function planById(id) {
  return PLANS.find(p => p.id === id) || PLANS[0]
}

export const DEFAULT_PLAN_ID = 'field_crew'
