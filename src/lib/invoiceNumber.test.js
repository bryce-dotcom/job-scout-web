import { describe, it, expect, vi } from 'vitest'
import { nextInvoiceNumber, formatInvoiceNumber, timestampInvoiceNumber } from './invoiceNumber'

// Christopher, 7d03fcec: "Having a simple number instead of a complicated
// alphabetical one would make communicating with clients their invoice numbers
// easier." He was reading INV-MUOH7H6Y down the phone.
//
// The important property is not the format — it is that a numbering failure
// never blocks an invoice. A field tech standing in a driveway cannot be told
// "could not allocate a number".

const rpcOk = (n) => ({ rpc: vi.fn().mockResolvedValue({ data: n, error: null }) })

describe('formatting', () => {
  it('reads as a plain number', () => {
    expect(formatInvoiceNumber(1001)).toBe('INV-1001')
    expect(formatInvoiceNumber(1042)).toBe('INV-1042')
  })

  it('keeps the deposit marker, so the type is still visible', () => {
    expect(formatInvoiceNumber(1001, { deposit: true })).toBe('INV-DEP-1001')
  })
})

describe('allocation', () => {
  it('asks the database and formats what it gets', async () => {
    const sb = rpcOk(1007)
    expect(await nextInvoiceNumber(sb, 3)).toBe('INV-1007')
    expect(sb.rpc).toHaveBeenCalledWith('next_invoice_number', { p_company_id: 3 })
  })

  it('passes the deposit flag through to the format, not to the database', async () => {
    const sb = rpcOk(1008)
    expect(await nextInvoiceNumber(sb, 3, { deposit: true })).toBe('INV-DEP-1008')
    expect(sb.rpc).toHaveBeenCalledWith('next_invoice_number', { p_company_id: 3 })
  })
})

describe('a numbering failure never blocks an invoice', () => {
  const legacy = /^INV-(DEP-)?[0-9A-Z]{6,}$/

  it('falls back to the timestamp shape when the rpc errors', async () => {
    const sb = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) }
    const got = await nextInvoiceNumber(sb, 3)
    expect(got).toMatch(legacy)
  })

  it('falls back when the rpc throws outright (offline)', async () => {
    const sb = { rpc: vi.fn().mockRejectedValue(new Error('network')) }
    expect(await nextInvoiceNumber(sb, 3)).toMatch(legacy)
  })

  it('falls back on a nonsense number rather than inventing INV-NaN', async () => {
    for (const bad of [null, undefined, 0, -1, 'abc', {}]) {
      const sb = rpcOk(bad)
      const got = await nextInvoiceNumber(sb, 3)
      expect(got).toMatch(legacy)
      expect(got).not.toContain('NaN')
      expect(got).not.toContain('null')
    }
  })

  it('keeps the deposit marker even on the fallback path', async () => {
    const sb = { rpc: vi.fn().mockRejectedValue(new Error('network')) }
    expect(await nextInvoiceNumber(sb, 3, { deposit: true })).toMatch(/^INV-DEP-/)
  })

  it('the legacy shape is still well-formed', () => {
    expect(timestampInvoiceNumber()).toMatch(legacy)
    expect(timestampInvoiceNumber({ deposit: true })).toMatch(/^INV-DEP-/)
  })
})
