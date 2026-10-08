/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rmx: {
          primary: "#0d4a8a",
          accent: "#1e88e5",
          ribbon: "#f3f3f3",
          ribbonBorder: "#d4d4d4",
          tabActive: "#ffffff",
        },
      },
    },
  },
  plugins: [],
};
