import type { Config } from 'tailwindcss'
export default {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {50:'#eef8f3',100:'#d9f0e5',200:'#b5dfca',300:'#83c8a6',400:'#48aa7d',500:'#0e8347',600:'#0b5d3b',700:'#084429',800:'#073923',900:'#052d1c'},
        ink: {500:'#717f8e',700:'#46584f',900:'#17191c'}
      },
      boxShadow: {
        soft:'0 10px 30px rgba(23,25,28,.055)',
        float:'0 18px 45px rgba(23,25,28,.09)'
      }
    }
  },
  plugins: []
} satisfies Config
