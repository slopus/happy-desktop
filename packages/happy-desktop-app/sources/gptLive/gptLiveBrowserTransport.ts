import type { GptLiveControlSocket, GptLiveControlSocketHandlers } from "happy-desktop-state";

/** The browser transports text; the state runtime validates the daemon's closed control contract. */
export function gptLiveBrowserTransport(
    url: string,
    handlers: GptLiveControlSocketHandlers,
): GptLiveControlSocket {
    const socket = new WebSocket(url);
    let stopped = false;
    const detach = () => {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
    };
    const close = () => {
        if (stopped) return;
        stopped = true;
        detach();
        socket.close();
    };
    const fail = (message: string) => {
        if (stopped) return;
        close();
        handlers.failed(message);
    };
    socket.onopen = () => {
        if (!stopped) handlers.opened();
    };
    socket.onmessage = (event: MessageEvent<unknown>) => {
        if (stopped) return;
        if (typeof event.data !== "string") {
            fail("Voice control sent an unsupported binary frame.");
            return;
        }
        handlers.messageReceived(event.data);
    };
    socket.onerror = () => fail("Voice control could not connect. Start a new call to reconnect.");
    socket.onclose = () => {
        if (stopped) return;
        stopped = true;
        detach();
        handlers.closed();
    };
    return {
        send(text) {
            if (stopped || socket.readyState !== WebSocket.OPEN)
                throw new Error("Voice control is not connected.");
            socket.send(text);
        },
        close,
    };
}
