import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Indian Railways official brand
        ir: {
          blue:    '#003893',   // IR primary blue
          orange:  '#F26522',   // IR saffron/orange
          red:     '#CE1726',   // IR red
          white:   '#FFFFFF',
          // Tonal palette
          '50':    '#E8F0FB',
          '100':   '#C5D6F5',
          '200':   '#9FBCEF',
          '300':   '#78A1E8',
          '400':   '#5C8CE3',
          '500':   '#3F77DE',
          '600':   '#1C5EC8',
          '700':   '#003893',
          '800':   '#002B74',
          '900':   '#001E55',
        },
        saffron: {
          '50':    '#FFF3E8',
          '100':   '#FFD9B8',
          '400':   '#F58A3A',
          '500':   '#F26522',
          '600':   '#D44F0C',
        },
        surface: {
          DEFAULT: '#F7F9FD',
          card:    '#FFFFFF',
          muted:   '#EEF2F9',
          border:  '#D8DFEE',
        },
        text: {
          primary:   '#1A1D2E',
          secondary: '#4A5068',
          muted:     '#8A91A8',
        },
        status: {
          ok:   '#1B7A45',
          warn: '#A05A00',
          err:  '#CE1726',
          info: '#003893',
        },
      },
      fontFamily: {
        sans:    ['DM Sans', 'Inter', 'system-ui', 'sans-serif'],
        serif:   ['DM Serif Display', 'Georgia', 'serif'],
        mono:    ['DM Mono', 'JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        card:  '0 2px 8px rgba(0,56,147,0.07)',
        panel: '0 4px 24px rgba(0,56,147,0.10)',
        float: '0 8px 32px rgba(0,56,147,0.15)',
      },
      borderRadius: {
        DEFAULT: '8px',
        card:    '12px',
        pill:    '999px',
      },
      animation: {
        'fade-in':  'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'pulse-dot':'pulseDot 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:   { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:  { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.3' } },
      },
    },
  },
  plugins: [],
};

export default config;
