// MERIDIEN DESIGN TOKENS (extracted from OPÉRA)

export const T = {
  void: '#0A0E0D',
  surface: '#0F1412',
  surfaceRaised: '#141A17',
  primary: '#D4CFC4',
  secondary: 'rgba(212,207,196,0.55)',
  ghost: 'rgba(212,207,196,0.18)',
  whisper: 'rgba(212,207,196,0.07)',
  meridian: '#003D2C',
  gold: '#A38767',
  alert: '#C45C3E',
  calm: '#4A7B6A',
  lockout: '#8B2942',      // Rouge profond - session privée
  openSession: '#2A6B4F',  // Vert - session ouverte (on peut hang)
  money: '#D4AF37',        // Or vif - priorité argent
  grainOpacity: 0.03,
} as const

// Group colors
export const GROUP_COLORS = {
  lobster: '#4A7B6A',  // vert sauge
  roman: '#A38767',    // doré
} as const

export const FONT = {
  label: "'Inter', system-ui, sans-serif",
  reading: "'Cormorant Garamond', Georgia, serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
} as const

export const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as const } },
}

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const } },
}

export const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`
