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
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          foreground: 'rgb(var(--color-surface-foreground) / <alpha-value>)',
          alt: 'rgb(var(--color-surface-alt) / <alpha-value>)',
          deep: 'rgb(var(--color-surface-deep) / <alpha-value>)'
        },
        border: 'rgb(var(--color-border) / <alpha-value>)',
        panel: {
          DEFAULT: 'rgb(var(--color-panel) / <alpha-value>)',
          muted: 'rgb(var(--color-panel-muted) / <alpha-value>)',
          contrast: 'rgb(var(--color-panel-contrast) / <alpha-value>)'
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          dark: 'rgb(var(--color-accent-dark) / <alpha-value>)',
          bright: 'rgb(var(--color-accent-bright) / <alpha-value>)',
          'bright-dark': 'rgb(var(--color-accent-bright-dark) / <alpha-value>)',
          foreground: 'rgb(var(--color-accent-foreground) / <alpha-value>)'
        },
        muted: {
          DEFAULT: 'rgb(var(--color-muted) / <alpha-value>)',
          foreground: 'rgb(var(--color-muted-foreground) / <alpha-value>)'
        },
        overlay: 'rgb(var(--color-overlay) / <alpha-value>)',
        discord: {
          primary: '#5865F2',
          hover: '#4752C4',
          active: '#3C45A5'
        }
      },
      boxShadow: {
        header: '0 10px 32px rgba(0, 0, 0, 0.45)',
        panel: '0 6px 24px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.5)'
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
