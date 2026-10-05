import { afterEach, describe, expect, it, vi } from "vitest";
import { gptLiveMediaOpen } from "../../sources/gptLive/gptLiveMedia";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

function fixture() {
    const operations: string[] = [];
    const track = { enabled: true, onended: null as (() => void) | null, stop: vi.fn() };
    const remoteTrack = { stop: vi.fn() };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    const channel = { close: vi.fn() };
    const output = {
        autoplay: false,
        srcObject: null,
        play: vi.fn(async () => {}),
        pause: vi.fn(),
        remove: vi.fn(),
    };
    let peer: FakePeer | undefined;
    class FakePeer extends EventTarget {
        iceGatheringState = "complete";
        connectionState = "new";
        localDescription: { sdp: string } | undefined;
        onconnectionstatechange: (() => void) | null = null;
        ontrack: ((event: { streams: (typeof stream)[] }) => void) | null = null;
        close = vi.fn();
        constructor(configuration: RTCConfiguration) {
            super();
            expect(configuration).toEqual({ iceServers: [] });
            peer = this;
        }
        getReceivers() {
            return [{ track: remoteTrack }];
        }
        addTrack() {
            operations.push("track");
        }
        createDataChannel(label: string, options: RTCDataChannelInit) {
            expect(label).toBe("oai-events");
            expect(options).toEqual({ ordered: true });
            operations.push("channel");
            return channel;
        }
        async createOffer() {
            operations.push("offer");
            return { type: "offer", sdp: "offer-sdp" };
        }
        async setLocalDescription(value: { sdp: string }) {
            operations.push("local");
            this.localDescription = value;
        }
        async setRemoteDescription(value: { type: string; sdp: string }) {
            expect(value).toEqual({ type: "answer", sdp: "answer-sdp" });
            operations.push("answer");
        }
    }
    const getUserMedia = vi.fn(async () => stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("RTCPeerConnection", FakePeer);
    vi.stubGlobal(
        "Audio",
        class {
            constructor() {
                return output;
            }
        },
    );
    return {
        operations,
        track,
        remoteTrack,
        stream,
        channel,
        output,
        getUserMedia,
        peer: () => peer!,
    };
}

describe("GPT-Live browser media lifetime", () => {
    it("never requests media for an already-ended call", async () => {
        const f = fixture();
        const lifetime = new AbortController();
        lifetime.abort();
        await expect(gptLiveMediaOpen(lifetime.signal, vi.fn())).rejects.toMatchObject({
            name: "AbortError",
        });
        expect(f.getUserMedia).not.toHaveBeenCalled();
    });

    it("stops a late microphone grant after cancellation without constructing a peer", async () => {
        const f = fixture();
        let grant!: (stream: typeof f.stream) => void;
        f.getUserMedia.mockImplementation(
            () =>
                new Promise((resolve) => {
                    grant = resolve;
                }),
        );
        const lifetime = new AbortController();
        const opening = gptLiveMediaOpen(lifetime.signal, vi.fn());
        lifetime.abort();
        grant(f.stream);
        await expect(opening).rejects.toMatchObject({ name: "AbortError" });
        expect(f.track.stop).toHaveBeenCalledTimes(1);
        expect(f.operations).toEqual([]);
    });

    it("creates the ordered channel before the offer, mutes tracks, and disposes every resource", async () => {
        const f = fixture();
        const lifetime = new AbortController();
        const failed = vi.fn();
        const media = await gptLiveMediaOpen(lifetime.signal, failed);
        expect(f.getUserMedia).toHaveBeenCalledWith({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
        });
        expect(f.operations).toEqual(["track", "channel", "offer", "local"]);
        expect(media.offer).toBe("offer-sdp");
        await media.answerApply("answer-sdp");
        media.microphoneMutedUpdate(true);
        expect(f.track.enabled).toBe(false);
        media.microphoneMutedUpdate(false);
        expect(f.track.enabled).toBe(true);
        lifetime.abort();
        media.close();
        expect(f.track.stop).toHaveBeenCalledTimes(1);
        expect(f.remoteTrack.stop).toHaveBeenCalledTimes(1);
        expect(f.peer().close).toHaveBeenCalledTimes(1);
        expect(f.channel.close).toHaveBeenCalledTimes(1);
        expect(f.output.pause).toHaveBeenCalledTimes(1);
        expect(f.output.srcObject).toBeNull();
        expect(failed).not.toHaveBeenCalled();
        await expect(media.answerApply("answer-sdp")).rejects.toMatchObject({ name: "AbortError" });
    });

    it("fails closed when microphone permission is revoked", async () => {
        const f = fixture();
        const failed = vi.fn();
        await gptLiveMediaOpen(new AbortController().signal, failed);
        f.track.onended?.();
        expect(failed).toHaveBeenCalledTimes(1);
        expect(f.peer().close).toHaveBeenCalledTimes(1);
        expect(f.track.onended).toBeNull();
    });

    it("releases recording and playback while retaining the transports for bounded close finalization", async () => {
        const f = fixture();
        const media = await gptLiveMediaOpen(new AbortController().signal, vi.fn());
        media.silence();
        expect(f.track.stop).toHaveBeenCalledTimes(1);
        expect(f.output.pause).toHaveBeenCalledTimes(1);
        expect(f.peer().close).not.toHaveBeenCalled();
        expect(f.channel.close).not.toHaveBeenCalled();
        media.close();
        expect(f.track.stop).toHaveBeenCalledTimes(1);
        expect(f.peer().close).toHaveBeenCalledTimes(1);
        expect(f.channel.close).toHaveBeenCalledTimes(1);
    });

    it("waits for connected media beyond SDP acceptance and ends on network loss", async () => {
        const f = fixture();
        const failed = vi.fn();
        const media = await gptLiveMediaOpen(new AbortController().signal, failed);
        const ready = vi.fn();
        void media.ready.then(ready);
        await media.answerApply("answer-sdp");
        expect(ready).not.toHaveBeenCalled();
        f.peer().connectionState = "connected";
        f.peer().onconnectionstatechange?.();
        await media.ready;
        expect(ready).toHaveBeenCalledTimes(1);
        expect(failed).not.toHaveBeenCalled();
        f.peer().connectionState = "disconnected";
        f.peer().onconnectionstatechange?.();
        expect(failed).toHaveBeenCalledTimes(1);
        expect(f.track.stop).toHaveBeenCalledTimes(1);
    });

    it("rejects pending transport readiness when the call closes", async () => {
        fixture();
        const media = await gptLiveMediaOpen(new AbortController().signal, vi.fn());
        media.close();
        await expect(media.ready).rejects.toMatchObject({ name: "AbortError" });
    });
});
