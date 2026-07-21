import type { Config } from 'tailwindcss';
export default { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'], theme: { extend: { colors: { ink: '#07111f', panel: '#0d1a2b', cyan: '#53d8fb', lime: '#b9f57c' }, boxShadow: { glow: '0 0 35px rgba(83,216,251,.12)' } } }, plugins: [] } satisfies Config;
