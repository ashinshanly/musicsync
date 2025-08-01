/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        primary: "#0A0A0F",
        "accent-1": "#00D4FF",
        "accent-2": "#FF00FF",
        "neon-blue": "#4DEEEA",
        "neon-purple": "#B026FF",
      },
      fontFamily: {
        "space-grotesk": ["Space Grotesk", "sans-serif"],
        syncopate: ["Syncopate", "sans-serif"],
      },
      animation: {
        gradient: "gradient 8s linear infinite",
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        float: "float 6s ease-in-out infinite",
      },
      keyframes: {
        gradient: {
          "0%, 100%": {
            "background-size": "200% 200%",
            "background-position": "left center",
          },
          "50%": {
            "background-size": "200% 200%",
            "background-position": "right center",
          },
        },
        float: {
          "0%, 100%": {
            transform: "translateY(0)",
          },
          "50%": {
            transform: "translateY(-10px)",
          },
        },
      },
      backgroundSize: {
        "300%": "300% 300%",
      },
      transitionDuration: {
        2000: "2000ms",
      },
      backdropBlur: {
        xl: "24px",
      },
      backgroundColor: {
        "black-glass": "rgba(0, 0, 0, 0.2)",
        "white-glass": "rgba(255, 255, 255, 0.1)",
      },
      borderColor: {
        "white-glass": "rgba(255, 255, 255, 0.2)",
      },
    },
  },
  plugins: [],
};
