import { defineConfig } from "vitest/config";

// Main-process tests must use Node, without the renderer Vite process polyfill.
export default defineConfig({ test: { environment: "node" } });
