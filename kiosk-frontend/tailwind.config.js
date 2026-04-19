/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Luxusní paleta pro kožené zboží
        midnight: '#0f0f1e',
        ink: '#1a1a2e',
        panel: '#252542',
        gold: '#d4a574',
        goldHi: '#e8c896',
        goldLo: '#9a7a4f',
        cream: '#f5e6d3',
        success: '#4ade80',
        danger: '#ef4444',
      },
      fontSize: {
        // Extra velké základní velikosti pro seniory
        'kiosk-sm': '20px',
        'kiosk-base': '24px',
        'kiosk-lg': '32px',
        'kiosk-xl': '48px',
        'kiosk-2xl': '64px',
        'kiosk-3xl': '96px',
      },
      spacing: {
        // Mimořádně velké tlačítka
        btnMin: '100px',
      },
    },
  },
  plugins: [],
};
