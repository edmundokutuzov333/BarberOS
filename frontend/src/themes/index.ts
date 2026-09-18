export type ThemeKey =
  | 'violet-noir' | 'neon-lilac' | 'midnight-indigo' | 'cyan-abyss' | 'emerald-smoke'
  | 'amber-ash' | 'rose-quartz' | 'plum-ember' | 'nordic-mono' | 'blood-orange';

export interface ThemePreset {
  key: ThemeKey;
  name: string;
  accent: string;
  accentSoft: string;
  accentInk: string;
  glowA: string;
  glowB: string;
}

export const THEMES: ThemePreset[] = [
  { key: 'violet-noir',     name: 'Violeta noir',     accent: '#9d7bf5', accentSoft: '#b59eff', accentInk: '#120c1f', glowA: '#1a102f', glowB: '#0c0614' },
  { key: 'neon-lilac',      name: 'Lilás néon',       accent: '#b87bf5', accentSoft: '#d4a8ff', accentInk: '#180a29', glowA: '#230f38', glowB: '#0e0517' },
  { key: 'midnight-indigo', name: 'Índigo meia-noite',accent: '#7b8cf5', accentSoft: '#a8b5ff', accentInk: '#0b102b', glowA: '#0f163d', glowB: '#05081a' },
  { key: 'cyan-abyss',      name: 'Ciano abismo',     accent: '#57d3e0', accentSoft: '#94edf5', accentInk: '#062226', glowA: '#0a2d33', glowB: '#031214' },
  { key: 'emerald-smoke',   name: 'Esmeralda fumo',   accent: '#57d8a2', accentSoft: '#9bf0cc', accentInk: '#062417', glowA: '#0c3321', glowB: '#03140d' },
  { key: 'amber-ash',       name: 'Âmbar cinza',      accent: '#f0b354', accentSoft: '#fbd593', accentInk: '#291b05', glowA: '#3d290f', glowB: '#170e03' },
  { key: 'rose-quartz',     name: 'Quartzo rosa',     accent: '#f27ba8', accentSoft: '#fbbada', accentInk: '#2b0a19', glowA: '#3b0e24', glowB: '#14030b' },
  { key: 'plum-ember',      name: 'Ameixa brasa',     accent: '#d965b8', accentSoft: '#f3a5df', accentInk: '#24091e', glowA: '#360d2e', glowB: '#140311' },
  { key: 'nordic-mono',     name: 'Nórdico mono',     accent: '#d1d5db', accentSoft: '#f3f4f6', accentInk: '#111827', glowA: '#1f2937', glowB: '#0b0f17' },
  { key: 'blood-orange',    name: 'Laranja sangue',   accent: '#f56b57', accentSoft: '#ffaa9e', accentInk: '#2b0a06', glowA: '#3b100a', glowB: '#140402' },
];

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

export function themeVars(t: ThemePreset): Record<string, string> {
  return {
    '--accent': t.accent,
    '--accent-soft': t.accentSoft,
    '--accent-ink': t.accentInk,
    '--accent-rgb': hexToRgb(t.accent),
    '--canvas-glow-a': t.glowA,
    '--canvas-glow-b': t.glowB,
    '--st-confirmed': t.accentSoft,
  };
}

export function applyTheme(key: string | null | undefined) {
  const t = THEMES.find((x) => x.key === key) ?? THEMES[0];
  const root = document.documentElement;
  root.setAttribute('data-theme', t.key);
  Object.entries(themeVars(t)).forEach(([k, v]) => root.style.setProperty(k, v));
}
