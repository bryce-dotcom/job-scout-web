require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const a = (await s.from('lighting_audits').select('*').eq('id', 120).maybeSingle()).data
  console.log('Audit 120:', a ? 'EXISTS' : 'MISSING')
  if (a) console.log(JSON.stringify(a, null, 2))

  // Other quotes with negative line totals? Check the breadth
  const lines = await s.from('quote_lines').select('quote_id,line_total,price').lt('line_total', 0).limit(50)
  console.log(`\nquote_lines with negative line_total (sample): ${lines.data?.length || 0}`)
  const byQuote = {}
  for (const l of lines.data || []) byQuote[l.quote_id] = (byQuote[l.quote_id] || 0) + 1
  console.log('Quotes with negative lines:', Object.keys(byQuote).length)
  console.log(Object.entries(byQuote).slice(0, 10))
})()
