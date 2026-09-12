import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/*
 * The demo's soundtrack palette.
 *
 * Key sounds are recordings, not an oscillator pretending to be one. The
 * vendored source is the CC0 OpenGameArt Keyboard Soundpack #1: 32 isolated
 * Cherry KC 1000 transients recorded with a Shure SM7B. The director cycles
 * through the set, with separate roles for ordinary keys, spaces, and Enter,
 * so a prompt has the irregular clickity cadence of a real board.
 * The small UI cues remain synthesized because they are not the requirement
 * under test and are easier to keep quiet beneath the keyboard.
 */

const sampleRate = 48_000;
const keyCount = 32;
const keyDirectory = resolve(import.meta.dirname, "../assets/sounds/mechanical");

function wavWrite(samples) {
    const data = Buffer.alloc(samples.length * 2);
    for (let index = 0; index < samples.length; index += 1) {
        const value = Math.max(-1, Math.min(1, samples[index]));
        data.writeInt16LE(Math.round(value * 32_767), index * 2);
    }
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}

/** Reads the PCM16 WAV files in the CC0 pack without adding an audio package. */
function wavRead(buffer) {
    if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE")
        throw new Error("The vendored keyboard sample is not a RIFF/WAVE file.");
    let cursor = 12;
    let channels;
    let sourceRate;
    let bits;
    let blockAlign;
    let data;
    while (cursor + 8 <= buffer.length) {
        const kind = buffer.toString("ascii", cursor, cursor + 4);
        const size = buffer.readUInt32LE(cursor + 4);
        const start = cursor + 8;
        if (kind === "fmt ") {
            const format = buffer.readUInt16LE(start);
            channels = buffer.readUInt16LE(start + 2);
            sourceRate = buffer.readUInt32LE(start + 4);
            blockAlign = buffer.readUInt16LE(start + 12);
            bits = buffer.readUInt16LE(start + 14);
            if (format !== 1) throw new Error("The keyboard sample is not PCM audio.");
        } else if (kind === "data") {
            data = buffer.subarray(start, start + size);
        }
        cursor = start + size + (size % 2);
    }
    if (
        !Number.isInteger(channels) ||
        !Number.isInteger(sourceRate) ||
        !Number.isInteger(blockAlign) ||
        bits !== 16 ||
        data === undefined
    ) {
        throw new Error("The keyboard sample has an unsupported WAV layout.");
    }
    const count = Math.floor(data.length / blockAlign);
    const mono = new Float64Array(count);
    for (let frame = 0; frame < count; frame += 1) {
        let sum = 0;
        for (let channel = 0; channel < channels; channel += 1) {
            sum += data.readInt16LE(frame * blockAlign + channel * 2) / 32_768;
        }
        mono[frame] = sum / channels;
    }
    return resample(mono, sourceRate);
}

/** Linear resampling keeps the original transient while standardizing the mix rate. */
function resample(samples, sourceRate) {
    if (sourceRate === sampleRate) return samples;
    const count = Math.max(1, Math.round((samples.length * sampleRate) / sourceRate));
    const result = new Float64Array(count);
    const ratio = sourceRate / sampleRate;
    for (let index = 0; index < count; index += 1) {
        const position = index * ratio;
        const left = Math.min(samples.length - 1, Math.floor(position));
        const right = Math.min(samples.length - 1, left + 1);
        const fraction = position - left;
        result[index] = samples[left] * (1 - fraction) + samples[right] * fraction;
    }
    return result;
}

function seconds(count) {
    return Math.round(count * sampleRate);
}

/** Deterministic noise for the tiny UI-only click cue. */
function noiseSequence(seed) {
    let state = seed >>> 0 || 1;
    return () => {
        state = (state * 1_664_525 + 1_013_904_223) >>> 0;
        return state / 4_294_967_296 - 0.5;
    };
}

function click({ seed, tone, gain }) {
    const length = seconds(0.05);
    const noise = noiseSequence(seed);
    const out = new Float64Array(length);
    const q = 0.988;
    const w = (2 * Math.PI * tone) / sampleRate;
    let y1 = 0;
    let y2 = 0;
    for (let index = 0; index < length; index += 1) {
        const t = index / sampleRate;
        const excite = index < seconds(0.002) ? noise() * 2 : 0;
        const y = excite + 2 * q * Math.cos(w) * y1 - q * q * y2;
        y2 = y1;
        y1 = y;
        out[index] = y * Math.exp(-t * 90) * gain;
    }
    return fades(out);
}

