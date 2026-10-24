// The shell every drawn mark sits in.
//
// It does the two things that are easy to get wrong forty-five times:
//
//   1. UNIQUE GRADIENT IDS. A gradient is referenced by `url(#id)`, and two
//      marks on one page sharing an id makes the second silently inherit the
//      first one's fill. CampfireMark solved this with a hand-passed `id`
//      prop, which works when there is one of them and does not when the same
//      mark renders in the sidebar, the mobile menu and the tab bar at once.
//      useId() gives each instance its own. The colons React puts in that
//      value are stripped, because `url(#:r3:-brass)` is legal markup that
//      breaks the moment anything tries to select it.
//
//   2. ONLY THE RAMPS THIS MARK USES. Emitting all sixteen ramps into every
//      icon would put ~700 unused <stop> nodes in a sidebar.
//
// A mark declares its materials and draws with them:
//
//   <ScoutMark ramps={['brass', 'glass']}>
//     {(m) => <rect fill={m.brass} … />}
//   </ScoutMark>
//
// Marks are drawn on a 24×24 grid, same as the lucide icons they sit beside,
// so the set can land one section at a time without the menu going ragged.

import { useId } from 'react'
import { RAMPS } from './scoutPalette'

export default function ScoutMark({ size = 24, ramps = [], title, style, className, children }) {
  const uid = useId().replace(/:/g, '')
  const used = ramps.filter((name) => RAMPS[name])

  // What the mark draws with: material name -> the url() for its gradient.
  const m = {}
  for (const name of used) m[name] = `url(#${uid}-${name})`

  // READING A MATERIAL YOU DID NOT DECLARE IS A CRASH, NOT A SHRUG.
  //
  // `fill={m.cooper}` is undefined, React drops the attribute, SVG falls back
  // to its default — and you get a solid BLACK shape sitting in the sidebar.
  // It renders, it passes a build, and it looks deliberate enough at 14px to
  // survive review. The same goes for a ramp name that is simply not in
  // scoutPalette. Both now throw the moment the mark is drawn, so the test
  // that renders every mark catches either one by name.
  const materials = new Proxy(m, {
    get(target, key) {
      if (typeof key !== 'string' || key in target) return target[key]
      const known = RAMPS[key] ? 'not declared in this mark' : 'not a ramp in scoutPalette'
      throw new Error(`ScoutMark: material "${String(key)}" is ${known}. Declared: ${used.join(', ') || '(none)'}`)
    },
  })

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {title && <title>{title}</title>}
      <defs>
        {used.map((name) => {
          const ramp = RAMPS[name]
          return (
            <linearGradient key={name} id={`${uid}-${name}`} x1="0" y1="0" x2={ramp.x || 0} y2="1">
              {ramp.stops.map(([offset, color]) => (
                <stop key={offset} offset={offset} stopColor={color} />
              ))}
            </linearGradient>
          )
        })}
      </defs>
      {typeof children === 'function' ? children(materials) : children}
    </svg>
  )
}
