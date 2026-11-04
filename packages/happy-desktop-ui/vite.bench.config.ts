import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { lottieLocalWasmPlugin } from "./vite/lottiePlugin";

/** A production build of the Blueprint workbench, for benches that must not time React's development mode. */
export default defineConfig({
    define: { "import.meta.env.HAPPY_TEST_DEPTH": JSON.stringify("cheap") },
    plugins: [
        tailwindcss(),
        react(),
        babel({ presets: [reactCompilerPreset()] }),
        lottieLocalWasmPlugin(),
    ],
    build: { outDir: process.env.BENCH_OUT_DIR ?? "dist/bench", emptyOutDir: true },
});
