// The app's topographic lines, used as signal rather than wallpaper.
//
// JobScout has had a tan contour pattern behind everything at 6% since the
// beginning — the one piece of visual identity it owns outright, and it was
// doing nothing but texture. Drawn here in a state's colour, it becomes the
// thing that tells you at a glance whether your assistant is working, waiting
// on you, or idle, without anything blinking.
//
// One definition because two pages draw it now. Cheap on purpose: six paths,
// no animation loop, no canvas — this renders on a phone on a job site.

export default function Contours({ tint, opacity = 0.22 }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 180"
      preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity }}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path
          key={i}
          d={`M-20 ${38 + i * 26} C 70 ${14 + i * 26}, 150 ${62 + i * 26}, 230 ${34 + i * 26} S 360 ${8 + i * 26}, 420 ${44 + i * 26}`}
          fill="none"
          stroke={tint}
          strokeWidth={i % 2 ? 0.7 : 1.1}
          strokeOpacity={0.5 - i * 0.055}
        />
      ))}
    </svg>
  )
}
