// Centralized status colors used across all pages
// Each status returns { bg, text } for badge rendering

export const leadStatusColors = {
  'New': { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6' },
  'Contacted': { bg: 'rgba(139,92,246,0.12)', text: '#8b5cf6' },
  'Appointment Set': { bg: 'rgba(34,197,94,0.12)', text: '#22c55e' },
  'Qualified': { bg: 'rgba(249,115,22,0.12)', text: '#f97316' },
  'Quote Sent': { bg: 'rgba(234,179,8,0.12)', text: '#eab308' },
  'Negotiation': { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
  'Won': { bg: 'rgba(16,185,129,0.12)', text: '#10b981' },
  'Lost': { bg: 'rgba(100,116,139,0.12)', text: '#64748b' },
  // Legacy statuses (still in DB)
  'Assigned': { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6' },
  'Callback': { bg: 'rgba(139,92,246,0.12)', text: '#8b5cf6' },
  'Not Qualified': { bg: 'rgba(100,116,139,0.12)', text: '#64748b' },
  'Converted': { bg: 'rgba(16,185,129,0.12)', text: '#10b981' },
}

export const jobStatusColors = {
  'Chillin': { bg: 'rgba(99,130,191,0.12)', text: '#6382bf' },
  'Scheduled': { bg: 'rgba(90,99,73,0.12)', text: '#5a6349' },
  'In Progress': { bg: 'rgba(194,139,56,0.12)', text: '#c28b38' },
  'Completed': { bg: 'rgba(74,124,89,0.12)', text: '#4a7c59' },
  'On Hold': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' },
  'Cancelled': { bg: 'rgba(139,90,90,0.12)', text: '#8b5a5a' },
}

export const invoiceStatusColors = {
  'Draft': { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' },
  'Sent': { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6' },
  'Pending': { bg: 'rgba(194,139,56,0.12)', text: '#c28b38' },
  'Open': { bg: 'rgba(194,139,56,0.12)', text: '#c28b38' },
  'Partially Paid': { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6' },
  'Paid': { bg: 'rgba(74,124,89,0.12)', text: '#4a7c59' },
  'Overdue': { bg: 'rgba(139,90,90,0.12)', text: '#8b5a5a' },
  'Void': { bg: 'rgba(156,163,175,0.12)', text: '#9ca3af' },
  'Cancelled': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' },
  'Not Invoiced': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' },
  'Invoiced': { bg: 'rgba(90,99,73,0.12)', text: '#5a6349' },
}

export const quoteStatusColors = {
  'Draft': { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' },
  'Sent': { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6' },
  'Approved': { bg: 'rgba(74,124,89,0.12)', text: '#4a7c59' },
  'Rejected': { bg: 'rgba(139,90,90,0.12)', text: '#8b5a5a' },
  'Expired': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' },
}

export const customerStatusColors = {
  'Active': { bg: 'rgba(22,163,74,0.12)', text: '#16a34a' },
  'Inactive': { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' },
  'Prospect': { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
}

export const auditStatusColors = {
  'Draft': { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' },
  'In Progress': { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6' },
  'Completed': { bg: 'rgba(34,197,94,0.12)', text: '#22c55e' },
  'Submitted': { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
  'Approved': { bg: 'rgba(22,163,74,0.12)', text: '#16a34a' },
  'Rejected': { bg: 'rgba(139,90,90,0.12)', text: '#8b5a5a' },
}

export const appointmentStatusColors = {
  'Scheduled': { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6', border: '#93c5fd' },
  'Confirmed': { bg: 'rgba(34,197,94,0.12)', text: '#22c55e', border: '#86efac' },
  'Completed': { bg: 'rgba(90,99,73,0.12)', text: '#5a6349', border: '#a3b18a' },
  'Cancelled': { bg: 'rgba(139,90,90,0.12)', text: '#8b5a5a', border: '#fca5a5' },
  'No Show': { bg: 'rgba(234,179,8,0.12)', text: '#eab308', border: '#fde047' },
}

// Generic getter — works with any entity type
export function getStatusColor(status, type = 'lead') {
  const maps = { lead: leadStatusColors, job: jobStatusColors, invoice: invoiceStatusColors, quote: quoteStatusColors, customer: customerStatusColors, audit: auditStatusColors }
  return maps[type]?.[status] || { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' }
}
