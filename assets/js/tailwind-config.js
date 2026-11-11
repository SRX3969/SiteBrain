/**
 * ═══════════════════════════════════════════════════════════════════
 * SITEBRAIN — SHARED TAILWIND DESIGN TOKENS
 * Loaded immediately AFTER the Tailwind CDN script on every page.
 * Single source of truth for the Apple 5th-Gen design system.
 * ═══════════════════════════════════════════════════════════════════
 */

window.SITEBRAIN_TAILWIND = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', 'Inter', 'sans-serif'],
        mono: ['"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        brand: { DEFAULT: '#0071E3', hover: '#0077ED', light: '#E8F2FD', dark: '#0058B6' },
        risk: {
          high: '#FF3B30', 'high-bg': '#FEECEB', 'high-border': '#FCD3D1',
          medium: '#FF9500', 'medium-bg': '#FFF8EB', 'medium-border': '#FFE3B3',
          low: '#34C759', 'low-bg': '#EBF9EE', 'low-border': '#B6EDBF',
        },
        apple: { title: '#1D1D1F', body: '#424245', muted: '#86868B', surface: '#F5F5F7' },
        ink: { DEFAULT: '#0A0F1E', soft: '#111A30' },
      },
      boxShadow: {
        '2xs': '0 1px 2px rgba(0,0,0,0.04)',
      },
    },
  },
};

if (window.tailwind) {
  tailwind.config = window.SITEBRAIN_TAILWIND;
}
