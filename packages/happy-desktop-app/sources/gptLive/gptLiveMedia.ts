/** Browser-only media. Provider credentials and provider control events never enter here. */
export interface GptLiveMedia {
    readonly offer: string;
    /** Local transport readiness only; the daemon separately confirms provider readiness. */
    readonly ready: Promise<void>;
    answerApply(sdp: string): Promise<void>;
    microphoneMutedUpdate(muted: boolean): void;
    /** Release microphone/audio immediately without interrupting provider close finalization. */
    silence(): void;
    close(): void;
}

function aborted(): DOMException {
    return new DOMException("The voice call ended.", "AbortError");
}

/**
 * Called only by the explicit Start flow after capability and host permission
 * gates. A late microphone permission grant is stopped, even if the window has
 * already disabled voice. The lifetime owns every track, listener and timer.
 */
export async function gptLiveMediaOpen(
    signal: AbortSignal,
    failed: (message: string) => void,
): Promise<GptLiveMedia> {
    if (signal.aborted) throw aborted();
    let closed = false;
    let silenced = false;
    let stream: MediaStream | undefined;
    let peer: RTCPeerConnection | undefined;
    let channel: RTCDataChannel | undefined;
    let output: HTMLAudioElement | undefined;
    let iceCancel: (() => void) | undefined;
    let readyResolve!: () => void;
    let readyReject!: (reason: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
    });
    // Permission/offer setup can fail before the caller receives this promise.
    void ready.catch(() => {});

    const silence = () => {
        if (silenced) return;
        silenced = true;
        for (const track of stream?.getTracks() ?? []) {
            track.onended = null;
            track.stop();
        }
        if (output) {
            output.pause();
            output.srcObject = null;
        }
    };

    const close = () => {
        if (closed) return;
        closed = true;
        readyReject(aborted());
        signal.removeEventListener("abort", close);
        iceCancel?.();
        iceCancel = undefined;
        if (peer) {
            peer.onconnectionstatechange = null;
            peer.ontrack = null;
        }
        for (const receiver of peer?.getReceivers() ?? []) receiver.track.stop();
        channel?.close();
        peer?.close();
        silence();
        if (output) {
            output.remove();
        }
    };
    signal.addEventListener("abort", close, { once: true });
    const fail = (message: string) => {
        if (closed) return;
        close();
        failed(message);
    };
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
        });
        if (closed || signal.aborted) {
            for (const track of stream.getTracks()) track.stop();
            throw aborted();
        }
        peer = new RTCPeerConnection({ iceServers: [] });
        output = new Audio();
        output.autoplay = true;
        peer.ontrack = (event) => {
            if (closed || silenced || !output) return;
            output.srcObject = event.streams[0] ?? new MediaStream([event.track]);
            void output
                .play()
                .catch(() =>
                    fail("Voice audio could not play. Check your audio output permissions."),
                );
        };
        peer.onconnectionstatechange = () => {
            if (peer?.connectionState === "connected") readyResolve();
            if (
                peer?.connectionState === "failed" ||
                peer?.connectionState === "disconnected" ||
                peer?.connectionState === "closed"
            ) {
                fail("The voice media connection ended. Start a new call to reconnect.");
            }
        };
        for (const track of stream.getAudioTracks()) {
            track.onended = () =>
                fail(
                    "Microphone access ended. Start a new call when your microphone is available.",
                );
            peer.addTrack(track, stream);
        }
        // GPT-Live WebRTC requires this ordered channel before offer creation.
        // It is kept alive but not interpreted: the daemon's typed control
        // stream supplies provider readiness, transcripts and desktop actions.
        // Full call readiness additionally requires the media transport above.
        channel = peer.createDataChannel("oai-events", { ordered: true });
        const offer = await peer.createOffer();
        if (closed) throw aborted();
        await peer.setLocalDescription(offer);
        if (closed) throw aborted();
        if (peer.iceGatheringState !== "complete") {
            const connection = peer;
            await new Promise<void>((resolve, reject) => {
                let timer: ReturnType<typeof setTimeout> | undefined;
                const cleanup = () => {
                    if (timer !== undefined) clearTimeout(timer);
                    connection.removeEventListener("icegatheringstatechange", changed);
                    iceCancel = undefined;
                };
                const changed = () => {
                    if (connection.iceGatheringState !== "complete") return;
                    cleanup();
                    resolve();
                };
                iceCancel = () => {
                    cleanup();
                    reject(aborted());
                };
                connection.addEventListener("icegatheringstatechange", changed);
                timer = setTimeout(() => {
                    cleanup();
                    reject(new Error("Voice media negotiation timed out."));
                }, 20_000);
                changed();
            });
        }
        if (closed) throw aborted();
        const sdp = peer.localDescription?.sdp;
        if (!sdp || sdp.length > 65_536)
            throw new Error("Voice media did not produce a valid connection offer.");
        const connection = peer;
        return {
            offer: sdp,
            ready,
            async answerApply(answer) {
                if (closed) throw aborted();
                await connection.setRemoteDescription({ type: "answer", sdp: answer });
                if (closed) throw aborted();
            },
            microphoneMutedUpdate(muted) {
                if (closed || silenced) return;
                for (const track of stream?.getAudioTracks() ?? []) track.enabled = !muted;
            },
            silence,
            close,
        };
    } catch (error) {
        close();
        throw error;
    }
}
