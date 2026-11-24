import type { GptLiveCallLevels } from "../src/GptLiveCallBar";

export interface GptLiveSyntheticVoice {
    /** The received track's bands, read as the desktop's call media reads them. */
    levelsRead(): GptLiveCallLevels;
    stop(): void;
}

/**
 * A received call track with no call behind it, for the Blueprint and the
 * call-bar bench. A voice-like source (a 120–180 Hz sawtooth through two
 * formant filters, gated into syllables) becomes a MediaStream; a separate
 * AudioContext reads that stream through an analyser exactly as
 * `gptLiveMedia` reads the agent's track: fftSize 256, smoothing 0.5, bands
 * of bins 1–2, 3–8 and 9–21. Nothing reaches a speaker: the source ends in the
 * stream, the stream plays through a muted element, the analyser feeds
 * nothing, and `silent` sends no voice at all, for a call whose agent is
 * quiet.
 */
export function gptLiveSyntheticVoiceStart(options?: {
    silent?: boolean;
    /** A recorded voice (any format the browser decodes) looped instead of the synthetic one. */
    recording?: ArrayBuffer;
}): GptLiveSyntheticVoice {
    const source = new AudioContext({ sampleRate: 48_000 });
    const destination = source.createMediaStreamDestination();
    const gate = source.createGain();
    gate.gain.value = 0;
    const nodes: AudioScheduledSourceNode[] = [];
    const recording = options?.recording;
    if (recording) {
        gate.gain.value = 1;
        void source.decodeAudioData(recording).then((buffer) => {
            const player = source.createBufferSource();
            player.buffer = buffer;
            player.loop = true;
            player.connect(gate);
            player.start();
            nodes.push(player);
        });
    } else if (!options?.silent) {
        const voice = source.createOscillator();
        voice.type = "sawtooth";
        voice.frequency.value = 140;
        const pitch = source.createOscillator();
        pitch.frequency.value = 0.7;
        const pitchDepth = source.createGain();
        pitchDepth.gain.value = 30;
        pitch.connect(pitchDepth).connect(voice.frequency);
        for (const [frequency, q] of [
            [700, 4],
            [1_800, 6],
        ] as const) {
            const formant = source.createBiquadFilter();
            formant.type = "bandpass";
            formant.frequency.value = frequency;
            formant.Q.value = q;
            voice.connect(formant).connect(gate);
        }
        voice.connect(gate);
        nodes.push(voice, pitch);
        // Syllables: on for 120–260 ms, off for 40–160 ms, with a pause now and
        // then, from a fixed seed so every run hears the same sentence.
        let seed = 7;
        const random = () => {
            seed = (seed * 16_807) % 2_147_483_647;
            return seed / 2_147_483_647;
        };
        let at = source.currentTime + 0.05;
        for (let index = 0; index < 600; index++) {
            const on = 0.12 + random() * 0.14;
            const off = index % 9 === 8 ? 0.6 : 0.04 + random() * 0.12;
            const peak = 0.25 + random() * 0.35;
            gate.gain.setTargetAtTime(peak, at, 0.015);
            gate.gain.setTargetAtTime(0, at + on, 0.04);
            at += on + off;
        }
    }
    gate.connect(destination);
    for (const node of nodes) node.start();
    const received = destination.stream;
    // Played as the desktop plays the agent's track, through a media element,
    // which here is muted at volume zero before it starts.
    const playback = new Audio();
    playback.muted = true;
    playback.volume = 0;
    playback.srcObject = received;
    void playback.play().catch(() => undefined);
    const meter = new AudioContext();
    const analyser = meter.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    meter.createMediaStreamSource(received).connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const band = (from: number, to: number) => {
        let sum = 0;
        for (let index = from; index <= to; index++) sum += bins[index] ?? 0;
        return sum / ((to - from + 1) * 255);
    };
    return {
        levelsRead() {
            analyser.getByteFrequencyData(bins);
            return [band(1, 2), band(3, 8), band(9, 21)];
        },
        stop() {
            playback.pause();
            playback.srcObject = null;
            for (const track of received.getTracks()) track.stop();
            void source.close();
            void meter.close();
        },
    };
}