function chime() {
    const length = seconds(0.55);
    const out = new Float64Array(length);
    for (let index = 0; index < length; index += 1) {
        const t = index / sampleRate;
        const envelope = Math.min(1, t / 0.008) * Math.exp(-t * 7);
        out[index] =
            (Math.sin(2 * Math.PI * 660 * t) * 0.6 +
                Math.sin(2 * Math.PI * 990 * t) * 0.35 +
                Math.sin(2 * Math.PI * 1980 * t) * 0.08) *
            envelope *
            0.22;
    }
    return fades(out);
}

function arrive() {
    const length = seconds(0.4);
    const out = new Float64Array(length);
    for (let index = 0; index < length; index += 1) {
        const t = index / sampleRate;
        const envelope = Math.min(1, t / 0.012) * Math.exp(-t * 11);
        out[index] =
            (Math.sin(2 * Math.PI * 220 * t) * 0.7 + Math.sin(2 * Math.PI * 330 * t) * 0.3) *
            envelope *
            0.25;
    }
    return fades(out);
}

function fades(samples) {
    const edge = Math.min(seconds(0.003), Math.floor(samples.length / 2));
    for (let index = 0; index < edge; index += 1) {
        const ramp = index / edge;
        samples[index] *= ramp;
        samples[samples.length - 1 - index] *= ramp;
    }
    return samples;
}

async function recordedKeysRead() {
    return await Promise.all(
        Array.from({ length: keyCount }, (_, index) => {
            const number = String(index + 1).padStart(3, "0");
            return readFile(join(keyDirectory, `keypress-${number}.wav`)).then(wavRead);
        }),
    );
}

/** Builds the complete palette, including dedicated space and Enter roles. */
async function paletteRender() {
    const recorded = await recordedKeysRead();
    const palette = {
        click: click({ seed: 7, tone: 2_200, gain: 0.3 }),
        chime: chime(),
        arrive: arrive(),
        // These roles are explicit rather than aliases for the director's
        // ordinary-key cycle. Two space samples keep a repeated word gap from
        // sounding machine-looped; Enter has its own transient as well.
        enter: recorded[29],
        "space-001": recorded[30],
        "space-002": recorded[31],
    };
    for (let index = 0; index < recorded.length; index += 1) {
        palette[`key-${String(index + 1).padStart(3, "0")}`] = recorded[index];
    }
    return palette;
}

/** Writes the decoded palette into a convenient 48 kHz debug directory. */
export async function soundsWrite(directory) {
    await mkdir(directory, { recursive: true });
    const files = {};
    const palette = await paletteRender();
    for (const [name, samples] of Object.entries(palette)) {
        const file = join(directory, `${name}.wav`);
        await writeFile(file, wavWrite(samples));
        files[name] = file;
    }
    return files;
}

/**
 * Mixes a take's cue list into one WAV lasting exactly the video's length.
 *
 * Real key recordings are deliberately mixed below full scale. Their quiet
 * tails may overlap at human cadence, so the final tanh soft knee prevents a
 * burst from clipping without flattening the transient into a tick.
 */
export async function soundtrackWrite(events, fps, totalFrames, file) {
    const palette = await paletteRender();
    const master = new Float64Array(Math.ceil((totalFrames / fps) * sampleRate));
    for (const event of events) {
        const cue = palette[event.sound];
        if (!cue) throw new Error(`A demo asked for an unknown sound: ${event.sound}`);
        const start = Math.round((event.frame / fps) * sampleRate);
        const gain = event.sound.startsWith("space-")
            ? 0.36
            : event.sound === "enter"
              ? 0.4
              : event.sound.startsWith("key-")
                ? 0.34
                : 1;
        for (let index = 0; index < cue.length && start + index < master.length; index += 1) {
            master[start + index] += cue[index] * gain;
        }
    }
    for (let index = 0; index < master.length; index += 1) master[index] = Math.tanh(master[index]);
    await writeFile(file, wavWrite(master));
    return file;
}
