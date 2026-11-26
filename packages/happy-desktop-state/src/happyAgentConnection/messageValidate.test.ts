import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { messageAdmission, messageProblem } from "./messageValidate.js";

/** One shared protocol message fixture; see `fixtures/protocol-messages/README.md`. */
interface Fixture {
    readonly name: string;
    readonly description: string;
    /** JSON pointers where an invalid message breaks the schema. */
    readonly invalidAt?: readonly string[];
    readonly message: unknown;
}

const FIXTURES = new URL("../../fixtures/protocol-messages/", import.meta.url);

/** Every fixture of one kind, by file name, as iOS and Android read the same folder. */
function protocolMessageFixtures(kind: "valid" | "invalid"): readonly Fixture[] {
    const directory = new URL(`${kind}/`, FIXTURES);
    return readdirSync(directory)
        .filter((file) => file.endsWith(".json"))
        .sort()
        .map((file) => ({
            name: file.replace(/\.json$/, ""),
            ...(JSON.parse(readFileSync(new URL(file, directory), "utf8")) as Omit<
                Fixture,
                "name"
            >),
        }));
}

describe("a valid message passes", () => {
    it.each(protocolMessageFixtures("valid").map((fixture) => [fixture.name, fixture] as const))(
        "%s",
        (_, fixture) => expect(messageProblem(fixture.message)).toBeUndefined(),
    );
});

it("covers every role, block type and tool presentation type with a valid fixture", () => {
    const roles = new Set<string>();
    const blocks = new Set<string>();
    const presentations = new Set<string>();
    for (const { message } of protocolMessageFixtures("valid")) {
        const { role, content } = message as {
            role: string;
            content: { type: string; presentation?: { type: string } }[];
        };
        roles.add(role);
        for (const block of content) {
            blocks.add(block.type);
            if (block.presentation !== undefined) presentations.add(block.presentation.type);
        }
    }
    expect([...roles].sort()).toEqual(["agent", "service", "system", "user"]);
    expect([...blocks].sort()).toEqual(
        [
            "action",
            "compaction",
            "configuration",
            "file",
            "image",
            "quick_replies",
            "reasoning",
            "text",
            "tool_call",
            "tool_call_request",
            "ui",
        ].sort(),
    );
    expect([...presentations].sort()).toEqual(
        [
            "agent_spawn",
            "artifact",
            "background_terminal_interaction",
            "exec_command",
            "exploration",
            "file_diff",
            "gen_ui",
            "hologram",
            "media",
            "page",
            "quick_replies",
            "search",
            "ui",
            "user_input",
        ].sort(),
    );
});

describe("an invalid message fails where its fixture says", () => {
    it.each(protocolMessageFixtures("invalid").map((fixture) => [fixture.name, fixture] as const))(
        "%s",
        (_, fixture) => {
            const problem = messageProblem(fixture.message);
            expect(problem).toBeDefined();
            const paths = problem!.errors.map((error) => error.slice(0, error.indexOf(": ")));
            for (const pointer of fixture.invalidAt ?? [])
                expect(
                    paths.some((path) => path === pointer || path.startsWith(`${pointer}/`)),
                ).toBe(true);
            expect(problem!.errors.length).toBeLessThanOrEqual(5);
        },
    );
});

it("names Happy Cloud's answerless question card by its ID, time and faults", () => {
    const card = protocolMessageFixtures("invalid").find(
        (fixture) => fixture.name === "cluster-cancelled-question",
    )!;
    expect(messageProblem(card.message)).toEqual({
        messageId: "msgclustercancelled000001",
        createdAt: 1_764_100_000_000,
        errors: ["/content/1/presentation/answers: Expected object"],
    });
});

it("reads a presentation of a type this build does not know as none", () => {
    const fixture = protocolMessageFixtures("valid").find(
        (candidate) => candidate.name === "agent-presentation-unknown-type",
    )!;
    const admission = messageAdmission(fixture.message);
    expect(admission).toMatchObject({
        kind: "valid",
        presentationsDropped: [{ toolCallId: "toolunknownpresent000001", type: "hologram" }],
    });
    const block = (admission as Extract<typeof admission, { kind: "valid" }>).message.content[0]!;
    expect(block).toMatchObject({ type: "tool_call", id: "toolunknownpresent000001" });
    expect("presentation" in block).toBe(false);
    // The payload itself is left as it came.
    expect(JSON.stringify(fixture.message)).toContain("hologram");
});

it("still fails a presentation of a known type with a bad shape", () => {
    const message = structuredClone(
        protocolMessageFixtures("valid").find(
            (candidate) => candidate.name === "agent-presentation-search",
        )!.message,
    ) as { content: { presentation: { target: unknown } }[] };
    message.content[0]!.presentation.target = "radio";
    expect(messageProblem(message)?.errors).toEqual([
        '/content/0/presentation/target: Expected one of "web", "x"',
    ]);
});

it("allows a user message's mode to be null, but not missing", () => {
    const legacy = protocolMessageFixtures("valid").find(
        (fixture) => fixture.name === "user-legacy-null-mode",
    )!.message as Record<string, unknown>;
    expect(legacy.mode).toBeNull();
    expect(messageProblem(legacy)).toBeUndefined();
    const { mode: _, ...missing } = legacy;
    expect(messageProblem(missing)?.errors.some((error) => error.startsWith("/mode: "))).toBe(
        true,
    );
});

it("allows a question with an empty header", () => {
    const card = structuredClone(
        protocolMessageFixtures("invalid").find(
            (fixture) => fixture.name === "cluster-cancelled-question",
        )!.message,
    ) as { content: { presentation?: Record<string, unknown> }[] };
    card.content[1]!.presentation!.answers = {};
    expect(messageProblem(card)).toBeUndefined();
});

it("checks a payload once, however often it is asked about", () => {
    const card = protocolMessageFixtures("invalid")[0]!.message;
    expect(messageProblem(card)).toBe(messageProblem(card));
});
