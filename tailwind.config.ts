import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#020617",
        panel: "#0f172a",
        accent: "#38bdf8",
        desktop: {
          night: "#0b1120",
          glass: "rgba(15, 23, 42, 0.45)",
          chrome: "rgba(255,255,255,0.12)"
        }
      },
      boxShadow: {
        window: "0 30px 90px rgba(15, 23, 42, 0.45)",
        dock: "0 30px 60px rgba(15, 23, 42, 0.3)"
      },
      backdropBlur: {
        desktop: "24px"
      }
    }
  },
  plugins: []
};

export default config;
