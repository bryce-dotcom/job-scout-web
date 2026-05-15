// Replace 100vh -> 100dvh in maxHeight / height / calc(100vh ...) usage
// (NOT minHeight on pages — those are fine).
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

let changes = 0
for (const f of walk('src')) {
  const orig = fs.readFileSync(f, 'utf8')
  let out = orig
  // maxHeight: '...100vh...' -> '100dvh'
  out = out.replace(/(maxHeight:\s*['"`])([^'"`]*?)100vh/g, '$1$2100dvh')
  // height: '...100vh...' standalone (not inside minHeight); we already
  // excluded minHeight by virtue of matching only literal "height:"
  out = out.replace(/(?<!min)(height:\s*['"`])([^'"`]*?)100vh/g, '$1$2100dvh')
  // calc(100vh ...) anywhere -> calc(100dvh ...)
  out = out.replace(/calc\(100vh/g, 'calc(100dvh')
  if (out !== orig) {
    fs.writeFileSync(f, out)
    const before = (orig.match(/100vh/g) || []).length
    const after = (out.match(/100vh/g) || []).length
    const rel = f.split(/[\\/]/).slice(-3).join('/')
    console.log('  ' + rel + ': ' + (before - after) + ' replacements')
    changes += (before - after)
  }
}
console.log('\nTotal: ' + changes + ' replacements')
