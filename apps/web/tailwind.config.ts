import type { Config } from 'tailwindcss'
export default {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {50:'#eefaf6',100:'#d8f4e9',200:'#b4ead6',300:'#84d9bb',400:'#55c69e',500:'#36b385',600:'#2b936d',700:'#26765b',800:'#235e4b',900:'#204e40'},
        ink: {500:'#666b8d',700:'#404568',900:'#2e3154'}
      },
      boxShadow: {
        soft:'0 10px 30px rgba(46,49,84,.07)',
        float:'0 18px 45px rgba(46,49,84,.10)'
      }
    }
  },
  plugins: []
} satisfies Config
