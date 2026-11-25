import { rename, unlink } from "node:fs/promises";
import { connect, createServer, type Server, type Socket } from "node:net";

/**
 * A network-like delay in front of a daemon's Unix socket: the socket file is
 * moved aside and a proxy takes its place, holding every chunk for half the
 * round trip plus jitter in each direction while keeping each stream's order.
 * The remote's Tailcat `serve` dials this path, so everything the host sends
 * the remote, and every answer, crosses it.
 */
export async function socketDelayInsert(
    socketPath: string,
    options: { readonly roundTripMs: number; readonly jitterMs: number },
): Promise<{ stop(): Promise<void>; readonly chunks: () => number }> {
    const direct = `${socketPath}.direct`;
    await rename(socketPath, direct);
    let chunks = 0;
    const sockets = new Set<Socket>();
    const oneWay = () =>
        Math.max(0, options.roundTripMs / 2 + (Math.random() - 0.5) * options.jitterMs);
    /**
     * Forwards `from` to `to` through one queue: each chunk waits for its own
     * delay but never overtakes the chunk before it. Separate timers per chunk
     * would let chunks due at the same moment fire out of order.
     */
    const delayed = (from: Socket, to: Socket) => {
        const queue: { at: number; chunk: Buffer | null }[] = [];
        let timer: ReturnType<typeof setTimeout> | undefined;
        const pump = () => {
            timer = undefined;
            while (queue.length > 0 && queue[0]!.at <= Date.now()) {
                const { chunk } = queue.shift()!;
                if (to.destroyed) continue;
                if (chunk === null) to.end();
                else to.write(chunk);
            }
            if (queue.length > 0) timer = setTimeout(pump, queue[0]!.at - Date.now());
        };
        const enqueue = (chunk: Buffer | null) => {
            const previous = queue.at(-1)?.at ?? 0;
            queue.push({ at: Math.max(Date.now() + oneWay(), previous), chunk });
            if (timer === undefined) timer = setTimeout(pump, queue[0]!.at - Date.now());
        };
        from.on("data", (chunk: Buffer) => {
            chunks++;
            enqueue(chunk);
        });
        from.on("end", () => enqueue(null));
    };
    const server: Server = createServer({ allowHalfOpen: true }, (client) => {
        const upstream = connect({ path: direct, allowHalfOpen: true });
        for (const socket of [client, upstream]) {
            sockets.add(socket);
            socket.on("close", () => sockets.delete(socket));
            socket.on("error", () => {
                client.destroy();
                upstream.destroy();
            });
        }
        delayed(client, upstream);
        delayed(upstream, client);
    });
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, () => resolve());
    });
    return {
        chunks: () => chunks,
        async stop() {
            for (const socket of sockets) socket.destroy();
            await new Promise<void>((resolve) => server.close(() => resolve()));
            await unlink(socketPath).catch(() => undefined);
            await rename(direct, socketPath).catch(() => undefined);
        },
    };
}
