import type { TestDepth } from "happy-desktop-gym/test-depth";

/** These four tapes exposed lifecycle bugs beyond the small named repros. */
export const FUZZ_REGRESSIONS = [
    { seed: 32749, name: "compound floor shrink followed by Stop" },
    { seed: 214013, name: "footer identity under concurrent updates" },
    { seed: 65521, name: "sparse question after zoom" },
    { seed: 0x12345678, name: "retained reader after hidden width changes" },
] as const;
export const FUZZ_FULL_SEEDS = [
    1, 7, 19, 42, 73, 101, 313, 733, 1021, 2027, 4093, 8191, 13337, 32749, 65521, 104729, 214013,
    999983, 0x12345678, 0xdeadbeef,
] as const;
export type FuzzCase = {
    seed: number;
    name: string;
    short: boolean;
    restore?: "warm" | "cold";
};

export function fuzzCases(depth: TestDepth): FuzzCase[] {
    const seeds = depth === "full" ? FUZZ_FULL_SEEDS : FUZZ_REGRESSIONS.map((entry) => entry.seed);
    const cases: FuzzCase[] = seeds.map((seed) => ({
        seed,
        name:
            FUZZ_REGRESSIONS.find((entry) => entry.seed === seed)?.name ?? "complete shuffled deck",
        short: false,
    }));
    if (depth === "cheap") {
        // Pinned generated seeds are reproducible on a developer machine and in a release.
        for (let index = 0; index < 4; index++)
            cases.push({ seed: 0xabcdef + index, name: "short generated deck", short: true });
    }
    for (const restore of ["warm", "cold"] as const)
        cases.push({
            seed: 0x12345678,
            name: `${restore} hidden-width return`,
            short: false,
            restore,
        });
    return cases;
}

export function fuzzRandom(seed: number) {
    let state = seed >>> 0;
    return (limit: number) => {
        state += 0x6d2b79f5;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
        return ((value ^ (value >>> 14)) >>> 0) % limit;
    };
}

export function fuzzActions(pageZoom: boolean) {
    return [
        "runEmptyQueue",
        "runOneQueued",
        "runLargeQueue",
        "stop",
        "dequeue",
        "dequeuedStream",
        "append",
        "stream",
        "finish",
        "send",
        "delivery",
        "sendFailed",
        "retry",
        "tool",
        "toolDone",
        "disclose",
        "reasoning",
        "shell",
        "labeled",
        "agentMessage",
        "delegation",
        "notice",
        "failure",
        "usageLimit",
        "switchResume",
        "resumeStream",
        "resumeFinish",
        "compaction",
        "question",
        "questionInline",
        "answer",
        "table",
        "media",
        "mediaDimensions",
        "end",
        "trace",
        "traceTurn",
        "loadStart",
        "prepend",
        "height",
        "width",
        ...(pageZoom ? ["zoom" as const] : []),
        "draft",
        "wheelUp",
        "wheelDown",
        "top",
        "jump",
        "pageUp",
        "endKey",
        "switch",
        "hiddenStream",
        "evictCached",
        "evictCold",
        "hydrate",
        "replay",
    ] as const;
}
export type FuzzAction = ReturnType<typeof fuzzActions>[number];

export function fuzzDeck(pick: ReturnType<typeof fuzzRandom>, pageZoom: boolean, short: boolean) {
    const deck: FuzzAction[] = [...fuzzActions(pageZoom)];
    for (let index = deck.length - 1; index > 0; index--) {
        const other = pick(index + 1);
        [deck[index], deck[other]] = [deck[other]!, deck[index]!];
    }
    // Short depth limits the number of action groups, preserving dependent sequences.
    const expanded = (short ? deck.slice(0, 10) : deck).flatMap((action): FuzzAction[] => {
        switch (action) {
            case "runEmptyQueue":
            case "runOneQueued":
            case "runLargeQueue":
                return [action, "stop", "dequeue", "dequeuedStream", "stop"];
            case "send":
                return [action, "delivery", "delivery"];
            case "sendFailed":
                return [action, "retry", "delivery", "delivery"];
            case "tool":
                return [action, "disclose", "toolDone", "disclose"];
            case "question":
            case "questionInline":
                return [action, "answer"];
            case "stream":
                return [action, "stream", "finish"];
            case "shell":
                return [action, "disclose"];
            case "traceTurn":
                return [action, "end", "trace"];
            case "usageLimit":
                return [action, "switchResume", "resumeStream", "resumeFinish"];
            case "evictCached":
                return [action, "switch", "hydrate"];
            default:
                return [action];
        }
    });
    return { expanded, count: expanded.length + (short ? 0 : 10 + pick(11)) };
}

/** Independently computes the expected completion marker without running a browser. */
export function fuzzCaseSteps(entry: FuzzCase, browser: string) {
    const pick = fuzzRandom(entry.seed);
    pick(4); // Initial history choice consumes the first PRNG value.
    return fuzzDeck(pick, browser === "chromium", entry.short).count;
}
