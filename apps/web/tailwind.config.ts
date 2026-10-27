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
        background: "#F8FAFC",
        night: {
          DEFAULT: "#0F172A",
          50: "#F8FAFC",
          100: "#F1F5F9",
          800: "#1E293B",
          900: "#0F172A",
          midnight: "#1E1B4B",
        },
        saakshi: {
          indigo: "#1E40AF",
          indigoPrimary: "#4F46E5",
          blue: "#2563EB",
          amber: "#D97706",
          amberAccent: "#F59E0B",
          emerald: "#059669",
          teal: "#0F766E",
          tealAccent: "#0D9488",
          rose: "#DC2626",
          roseAccent: "#E11D48",
          slate: "#475569",
          slateMuted: "#64748B",
          bg: "#F8FAFC",
          surface: "#F1F5F9",
          navy: "#1E1B4B",
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
