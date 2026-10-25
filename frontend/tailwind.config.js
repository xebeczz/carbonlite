/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: "#123f2e",
          deep: "#0b2b1e",
          soft: "#1d5540",
        },
        leaf: {
          DEFAULT: "#2f6f4e",
          light: "#4c8a69",
          pale: "#e7efe8",
        },
        sand: {
          DEFAULT: "#f6f5ef",
          deep: "#ece9df",
        },
        ink: {
          DEFAULT: "#14231c",
          soft: "#42554b",
          muted: "#718077",
        },
        line: "#dee3dc",
        clay: "#b45309",
        danger: "#a63d2e",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        display: ["Fraunces", "Georgia", "ui-serif", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(18, 63, 46, 0.04), 0 18px 40px -32px rgba(18, 63, 46, 0.28)",
        lift: "0 24px 60px -30px rgba(11, 43, 30, 0.4)",
      },
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        rise: "rise 420ms ease-out both",
        shimmer: "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};
