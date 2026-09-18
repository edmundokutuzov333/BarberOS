import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: { void: '#000000', glowA: 'var(--canvas-glow-a)', glowB: 'var(--canvas-glow-b)' },
        accent: { DEFAULT: 'var(--accent)', soft: 'var(--accent-soft)', ink: 'var(--accent-ink)' },
        ink: { hi: 'var(--text-hi)', mid: 'var(--text-mid)', lo: 'var(--text-lo)' },
        st: {
          pending: 'var(--st-pending)',
          warning: 'var(--st-warning)',
          confirmed: 'var(--st-confirmed)',
          active: 'var(--st-active)',
          info: 'var(--st-info)',
          done: 'var(--st-done)',
          cancelled: 'var(--st-cancelled)',
          noshow: 'var(--st-noshow)',
        },
        surface: {
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          hover: 'var(--surface-hover)',
        },
      },
      fontFamily: { sans: ['Geist', 'Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'] },
      backdropBlur: { xs: '2px' },
      borderRadius: { panel: 'var(--radius-panel)', card: 'var(--radius-card)', pill: 'var(--radius-pill)' },
      keyframes: {
        aurora: {
          '0%,100%': { opacity: '.35', transform: 'translateX(-12%)' },
          '50%': { opacity: '.7', transform: 'translateX(12%)' },
        },
        pulseSlow: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.55' } },
      },
      animation: { aurora: 'aurora 3.2s ease-in-out infinite', pulseSlow: 'pulseSlow 2.4s ease-in-out infinite' },
    },
  },
  plugins: [],
} satisfies Config;