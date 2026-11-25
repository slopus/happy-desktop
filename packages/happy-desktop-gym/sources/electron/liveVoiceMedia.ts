/** Instrument only media edges. All SDP, WebRTC and provider transport remain real. */
export function liveVoiceMediaInstall() {
    const recorders: {
        name: string;
        recorder: MediaRecorder;
        chunks: Blob[];
        stopped: Promise<void>;
    }[] = [];
    const peers: RTCPeerConnection[] = [];
    // The received speaker track is recorded from the peer, never heard: every
    // media element this page plays is locked muted at volume zero before it
    // can start, so even a later `muted = false` cannot reach the speakers.
    const outputs: HTMLMediaElement[] = [];
    const silenced = new WeakSet<HTMLMediaElement>();
    const lockMuted = (element: HTMLMediaElement) => {
        if (silenced.has(element)) return;
        silenced.add(element);
        element.muted = true;
        element.volume = 0;
        Object.defineProperty(element, "muted", { get: () => true, set: () => {} });
        Object.defineProperty(element, "volume", { get: () => 0, set: () => {} });
        outputs.push(element);
    };
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
        lockMuted(this);
        return nativePlay.call(this);
    };
    const sourceObject = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "srcObject")!;
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
        ...sourceObject,
        set(this: HTMLMediaElement, value: MediaProvider | null) {
            lockMuted(this);
            sourceObject.set!.call(this, value);
        },
    });
    const NativeAudio = window.Audio;
    window.Audio = function Audio(source?: string) {
        const element = new NativeAudio(source);
        lockMuted(element);
        return element;
    } as unknown as typeof window.Audio;
    window.Audio.prototype = NativeAudio.prototype;
    let microphone:
        | {
              context: AudioContext;
              destination: MediaStreamAudioDestinationNode;
              clock: ConstantSourceNode;
          }
        | undefined;
    const record = (name: string, stream: MediaStream) => {
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
        const chunks: Blob[] = [];
        const stopped = new Promise<void>((resolve) =>
            recorder.addEventListener("stop", () => resolve(), { once: true }),
        );
        recorder.addEventListener("dataavailable", (event) => {
            if (event.data.size) chunks.push(event.data);
        });
        recorder.start(500);
        recorders.push({ name, recorder, chunks, stopped });
    };
    const originalMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
        // Chromium's fake device exercises the ordinary permission boundary;
        // the controllable virtual microphone supplies actual speech PCM.
        const permitted = await originalMedia(constraints);
        for (const track of permitted.getTracks()) track.stop();
        const context = new AudioContext({ sampleRate: 48_000 });
        const destination = context.createMediaStreamDestination();
        // A real microphone keeps supplying PCM after speech ends. GPT-Live's
        // duplex audio clock must continue through the assistant's response.
        const clock = context.createConstantSource();
        clock.offset.value = 0;
        clock.connect(destination);
        clock.start();
        await context.resume();
        microphone = { context, destination, clock };
        return destination.stream;
    };
    /*
     * Chromium reports zero inbound RTP audio energy while playout is muted, so
     * the received track's own level is measured here: an analyser that is
     * never connected to an output, sampled every 50 ms, as mean square × seconds.
     */
    let receivedEnergy = 0;
    /** Each 50 ms sample of the received level (mean square), stamped in epoch ms. */
    const levels: { at: number; level: number }[] = [];
    const meters: { context: AudioContext; timer: ReturnType<typeof setInterval> }[] = [];
    const meter = (track: MediaStreamTrack) => {
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        context.createMediaStreamSource(new MediaStream([track])).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        const timer = setInterval(() => {
            analyser.getFloatTimeDomainData(samples);
            let sum = 0;
            for (const sample of samples) sum += sample * sample;
            receivedEnergy += (sum / samples.length) * 0.05;
            levels.push({ at: Date.now(), level: sum / samples.length });
            if (levels.length > 24_000) levels.splice(0, levels.length - 24_000);
        }, 50);
        meters.push({ context, timer });
    };
    const NativePeer = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends NativePeer {
        constructor(configuration?: RTCConfiguration) {
            super(configuration);
            peers.push(this);
            this.addEventListener("track", (event) => {
                record("output", new MediaStream([event.track]));
                if (event.track.kind === "audio") meter(event.track);
            });
        }
        override addTrack(track: MediaStreamTrack, ...streams: MediaStream[]): RTCRtpSender {
            if (track.kind === "audio") record("input", new MediaStream([track]));
            return super.addTrack(track, ...streams);
        }
    };
    const api = {
        async microphonePlay(base64: string) {
            if (!microphone) throw new Error("The call has not opened its microphone.");
            const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
            const buffer = await microphone.context.decodeAudioData(bytes.buffer);
            const source = microphone.context.createBufferSource();
            source.buffer = buffer;
            source.connect(microphone.destination);
            await microphone.context.resume();
            source.start();
            return {
                startedAt: Date.now(),
                durationSeconds: buffer.duration,
                sampleRate: buffer.sampleRate,
                channels: buffer.numberOfChannels,
            };
        },
        async stats() {
            const reports: {
                type: string;
                bytes: number;
                packets: number;
                energy: number | null;
                samplesDuration: number | null;
            }[] = [];
            for (const peer of peers) {
                const stats = await peer.getStats();
                stats.forEach((entry) => {
                    if (
                        (entry.type === "inbound-rtp" ||
                            entry.type === "outbound-rtp" ||
                            entry.type === "media-source") &&
                        entry.kind === "audio"
                    )
                        reports.push({
                            type: entry.type,
                            bytes: entry.bytesReceived ?? entry.bytesSent ?? 0,
                            packets: entry.packetsReceived ?? entry.packetsSent ?? 0,
                            energy: entry.totalAudioEnergy ?? null,
                            samplesDuration: entry.totalSamplesDuration ?? null,
                        });
                });
            }
            return {
                states: peers.map((peer) => peer.connectionState),
                reports,
                receivedEnergy,
            };
        },
        /** Every media element the page has played, as it would sound. */
        outputs() {
            return outputs.map((element) => ({ muted: element.muted, volume: element.volume }));
        },
        /** The first moment after `since` the received level passed `threshold`, in epoch ms. */
        audioAfter(since: number, threshold: number): number | null {
            return (
                levels.find((sample) => sample.at >= since && sample.level > threshold)?.at ?? null
            );
        },
        /** Received levels since `since`, for choosing a threshold. */
        levelsSince(since: number) {
            return levels.filter((sample) => sample.at >= since);
        },
        /** Forgets earlier calls' peers and meters, so stats describe only the next call. */
        peersReset() {
            peers.splice(0);
            for (const { context, timer } of meters.splice(0)) {
                clearInterval(timer);
                void context.close();
            }
            receivedEnergy = 0;
            levels.splice(0);
        },
        /** Stops and hands over the recordings made so far; the next call starts its own. */
        async recordingsFinish() {
            for (const entry of recorders)
                if (entry.recorder.state !== "inactive") entry.recorder.stop();
            await Promise.all(recorders.map((entry) => entry.stopped));
            const recordings: { name: string; base64: string; bytes: number }[] = [];
            for (const entry of recorders.splice(0)) {
                const bytes = new Uint8Array(await new Blob(entry.chunks).arrayBuffer());
                let binary = "";
                for (const byte of bytes) binary += String.fromCharCode(byte);
                recordings.push({ name: entry.name, base64: btoa(binary), bytes: bytes.length });
            }
            return recordings;
        },
        async microphoneRelease() {
            microphone?.clock.stop();
            await microphone?.context.close();
        },
    };
    (window as Window & { voiceGym?: typeof api }).voiceGym = api;
}

export type LiveVoiceMedia = {
    microphonePlay(base64: string): Promise<{
        startedAt: number;
        durationSeconds: number;
        sampleRate: number;
        channels: number;
    }>;
    stats(): Promise<{
        states: string[];
        reports: {
            type: string;
            bytes: number;
            packets: number;
            energy: number | null;
            samplesDuration: number | null;
        }[];
        /** The received speaker track's measured level, independent of muted playout. */
        receivedEnergy: number;
    }>;
    outputs(): { muted: boolean; volume: number }[];
    audioAfter(since: number, threshold: number): number | null;
    levelsSince(since: number): { at: number; level: number }[];
    peersReset(): void;
    recordingsFinish(): Promise<{ name: string; base64: string; bytes: number }[]>;
    microphoneRelease(): Promise<void>;
};
