import { describe, it, expect } from 'vitest'
import {
  WALLETS, walletById, walletByMethod, walletForAccountName, enabledWalletsFrom, walletPortalFields,
  walletNetAmount, walletGuidance, walletSmsBody, normalizeCashtag, cashAppPayUrl, displayHandle,
} from './wallets'

describe('cashtags', () => {
  it('normalizes whatever gets pasted', () => {
    expect(normalizeCashtag('$Acme')).toBe('Acme')
    expect(normalizeCashtag('https://cash.app/$Acme')).toBe('Acme')
    expect(normalizeCashtag('cash.app/$Acme/25?x=1')).toBe('Acme')
    expect(normalizeCashtag('')).toBe('')
  })
  it('builds the pay link with the amount in the path', () => {
    expect(cashAppPayUrl({ handle: '$Acme', amount: '42.5' })).toBe('https://cash.app/$Acme/42.50')
    expect(cashAppPayUrl({ handle: 'Acme' })).toBe('https://cash.app/$Acme')
    expect(cashAppPayUrl({ handle: '' })).toBe(null)
  })
})

describe('wallet lookup', () => {
  it('finds wallets by id, by payments.method, and by manual account name', () => {
    expect(walletById('venmo').label).toBe('Venmo')
    expect(walletByMethod('cash app').id).toBe('cashapp')
    expect(walletByMethod('Check')).toBe(null)
    expect(walletForAccountName('Venmo').id).toBe('venmo')
    expect(walletForAccountName('Cash App balance').id).toBe('cashapp')
    // Zelle has no balance to track, so an account named Zelle is not a wallet account.
    expect(walletForAccountName('Zelle')).toBe(null)
    expect(walletForAccountName('Checking')).toBe(null)
  })
  it('shows handles with the right prefix', () => {
    expect(displayHandle(walletById('venmo'), 'Acme')).toBe('@Acme')
    expect(displayHandle(walletById('cashapp'), 'Acme')).toBe('$Acme')
    expect(displayHandle(walletById('zelle'), 'pay@acme.com')).toBe('pay@acme.com')
  })
})

describe('enabledWalletsFrom — what customer surfaces get', () => {
  it('returns only wallets that are on AND have a handle, with a profile', () => {
    const cfg = {
      venmo_enabled: true, venmo_handle: '@Acme', venmo_profile: 'personal',
      cashapp_enabled: true, cashapp_handle: '',
      zelle_enabled: false, zelle_handle: 'pay@acme.com',
    }
    const on = enabledWalletsFrom(cfg)
    expect(on.map(w => w.id)).toEqual(['venmo'])
    expect(on[0].handle).toBe('Acme')
    expect(on[0].profile).toBe('personal')
  })
  it('defaults the profile to business and Zelle to no profile', () => {
    const on = enabledWalletsFrom({ venmo_enabled: true, venmo_handle: 'A', zelle_enabled: true, zelle_handle: 'z@a.com' })
    expect(on.find(w => w.id === 'venmo').profile).toBe('business')
    expect(on.find(w => w.id === 'zelle').profile).toBe(null)
  })
  it('portal fields carry every wallet key explicitly', () => {
    const f = walletPortalFields({ venmo_enabled: true, venmo_handle: 'https://venmo.com/u/Acme' })
    expect(f.venmo_enabled).toBe(true)
    expect(f.venmo_handle).toBe('Acme')
    expect(f.cashapp_enabled).toBe(false)
    expect(f.zelle_handle).toBe(null)
    expect(Object.keys(f)).toHaveLength(WALLETS.length * 4)
  })
})

describe('fees and guidance', () => {
  it('nets out the business-profile fee, and nothing for personal or Zelle', () => {
    expect(walletNetAmount(walletById('venmo'), 100, 'business')).toBe(98.0)
    expect(walletNetAmount(walletById('venmo'), 100, 'personal')).toBe(100)
    expect(walletNetAmount(walletById('cashapp'), 100, 'business')).toBe(97.25)
    expect(walletNetAmount(walletById('zelle'), 100, 'business')).toBe(100)
  })
  it('tells personal-profile customers to send as friends & family', () => {
    expect(walletGuidance(walletById('venmo'), 'personal')).toMatch(/friends and family/)
    expect(walletGuidance(walletById('venmo'), 'business')).toMatch(/No fee to you/)
    expect(walletGuidance(walletById('zelle'))).toMatch(/bank app/)
  })
  it('sms body includes handle, amount, note, and a link when the wallet has one', () => {
    const body = walletSmsBody(walletById('cashapp'), { customerName: 'Dana', handle: 'Acme', amount: 20, note: 'INV-9' })
    expect(body).toContain('$Acme')
    expect(body).toContain('$20.00')
    expect(body).toContain('https://cash.app/$Acme/20.00')
    const zelle = walletSmsBody(walletById('zelle'), { handle: 'z@a.com', amount: 20, note: 'INV-9' })
    expect(zelle).toContain('memo')
    expect(zelle).not.toContain('http')
  })
})
