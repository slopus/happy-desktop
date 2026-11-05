import { availableParallelism } from "node:os";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";
import { lottieLocalWasmPlugin } from "./vite/lottiePlugin";
import { testDepthBrowsers, testDepthRead } from "happy-desktop-gym/test-depth";

const depth = testDepthRead(process.env.HAPPY_TEST_DEPTH);
const browsers = testDepthBrowsers(depth);

export default defineConfig({
    define: { "import.meta.env.HAPPY_TEST_DEPTH": JSON.stringify(depth) },
    plugins: [
        tailwindcss(),
        react(),
        babel({ presets: [reactCompilerPreset()] }),
        lottieLocalWasmPlugin(),
    ],
    build: {
        lib: {
            entry: resolve(import.meta.dirname, "src/index.ts"),
            formats: ["es"],
            fileName: "index",
        },
        rollupOptions: {
            external: ["react", "react-dom", "react/jsx-runtime"],
        },
    },
    test: {
        setupFiles: ["./src/testing/browserSetup.ts"],
        exclude: [...configDefaults.exclude, "eslint/**"],
        // Optical tests take several black/white Retina captures per fixture.
        // Three browsers run concurrently, so the 15s Vitest default is too
        // tight under ordinary desktop contention even when every assertion
        // is healthy.
        testTimeout: 30_000,
        /* The selected engines run as parallel projects, and Vitest sizes
         * each project's browser pool on its own at min(12, cpus - 1). That is 36
         * concurrent tabs on a 16-core machine, every one a real browser painting a
         * 1660² surface at 2x — roughly 20 GB resident and far more runnable threads
         * than cores. The result is not a uniformly slower suite but a starved one:
         * measured against this file's own timeout, the slowest optical test stretched
         * from 6.2s to 48.1s, so whichever test lost the scheduler that run either blew
         * the timeout or lost an ordinary render race, and a different one failed every
         * time. Size each pool so all three engines together ask for about three
         * quarters of the machine, and keep Vitest's own ceiling of 12 per pool: past
         * that the single node process driving all three chokes, which is what the cap
         * in its source is for. Bounding it this way is also strictly faster in wall
         * clock (61.6s against 89.6s), so developers and release validation share one
         * setting. Cheap and full divide the same budget across their engine count. */
        maxWorkers: Math.max(
            1,
            Math.min(12, Math.round((availableParallelism() * 0.75) / browsers.length)),
        ),
        browser: {
            /* Lets a test read its component as a reader who asked for reduced
             * motion does; the page goes back to no preference when it is done. */
            commands: {
                reducedMotionEmulate: async ({ page }, reduce: boolean) => {
                    await page.emulateMedia({ reducedMotion: reduce ? "reduce" : "no-preference" });
                },
                scrollReproWheel: async ({ page, iframe }, deltaY: number) => {
                    const box = await iframe
                        .locator("[data-scrollbar-viewport]")
                        .first()
                        .boundingBox();
                    if (!box) throw new Error("Scroll repro viewport is missing");
                    if (process.env.HAPPY_SCROLL_REPRO_NATIVE === "1") {
                        if (process.platform !== "win32")
                            throw new Error("Native wheel repro requires Windows");
                        const windowGeometry = await page.evaluate(() => ({
                            x: window.screenX + (window.outerWidth - window.innerWidth) / 2,
                            y:
                                window.screenY +
                                window.outerHeight -
                                window.innerHeight -
                                (window.outerWidth - window.innerWidth) / 2,
                            screenWidth: window.screen.width,
                            screenHeight: window.screen.height,
                            devicePixelRatio: window.devicePixelRatio,
                            outerWidth: window.outerWidth,
                            outerHeight: window.outerHeight,
                            innerWidth: window.innerWidth,
                            innerHeight: window.innerHeight,
                        }));
                        const x = Math.round(windowGeometry.x + box.x + box.width / 2);
                        const y = Math.round(windowGeometry.y + box.y + box.height / 2);
                        const output = execFileSync(
                            "powershell.exe",
                            [
                                "-NoLogo",
                                "-NoProfile",
                                "-NonInteractive",
                                "-File",
                                resolve(
                                    import.meta.dirname,
                                    "../../scripts/windows-scroll-wheel.ps1",
                                ),
                                "-ScreenX",
                                String(x),
                                "-ScreenY",
                                String(y),
                                "-Delta",
                                String(deltaY < 0 ? 120 : -120),
                            ],
                            { stdio: "pipe" },
                        );
                        console.log(
                            "NATIVE_WHEEL_GEOMETRY",
                            JSON.stringify({ windowGeometry, box, x, y }),
                            output.toString(),
                        );
                        return;
                    }
                    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                    await page.mouse.wheel(0, deltaY);
                },
                scrollReproDrag: async ({ page, iframe }, direction: "up" | "down") => {
                    const track = iframe
                        .locator('[data-scrollbar-track][data-axis="vertical"]')
                        .first();
                    const thumb = track.locator(".happy-scrollbar__thumb");
                    const box = await thumb.boundingBox();
                    const trackBox = await track.boundingBox();
                    if (!box || !trackBox)
                        throw new Error("Scroll repro thumb or track is missing");
                    const x = box.x + box.width / 2;
                    const y = box.y + box.height / 2;
                    const distance =
                        direction === "up" ? -300 : trackBox.y + trackBox.height + box.height - y;
                    await page.mouse.move(x, y);
                    await page.mouse.down();
                    for (let i = 1; i <= 10; i += 1) {
                        await page.mouse.move(x, y + (distance * i) / 10);
                        await new Promise((resolve) => setTimeout(resolve, 40));
                    }
                    await page.mouse.up();
                },
                scrollReproKey: async ({ page, iframe }, key: string) => {
                    await iframe.locator("[data-scrollbar-viewport]").first().focus();
                    await page.keyboard.press(key);
                },
            },
            enabled: true,
            headless: process.env.HAPPY_SCROLL_REPRO_HEADED !== "1",
            instances: browsers.map((browser) => ({ browser })),
            provider: playwright({
                launchOptions: {
                    ...(process.env.HAPPY_SCROLL_REPRO_SMOOTH === "1"
                        ? {
                              args: ["--enable-smooth-scrolling"],
                              ignoreDefaultArgs: ["--disable-smooth-scrolling"],
                          }
                        : {}),
                    /* Firefox honours HTTP_PROXY/ALL_PROXY from the environment,
                     * so on a machine behind a local proxy it cannot reach the
                     * Vitest server on loopback and every session times out.
                     * Chromium and WebKit ignore those variables under
                     * Playwright; pin Firefox to a direct connection so all
                     * three behave the same wherever the suite runs. */
                    firefoxUserPrefs: { "network.proxy.type": 0 },
                },
                contextOptions: {
                    deviceScaleFactor: Number(process.env.HAPPY_SCROLL_REPRO_DPR ?? 2),
                    /* Must be >= the tester viewport below: when the browser
                     * window is smaller, vitest CSS-scales the tester iframe
                     * and element captures come out at a fraction of true 2x. */
                    viewport: {
                        height: 1660,
                        width: 1660,
                    },
                },
            }),
            ui: false,
            /* Element captures clip to the viewport; keep it larger than any
             * test surface so screenshots and pixel measurements never truncate. */
            viewport: {
                height: 1600,
                width: 1600,
            },
        },
    },
});
