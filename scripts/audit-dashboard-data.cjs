require('dotenv').config()
const {createClient}=require('@supabase/supabase-js')
const sb=createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)
const CID=3

async function getAll(table, select, filters={}) {
  const all=[]
  let from=0
  while(true){
    let q=sb.from(table).select(select).eq('company_id',CID)
    for(const [k,v] of Object.entries(filters)) q=q.eq(k,v)
    const {data,error}=await q.range(from,from+999).order('id')
    if(error||!data||!data.length) break
    all.push(...data)
    from+=data.length
    if(data.length<1000) break
  }
  return all
}

async function run(){
  console.log('=== Dashboard Data Audit for Company 3 ===\n')

  // Jobs by year
  const jobs=await getAll('jobs','id,status,created_at,contract_amount,job_total,start_date')
  const jByYear={}
  jobs.forEach(j=>{
    const d=j.start_date||j.created_at||''
    const y=d.slice(0,4)
    jByYear[y]=(jByYear[y]||0)+1
  })
  console.log('Jobs by year (start_date):',JSON.stringify(jByYear))

  // Jobs by status
  const jByStatus={}
  jobs.forEach(j=>{jByStatus[j.status||'null']=(jByStatus[j.status||'null']||0)+1})
  console.log('Jobs by status:',JSON.stringify(jByStatus))

  // YTD completed jobs (2026)
  const ytdCompleted=jobs.filter(j=>j.status==='Completed'&&(j.start_date||j.created_at||'').startsWith('2026'))
  const ytdCompletedValue=ytdCompleted.reduce((s,j)=>s+(parseFloat(j.contract_amount)||parseFloat(j.job_total)||0),0)
  console.log('\n2026 YTD completed jobs: '+ytdCompleted.length+' ($'+ytdCompletedValue.toFixed(2)+')')

  // MTD (April 2026)
  const mtdCompleted=jobs.filter(j=>j.status==='Completed'&&(j.start_date||j.created_at||'').startsWith('2026-04'))
  const mtdCompletedValue=mtdCompleted.reduce((s,j)=>s+(parseFloat(j.contract_amount)||parseFloat(j.job_total)||0),0)
  console.log('April 2026 MTD completed jobs: '+mtdCompleted.length+' ($'+mtdCompletedValue.toFixed(2)+')')

  // All-time completed
  const allCompleted=jobs.filter(j=>j.status==='Completed')
  const allCompletedValue=allCompleted.reduce((s,j)=>s+(parseFloat(j.contract_amount)||parseFloat(j.job_total)||0),0)
  console.log('All-time completed jobs: '+allCompleted.length+' ($'+allCompletedValue.toFixed(2)+')')

  // Check how many jobs have created_at in 2026 vs original dates
  const jCreated2026=jobs.filter(j=>(j.created_at||'').startsWith('2026'))
  const jCreatedOlder=jobs.filter(j=>!(j.created_at||'').startsWith('2026'))
  console.log('\nJobs created_at in 2026: '+jCreated2026.length)
  console.log('Jobs created_at before 2026: '+jCreatedOlder.length)

  // Payments
  const payments=await getAll('payments','id,payment_date,amount')
  const pByYear={}
  payments.forEach(p=>{const y=(p.payment_date||'').slice(0,4); pByYear[y]=(pByYear[y]||0)+1})
  console.log('\nPayments by year:',JSON.stringify(pByYear))

  const ytdPayments=payments.filter(p=>(p.payment_date||'').startsWith('2026'))
  const ytdPaymentTotal=ytdPayments.reduce((s,p)=>s+(parseFloat(p.amount)||0),0)
  console.log('2026 YTD payments: '+ytdPayments.length+' ($'+ytdPaymentTotal.toFixed(2)+')')

  const allPaymentTotal=payments.reduce((s,p)=>s+(parseFloat(p.amount)||0),0)
  console.log('All-time payments: '+payments.length+' ($'+allPaymentTotal.toFixed(2)+')')

  // Invoices
  const invoices=await getAll('invoices','id,invoice_date,status,total,balance_due')
  const iByYear={}
  invoices.forEach(i=>{const y=(i.invoice_date||'').slice(0,4); iByYear[y]=(iByYear[y]||0)+1})
  console.log('\nInvoices by year:',JSON.stringify(iByYear))

  const invoicesByStatus={}
  invoices.forEach(i=>{invoicesByStatus[i.status||'null']=(invoicesByStatus[i.status||'null']||0)+1})
  console.log('Invoices by status:',JSON.stringify(invoicesByStatus))

  // Leads
  const leads=await getAll('leads','id,status,created_at')
  const lCreated2026=leads.filter(l=>(l.created_at||'').startsWith('2026'))
  console.log('\nLeads created in 2026: '+lCreated2026.length+' / '+leads.length+' total')

  // The PROBLEM: all HCP data was imported with recent created_at dates
  // Let's check the date distribution more granularly
  const jByMonth={}
  jobs.forEach(j=>{
    const d=(j.start_date||j.created_at||'').slice(0,7)
    jByMonth[d]=(jByMonth[d]||0)+1
  })
  const sortedMonths=Object.entries(jByMonth).sort((a,b)=>b[1]-a[1]).slice(0,10)
  console.log('\nTop 10 job months (by start_date):')
  sortedMonths.forEach(([m,c])=>console.log('  '+m+': '+c))

  console.log('\n=== DONE ===')
}
run()
