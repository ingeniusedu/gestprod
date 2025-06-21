import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'ingenius-yellow': '#FFD700', // Placeholder, replace with actual if known
        'ingenius-purple': '#800080', // Placeholder, replace with actual if known
        'ingenius-blue': '#0000FF',   // Placeholder, replace with actual if known
      },
    },
  },
  plugins: [],
};
export default config;
