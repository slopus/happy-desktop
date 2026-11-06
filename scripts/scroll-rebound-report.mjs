import { readFileSync, writeFileSync } from "node:fs";

const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error("Usage: node scroll-rebound-report.mjs INPUT OUTPUT");
const text = readFileSync(source, "utf8");
const prefixes = [
    "PARKED_TRACE ",
    "PARKED_MUTATION_TRACE ",
    "PARKED_IMAGE_TRACE ",
    "PARKED_SWITCH_TRACE ",
    "PARKED_FOLD_TRACE ",
    "NOTCHED_WHEEL_TRACE ",
    "ONE_NOTCH_CASE ",
];
const reports = [];
let traces = 0;
for (const line of text.split(/\r?\n/u)) {
    const prefix = prefixes.find((candidate) => line.includes(candidate));
    if (!prefix) continue;
    const trace = JSON.parse(line.slice(line.indexOf(prefix) + prefix.length));
    const frames = trace.samples ?? [];
    const events = (trace.events ?? []).filter((event) =>
        ["wheel", "pointerdown", "pointermove", "pointerup", "keydown"].includes(event.type),
    );
    const rowHistory = new Map();
    const episodes = new Map();
    const scenario = [prefix.trim(), trace.mode, trace.change, trace.distance, trace.iteration].filter((value) => value !== undefined).join(":");
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
        const frame = frames[frameIndex];
        const rows = frame.rows ?? (frame.row !== undefined && frame.rowTop !== undefined ? [{ key: frame.row, top: frame.rowTop }] : []);
        const present = new Set();
        for (const row of rows) {
            if (row.key === undefined || !Number.isFinite(row.top)) continue;
            const key = String(row.key);
            present.add(key);
            let history = rowHistory.get(key) ?? [];
            history = history.filter((sample) => frameIndex - sample.frame <= 30);
            for (let a = 0; a < history.length; a += 1) {
                const start = history[a];
                if (events.some((event) => event.time >= start.time && event.time <= frame.time)) continue;
                for (let b = a + 1; b < history.length; b += 1) {
                    const peak = history[b];
                    const outward = peak.top - start.top;
                    const back = row.top - peak.top;
                    if (Math.abs(outward) < 1 || Math.abs(back) < 1 || Math.sign(outward) === Math.sign(back)) continue;
                    const identity = `${key}:${peak.frame}`;
                    const previous = episodes.get(identity);
                    const score = Math.min(Math.abs(outward), Math.abs(back));
                    if (!previous || score > previous.score) episodes.set(identity, { scenario, dpr: trace.dpr, key, startFrame: start.frame, turnFrame: peak.frame, endFrame: frameIndex, outward, back, score });
                }
            }
            history.push({ frame: frameIndex, time: frame.time, top: row.top });
            rowHistory.set(key, history);
        }
        for (const key of rowHistory.keys()) if (!present.has(key)) rowHistory.delete(key);
    }
    reports.push(...episodes.values());
    traces += 1;
}
writeFileSync(output, JSON.stringify({ traces, rebounds: reports }, null, 2));
console.log(`Analyzed ${traces} traces; found ${reports.length} rebound turning points.`);