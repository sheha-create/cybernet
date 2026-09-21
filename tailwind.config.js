/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'cyber-bg': '#050d1a',
        'cyber-cyan': '#00f5d4',
        'cyber-red': '#ff2d55',
        'cyber-dark': '#0a1628',
        'cyber-card': 'rgba(10, 22, 40, 0.9)',
        'cyber-border': 'rgba(0, 245, 212, 0.1)',
        'cyber-glow': 'rgba(0, 245, 212, 0.15)',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'neon-cyan': '0 0 20px rgba(0, 245, 212, 0.15)',
        'neon-cyan-strong': '0 0 30px rgba(0, 245, 212, 0.4)',
        'neon-red': '0 0 20px rgba(255, 45, 85, 0.3)',
        'neon-red-strong': '0 0 40px rgba(255, 45, 85, 0.6)',
      },
      animation: {
        'pulse-cyan': 'pulse-cyan 2s ease-in-out infinite',
        'pulse-red': 'pulse-red 1s ease-in-out infinite',
        'scanline': 'scanline 8s linear infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'tick-up': 'tick-up 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
        'bounce-dot': 'bounce-dot 1.4s ease-in-out infinite',
      },
      keyframes: {
        'pulse-cyan': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 245, 212, 0.15)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 245, 212, 0.5)' },
        },
        'pulse-red': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(255, 45, 85, 0.3)' },
          '50%': { boxShadow: '0 0 60px rgba(255, 45, 85, 0.8)' },
        },
        'scanline': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        'tick-up': {
          '0%': { transform: 'translateY(4px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'bounce-dot': {
          '0%, 80%, 100%': { transform: 'scale(0)', opacity: '0.5' },
          '40%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
