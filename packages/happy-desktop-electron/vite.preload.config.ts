import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
    publicDir: false,
    build: {
        emptyOutDir: false,
        lib: {
            entry: resolve(import.meta.dirname, "sources/preload/preload.ts"),
            formats: ["cjs"],
            fileName: () => "preload.cjs",
        },
        outDir: "dist",
        rollupOptions: {
            external: ["electron"],
        },
    },
});
