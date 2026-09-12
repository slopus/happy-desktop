import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { lottieLocalWasmPlugin } from "happy-desktop-ui/vite";
import { browserLocalHappyAgentPlugin } from "./sources/main/browserDevServer";

const require = createRequire(import.meta.url);
const packageJson = require("./package.json") as { readonly version: string };
const unavailableReactDevtoolsCore = fileURLToPath(
    new URL("./sources/renderer/reactDevtoolsCoreUnavailable.ts", import.meta.url),
);
const profileBuild = process.env.HAPPY_DESKTOP_PROFILE === "1";
const localWebSite = process.env.HAPPY_LOCAL_WEB_SITE === "1";
const localWebBuild = localWebSite
    ? {
          buildId: process.env.HAPPY_LOCAL_WEB_BUILD_ID ?? "development",
          version: process.env.RELEASE_VERSION ?? packageJson.version,
      }
    : undefined;

function localWebVersionPlugin(build: NonNullable<typeof localWebBuild>): Plugin {
    return {
        name: "happy-local-web-version",
        generateBundle() {
            this.emitFile({
                fileName: "local-web-version.json",
                source: `${JSON.stringify(build)}\n`,
                type: "asset",
            });
        },
    };
}

function profilerEntryPlugin(enabled: boolean): Plugin {
    return {
        name: "happy-profile-entry",
        transformIndexHtml: {
            order: "pre",
            handler(html) {
                if (!enabled) return html;
                const normalEntry = /\/sources\/renderer\/renderer\.tsx(?:\?[^"]*)?/u;
                if (!normalEntry.test(html))
                    throw new Error("Happy renderer entry was not found in index.html.");
                return html.replace(normalEntry, "/sources/renderer/profileEntry.ts");
            },
        },
    };
}

export default defineConfig({
    base: localWebSite ? "/" : "./",
    // The profile entry must own the React DevTools hook before React DOM is
    // evaluated. Vite's normal Fast Refresh preamble installs a placeholder
    // hook first, so profile development deliberately disables HMR (the
    // optimized profile build has no preamble either). This keeps the hook
    // ownership boundary explicit instead of silently replacing a refresh
    // runtime or reporting attribution that never attached.
    ...(profileBuild ? { server: { hmr: false } } : {}),
    define: {
        __HAPPY_ALLOW_SOURCE_AGENT__: JSON.stringify(process.env.HAPPY_ALLOW_SOURCE_AGENT === "1"),
        __HAPPY_DESKTOP_PROFILE__: JSON.stringify(profileBuild),
        __HAPPY_LOCAL_WEB_BUILD_ID__: JSON.stringify(localWebBuild?.buildId ?? null),
        __HAPPY_LOCAL_WEB_VERSION__: JSON.stringify(localWebBuild?.version ?? null),
    },
    plugins: [
        // The Happy Agent terminal protocol (@slopus/ghostty-web) decodes compressed wire
        // frames with node:zlib and node Buffer; these polyfills make them real in
        // the browser instead of empty externals that would throw at runtime.
        nodePolyfills({
            include: ["buffer", "zlib", "crypto", "stream", "util"],
            globals: { Buffer: true },
        }),
        tailwindcss(),
        react(),
        babel({ presets: [reactCompilerPreset()] }),
        profilerEntryPlugin(profileBuild),
        // Happy-ui's empty-state marks are drawn by a WASM Lottie renderer that
        // ships hardcoded CDN URLs for its binary. This cuts them out so the
        // renderer can only ever load the copy bundled here.
        lottieLocalWasmPlugin(),
        browserLocalHappyAgentPlugin(),
        ...(localWebBuild ? [localWebVersionPlugin(localWebBuild)] : []),
    ],
    resolve: {
        alias: [
            ...(profileBuild
                ? [
                      // React's profiling renderer is a production-shaped build with
                      // the Performance Tracks instrumentation retained. This alias is
                      // renderer-only and never changes the ordinary app build.
                      { find: "react-dom/client", replacement: "react-dom/profiling" },
                  ]
                : []),
            ...(!profileBuild
                ? [
                      // Keep the normal renderer's startup graph free of the profiler
                      // backend. The profile flavor resolves this import to the exact
                      // pinned OSS package above instead.
                      {
                          find: "react-devtools-core",
                          replacement: unavailableReactDevtoolsCore,
                      },
                  ]
                : []),
        ],
    },
    build: {
        outDir: "dist/renderer",
        // Keep source locations available for raw profile traces. Normal
        // release bundles remain unchanged; only the explicit profile flavor
        // carries maps for correlating hot frames back to source.
        sourcemap: profileBuild,
        // Keep function/class names only in the explicit profile flavor. The
        // optimized profile remains minified, but this small bundler overhead
        // preserves React component attribution; normal builds stay untouched.
        ...(profileBuild
            ? {
                  rolldownOptions: {
                      output: {
                          keepNames: true,
                      },
                  },
              }
            : {}),
    },
});
