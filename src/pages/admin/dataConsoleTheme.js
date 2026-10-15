// The Data Console's own dark palette.
//
// It lived in DataConsole.jsx, which DataConsoleMigrations imported for the
// theme — while DataConsole imports DataConsoleMigrations to render it. That
// cycle is harmless in development, where Vite serves native ES modules, and
// becomes a read-before-initialisation error once the production build hoists
// them into a chunk. Same shape as the Layout cycle; a constant does not need
// to drag a whole page module behind it.

export const dataConsoleTheme = {
  bg: '#0a0a0a',
  bgCard: '#141414',
  bgHover: '#1f1f1f',
  border: '#2a2a2a',
  text: '#ffffff',
  textMuted: '#888888',
  accent: '#f97316',
  accentBg: 'rgba(249, 115, 22, 0.15)',
  success: '#22c55e',
  warning: '#eab308',
  error: '#ef4444',
}
