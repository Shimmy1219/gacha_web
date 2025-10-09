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
      full: '1.5rem'
    },
    extend: {
      colors: {
        surface: {
          DEFAULT: '#05040a',
          foreground: '#f7f7fb'
        },
        border: '#241c31',
        panel: '#0f0f18',
        accent: {
          DEFAULT: '#ff2f5d',
          foreground: '#19040a'
        },
        muted: {
          DEFAULT: '#171425',
          foreground: '#9f9ab6'
        },
        discord: {
          primary: '#5865F2',
          hover: '#4752C4',
          active: '#3C45A5'
        }
      },
      boxShadow: {
        header: '0 16px 48px rgba(0, 0, 0, 0.35)',
        panel: '0 24px 72px rgba(0, 0, 0, 0.55)'
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'system-ui', 'sans-serif']
      },
      backgroundImage: {
        'panel-overlay': 'linear-gradient(135deg, rgba(255,47,93,0.18), transparent 55%)'
      }
    }
  },
  plugins: []
};

export default config;
