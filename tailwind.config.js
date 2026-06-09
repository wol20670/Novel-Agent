/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1a1726',
        panel: '#211d30',
        panel2: '#2a2540',
        edge: '#3a3450',
        accent: '#a78bfa',
        accent2: '#7c5cff',
      },
    },
  },
  plugins: [],
};
