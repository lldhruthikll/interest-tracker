/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#e9e8f8',
        ink: '#1e2a44',
        muted: '#55607a',
        accent: '#8db9f0',
        'accent-ink': '#1e3a66',
        peach: '#f5b69e',
        line: '#d4d3ea',
        clay: {
          paid: '#c9f2dc', 'paid-ink': '#14532d',
          partial: '#ffeab5', 'partial-ink': '#7a4a04',
          overdue: '#ffd9d6', 'overdue-ink': '#8f1d1d',
          advance: '#f5b69e', 'advance-ink': '#5c2410',
          neutral: '#cfe2fb', 'neutral-ink': '#1e3a66',
        },
      },
      boxShadow: {
        neu: '8px 8px 16px #c7c6de, -8px -8px 16px #ffffff',
        'neu-in': 'inset 5px 5px 10px #c7c6de, inset -5px -5px 10px #ffffff',
      },
      fontFamily: { sans: ['Nunito', 'system-ui', 'sans-serif'] },
      borderRadius: { xl2: '20px', xl3: '28px' },
    },
  },
  plugins: [],
};
