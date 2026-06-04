require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const replies = [
  {
    id: 'd7479858-d6fe-4316-936c-f33c3d1908c9', // Doug — jobs to Scheduled
    reply: `Fixed — approved jobs will now land in Chillin instead of Scheduled.

The bug: when an estimate got approved, the job got created with status='Chillin' (correct) but we were also auto-filling its start_date to NOW because no service date was set. The Job Board derives the column from start_date when it's today or later, so it bumped every fresh job into Scheduled regardless of what the status field said.

The fix: if the estimate doesn't have a service date, the job leaves start_date empty. The Schedule modal sets it the first time you actually drag the job onto a calendar day. Same fix applied to the deposit-paid auto-convert path so cash-paid estimates behave the same way.`
  },
  {
    id: '0e3b7a75-a2da-4498-a79e-9632d7bf5cbc', // Doug — MTD/QTD/YTD
    reply: `Fixed — MTD / QTD / YTD totals on the Job Board will now include completed jobs even if they were created in a previous period.

The bug: the board was pulling completed jobs by created_at >= Jan 1. So a recurring weekly clean that started last November but got completed throughout this year was invisible to YTD because the parent job rows were created the previous year.

The fix: the board now pulls anything completed, last-touched, or created in the last 365 days, then the date-range selector (MTD/QTD/YTD/last30/last90/custom) buckets them properly. No re-fetch when you flip the selector. Custom ranges further back than a year will still need a wider window, but for the standard buckets you should now see everything.`
  },
  {
    id: '60f0a7a3-84ec-4b48-81ba-40dea09f9968', // Christopher — Resend Invoice
    reply: `Fixed — added a Resend Invoice button in two places so you don't have to download and re-attach.

1. On the JOB page where you filed this (jobs/21017): each invoice row now has a "Resend" pill right next to the amount. Click it and you land on the invoice with the Send modal already open — pick the email + attachments and hit send.

2. On the INVOICE page itself: a "Resend Invoice" button now lives right inside the Email Delivery panel at the top, in addition to the existing one in the sidebar.

The Resend button uses the same Send modal as the first send, so you can change the email address, edit the subject/body, and add attachments. Email delivery status (sent / delivered / opened / bounced) keeps updating after the resend too.`
  },
  {
    id: '0e927cbd-da50-4d36-9fae-44e11202c981', // Christopher — Resend Estimate
    reply: `Fixed — there's now a "Resend" pill right next to the delivery status at the top of every estimate page (visible the moment last_sent_at is set). Click it, it opens the same Send modal you used to send it the first time, change the email if you need to, and resend.

The existing "Resend Proposal" button in the sidebar is still there — this just makes it findable without scrolling. Same actual flow underneath.

The customer Natasha you mentioned on estimate 4422 — once you resend, watch the delivery badge. If it bounces, the bounce reason shows up red next to the Sent badge so you'll see immediately whether the new address worked.`
  },
]

;(async () => {
  for (const r of replies) {
    const { error } = await s.from('feedback').update({
      status: 'resolved',
      reply_message: r.reply,
      replied_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
    }).eq('id', r.id)
    if (error) console.log('ERR', r.id, error.message)
    else console.log('Replied', r.id)
  }
})()
