import type { GptLiveStore } from "happy-desktop-state";

/*
 * The sound of a call that ended without the person asking, as Happy's phones
 * make it (happy-ios `CallDropSound`): the completion chime's two notes
 * falling, A5 then E5 0.11 s later, each 0.28 s long under one envelope that
 * rises over 15 ms to 0.12 and falls away by 0.42 s. Synthesised here, so
 * there is no asset to ship or license.
 */
const NOTES = [
    { frequency: 880, delay: 0 },
    { frequency: 659.25, delay: 0.11 },
] as const;
const NOTE = 0.28;
const ATTACK = 0.015;
const LENGTH = 0.42;
const PEAK = 0.12;
const FLOOR = 0.0001;

export interface GptLiveDropSoundOptions {
    /** Plays nothing at all; for a test or a run that must stay silent. */
    readonly muted?: boolean;
    /** Where the sound is made; a check passes an offline context to capture it. */
    readonly contextCreate?: () => BaseAudioContext;
}

/** Plays the drop sound once on `context`, closing a live one after it. */
export function gptLiveDropSoundPlay(context: BaseAudioContext): void {
    const start = context.currentTime + 0.02;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(FLOOR, start);
    envelope.gain.exponentialRampToValueAtTime(PEAK, start + ATTACK);
    envelope.gain.exponentialRampToValueAtTime(FLOOR, start + LENGTH);
    envelope.connect(context.destination);
    for (const note of NOTES) {
        const tone = context.createOscillator();
        tone.frequency.value = note.frequency;
        tone.connect(envelope);
        tone.start(start + note.delay);
        tone.stop(start + note.delay + NOTE);
    }
    if (context instanceof AudioContext)
        setTimeout(() => void context.close().catch(() => undefined), (LENGTH + 0.3) * 1000);
}

/**
 * Plays the drop sound when the window's live call ends with a connection
 * problem: the call dropped, the person did not hang up. Hanging up goes to
 * `idle`, and a call that never connected keeps its reason in the status bar
 * without a sound. Returns the disconnect.
 */
export function gptLiveDropSoundConnect(
    store: GptLiveStore,
    options: GptLiveDropSoundOptions = {},
): () => void {
    let previous = store.get().call;
    return store.subscribe(() => {
        const call = store.get().call;
        const dropped =
            previous.kind === "active" && call.kind === "ended" && call.problem === "connection";
        previous = call;
        if (!dropped || options.muted) return;
        try {
            gptLiveDropSoundPlay((options.contextCreate ?? (() => new AudioContext()))());
        } catch {
            // No audio output is no reason to disturb the call's own ending.
        }
    });
}
