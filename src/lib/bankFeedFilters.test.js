import { describe, it, expect } from 'vitest'
import { isVenmoTransaction, isVirtualAccountFilter, VENMO_FILTER } from './bankFeedFilters'

describe('isVenmoTransaction — the Venmo option in the account filter', () => {
  it('catches a cash-out by its raw bank descriptor when Plaid gives no merchant', () => {
    expect(isVenmoTransaction({ name: 'VENMO CASHOUT 250915', merchant_name: null })).toBe(true)
  })
  it('catches a recognized Venmo merchant', () => {
    expect(isVenmoTransaction({ name: 'Purchase', merchant_name: 'Venmo' })).toBe(true)
    expect(isVenmoTransaction({ name: 'VENMO PAYMENT 1234567', merchant_name: 'Venmo' })).toBe(true)
  })
  it('is case-insensitive', () => {
    expect(isVenmoTransaction({ name: 'venmo *john smith' })).toBe(true)
  })
  it('does not match a merchant whose name merely contains the letters', () => {
    expect(isVenmoTransaction({ name: 'ENVENMOTORS LLC' })).toBe(false)
  })
  it('leaves ordinary bank rows alone', () => {
    expect(isVenmoTransaction({ name: 'HOME DEPOT #4412', merchant_name: 'The Home Depot' })).toBe(false)
    expect(isVenmoTransaction({})).toBe(false)
    expect(isVenmoTransaction(null)).toBe(false)
  })
})

describe('isVirtualAccountFilter', () => {
  it('recognizes the Venmo option and nothing numeric', () => {
    expect(isVirtualAccountFilter(VENMO_FILTER)).toBe(true)
    expect(isVirtualAccountFilter('all')).toBe(false)
    expect(isVirtualAccountFilter('12')).toBe(false)
  })
})
