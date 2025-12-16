/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Perplexity-inspired dark theme
        'surface': {
          DEFAULT: '#1a1a2e',
          light: '#25253d',
          lighter: '#2f2f4a',
        },
        'accent': {
          DEFAULT: '#6366f1',
          light: '#818cf8',
        }
      },
    },
  },
  plugins: [],
}
