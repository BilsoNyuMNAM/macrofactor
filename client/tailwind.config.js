/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mf: {
          canvas: '#0E0F12',
          surface: '#1F1F1F',
          card: '#18191F',
          surfaceSec: '#25272E',
          surfaceTert: '#2A2A2A',
          border: '#272930',
          borderSubtle: 'rgba(255, 255, 255, 0.08)',
          borderMedium: '#383A45',
          orange: '#F6805B',
          orangeDark: '#FF6636',
          orangeGlow: 'rgba(246, 128, 91, 0.25)',
          green: '#43AA71',
          yellow: '#F5BC43',
          purple: '#C7B8F5',
          scale: '#8250DF',
          blue: '#4D74FF',
          expHolding: '#9B523C',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        'tile': '16px',
        'sheet': '24px',
      }
    },
  },
  plugins: [],
}
