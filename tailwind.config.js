/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Ember accent — resolves via CSS vars so the light/parchment toggle
        // (class="parchment" on <html>) repaints every existing bg-brand-*/
        // text-brand-* usage without touching component classNames.
        brand: {
          50: 'var(--accent-dim)',
          100: 'var(--accent-dim)',
          300: 'var(--accent-bright)',
          400: 'var(--accent-bright)',
          500: 'var(--accent)',
          600: 'var(--accent-deep)',
          700: 'var(--accent-deep)',
          800: 'var(--accent-deep)',
        },
        // Ink-teal ground + sage text — same var-indirection as brand above.
        ink: {
          900: 'var(--bg)',
          800: 'var(--surface)',
          700: 'var(--surface-2)',
          600: 'var(--surface-3)',
          400: 'var(--muted)',
          300: 'var(--muted-bright)',
        },
        cream: 'var(--text)',
      },
      fontFamily: {
        sans: ['Jost', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      borderRadius: {
        lg: '10px',
        xl: '14px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
}
