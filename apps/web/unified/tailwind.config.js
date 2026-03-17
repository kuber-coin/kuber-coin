const path = require('node:path');

const uiRoot = path.dirname(require.resolve('@kubercoin/ui'));

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    `${uiRoot}/**/*.{js,ts,jsx,tsx,mdx}`,
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#F97316',
          'orange-dark': '#EA580C',
        },
      },
    },
  },
  plugins: [],
}
