import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#D4500A',
          hover: '#B8420A',
          light: '#FFF0E8',
        },
        brand: {
          dark: '#1A1A2E',
          surface: '#16213E',
          card: '#0F3460',
        },
      },
      fontFamily: {
        ui: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      transitionDuration: {
        fast: '150ms',
        medium: '200ms',
      },
      transitionTimingFunction: {
        'ease-out-standard': 'ease-out',
      },
    },
  },
  plugins: [],
}

export default config
