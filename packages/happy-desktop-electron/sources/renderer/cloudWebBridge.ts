import type { DesktopConfig, HappyDesktopBridge } from "../shared/desktopContract";
import { browserDevBridgeCreate } from "./browserDevBridge";
import { cloudWebSessionRead, cloudWebSignIn } from "./cloudWeb";

const CONFIG_KEY = "happy.desktop.config";
const CONFIG_EMPTY: DesktopConfig = {
    appearance: "system",
    defaultEffort: "medium",
    defaultPermissionMode: "auto",
    modelPreferences: [],
    scrollbarVisibility: "automatic",
    version: 1,
};

function configRead(): DesktopConfig {
    try {
        const stored = window.localStorage.getItem(CONFIG_KEY);
        const parsed: unknown = stored === null ? undefined : JSON.parse(stored);
        return typeof parsed === "object" && parsed !== null && "version" in parsed
            ? { ...CONFIG_EMPTY, ...(parsed as Partial<DesktopConfig>), version: 1 }
            : CONFIG_EMPTY;
    } catch {
        return CONFIG_EMPTY;
    }
}

function configWrite(config: DesktopConfig): void {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/** The server's Happy Agent version, as its own health says. */
async function versionRead(): Promise<string> {
    const response = await fetch("/v0/health", { headers: { accept: "application/json" } });
    const body = (await response.json().catch(() => ({}))) as {
        readonly version?: { readonly daemon?: unknown } | string;
        readonly daemon?: unknown;
    };
    const version =
        typeof body.version === "object" ? body.version.daemon : (body.version ?? body.daemon);
    return typeof version === "string" ? version : "0.0.0";
}

/**
 * The bridge for the cloud web app. The page's own server stands where the
 * local Happy Agent stands in the desktop: its address is the page's origin,
 * so every request is same-origin and carries the edge's cookies. Preferences
 * live in this browser. Everything the browser cannot do degrades as in
 * browser development.
 */
export function cloudWebBridgeCreate(): HappyDesktopBridge {
    const browser = browserDevBridgeCreate();
    return {
        ...browser,
        desktopConfigGet: async () => configRead(),
        desktopConfigWrite: async (config) => configWrite(config),
        desktopConfigUpdate: async (_previous, next) => configWrite(next),
        runtimeGet: async () => {
            if (!(await cloudWebSessionRead())) {
                cloudWebSignIn();
                // The page is leaving; nothing here is ever ready.
                return new Promise<never>(() => undefined);
            }
            const host = window.location.hostname;
            return {
                activeTarget: {
                    authentication: "happyAgent",
                    detail: host,
                    id: "cloud-web",
                    kind: "local",
                    label: host.split(".")[0] ?? host,
                    mode: "local",
                    happyAgentVersion: await versionRead(),
                    happyAgentHttpUrl: window.location.origin,
                },
                activeTargetId: "cloud-web",
                connectionId: 1,
                mode: "local",
                phase: "ready",
                targets: [],
                update: { status: "idle" },
            };
        },
    };
}
