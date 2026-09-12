/*
 * The pointer the video shows.
 *
 * A headless browser draws no cursor, so clicks would otherwise happen with
 * nothing on screen to explain them. This installs a drawn one: an arrow, a
 * press state, a click ripple, and a keyboard badge, all in a layer that takes
 * no pointer events so the page underneath still behaves exactly as it would
 * for a real mouse.
 *
 * The director poses this overlay on its continuous wall-time timeline. The
 * application and its animations keep their native clocks throughout.
 */

/** Runs in the page. Serialized by `addInitScript`, so it may not close over anything. */
export function overlayInstall(options) {
    // -------------------------------------------------- the scripted daemon
    //
    // Browser-local mode has no machine-local daemon lifecycle to report, so
    // the dev bridge asks this scenario instead (`window.happyDemoDaemon`).
    // The recorder publishes genuine daemon snapshot progressions — update
    // available, downloaded, draining, restarting — while it restarts the
    // actual gym daemon out of band. Every surface that reads these snapshots
    // is the production code path: the real daemon store, the real sidebar
    // update action, the real full-window restart screen, and the real
    // retained application and reconnection when the install completes.
    if (options.daemon) {
        const daemon = { installAsked: false, listeners: new Set(), snapshot: options.daemon };
        window.happyDemoDaemon = {
            get: () => daemon.snapshot,
            subscribe(listener) {
                daemon.listeners.add(listener);
                return () => daemon.listeners.delete(listener);
            },
            install() {
                daemon.installAsked = true;
                return Promise.resolve();
            },
        };
        window.__happyDemoDaemon = {
            installAsked: () => daemon.installAsked,
            publish(snapshot) {
                daemon.snapshot = snapshot;
                // A listener may unsubscribe while handling this snapshot; the
                // delivery set for one published state must remain stable.
                // oxlint-disable-next-line unicorn/no-useless-spread -- snapshot the mutable listener set.
                for (const listener of [...daemon.listeners]) listener(snapshot);
            },
        };
    }

    const persistedTurnElapsed = Number.parseFloat(
        window.sessionStorage.getItem("happy-demo-turn-elapsed") ?? "",
    );
    const persistedTurnStart = Number.parseFloat(
        window.sessionStorage.getItem("happy-demo-turn-start") ?? "",
    );
    const persistedTurnStartedAt = Number.parseFloat(
        window.sessionStorage.getItem("happy-demo-turn-started-at") ?? "",
    );
    const persistedVideoNow = Number.parseFloat(
        window.sessionStorage.getItem("happy-demo-video-now") ?? "",
    );
    const clock = {
        lastTurnElapsed: Number.isFinite(persistedTurnElapsed) ? persistedTurnElapsed : undefined,
        settledAtVideo: undefined,
        settledTurnElapsed: undefined,
        turnStartVideo: Number.isFinite(persistedTurnStart) ? persistedTurnStart : undefined,
        turnStartedAt: Number.isFinite(persistedTurnStartedAt) ? persistedTurnStartedAt : undefined,
        videoNow: Number.isFinite(persistedVideoNow) ? persistedVideoNow : 0,
    };

    const install = () => {
        if (document.getElementById("happy-demo-overlay")) return;
        const layer = document.createElement("div");
        layer.id = "happy-demo-overlay";
        layer.setAttribute("aria-hidden", "true");
        layer.style.cssText = [
            "position:fixed",
            "inset:0",
            "pointer-events:none",
            "z-index:2147483647",
            "overflow:hidden",
            "contain:strict",
        ].join(";");

        const ripples = document.createElement("div");
        ripples.style.cssText = "position:absolute;inset:0";
        layer.append(ripples);

        const pointer = document.createElement("div");
        pointer.style.cssText = [
            "position:absolute",
            "top:0",
            "left:0",
            "width:28px",
            "height:36px",
            "will-change:transform",
            `filter:drop-shadow(0 3px 6px rgba(0,0,0,${options.shadow}))`,
        ].join(";");
        pointer.innerHTML = `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 1.6 L2 27.4 L8.9 20.7 L13.3 30.6 L17.8 28.6 L13.5 18.9 L22.6 18.9 Z" fill="${options.fill}" stroke="${options.stroke}" stroke-width="1.7" stroke-linejoin="round"/></svg>`;
        layer.append(pointer);

        const badge = document.createElement("div");
        badge.style.cssText = [
            "position:absolute",
            "left:50%",
            "bottom:56px",
            "transform:translateX(-50%)",
            "display:flex",
            "gap:8px",
            "opacity:0",
        ].join(";");
        layer.append(badge);

        document.documentElement.append(layer);

        // The pointer is drawn from its tip, and the arrow's tip sits a little
        // inside its own box, so every pose subtracts that offset. A press
        // shrinks the arrow about the tip rather than about the box centre,
        // which is what makes it read as pressing rather than sliding.
        const tip = { x: 2, y: 1.6 };
        const state = { x: -100, y: -100, press: 0, visible: true };
        const pose = () => {
            const scale = 1 - state.press * 0.14;
            pointer.style.opacity = state.visible ? "1" : "0";
            pointer.style.transform =
                `translate(${state.x - tip.x * scale}px, ${state.y - tip.y * scale}px)` +
                ` scale(${scale})`;
        };
        pose();

        window.__happyDemo = {
            /** Advances the take clock for one frame while the page stays real-time. */
            clockLiveTick(stepMs) {
                clock.videoNow += stepMs;
                window.sessionStorage.setItem("happy-demo-video-now", String(clock.videoNow));
            },
            /** Observes the real product clock; never changes its returned value. */
            turnElapsed(startedAt, realElapsed) {
                if (clock.turnStartedAt !== startedAt) {
                    clock.turnStartedAt = startedAt;
                    clock.turnStartVideo = clock.videoNow - realElapsed;
                    clock.lastTurnElapsed = undefined;
                    clock.settledAtVideo = undefined;
                    clock.settledTurnElapsed = undefined;
                    window.sessionStorage.setItem("happy-demo-turn-started-at", String(startedAt));
                    window.sessionStorage.setItem(
                        "happy-demo-turn-start",
                        String(clock.turnStartVideo),
                    );
                }
                clock.lastTurnElapsed = realElapsed;
                window.sessionStorage.setItem("happy-demo-turn-elapsed", String(realElapsed));
                return realElapsed;
            },
            /** Records the server's settled duration without substituting video time. */
            turnSettled(startedAt, realElapsed) {
                if (clock.turnStartedAt !== startedAt || clock.turnStartVideo === undefined)
                    return realElapsed;
                if (clock.settledTurnElapsed === undefined) {
                    clock.settledAtVideo = clock.videoNow;
                    clock.settledTurnElapsed = realElapsed;
                }
                return realElapsed;
            },
            /** Returns the take clock so the scenario can prove its footer is 1:1. */
            clockSnapshot() {
                return {
                    lastTurnElapsed: clock.lastTurnElapsed,
                    settledAtVideo: clock.settledAtVideo,
                    settledTurnElapsed: clock.settledTurnElapsed,
                    turnStartVideo: clock.turnStartVideo,
                    turnStartedAt: clock.turnStartedAt,
                    videoNow: clock.videoNow,
                };
            },
            /** Places the pointer tip, in CSS pixels, and sets how far it is pressed. */
            pointer(x, y, press, visible) {
                state.x = x;
                state.y = y;
                state.press = press;
                state.visible = visible;
                pose();
            },
            /** Adds a ripple whose life the director advances frame by frame. */
            ripple(x, y) {
                const node = document.createElement("div");
                node.style.cssText = [
                    "position:absolute",
                    "border-radius:9999px",
                    `border:2px solid ${options.ripple}`,
                    `background:${options.rippleFill}`,
                    "will-change:transform,opacity",
                ].join(";");
                node.dataset.x = String(x);
                node.dataset.y = String(y);
                node.dataset.life = "0";
                ripples.append(node);
            },
            /**
             * Advances every ripple by one frame. A ripple grows to its full
             * size early and spends the rest of its life fading, so the click
             * reads as an impact rather than a slow bloom.
             */
            rippleStep(step) {
                // Snapshot first because expired nodes are removed during the
                // walk; iterating the live HTMLCollection would skip siblings.
                for (const node of Array.from(ripples.children)) {
                    const life = Number(node.dataset.life) + step;
                    if (life >= 1) {
                        node.remove();
                        continue;
                    }
                    node.dataset.life = String(life);
                    const eased = 1 - (1 - life) ** 3;
                    const size = 18 + eased * 62;
                    node.style.width = `${size}px`;
                    node.style.height = `${size}px`;
                    node.style.left = `${Number(node.dataset.x) - size / 2}px`;
                    node.style.top = `${Number(node.dataset.y) - size / 2}px`;
                    node.style.opacity = String((1 - life) ** 1.6);
                }
            },
            /** Shows a keyboard chord as macOS key caps, or clears it when empty. */
            keys(caps) {
                if (caps.length === 0) {
                    badge.style.opacity = "0";
                    badge.replaceChildren();
                    return;
                }
                badge.replaceChildren(
                    ...caps.map((cap) => {
                        const node = document.createElement("div");
                        node.textContent = cap;
                        node.style.cssText = [
                            "min-width:38px",
                            "height:38px",
                            "padding:0 12px",
                            "display:flex",
                            "align-items:center",
                            "justify-content:center",
                            "border-radius:9px",
                            `background:${options.capFill}`,
                            `color:${options.capText}`,
                            `border:1px solid ${options.capBorder}`,
                            "box-shadow:0 2px 0 rgba(0,0,0,0.35), 0 6px 18px rgba(0,0,0,0.35)",
                            "font:600 19px/1 ui-sans-serif,-apple-system,system-ui,sans-serif",
                        ].join(";");
                        return node;
                    }),
                );
                badge.style.opacity = "1";
            },
            /** Fades the key caps out over the life the director gives them. */
            keysFade(value) {
                badge.style.opacity = String(value);
            },
        };
    };
    if (document.documentElement) install();
    else document.addEventListener("DOMContentLoaded", install, { once: true });
}

