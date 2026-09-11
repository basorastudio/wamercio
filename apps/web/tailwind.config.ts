import type { Config } from 'tailwindcss'
export default {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#effdf4',100:'#dcfce7',200:'#bbf7d0',300:'#86efac',400:'#4ade80',500:'#22c55e',600:'#16a34a',700:'#15803d',800:'#166534',900:'#14532d' }
      },
      boxShadow: { soft:'0 8px 30px rgba(15,23,42,.06)' }
    }
  },
  plugins: []
} satisfies Config
