import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#1B4F8A',
          50: '#EAF1FA',
          100: '#CFE0F3',
          300: '#7FA9DA',
          400: '#4D86C9',
          500: '#2A66AB',
          600: '#1B4F8A',
          700: '#153E6C',
          800: '#0F2D4F',
        },
      },
    },
  },
  plugins: [],
};
export default config;
