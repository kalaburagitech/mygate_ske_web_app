/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    theme: {
        extend: {
            colors: {
                primary: "#2563eb",
                background: "#020617",
                card: "#0f172a",
                muted: "#64748b",
            },
        },
    },
    plugins: [],
}