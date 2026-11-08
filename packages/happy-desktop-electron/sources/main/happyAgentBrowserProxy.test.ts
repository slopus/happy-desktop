import { request } from "node:http";
import { connect, createServer, type Server, type Socket } from "node:net";
import { Duplex } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
    happyAgentBrowserProxyCreate,
    relay,
    type HappyAgentBrowserProxyHandle,
} from "./happyAgentBrowserProxy";

/**
 * Stands in for the daemon's tunnel: each tunnel is a fresh connection to a
 * server that answers the one request Chromium's proxy forwards over it.
 */
function daemonStandIn(answer: (socket: Socket, head: string) => void): Promise<Server> {
    const server = createServer({ allowHalfOpen: true }, (socket) => {
        let head = "";
        const read = (chunk: Buffer) => {
            head += chunk.toString("latin1");
            if (!head.includes("\r\n\r\n")) return;
            socket.removeListener("data", read);
            answer(socket, head);
        };
        socket.on("data", read);
        socket.on("error", () => socket.destroy());
    });
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function tunnelOpen(server: Server) {
    const { port } = server.address() as { port: number };
    return () =>
        new Promise<Duplex>((resolve, reject) => {
            const socket = connect(port, "127.0.0.1", () => resolve(socket));
            socket.once("error", reject);
        });
}

function authorization(proxy: HappyAgentBrowserProxyHandle): string {
    return `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64")}`;
}

describe("the workspace browser's loopback proxy", () => {
    let proxy: HappyAgentBrowserProxyHandle | undefined;
    let daemon: Server | undefined;

    afterEach(() => {
        proxy?.close();
        daemon?.close();
    });

    it("fails a response whose body the agent's network cut short, instead of leaving it open", async () => {
        daemon = await daemonStandIn((socket) => {
            socket.write("HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\nonly ten b");
            setTimeout(() => socket.destroy(), 20);
        });
        proxy = await happyAgentBrowserProxyCreate({ openHttpProxy: tunnelOpen(daemon) });
        const started = Date.now();
        const outcome = await new Promise<{ status?: number; body: string; complete: boolean }>(
            (resolve) => {
                const sent = request({
                    host: "127.0.0.1",
                    port: proxy!.port,
                    path: "http://dev.example:3000/",
                    headers: {
                        host: "dev.example:3000",
                        "proxy-authorization": authorization(proxy!),
                    },
                });
                sent.on("response", (response) => {
                    let body = "";
                    response.on("data", (chunk: Buffer) => (body += chunk.toString()));
                    response.on("error", () => undefined);
                    response.once("close", () =>
                        resolve({
                            status: response.statusCode,
                            body,
                            complete: response.complete,
                        }),
                    );
                });
                sent.on("error", () => undefined);
                sent.end();
            },
        );
        expect(outcome).toEqual({ status: 200, body: "only ten b", complete: false });
        expect(Date.now() - started).toBeLessThan(2_000);
    });

    it("delivers everything a CONNECT tunnel's origin sent before it closed", async () => {
        const payload = Buffer.alloc(8 * 1024 * 1024, 7);
        daemon = await daemonStandIn((socket) => {
            socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
            // The origin answers once the browser has finished asking, then hangs up.
            socket.once("end", () => {
                socket.write(payload);
                socket.end();
            });
            socket.resume();
        });
        proxy = await happyAgentBrowserProxyCreate({ openHttpProxy: tunnelOpen(daemon) });
        const { port } = { port: proxy.port };
        const received = await new Promise<number>((resolve, reject) => {
            const browser = connect(port, "127.0.0.1", () => {
                browser.write(
                    `CONNECT dev.example:443 HTTP/1.1\r\nHost: dev.example:443\r\nProxy-Authorization: ${authorization(proxy!)}\r\n\r\n`,
                );
            });
            let head = "";
            let length = 0;
            let open = false;
            browser.on("data", (chunk: Buffer) => {
                if (open) {
                    length += chunk.length;
                    return;
                }
                head += chunk.toString("latin1");
                const end = head.indexOf("\r\n\r\n");
                if (end < 0) return;
                open = true;
                length += Buffer.byteLength(head.slice(end + 4), "latin1");
                browser.end("request");
                // A browser that is slow to read leaves the tail queued in the proxy.
                browser.pause();
                setTimeout(() => browser.resume(), 300);
            });
            browser.once("close", () => resolve(length));
            browser.once("error", reject);
        });
        expect(received).toBe(payload.length);
    });
});

describe("relay", () => {
    /**
     * A side whose writes land only after a delay, as a socket's do when the
     * reader is slow: what it has taken is recorded once each write completes.
     */
    function slowSide() {
        const written: string[] = [];
        const side = new Duplex({
            read() {},
            write(chunk: Buffer, _encoding, done) {
                setTimeout(() => {
                    written.push(chunk.toString());
                    done();
                }, 30);
            },
        });
        return { side, written };
    }

    it("lets the other side take the tail when one side ends cleanly", async () => {
        const browser = slowSide();
        const origin = new Duplex({ read() {}, write: (_chunk, _encoding, done) => done() });
        relay(browser.side, origin);
        origin.push("head ");
        origin.push("tail");
        origin.push(null);
        origin.end();
        await new Promise((resolve) => browser.side.once("close", resolve));
        expect(browser.written.join("")).toBe("head tail");
    });

    it("tears the other side down at once when one side fails", async () => {
        const browser = slowSide();
        const origin = new Duplex({ read() {}, write: (_chunk, _encoding, done) => done() });
        origin.on("error", () => undefined);
        relay(browser.side, origin);
        origin.destroy(new Error("reset"));
        await new Promise((resolve) => browser.side.once("close", resolve));
        expect(browser.side.destroyed).toBe(true);
    });
});