/**
 * The scripted daemon's opening state: a healthy, managed local agent with no
 * news. Progressions the recorder publishes start from here.
 */
export const demoDaemonBaseline = {
    install: { phase: "idle" },
    installation: "installed",
    installedVersion: "0.4.62",
    managed: true,
    operation: "idle",
    runtime: "ready",
    updateAvailable: false,
    versions: [],
};

/** How the pointer is drawn, per appearance. Light UI takes the macOS arrow; dark inverts it. */
export function overlayOptions(appearance) {
    if (appearance === "light")
        return {
            capBorder: "rgba(0,0,0,0.14)",
            capFill: "rgba(255,255,255,0.96)",
            capText: "#101216",
            fill: "#0b0d10",
            ripple: "rgba(20,22,26,0.55)",
            rippleFill: "rgba(20,22,26,0.12)",
            shadow: 0.28,
            stroke: "#ffffff",
        };
    return {
        capBorder: "rgba(255,255,255,0.16)",
        capFill: "rgba(28,31,38,0.94)",
        capText: "#f2f4f8",
        fill: "#ffffff",
        ripple: "rgba(255,255,255,0.62)",
        rippleFill: "rgba(255,255,255,0.14)",
        shadow: 0.45,
        stroke: "rgba(10,12,16,0.85)",
    };
}
