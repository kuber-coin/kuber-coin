import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const uiRoot = path.dirname(require.resolve('@kubercoin/ui'));

/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    `${uiRoot}/**/*.{js,ts,jsx,tsx,mdx}`,
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
