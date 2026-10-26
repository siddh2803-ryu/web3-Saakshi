import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F1F5F9",
        night: {
          DEFAULT: "#1E1B4B",
          50: "#EEF2FF",
          100: "#E0E7FF",
          900: "#1E1B4B",
        },
        saakshi: {
          indigo: "#4F46E5",
          amber: "#F59E0B",
          teal: "#0D9488",
          rose: "#E11D48",
          slate: "#64748B",
          bg: "#F1F5F9",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        hindi: ["var(--font-noto-hindi)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)",
        soft: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
      },
    },
  },
  plugins: [],
};

export default config;
