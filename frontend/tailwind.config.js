/** @type {import('tailwindcss').Config} */
// Colors map to CSS variables defined in src/index.css (:root = light, [data-theme="dark"] = dark).
const ch = (v) => `rgb(var(--${v}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  safelist: [{ pattern: /^tone-/ }], // built dynamically as tone-${name}
  theme: {
    extend: {
      colors: {
        base: ch('base'),
        ink: ch('ink'),
        muted: ch('muted'),
        accent: ch('accent'), // primary action / active item (black in light, white in dark)
        'accent-ink': ch('accent-ink'), // text on accent
        line: 'var(--line)',
        scrim: 'var(--scrim)',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { xl2: '16px', xl3: '26px' },
    },
  },
  plugins: [],
};
