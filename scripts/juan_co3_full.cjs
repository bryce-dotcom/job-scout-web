require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async()=>{
  // Look at customer 2000 ("Juan Diego" alone — most likely the fresh one)
  for (const cid of [1775, 2000]) {
    const { data: c } = await sb.from('customers').select('*').eq('id',cid).single()
    console.log('\n=== Customer', cid, '|', c?.name, '|', c?.business_name, '|', c?.created_at?.slice(0,10))
    const { data: qs } = await sb.from('quotes').select('id,quote_id,salesperson_id,quote_amount,estimate_name,summary,job_title,created_at,status,source_system').eq('customer_id', cid).order('created_at',{ascending:false})
    console.log('Quotes:', qs?.length)
    for (const q of qs||[]) {
      const { data: e } = q.salesperson_id ? await sb.from('employees').select('name').eq('id',q.salesperson_id).maybeSingle() : { data: null }
      const { data: ll } = await sb.from('quote_lines').select('id,item_id,item_name,description,quantity,price').eq('quote_id',q.id)
      console.log(`  q${q.id} | ${q.quote_id||'(no quote_id)'} | $${q.quote_amount} | ${q.status} | sp:${e?.name||'?'} | src:${q.source_system||'-'} | ${q.created_at?.slice(0,10)}`)
      console.log(`     title: ${q.estimate_name||q.summary||q.job_title||''}`)
      console.log(`     lines: ${ll?.length||0}`)
      for (const l of ll||[]) {
        console.log(`       · item_id=${l.item_id||'null'} | item_name=${JSON.stringify(l.item_name)} | desc=${JSON.stringify((l.description||'').slice(0,80))} | qty=${l.quantity} | $${l.price}`)
      }
    }
  }
})()
