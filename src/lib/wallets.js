// Peer-to-peer wallets as payment options: Venmo, Cash App, Zelle.
//
// None of these has a processor behind it. The company publishes a handle,
// the customer sends money from their own app, and someone records the
// payment on the invoice (or in FieldScout) when it lands. One definition
// per wallet here drives Settings → My Money, the customer portal, invoice
// emails, FieldScout's Collect Payment sheet, and the Books bank-feed filter.
import { normalizeVenmoHandle, venmoPayUrl } from './venmo'

// Fees the WALLET takes from the business when the customer pays a business
// profile. Personal profiles receive the gross (and the customer must send
// as friends & family). Published rates as of 2026; used only to reconcile
// payouts and estimate balances, never to charge anyone.
const VENMO_BUSINESS_FEE = { pct: 0.019, fixed: 0.10 }
const CASHAPP_BUSINESS_FEE = { pct: 0.0275, fixed: 0 }

export function normalizeCashtag(raw) {
  if (!raw) return ''
  let s = String(raw).trim()
  s = s.replace(/^https?:\/\/(www\.)?cash\.app\//i, '')
  s = s.replace(/^cash\.app\//i, '')
  s = s.replace(/[?#].*$/, '')
  s = s.replace(/\/.*$/, '')
  s = s.replace(/^\$+/, '')
  s = s.replace(/\s+/g, '')
  return s
}

export function cashAppPayUrl({ handle, amount } = {}) {
  const h = normalizeCashtag(handle)
  if (!h) return null
  const amt = parseFloat(amount)
  const suffix = Number.isFinite(amt) && amt > 0 ? `/${amt.toFixed(2)}` : ''
  return `https://cash.app/$${encodeURIComponent(h)}${suffix}`
}

// Zelle is an email or phone number; keep it readable, just trim.
export function normalizeZelleHandle(raw) {
  return raw ? String(raw).trim() : ''
}

export const WALLETS = [
  {
    id: 'venmo',
    label: 'Venmo',
    method: 'Venmo',          // payments.method value
    prefix: '@',
    color: '#008CFF',
    keys: { enabled: 'venmo_enabled', handle: 'venmo_handle', instructions: 'venmo_instructions', profile: 'venmo_profile' },
    handleLabel: 'Venmo handle',
    handlePlaceholder: 'YourBusiness',
    handleHelp: 'Find yours in the Venmo app under Me → your username. Pasting a venmo.com link works too.',
    normalize: normalizeVenmoHandle,
    payUrl: venmoPayUrl,
    feedRe: /\bvenmo\b/i,
    hasBalance: true,
    hasProfile: true,
    businessFee: VENMO_BUSINESS_FEE,
  },
  {
    id: 'cashapp',
    label: 'Cash App',
    method: 'Cash App',
    prefix: '$',
    color: '#00D632',
    keys: { enabled: 'cashapp_enabled', handle: 'cashapp_handle', instructions: 'cashapp_instructions', profile: 'cashapp_profile' },
    handleLabel: 'Cashtag',
    handlePlaceholder: 'YourBusiness',
    handleHelp: 'Your $Cashtag from the Cash App profile screen. Pasting a cash.app link works too.',
    normalize: normalizeCashtag,
    payUrl: cashAppPayUrl,
    feedRe: /cash\s?app|sq\s?\*\s?cash/i,
    hasBalance: true,
    hasProfile: true,
    businessFee: CASHAPP_BUSINESS_FEE,
  },
  {
    id: 'zelle',
    label: 'Zelle',
    method: 'Zelle',
    prefix: '',
    color: '#6D1ED4',
    keys: { enabled: 'zelle_enabled', handle: 'zelle_handle', instructions: 'zelle_instructions', profile: 'zelle_profile' },
    handleLabel: 'Zelle email or phone',
    handlePlaceholder: 'payments@yourcompany.com',
    handleHelp: 'The email or mobile number enrolled with Zelle at your bank. Money lands straight in that bank account.',
    normalize: normalizeZelleHandle,
    payUrl: null,             // Zelle has no pay link; the customer uses their bank app
    feedRe: /\bzelle\b/i,
    hasBalance: false,        // no wallet balance — it is already in the bank
    hasProfile: false,
    businessFee: null,
  },
]

export const walletById = (id) => WALLETS.find(w => w.id === id) || null
export const walletByMethod = (method) =>
  WALLETS.find(w => w.method.toLowerCase() === String(method || '').toLowerCase()) || null

// A manual account named "Venmo", "Cash App balance", etc. belongs to that wallet.
export function walletForAccountName(name) {
  const n = String(name || '').toLowerCase()
  if (!n) return null
  return WALLETS.find(w => w.hasBalance && n.includes(w.label.toLowerCase())) || null
}

export function displayHandle(wallet, handle) {
  return handle ? `${wallet.prefix}${handle}` : ''
}

// Everything the customer-facing surfaces need, from a raw payment_config.
// Only wallets that are enabled AND have a handle are returned.
export function enabledWalletsFrom(cfg) {
  if (!cfg) return []
  return WALLETS.flatMap(w => {
    const enabled = !!cfg[w.keys.enabled]
    const handle = w.normalize(cfg[w.keys.handle] || '')
    if (!enabled || !handle) return []
    return [{
      ...w,
      handle,
      instructions: cfg[w.keys.instructions] || '',
      profile: w.hasProfile ? (cfg[w.keys.profile] === 'personal' ? 'personal' : 'business') : null,
    }]
  })
}

// The safe subset of payment_config to hand to the public portal (no secrets
// exist for wallets, but keep the shape explicit like the other providers).
export function walletPortalFields(cfg) {
  const out = {}
  for (const w of WALLETS) {
    const handle = w.normalize(cfg?.[w.keys.handle] || '')
    out[w.keys.enabled] = !!(cfg?.[w.keys.enabled] && handle)
    out[w.keys.handle] = handle || null
    out[w.keys.instructions] = cfg?.[w.keys.instructions] || null
    out[w.keys.profile] = w.hasProfile ? (cfg?.[w.keys.profile] === 'personal' ? 'personal' : 'business') : null
  }
  return out
}

// What the business actually receives for a gross payment.
export function walletNetAmount(wallet, amount, profile) {
  const amt = parseFloat(amount) || 0
  if (!wallet?.businessFee || profile === 'personal') return Math.round(amt * 100) / 100
  const net = amt * (1 - wallet.businessFee.pct) - wallet.businessFee.fixed
  return Math.max(0, Math.round(net * 100) / 100)
}

// One sentence the customer should read before sending.
export function walletGuidance(wallet, profile) {
  if (wallet.id === 'zelle') return 'No fee either way. Send from your bank app to the email or phone above.'
  if (profile === 'personal') {
    return `No fee — please send as "friends and family" (not goods & services) so ${wallet.label} doesn't take a cut.`
  }
  return `No fee to you. ${wallet.label} charges the business a small fee on business-profile payments; we cover it.`
}

// Body of the text a tech sends from FieldScout.
export function walletSmsBody(wallet, { customerName, handle, amount, note, profile } = {}) {
  const amt = parseFloat(amount)
  const parts = [`Hi ${customerName || 'there'} — you can pay by ${wallet.label} to ${displayHandle(wallet, handle)}`]
  if (Number.isFinite(amt) && amt > 0) parts.push(`Amount: $${amt.toFixed(2)}`)
  if (note) parts.push(`Please put "${note}" in the ${wallet.id === 'zelle' ? 'memo' : 'note'}.`)
  if (profile === 'personal' && wallet.hasProfile) parts.push('Please send as friends & family.')
  const url = wallet.payUrl ? wallet.payUrl({ handle, amount, note }) : null
  if (url) parts.push(url)
  return parts.join('\n')
}
