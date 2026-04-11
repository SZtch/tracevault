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
          900: '#0B1020',
          850: '#0E1628',
          800: '#121A2B',
          750: '#182235',
          700: '#0F1729',
          500: '#263248',
          400: '#3A4E6A',
          300: '#4A6080',
          200: '#5A7090',
          100: '#9FB0C7',
          50:  '#E6EDF7',
        },
        accent:   '#4F8CFF',
        success:  '#22C55E',
        warning:  '#F59E0B',
        danger:   '#EF4444',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        'slide-up':  'slide-up 0.14s ease both',
        'fade-in':   'fade-in 0.16s ease both',
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
        'spin-slow': 'spin 1.4s linear infinite',
      },
      keyframes: {
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(5px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1',    transform: 'scale(1)'    },
          '50%':      { opacity: '0.2',  transform: 'scale(0.55)' },
        },
      },
    },
  },
  plugins: [],
}
