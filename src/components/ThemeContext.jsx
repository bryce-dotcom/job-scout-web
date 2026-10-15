// The theme, and the hook that reads it.
//
// This lived inside Layout.jsx, which made Layout a module that half the app
// had to import — including components Layout itself renders. That closed a
// circular import:
//
//   Layout.jsx  ->  ArnieFloatingPanel.jsx  ->  ArnieChat.jsx  ->  Layout.jsx
//                                               (for useTheme)
//
// Vite serves native ES modules in development, where a cycle like that
// usually resolves itself lazily and nothing looks wrong. The production build
// hoists the same modules into chunks, and then whichever binding is reached
// first can be read before it is initialised:
//
//   ReferenceError: Cannot access 'Ka' before initialization
//
// which is what /payroll threw, five times, on a build nobody could reproduce
// in dev. Whether a given page trips it depends on the order its lazily-loaded
// chunk pulls the cycle in, which is why it moved around between builds and
// hit some pages and not others.
//
// Keeping the context here, with no imports of its own beyond React, means
// nothing ever has to import Layout to read the theme. Layout re-exports
// useTheme so the 117 files that already import it from there keep working
// untouched — new code should import it from this file.

import { createContext, useContext } from 'react'

export const ThemeContext = createContext(null)

/** Job Scout — Light Topo. */
export const theme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  bgCardHover: '#eef2eb',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentHover: '#4a5239',
  accentBg: 'rgba(90,99,73,0.12)',
  shadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
  shadowLg: '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)',
}

/** The theme in context, or the default one — never undefined. */
export const useTheme = () => {
  const context = useContext(ThemeContext)
  return context || { theme }
}
