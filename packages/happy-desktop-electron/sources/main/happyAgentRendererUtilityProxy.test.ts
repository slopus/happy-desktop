import { EventEmitter } from "node:events";
import type { Session, UtilityProcess, WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { happyAgentRendererUtilityProxyCreate } from "./happyAgentRendererUtilityProxy";
import { happyAgentRendererSessionCreate } from "./happyAgentRendererSession";
import type {
    RendererCloudSite,
    RendererUtilityInput,
} from "../shared/happyAgentRendererUtilityContract";
import { ArtifactSiteError } from "./artifactSite";

class FakeUtility extends EventEmitter {
    readonly sent: RendererUtilityInput[] = [];
    ack = true;
    postMessage(message: RendererUtilityInput) {
        this.sent.push(message);
        if (this.ack && message.type === "backing")
            queueMicrotask(() => this.emit("message", { type: "attached", id: message.id }));
    }
    kill() {
        this.emit("exit", 1);
        return true;
    }
    ready(port: number) {
        this.emit("message", {
            type: "ready",
            port,
            username: `user-${String(port)}`,
            password: `pass-${String(port)}`,
        });
    }
}

describe("isolated renderer proxy lifecycle", () => {
    it("retries a utility that exits before the first route is installed", async () => {
        const failed = new FakeUtility();
        const recovered = new FakeUtility();
        const workers = [failed, recovered];
        const ready = vi.fn(async () => undefined);
        const starting = happyAgentRendererUtilityProxyCreate({
            fork: () => workers.shift() as unknown as UtilityProcess,
            ready,
            offline: () => undefined,
        });
        failed.kill();
        await new Promise((resolve) => setTimeout(resolve, 160));
        recovered.ready(11111);
        const proxy = await starting;
        expect(proxy.port).toBe(11111);
        expect(ready).toHaveBeenCalledOnce();
        proxy.close();
    });

    it("acks private backing before route activation and restores it after a worker crash", async () => {
        const first = new FakeUtility();
        const second = new FakeUtility();
        const workers = [first, second];
        const routeReady = vi.fn(async () => undefined);
        const offline = vi.fn();
        const starting = happyAgentRendererUtilityProxyCreate({
            fork: () => workers.shift() as unknown as UtilityProcess,
            ready: routeReady,
            offline,
        });
        first.ready(10101);
        const proxy = await starting;
        const target = {
            url: "http://127.0.0.1:20202/private-capability",
            terminalCapability: "private-capability",
            transport: { socketPath: "/private/daemon.sock", token: "secret-token" },
            requestHandle: vi.fn(),
        };
        const detach = await proxy.targetSet(target);
        expect(first.sent).toEqual([
            {
                type: "backing",
                id: 1,
                bridgeUrl: target.url,
                terminalCapability: target.terminalCapability,
                transport: target.transport,
            },
        ]);
        expect(proxy.port).toBe(10101);
        expect(routeReady).toHaveBeenCalledOnce();

        first.kill();
        expect(proxy.port).toBe(0);
        expect(offline).toHaveBeenCalledOnce();
        await new Promise((resolve) => setTimeout(resolve, 160));
        second.ready(30303);
        await vi.waitFor(() => expect(routeReady).toHaveBeenCalledTimes(2));
        expect(second.sent).toMatchObject([
            {
                type: "backing",
                bridgeUrl: target.url,
                transport: target.transport,
            },
        ]);
        expect(proxy.port).toBe(30303);
        detach();
        expect(second.sent.at(-1)).toMatchObject({ type: "detach" });
        proxy.close();
        expect(proxy.port).toBe(0);
    });

    it("rejects an unacknowledged replacement when the worker exits", async () => {
        const first = new FakeUtility();
        const starting = happyAgentRendererUtilityProxyCreate({
            fork: () => first as unknown as UtilityProcess,
            ready: async () => undefined,
            offline: () => undefined,
        });
        first.ready(10101);
        const proxy = await starting;
        first.ack = false;
        const replacement = proxy.targetSet({
            url: "http://127.0.0.1:20202/private-capability",
            terminalCapability: "private-capability",
            transport: { socketPath: "/private/daemon.sock", token: "secret-token" },
            requestHandle: vi.fn(),
        });
        first.kill();
        await expect(replacement).rejects.toThrow("exited");
        proxy.close();
    });

    it("opens a Happy Cloud site for the utility with no Happy Agent backing it", async () => {
        const first = new FakeUtility();
        const cloudSiteOpen = vi.fn(async (_connectionId: string, site: RendererCloudSite) => {
            if (site.kind === "artifact")
                throw new ArtifactSiteError(403, "Sign in to this server to use it.");
            return "happy-artifact://vault-a-v3.cabc/index.html";
        });
        const starting = happyAgentRendererUtilityProxyCreate({
            fork: () => first as unknown as UtilityProcess,
            ready: async () => undefined,
            offline: () => undefined,
            cloudSiteOpen,
        });
        first.ready(10101);
        const proxy = await starting;
        const vault = { kind: "vault", surfaceId: "s", fileId: "f", version: 3 } as const;
        first.emit("message", {
            type: "cloud-site-open",
            requestId: 7,
            connectionId: "cloud-acme",
            site: vault,
        });
        first.emit("message", {
            type: "cloud-site-open",
            requestId: 8,
            connectionId: "cloud-acme",
            site: { kind: "artifact", artifactId: "a", version: 2 },
        });
        await vi.waitFor(() => expect(first.sent).toHaveLength(2));
        expect(cloudSiteOpen).toHaveBeenCalledWith("cloud-acme", vault);
        expect(first.sent).toEqual([
            {
                type: "cloud-site-opened",
                requestId: 7,
                url: "happy-artifact://vault-a-v3.cabc/index.html",
            },
            {
                type: "cloud-site-refused",
                requestId: 8,
                status: 403,
                error: "Sign in to this server to use it.",
            },
        ]);
        expect(first.sent.some((message) => message.type === "backing")).toBe(false);
        proxy.close();
    });

    it("records voice ownership before acknowledging creation and restores it without replay after a utility crash", async () => {
        const first = new FakeUtility();
        const second = new FakeUtility();
        const workers = [first, second];
        const starting = happyAgentRendererUtilityProxyCreate({
            fork: () => workers.shift() as unknown as UtilityProcess,
            ready: async () => undefined,
            offline: () => undefined,
        });
        first.ready(10101);
        const proxy = await starting;
        const liveAttemptClose = vi.fn();
        await proxy.targetSet({
            url: "http://127.0.0.1:20202/capability",
            terminalCapability: "capability",
            transport: { socketPath: "/private/daemon.sock", token: "secret-token" },
            requestHandle: vi.fn(),
            liveAttemptClose,
        });
        proxy.liveWindowStart!("window-a");
        const attempt = { id: "liveattempt", windowId: "window-a", connectionId: "node-a" };
        first.emit("message", {
            type: "live-attempt-reserve",
            reservationId: 7,
            backingId: 1,
            attempt,
        });
        expect(first.sent.at(-1)).toEqual({
            type: "live-attempt-reserved",
            reservationId: 7,
            allowed: true,
        });
        expect(liveAttemptClose).not.toHaveBeenCalled();
        first.kill();
        expect(liveAttemptClose).toHaveBeenCalledWith(attempt);
        await new Promise((resolve) => setTimeout(resolve, 160));
        second.ready(30303);
        await vi.waitFor(() => expect(proxy.port).toBe(30303));
        expect(second.sent).toContainEqual({
            type: "live-attempt-restore",
            attempt,
            disposed: false,
        });
        expect(second.sent.map((message) => message.type)).toEqual([
            "backing",
            "live-window-start",
            "live-attempt-restore",
        ]);
        proxy.liveWindowClose!("window-b");
        expect(liveAttemptClose).toHaveBeenCalledOnce();
        proxy.liveWindowClose!("window-a");
        expect(liveAttemptClose).toHaveBeenCalledTimes(2);
        expect(second.sent.at(-1)).toEqual({ type: "live-window-close", windowId: "window-a" });
        proxy.close();
    });

    it("fails the main-frame gate closed during a crash and installs only a new authenticated PAC route", async () => {
        const first = new FakeUtility();
        const second = new FakeUtility();
        const workers = [first, second];
        const pac: string[] = [];
        const steps: string[] = [];
        let gate!: (details: never, callback: (result: { cancel: boolean }) => void) => void;
        let headers!: (
            details: never,
            callback: (result: {
                cancel?: boolean;
                requestHeaders?: Record<string, string>;
            }) => void,
        ) => void;
        const browserSession = {
            setPermissionCheckHandler: vi.fn(),
            setPermissionRequestHandler: vi.fn(),
            setProxy: async (settings: { pacScript: string }) => {
                pac.push(Buffer.from(settings.pacScript.split(",")[1]!, "base64").toString());
                const port = /PROXY 127\.0\.0\.1:(\d+)/u.exec(pac.at(-1)!)?.[1];
                steps.push(`proxy:${String(port)}`);
            },
            closeAllConnections: async () => {
                steps.push("close");
            },
            webRequest: {
                onBeforeRequest: (_filter: unknown, listener: typeof gate) => {
                    gate = listener;
                },
                onBeforeSendHeaders: (_filter: unknown, listener: typeof headers) => {
                    headers = listener;
                },
            },
        } as unknown as Session;
        const starting = happyAgentRendererSessionCreate(
            browserSession,
            () => workers.shift() as unknown as UtilityProcess,
        );
        first.ready(10101);
        const rendererSession = await starting;
        const frame = { url: "file:///app/index.html", detached: false };
        const contents = {
            id: 1,
            mainFrame: frame,
            session: browserSession,
            isDestroyed: () => false,
            once: () => undefined,
            on: () => undefined,
        } as unknown as WebContents;
        rendererSession.windowRegister(contents, frame.url, false);
        const details = {
            webContentsId: 1,
            frame,
            url: "http://happy-agent/v0/history",
            requestHeaders: {},
        } as never;
        const allowed = () => {
            let cancelled = true;
            gate(details, ({ cancel }) => {
                cancelled = cancel;
            });
            return !cancelled;
        };
        expect(allowed()).toBe(true);
        let originalAuth = "";
        headers(details, ({ requestHeaders }) => {
            originalAuth = requestHeaders?.["Proxy-Authorization"] ?? "";
        });
        expect(originalAuth).toContain("Basic ");
        expect(pac.at(-1)).toContain("PROXY 127.0.0.1:10101");
        expect(pac.at(-1)).not.toContain('"DIRECT" : "DIRECT"');
        expect(steps).toEqual(["proxy:10101", "close"]);

        first.kill();
        expect(allowed()).toBe(false);
        await vi.waitFor(() => expect(steps).toEqual(["proxy:10101", "close", "proxy:9", "close"]));
        await new Promise((resolve) => setTimeout(resolve, 160));
        second.ready(30303);
        await vi.waitFor(() => expect(allowed()).toBe(true));
        expect(pac.at(-1)).toContain("PROXY 127.0.0.1:30303");
        expect(steps).toEqual(["proxy:10101", "close", "proxy:9", "close", "proxy:30303", "close"]);
        let nextAuth = "";
        headers(details, ({ requestHeaders }) => {
            nextAuth = requestHeaders?.["Proxy-Authorization"] ?? "";
        });
        expect(nextAuth).not.toBe(originalAuth);
        rendererSession.close();
    });
});
