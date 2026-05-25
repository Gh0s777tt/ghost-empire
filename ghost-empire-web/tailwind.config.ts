import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ghost: {
          black:   "#0A0A0A",
          charcoal:"#1A1A1A",
          graphite:"#2A2A2A",
          smoke:   "#6B6B6B",
          bone:    "#E8E8E8",
          red:     "#E50914",
          "red-dark": "#8B0000",
          gold:    "#D4AF37",
        },
      },
      fontFamily: {
        display: ["Anton", "Impact", "sans-serif"],
        mono:    ["JetBrains Mono", "Consolas", "monospace"],
        sans:    ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "ping-slow": "ping 2s cubic-bezier(0,0,0.2,1) infinite",
        "glow-pulse": "glow-pulse 4s ease-in-out infinite",
        "pulse-red":  "pulse-red 2s ease-in-out infinite",
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(229,9,20,0.3)" },
          "50%":       { boxShadow: "0 0 40px rgba(229,9,20,0.6)" },
        },
        "pulse-red": {
          "0%, 100%": { background: "rgba(229,9,20,0.1)" },
          "50%":       { background: "rgba(229,9,20,0.25)" },
        },
      },
      backgroundImage: {
        "ghost-radial":
          "radial-gradient(circle at 20% 50%, rgba(229,9,20,0.2) 0%, transparent 50%)",
      },
    },
  },
  plugins: [],
};

export default config;
