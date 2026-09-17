/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./index.html",
    "./weeks/*.html",
    "./js/*.js"
  ],
  theme: {
    extend: {
      colors: {
        "surface-dim": "#121316",
        "surface": "#121316",
        "background": "#121316",
        "surface-container-lowest": "#0d0e11",
        "surface-container-low": "#1b1b1f",
        "surface-container": "#1f1f23",
        "surface-container-high": "#292a2d",
        "surface-container-highest": "#343538",
        "on-surface": "#e3e2e6",
        "on-surface-variant": "#c7c4d7",
        "outline-variant": "#464554",
        "outline": "#908fa0",
        "primary": "#c0c1ff",
        "primary-container": "#8083ff",
        "on-primary": "#1000a9",
        "tertiary": "#b9c8de",
        "secondary": "#c1c7cf",
        "error": "#ffb4ab"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      fontFamily: {
        "headline": ["Space Grotesk", "sans-serif"],
        "body": ["Inter", "sans-serif"],
        "mono": ["JetBrains Mono", "monospace"]
      }
    }
  },
  plugins: []
};
