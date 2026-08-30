/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: '#f4f1ea',
        forest: '#264336',
        stone: {
          950: '#1d211d',
          900: '#292d28',
          800: '#454a43',
          700: '#60655d',
          600: '#777c73',
          500: '#92968d',
          400: '#b5b8b0',
          300: '#d4d5cd',
          200: '#e5e4dc',
          100: '#eeece5',
        },
      },
    },
  },
  plugins: [],
};
