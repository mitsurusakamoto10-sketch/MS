import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 落ち着いた業務用のアクセントカラー（くすんだ青系）
        brand: {
          50: "#f1f5f9",
          100: "#e2e8f0",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
        },
      },
    },
  },
  plugins: [],
};

export default config;
