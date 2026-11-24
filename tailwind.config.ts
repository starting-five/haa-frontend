import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: "#CC007E",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      keyframes: {
        // Brand mark on the interstitials: a gentle rise that settles, then rests
        // for the second half of the cycle. Segment easings follow the design's
        // motion spec (easeOut up, easeIn down, linear hold).
        "haa-bounce": {
          "0%": { transform: "translate3d(0, 0, 0)", animationTimingFunction: "ease-out" },
          "37.5%": { transform: "translate3d(0, -12px, 0)", animationTimingFunction: "ease-in" },
          "75%": { transform: "translate3d(0, 0, 0)", animationTimingFunction: "linear" },
          "100%": { transform: "translate3d(0, 0, 0)" },
        },
        // Character on the reassurance screen (Figma 1949:3715): the design's
        // timeline is a single 600 ms ease-out fade from 0 to 1 that then holds.
        // It runs once — replaying it every cycle is what made the character blink.
        "haa-fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        // The dashboard notification bell (Figma 3778:15069). Read off that
        // layer's exported motion: a 2 s linear loop whose rotation keyframes
        // sit at 0/4/11/18/25/31/37/42 %, each segment eased, then a rest to
        // 100 %. Figma states the angles in radians (-0.262, 0.209, -0.175,
        // 0.122, -0.07, 0.035) — the degrees below are those values.
        "haa-bell-ring": {
          "0%": { transform: "rotate(0deg)", animationTimingFunction: "ease" },
          "4%": { transform: "rotate(-15deg)", animationTimingFunction: "ease" },
          "11%": { transform: "rotate(12deg)", animationTimingFunction: "ease" },
          "18%": { transform: "rotate(-10deg)", animationTimingFunction: "ease" },
          "25%": { transform: "rotate(7deg)", animationTimingFunction: "ease" },
          "31%": { transform: "rotate(-4deg)", animationTimingFunction: "ease" },
          "37%": { transform: "rotate(2deg)", animationTimingFunction: "ease" },
          "42%, 100%": { transform: "rotate(0deg)" },
        },
      },
      animation: {
        "haa-bounce": "haa-bounce 2s infinite",
        "haa-fade-in": "haa-fade-in 600ms cubic-bezier(0, 0, 0.58, 1) both",
        "haa-bell-ring": "haa-bell-ring 2s linear infinite",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        inter: [
          "Inter",
          "Inter Fallback",
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
        nunito: [
          '"Nunito Sans"',
          '"Nunito Sans Fallback"',
          "var(--font-nunito-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
