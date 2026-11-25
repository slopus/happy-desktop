import type { GptLiveCallLevels } from "../src/GptLiveCallBar";

/*
 * Each band's span on the analyser's scale, as speech fills it (see
 * `gptLiveCallMotion.ts`): below the first number is rest, the second is a
 * bar at full height.
 */
const SPAN = [
    [0.45, 1],
    [0.3, 0.9],
    [0.2, 0.75],
] as const;
/* A syllable lasts about 220ms; every ninth is a pause. */
const SYLLABLE = 0.22;
/* The bands peak a little apart within a syllable, as voiced sounds do. */
const PHASE = [0, 0.12, 0.24] as const;

/** A fixed amplitude per syllable from its index, so every run speaks the same. */
function syllableLoudness(index: number): number {
    if (index % 9 === 8) return 0;
    const value = Math.sin(index * 12.9898) * 43_758.5453;
    return 0.45 + 0.55 * (value - Math.floor(value));
}

/**
 * Three bands that rise and fall like a voice, for the Blueprint's live bars:
 * levels only, with no audio, so there is nothing to play or to close.
 */
export function gptLiveSyntheticLevels(
    clock: () => number = () => performance.now(),
): () => GptLiveCallLevels {
    return () => {
        const position = clock() / 1000 / SYLLABLE;
        const index = Math.floor(position);
        const loudness = syllableLoudness(index);
        const band = (which: 0 | 1 | 2) => {
            const within = Math.min(1, Math.max(0, position - index - PHASE[which]) / 0.76);
            const [floor, ceiling] = SPAN[which];
            return floor + (ceiling - floor) * loudness * Math.sin(Math.PI * within);
        };
        return [band(0), band(1), band(2)];
    };
}
