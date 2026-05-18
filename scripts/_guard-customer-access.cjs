// Defensive: convert `.customer.` (after `.` with no preceding `?`) into
// `.customer?.` across all .jsx files. Won't double-convert existing
// `.customer?.` accesses. Safe — `?.` returns undefined instead of
// throwing if the customer relation is null.
const fs = require('fs')
const path = require('path')
function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, files)
    else if (/\.(jsx?|tsx?)$/.test(name)) files.push(p)
  }
  return files
}
let total = 0
for (const f of walk('src')) {
  const orig = fs.readFileSync(f, 'utf8')
  // Match `.customer.` NOT preceded by `?` — i.e., already `.customer.` and not `?.customer.`
  // We need (?<!\?)\.customer\. but JS regex supports lookbehind.
  const out = orig.replace(/(?<!\?)\.customer\.(?!=)/g, '.customer?.')
  if (out !== orig) {
    const count = (orig.match(/(?<!\?)\.customer\.(?!=)/g) || []).length
    fs.writeFileSync(f, out)
    console.log('  ' + f.split(/[\\/]/).slice(-3).join('/') + ': ' + count)
    total += count
  }
}
console.log('\nTotal: ' + total + ' replacements')
