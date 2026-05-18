// Add { state: { from: window.location.pathname } } to every
// navigate(`/invoices/${X}`) call so the InvoiceDetail back button
// returns the user to wherever they were.
const fs = require('fs')
const path = require('path')

const files = [
  'src/pages/agents/frankie/FrankieCollections.jsx',
  'src/pages/agents/frankie/FrankieDashboard.jsx',
  'src/pages/CustomerDetail.jsx',
  'src/pages/Invoices.jsx',
  'src/pages/JobDetail.jsx',
  'src/pages/UtilityInvoices.jsx',
  'src/pages/Books.jsx',
]

let total = 0
for (const f of files) {
  const orig = fs.readFileSync(f, 'utf8')
  let out = orig
  // navigate(`/invoices/${X}`)  -> navigate(`/invoices/${X}`, { state: { from: window.location.pathname } })
  out = out.replace(
    /navigate\((`\/invoices\/\$\{[^`}]+\}`)\)/g,
    'navigate($1, { state: { from: window.location.pathname } })'
  )
  out = out.replace(
    /navigate\((`\/utility-invoices\/\$\{[^`}]+\}`)\)/g,
    'navigate($1, { state: { from: window.location.pathname } })'
  )
  if (out !== orig) {
    fs.writeFileSync(f, out)
    const count = (orig.match(/navigate\(`\/(?:utility-)?invoices\/\$\{/g) || []).length
    const after = (out.match(/navigate\(`\/(?:utility-)?invoices\/\$\{[^`}]+\}`\)\s*[,)]/g) || []).length
    console.log('  ' + f + ': ' + count + ' callsites')
    total += count
  }
}
console.log('\nTotal patched: ' + total)
