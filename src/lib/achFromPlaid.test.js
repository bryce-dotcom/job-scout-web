import { describe, it, expect } from 'vitest'
import { pickAchAccount, achSettingsFromPlaidAccount, describeAchAccount } from './achFromPlaid'

const macu = { item_id: 'i1', account_id: 'a1', institution_name: 'Mountain America Credit Union', name: 'Business Checking', mask: '1234', subtype: 'checking', routing: '324079555', account: '000111222333' }
const savings = { ...macu, account_id: 'a2', name: 'Business Savings', mask: '9876', subtype: 'savings', account: '000999888777' }
const card = { ...macu, account_id: 'a3', name: 'Rewards Visa', subtype: 'credit card', routing: '', account: '' }

describe('choosing the payroll account from the linked bank', () => {
  it('prefers checking over savings, and ignores anything without ACH numbers', () => {
    expect(pickAchAccount([savings, card, macu]).account_id).toBe('a1')
    expect(pickAchAccount([card])).toBeNull()
    expect(pickAchAccount([])).toBeNull()
  })
  it('among checking accounts, prefers one named operating, business or payroll', () => {
    const personal = { ...macu, account_id: 'a4', name: 'Everyday Checking' }
    expect(pickAchAccount([personal, macu]).account_id).toBe('a1')
  })
})

describe('mapping to the ACH settings', () => {
  it('fills bank name, routing and offset account, and nothing else', () => {
    expect(achSettingsFromPlaidAccount(macu)).toEqual({
      destinationName: 'Mountain America Credit', odfiRouting: '324079555', offsetAccount: '000111222333',
      offsetAccountType: 'checking', linkedAccountId: 'a1', linkedMask: '1234',
    })
    expect(achSettingsFromPlaidAccount(savings).offsetAccountType).toBe('savings')
    expect(achSettingsFromPlaidAccount(null)).toEqual({})
  })
  it('describes an account for a button', () => {
    expect(describeAchAccount(macu)).toBe('Mountain America Credit Union ••••1234 (checking)')
  })
})
