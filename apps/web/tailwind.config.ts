import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'hsl(222 45% 8%)',
          foreground: 'hsl(0 0% 100%)'
        },
        border: 'hsl(220 13% 18%)',
        panel: 'hsl(223 34% 14%)',
        accent: {
          DEFAULT: 'hsl(268 89% 68%)',
          foreground: '#0b0612'
        },
        muted: {
          DEFAULT: 'hsl(223 24% 22%)',
          foreground: 'hsl(220 15% 65%)'
        },
        discord: {
          primary: '#5865F2',
          hover: '#4752C4',
          active: '#3C45A5'
        }
      },
      boxShadow: {
        header: '0 1px 0 rgba(15, 23, 42, 0.4)'
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};

export default config;
