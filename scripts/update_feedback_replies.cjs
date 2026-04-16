require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const updates = [
  {
    id: '91349f6d-a922-44d5-a1f9-c3891ecb8311',
    reply: "Done! The recurrence dropdown on jobs now includes Bi-Weekly, Every 6 Weeks, Bi-Monthly, Quarterly, Bi-Annually, and Annually in addition to the existing options. Live after the next deploy."
  },
  {
    id: '08af648c-3e67-4619-a694-b6b6e7879a0e',
    reply: "Done! The Job Board / schedule cards now show the customer name before the job title (e.g. \"ACME Corp - Window Cleaning\") so you can see who the job is for at a glance. Live after the next deploy."
  },
  {
    id: '7443b499-57cf-430b-9e6b-07c87665f53d',
    reply: "Looked into this. Two things shipped: (1) the send-invoice function now strips \"Name <email>\" wrappers before sending so malformed addresses don't slip through, and (2) it validates the cleaned address up front and returns a clear error before contacting the email provider. The invoice detail page already shows bounce reasons under the Email Status section, so if it bounces again you'll see exactly why. If you have the bounced invoice handy, double-check the customer's email field is just the address (no name in the field) and resend."
  },
  {
    id: '414a710f-2815-46cc-9f55-37a0db2bc919',
    reply: "Done! Job detail (the page you land on after creating a job from the customer page) now has a Crew Members multi-select with checkboxes alongside the Job Lead picker. Pick the lead in one and check off everyone else assigned in the other. Live after the next deploy."
  },
  {
    id: 'b864a132-133e-4462-acd4-05f58f9d7fe0',
    reply: "Done! Removed the camera-only restriction across the photo upload buttons (job proof, lead photos, audit photos, payment receipts). The OS picker will now offer both Take Photo and Photo Library so you can pick existing pictures from your camera roll. Live after the next deploy."
  },
  {
    id: '55ba2f3b-3c4d-479d-bd02-8d33208aa424',
    reply: "Done! Added a \"Reactivate Customer\" button at the top of the Lead Setter page. Click it, search for the old customer by name, business, email, or phone, and click them - it creates a fresh lead (status: New, source: Existing Customer) so you can move them through the pipeline normally. Live after the next deploy."
  },
  {
    id: '6977de2f-71d5-4b82-97ae-c3af12487a95',
    reply: "Done! Same fix as Christopher's request - Job Detail now has a Crew Members multi-select with checkboxes for assigning multiple employees to a single job, instead of needing separate sections per person. Live after the next deploy."
  },
];

(async () => {
  const now = new Date().toISOString();
  for (const u of updates) {
    const r = await supabase.from('feedback').update({
      status: 'resolved',
      resolved_at: now,
      resolved_by: 'bryce@hhh.services',
      reply_message: u.reply,
      replied_at: now,
    }).eq('id', u.id).select('id, status, replied_at');
    console.log(u.id, '->', r.error ? 'ERR ' + r.error.message : 'OK ' + r.data?.[0]?.status);
  }
})();
