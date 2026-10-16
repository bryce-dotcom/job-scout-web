// Which payment methods an invoice email may advertise.
//
// This used to be worked out in the browser and posted to send-invoice. That
// only worked because every employee could read payment_config — the same
// reason a field tech could read the company's Stripe secret key. Once that
// row became admin-only (20261016210000), a field tech sending an invoice
// from FieldScout would have advertised nothing at all, and the customer
// would have received an email with no way to pay.
//
// So the server works it out instead, from its own service-role read. The
// browser's list is still accepted and still wins when it is non-empty, so
// an admin's send is byte-for-byte what it was before this change.
//
// TWIN: src/lib/invoiceSend.js paymentMethodNames(). The two are pinned
// against each other in src/lib/invoiceSend.test.js — if they drift, that
// test fails.

export type PaymentConfig = Record<string, unknown> | null | undefined;

// Mirrors WALLETS in src/lib/wallets.js, in the same order: a wallet counts
// when it is enabled AND a handle survives normalising. An enabled wallet
// whose handle is only "@" or a bare venmo.com/ gives the customer a button
// that cannot be paid, so enabledWalletsFrom() drops it and so does this.
const WALLETS = [
  {
    method: 'Venmo',
    enabled: 'venmo_enabled',
    handle: 'venmo_handle',
    // normalizeVenmoHandle, src/lib/venmo.js
    normalize: (s: string) => s.trim()
      .replace(/^https?:\/\/(www\.)?venmo\.com\//i, '')
      .replace(/^venmo\.com\//i, '')
      .replace(/^u\//i, '')
      .replace(/[?#].*$/, '')
      .replace(/^@+/, '')
      .replace(/\s+/g, ''),
  },
  {
    method: 'Cash App',
    enabled: 'cashapp_enabled',
    handle: 'cashapp_handle',
    // normalizeCashtag, src/lib/wallets.js
    normalize: (s: string) => s.trim()
      .replace(/^https?:\/\/(www\.)?cash\.app\//i, '')
      .replace(/^cash\.app\//i, '')
      .replace(/[?#].*$/, '')
      .replace(/\/.*$/, '')
      .replace(/^\$+/, '')
      .replace(/\s+/g, ''),
  },
  {
    method: 'Zelle',
    enabled: 'zelle_enabled',
    handle: 'zelle_handle',
    // normalizeZelleHandle — an email or a phone number, so only trimmed
    normalize: (s: string) => s.trim(),
  },
] as const;

export function paymentMethodNames(pc: PaymentConfig): string[] {
  if (!pc || typeof pc !== 'object') return [];
  const cfg = pc as Record<string, unknown>;
  const out: string[] = [];
  if (cfg.stripe_enabled) out.push('Credit Card');
  if (cfg.bank_transfer_enabled) out.push('ACH / Bank Transfer');
  if (cfg.paypal_enabled) out.push('PayPal');
  for (const w of WALLETS) {
    const handle = w.normalize(String(cfg[w.handle] ?? ''));
    if (cfg[w.enabled] && handle) out.push(w.method);
  }
  return out;
}

// payment_config is stored as a JSON string in settings.value.
export function parsePaymentConfig(value: unknown): PaymentConfig {
  if (!value) return null;
  if (typeof value === 'object') return value as PaymentConfig;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // An unreadable config advertises nothing — it never throws into a send.
    return null;
  }
}
