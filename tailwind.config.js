// Tailwind can't derive an alpha channel from an opaque var(--accent) string —
// bg-brand-500/10 needs the underlying r/g/b numbers to build rgba(...). Each
// colour below is stored twice in src/index.css: a "-rgb" space-separated
// triplet for this, and a plain var wrapping it for direct CSS/inline-style
// use. This is Tailwind's documented pattern for opacity-modifier-compatible
// CSS-variable colours.
function withOpacity(variable) {
  return ({ opacityValue }) =>
    opacityValue !== undefined ? `rgba(var(${variable}), ${opacityValue})` : `rgb(var(${variable}))`
}

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
          300: withOpacity('--accent-bright-rgb'),
          400: withOpacity('--accent-bright-rgb'),
          500: withOpacity('--accent-rgb'),
          600: withOpacity('--accent-deep-rgb'),
          700: withOpacity('--accent-deep-rgb'),
          800: withOpacity('--accent-deep-rgb'),
        },
        // Ink-teal ground + sage text — same var-indirection as brand above.
        ink: {
          900: withOpacity('--bg-rgb'),
          800: withOpacity('--surface-rgb'),
          700: withOpacity('--surface-2-rgb'),
          600: withOpacity('--surface-3-rgb'),
          500: withOpacity('--faint-rgb'), // was previously undefined — text-ink-500 silently no-op'd
          400: withOpacity('--muted-rgb'),
          300: withOpacity('--muted-bright-rgb'),
        },
        cream: withOpacity('--text-rgb'),
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
