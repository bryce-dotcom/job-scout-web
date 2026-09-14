import { describe, it, expect } from 'vitest'
import { fieldJobHeading } from './jobHeading'

const janPro = { name: 'Jan Pro' }

describe('leading with the site, not the customer', () => {
  it('drops a customer-name prefix and keeps the rest', () => {
    expect(fieldJobHeading({ job_title: 'Jan Pro - BHB Structural ', customer: janPro, job_address: '2766 S Main St, SLC' }))
      .toMatchObject({ title: 'BHB Structural', subtitle: 'Jan Pro · 2766 S Main St, SLC' })
    expect(fieldJobHeading({ job_title: 'Jan Pro Signature Real Estate  September  Exterior Cleaning ', customer: janPro }).title)
      .toBe('Signature Real Estate  September  Exterior Cleaning')
    expect(fieldJobHeading({ job_title: 'jan pro: In/Out Corporate Office', customer: janPro }).title)
      .toBe('In/Out Corporate Office')
  })
  it('leaves a title that already leads with the site alone', () => {
    expect(fieldJobHeading({ job_title: 'Sun Belt Exterior Windows ', customer: janPro, job_address: '8238 S 700 E, Sandy' }))
      .toMatchObject({ title: 'Sun Belt Exterior Windows', subtitle: 'Jan Pro · 8238 S 700 E, Sandy' })
  })
  it('does not empty a title that is only the customer name', () => {
    expect(fieldJobHeading({ job_title: 'Jan Pro', customer: janPro }).title).toBe('Jan Pro')
  })
  it('does not eat a longer word that merely starts the same', () => {
    expect(fieldJobHeading({ job_title: 'Jan Products warehouse', customer: janPro }).title).toBe('Jan Products warehouse')
  })
  it('falls back to the job number and to the customer_name column', () => {
    expect(fieldJobHeading({ job_id: 'JOB-1', customer_name: 'Acme' })).toMatchObject({ title: 'JOB-1', subtitle: 'Acme' })
    expect(fieldJobHeading(null)).toMatchObject({ title: 'Job', subtitle: '' })
  })
})
