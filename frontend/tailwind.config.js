/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        vault: {
          900: '#0a0c0f',
          850: '#0d1014',
          800: '#0f1215',
          750: '#111820',
          700: '#151c24',
          600: '#1a2230',
          500: '#1e2830',
          400: '#253040',
          300: '#3a4a5a',
          200: '#5a7080',
          100: '#8fa0b0',
          50:  '#c8d4dc',
          10:  '#e8f0f5',
        },
        accent: '#00c8a0',
        'accent-lo': 'rgba(0,200,160,0.10)',
        'accent-md': 'rgba(0,200,160,0.20)',
        'accent-hi': 'rgba(0,200,160,0.35)',
        red:    '#e05050',
        orange: '#e08020',
        yellow: '#d4b030',
        blue:   '#4090d0',
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        'slide-up':   'slide-up 0.18s ease both',
        'fade-in':    'fade-in 0.2s ease both',
        'pulse-dot':  'pulse-dot 1.4s ease-in-out infinite',
        'spin-slow':  'spin 1.2s linear infinite',
      },
      keyframes: {
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':      { opacity: '0.25', transform: 'scale(0.65)' },
        },
      },
    },
  },
  plugins: [],
}
