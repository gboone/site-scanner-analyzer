/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gov: {
          blue: '#005ea2',
          'blue-dark': '#1a4480',
          'blue-light': '#d9e8f6',
          red: '#d83933',
          green: '#00a91c',
          gold: '#e5a000',
          gray: '#71767a',
          'gray-cool': '#565c65',
        },
      },
    },
  },
  plugins: [],
};
