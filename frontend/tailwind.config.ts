import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: { void: '#000000', glowA: '#1a102f', glowB: '#0c0614' },
        accent: { DEFAULT: 'var(--accent)', soft: 'var(--accent-soft)', ink: 'var(--accent-ink)' },
        ink: { hi: '#ffffff', mid: '#9b95a8', lo: '#5c5765' },
        st: {
          pending: '#e0b057', confirmed: '#b59eff', active: '#7bd7f5',
          done: '#6ee7b7', cancelled: '#5c5765', noshow: '#f57b9d',
        },
      },
      fontFamily: { sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'] },
      backdropBlur: { xs: '2px' },
      borderRadius: { panel: 'var(--radius-panel)', card: 'var(--radius-card)' },
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
