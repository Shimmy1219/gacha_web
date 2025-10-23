import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['index.html', './src/**/*.{ts,tsx}'],
  theme: {
    borderRadius: {
      none: '0px',
      sm: '0.125rem',
      DEFAULT: '0.25rem',
      md: '0.375rem',
      lg: '0.375rem',
      xl: '0.5rem',
      '2xl': '0.75rem',
      '3xl': '1rem',
      '4xl': '1.5rem',
      full: '9999px'
    },
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0b0b0f',
          foreground: '#f5f5f6'
        },
        border: '#2a2a36',
        panel: '#15151b',
        accent: {
          DEFAULT: '#e11d48',
          dark: '#9f1239',
          foreground: '#ffffff'
        },
        muted: {
          DEFAULT: '#23232b',
          foreground: '#b3b3bd'
        },
        discord: {
          primary: '#5865F2',
          hover: '#4752C4',
          active: '#3C45A5'
        }
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'system-ui', 'sans-serif']
      },
      backgroundImage: {
        'panel-overlay': 'linear-gradient(135deg, rgba(225,29,72,0.12), transparent 55%)'
      }
    }
  },
  plugins: []
};

export default config;
