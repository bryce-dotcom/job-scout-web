require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Round of replies for Cole / Tracy / Alayda after the 100W SKU + payment plan
// + invoice_lines migration work. Alayda stays in_progress because her "3 lines"
// description is ambiguous — need a screenshot to nail the exact spot.

const updates = [
  {
    id: 'd3640ee1-3550-48ed-b5ef-57a6ffec5f73', // Cole — wall pack catalog gap
    status: 'resolved',
    reply: "Added 7 standalone 100W wall pack SKUs to the catalog so they show up in search:\n" +
      " - 100W Wall Pack ($181.14)\n" +
      " - 100W Wall Pack Relocate ($388.64)\n" +
      " - 100W Wall Pack w/ Lift ($231.14)\n" +
      " - 100W Wall Pack Relocate w/ Lift ($458.64)\n" +
      " - SBE 100W Wall Pack ($301.14)\n" +
      " - SBE 100W Wall Pack Relocate ($508.64)\n" +
      " - SBE 100W Wall Pack Relocate w/ Lift ($623.00)\n" +
      "Search 'wall pack' or '100W' on Products & Services and they'll appear. The existing multi-wattage 50/60/80/100W SKU is still there too."
  },
  {
    id: 'e345e2f7-5e30-40e6-9155-82b3773a157d', // Tracy — quick view + payment plans
    status: 'resolved',
    reply: "Two things shipped:\n" +
      "1) Invoices page now has quick-filter chips at the top: Overdue (red), Due in 7d (yellow), Due in 30d (blue), Card on File (green), and Active Plan (purple). Each shows a count and toggles to filter the list. Every card also has a due-date badge so you can see at a glance which ones are coming up.\n" +
      "2) Payment plans: open any invoice and click 'Set Up Payment Plan' to schedule recurring installments (weekly / bi-weekly / monthly / quarterly). If the customer has a saved card you can flip on auto-charge. Plans auto-complete when the invoice balance hits zero and show progress + next charge date inline on the invoice page."
  },
  {
    id: '4e7c3f16-61bc-4ade-8c96-a8d85c51bd8a', // Alayda — utility incentive invoice 3 lines
    status: 'in_progress',
    reply: "Looking into this — wanted to make sure I'm chasing the right invoice before I rewrite anything. When you say it 'comes in as 3 lines,' do you mean:\n" +
      "  (a) the customer invoice PDF only shows a 3-row summary (project / discount / net) instead of the full fixture-by-fixture breakdown, or\n" +
      "  (b) the utility invoice PDF in the submittal package looks wrong (Material / Labor / Net Cost), or\n" +
      "  (c) something else?\n\n" +
      "If you can grab a quick screenshot of the package contents + the invoice PDF that opens, I can match it exactly. In parallel I added a new invoice_lines table so customer invoices can now carry a real itemized breakdown — once I know which invoice you're referring to I can wire the audit fixtures into it automatically."
  }
];

(async () => {
  for (const u of updates) {
    const update = {
      status: u.status,
      reply_message: u.reply,
      replied_at: new Date().toISOString()
    };
    if (u.status === 'resolved') update.resolved_at = new Date().toISOString();
    const { error } = await supabase
      .from('feedback')
      .update(update)
      .eq('id', u.id);
    if (error) console.log('UPDATE ERR for', u.id, error.message);
    else console.log('Updated', u.id, '->', u.status);
  }
})();
