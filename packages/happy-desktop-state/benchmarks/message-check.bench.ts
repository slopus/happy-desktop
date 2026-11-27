import { readdirSync, readFileSync } from "node:fs";
import { Value } from "@sinclair/typebox/value";
import { messageCheck } from "../src/happyAgentConnection/messageCheck.generated.js";
import { messageSchema } from "../src/happyAgentConnection/messageSchema.js";

/*
 * Checks one long chat history the way a history page reads it, interpreted
 * by `Value.Check` and by the check compiled ahead of time. The history
 * cycles through every valid protocol fixture, each message its own copy so
 * no cache answers for another.
 */

const HISTORY_LENGTH = 3_000;
const ROUNDS = 20;

const directory = new URL("../fixtures/protocol-messages/valid/", import.meta.url);
const fixtures = readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map(
        (file) =>
            (JSON.parse(readFileSync(new URL(file, directory), "utf8")) as { message: unknown })
                .message,
    );
const history = Array.from({ length: HISTORY_LENGTH }, (_, index) =>
    structuredClone(fixtures[index % fixtures.length]),
);

const checks = {
    "Value.Check": (value: unknown) => Value.Check(messageSchema, value),
    compiled: messageCheck,
};

const rows: string[][] = [];
for (const [name, check] of Object.entries(checks)) {
    const start = performance.now();
    for (const message of history)
        if (!check(message)) throw new Error(`${name} refused a fixture`);
    const first = performance.now() - start;
    const times: number[] = [];
    for (let round = 0; round < ROUNDS; round += 1) {
        const start = performance.now();
        for (const message of history) check(message);
        times.push(performance.now() - start);
    }
    times.sort((left, right) => left - right);
    const median = times[Math.floor(times.length / 2)]!;
    rows.push([
        name,
        first.toFixed(2),
        median.toFixed(2),
        times[0]!.toFixed(2),
        ((median * 1_000) / HISTORY_LENGTH).toFixed(2),
    ]);
}

const headings = [
    "check",
    `ms/${HISTORY_LENGTH} messages (first)`,
    "ms (median)",
    "ms (best)",
    "µs/message",
];
const widths = headings.map((heading, index) =>
    Math.max(heading.length, ...rows.map((row) => row[index]!.length)),
);
const line = (row: readonly string[]): string =>
    row.map((value, index) => value.padEnd(widths[index]!)).join("  ");
console.log(line(headings));
console.log(widths.map((width) => "-".repeat(width)).join("  "));
for (const row of rows) console.log(line(row));
