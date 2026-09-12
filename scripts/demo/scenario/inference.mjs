import { appendFile, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { turnFind } from "./world.mjs";

/*
 * The scenario's inference boundary, and the reason a captured run can be replayed.
 *
 * The isolated daemon sends every inference request here (HAPPY_GYM_INFERENCE_URL),
 * so this one process sees all of the run's outside IO. Whatever mode answers a
 * request, the full request and the full response are appended to `io.ndjson` —
 * that file *is* the captured run, and `replay` mode serves a take back from it
 * verbatim.
 *
 * Modes:
 * - `screenplay` (default): answers from the scripted world, streamed at a
 *   believable pace. Deterministic; used for seeding and for recorded takes.
 * - `replay`: answers from a previous run's io.ndjson, matched by session and
 *   per-key call order. Proves a captured run is complete.
 * - `live`: forwards to the Anthropic Messages API using ANTHROPIC_API_KEY and
 *   records everything, so a by-hand live take becomes a replayable capture.
 */

export async function gatewayCreate(options) {
    const token = randomBytes(24).toString("hex");
    const mode = options.mode ?? "screenplay";
    const emitted = new Map();
    const replayed = new Map();
    const replayLog = mode === "replay" ? await replayLogRead(options.replayPath) : undefined;

    // The timing gate the update take stands on. While a hold is set for a
    // session, that session's inference requests wait here until released —
    // the daemon sees a slow model, nothing more. The `arrived` promise says a
    // tool result is durable. Production keeps draining across the inference
    // and every later tool in the same turn; the gate only lets the camera see
    // that causal hand-off clearly.
    let hold;

    const server = createServer((request, response) => {
        void respond(request, response);
    });

    async function respond(request, response) {
        try {
            if (request.method !== "POST" || request.url !== "/inference") {
                response.writeHead(404).end("Unknown route.");
                return;
            }
            if (request.headers.authorization !== `Bearer ${token}`) {
                response.writeHead(401).end("Bad token.");
                return;
            }
            const payload = JSON.parse(await bodyRead(request));
            const sessionId =
                typeof payload.options?.sessionId === "string" ? payload.options.sessionId : "";
            const latestMessage = payload.context?.messages?.at(-1);
            if (hold && sessionId === hold.sessionId && latestMessage?.role === "tool") {
                hold.arrived();
                await hold.released;
                // A daemon killed mid-hold abandons its request; computing a
                // reply for a dead socket would consume screenplay state and
                // spend a live call on nothing.
                if (response.destroyed || response.writableEnded) return;
            }
            const reply =
                mode === "replay"
                    ? replayReply(payload, replayLog, replayed)
                    : mode === "live"
                      ? await liveReply(payload)
                      : screenplayReply(payload, emitted);
            await appendFile(
                options.ioPath,
                `${JSON.stringify({ at: new Date().toISOString(), mode, request: payload, response: reply })}\n`,
                "utf8",
            );
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify(reply));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await appendFile(
                options.ioPath,
                `${JSON.stringify({ at: new Date().toISOString(), mode, error: message })}\n`,
                "utf8",
            ).catch(() => undefined);
            response.writeHead(500).end(message);
        }
    }

    await new Promise((settle, fail) => {
        server.once("error", fail);
        server.listen(0, "127.0.0.1", settle);
    });
    const url = `http://127.0.0.1:${server.address().port}/inference`;
    return {
        url,
        token,
        /**
         * Holds this session's post-tool inference reply until `release`.
         * Arming before the turn begins is intentional: matching the typed
         * tool result is reliable even when startup and streaming speed vary.
         */
        holdSet(sessionId) {
            let arrived;
            let release;
            const arrivedPromise = new Promise((settle) => {
                arrived = settle;
            });
            const released = new Promise((settle) => {
                release = settle;
            });
            hold = { arrived, released, release, sessionId };
            return arrivedPromise;
        },
        /** Lets every held request proceed and clears the hold. */
        release() {
            hold?.release();
            hold = undefined;
        },
        close: () =>
            new Promise((settle) => {
                server.close(() => settle());
                server.closeAllConnections();
            }),
    };
}

// ------------------------------------------------------------- screenplay

function screenplayReply(payload, emitted) {
    const latest = latestUserText(payload.context);
    const sessionId =
        typeof payload.options?.sessionId === "string" ? payload.options.sessionId : "";

    if (payload.options?.intent === "compaction") {
        return {
            content: [{ type: "text", text: "Compacted the earlier turns." }],
            compactionContext: {
                messages: [
                    {
                        role: "compaction",
                        content: null,
                        encryptedContent: "dg:compacted",
                        timestamp: Date.now(),
                    },
                ],
            },
            compactionSummary: "Demo gym compaction",
        };
    }

    if (sessionId.endsWith(":title")) {
        // Title generation frames user messages in wrapper lines that vary by
        // turn, so key on any screenplay words appearing anywhere in context.
        const known = sessionFindInContext(payload.context);
        const title = known?.title ?? "Working session";
        const recap = known?.recap ?? "In progress.";
        return {
            content: [{ type: "text", text: `<title>${title}</title>\n<recap>${recap}</recap>` }],
        };
    }

    const found = turnFind(latest);

    if (
        !found &&
        latest.toLowerCase().includes("sticker") &&
        latest.toLowerCase().includes("what") &&
        latest.toLowerCase().includes("new")
    ) {
        // The update take's live turn is deliberately multi-step. Every tool
        // runs through the real daemon: inspect, edit/copy, then Happy Agent's
        // own attachment-capable message tool. The next provider call advances
        // one step, so a drain can span the whole admitted turn honestly.
        const key = `adlib:whats-new-sticker:${sessionId}`;
        const count = emitted.get(key) ?? 0;
        emitted.set(key, count + 1);
        if (count === 0) {
            return paced(
                {
                    content: [
                        {
                            type: "thinking",
                            thinking:
                                "Check the existing card and the image dimensions first, then add the sticker without changing the layout of the other release notes.",
                        },
                        {
                            type: "text",
                            text: "I’ll inspect the current What’s New card and the candidate image first, then make the smallest isolated change.",
                        },
                        {
                            type: "toolCall",
                            name: "Bash",
                            arguments: {
                                command: "node scripts/inspect-whats-new.mjs",
                                description: "Inspect the What’s New card and sticker",
                                timeout: 120_000,
                            },
                        },
                    ],
                },
                {
                    thinkingDeltaDelayMs: 140,
                    textDeltaDelayMs: 50,
                    toolCallDeltaDelayMs: 35,
                    completionDelayMs: 100,
                },
            );
        }
        if (count === 1) {
            return paced(
                {
                    content: [
                        {
                            type: "thinking",
                            thinking:
                                "The image fits. Copy it into the public bundle and add the sticker field to the card.",
                        },
                        {
                            type: "text",
                            text: "The rocket dino fits. I’m adding it to the card now.",
                        },
                        {
                            type: "toolCall",
                            name: "Bash",
                            arguments: {
                                command: "node scripts/install-whats-new-sticker.mjs",
                                description: "Add the rocket dino to What’s New",
                                timeout: 120_000,
                            },
                        },
                    ],
                },
                // This is the thesis shot: publish the command-bearing argument
                // object with the tool name instead of holding it in the generic
                // "Bash" fallback state before the post-restart tool begins.
                { thinkingDeltaDelayMs: 12, textDeltaDelayMs: 85, toolCallDeltaDelayMs: 0 },
            );
        }
        if (count === 2) {
            return paced({
                content: [
                    {
                        type: "text",
                        text: [
                            "All code is done. I picked the rocket dino — a tiny victory lap for your next release.",
                            "",
                            "Everything is in place: the image is bundled and wired into the What’s New card. Here’s the little guy:",
                        ].join("\n"),
                    },
                ],
            });
        }
        return paced({
            content: [
                {
                    type: "text",
                    text: "Everything is in place, including the actual image above. The updater code itself was not changed.",
                },
            ],
        });
    }

    if (!found && latest.toLowerCase().includes("soak")) {
        // The update rehearsal's follow-up turn: run the repo's genuinely
        // long soak check, then close over its output. Live mode answers this
        // same prompt with a real model; the screenplay branch keeps rehearsal
        // takes cheap and deterministic.
        const count = emitted.get("adlib:soak") ?? 0;
        emitted.set("adlib:soak", count + 1);
        if (count === 0) {
            return paced({
                content: [
                    {
                        type: "thinking",
                        thinking:
                            "The repo has scripts/soak.mjs for exactly this. Run it and read the window results before concluding anything — it takes a while and must not be cut short.",
                    },
                    {
                        type: "text",
                        text: "Running the ingest soak check — it replays a synthetic day of usage events across all twelve aggregation windows, so it takes a little while. I'll read the per-window results when it finishes.",
                    },
                    {
                        type: "toolCall",
                        name: "Bash",
                        arguments: {
                            command: "node scripts/soak.mjs",
                            description: "Run the ingest soak check",
                            timeout: 30_000,
                        },
                    },
                ],
            });
        }
        return paced({
            content: [
                {
                    type: "text",
                    text: [
                        "The soak check is clean:",
                        "",
                        "- All twelve windows replayed with **0 invariant violations** — credits and debits balance in every window.",
                        "- Per-window replay time stayed inside the meter store's write budget, so ingest is keeping up.",
                        "",
                        "Ingest is safe to ship against. If you want, I can wire this check into CI so it runs before every release instead of by hand.",
                    ].join("\n"),
                },
            ],
        });
    }

    if (!found) {
        // A live send from the composer during a take lands here: unscripted
        // user words. Answer in character rather than failing the run.
        return paced({
            content: [
                {
                    type: "thinking",
                    thinking:
                        "The user is continuing the conversation. Answer directly and briefly, staying with the work already on screen.",
                },
                { type: "text", text: adLibText(latest) },
            ],
        });
    }

    const key = `${found.session.id}:${found.session.turns.indexOf(found.turn)}`;
    const count = emitted.get(key) ?? 0;
    emitted.set(key, count + 1);
    const scripted = found.turn.response;

    // The daemon asks again after executing a tool call; the second call for
    // the same marker gets the closing blocks.
    if (count > 0 || !scripted.tool) {
        const closing = count > 0 && scripted.after ? scripted.after : scripted;
        return paced({
            content: [
                ...(count === 0 && closing.thinking
                    ? [{ type: "thinking", thinking: closing.thinking }]
                    : []),
                { type: "text", text: closing.text },
            ],
        });
    }
    return paced({
        content: [
            ...(scripted.thinking ? [{ type: "thinking", thinking: scripted.thinking }] : []),
            { type: "text", text: scripted.text },
            { type: "toolCall", name: scripted.tool.name, arguments: scripted.tool.arguments },
        ],
    });
}

/** Streaming pace that remains readable in a frame-by-frame artifact take. */
function paced(reply, timing = {}) {
    return {
        ...reply,
        thinkingDeltaChunkSize: 12,
        thinkingDeltaDelayMs: 42,
        textDeltaChunkSize: 6,
        textDeltaDelayMs: 58,
        toolCallDeltaDelayMs: 760,
        completionDelayMs: 180,
        ...timing,
    };
}

function adLibText(latest) {
    const lower = latest.toLowerCase();
    // A message can both thank and ask; the ask wins.
    if (lower.includes("summar") || lower.includes("recap"))
        return [
            "Where we are:",
            "",
            "- The cause is confirmed and written up above.",
            "- The fix is scoped and small; nothing else in the module changes.",
            "- Tests cover the exact regression, so it cannot come back silently.",
            "",
            "Say the word and I'll open the pull request.",
        ].join("\n");
    if (lower.includes("thank")) return "Any time. The change is in place and the tests are green.";
    return [
        "Picking that up now. The context above already has what we need, so I'll",
        "keep the change small and verify it the same way — run the suite, read",
        "the failure if there is one, and only then touch the code.",
    ].join(" ");
}

// ----------------------------------------------------------------- replay

async function replayLogRead(path) {
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
    const entries = [];
    for (const line of lines) {
        const parsed = JSON.parse(line);
        if (parsed.request && parsed.response) entries.push(parsed);
    }
    if (entries.length === 0) throw new Error(`No captured inference pairs in ${path}.`);
    return entries;
}

function replayReply(payload, log, replayed) {
    const key = replayKey(payload);
    const seen = replayed.get(key) ?? 0;
    let index = 0;
    for (const entry of log) {
        if (replayKey(entry.request) !== key) continue;
        if (index === seen) {
            replayed.set(key, seen + 1);
            return entry.response;
        }
        index += 1;
    }
    throw new Error(`No captured response left for ${key} (served ${seen}).`);
}

function replayKey(payload) {
    const sessionId =
        typeof payload.options?.sessionId === "string" ? payload.options.sessionId : "";
    return `${sessionId}\u0000${latestUserText(payload.context).slice(0, 200)}`;
}

// ------------------------------------------------------------------- live

/**
 * Experimental: forwards to the Anthropic Messages API so a by-hand run uses a
 * real model while still being captured for replay. Text and tool_use blocks
 * translate; anything the translation cannot express fails loudly rather than
 * degrading silently.
 */
async function liveReply(payload) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("live mode requires ANTHROPIC_API_KEY.");
    const context = payload.context ?? {};
    const messages = (Array.isArray(context.messages) ? context.messages : [])
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
            role: message.role,
            content: contentText(message.content),
        }))
        .filter((message) => message.content.length > 0);
    const body = {
        model: process.env.DEMO_LIVE_MODEL ?? "claude-sonnet-4-5",
        max_tokens: 2048,
        ...(typeof context.systemPrompt === "string" ? { system: context.systemPrompt } : {}),
        messages,
    };
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
    });
    if (!response.ok)
        throw new Error(`Anthropic answered ${response.status}: ${await response.text()}`);
    const answer = await response.json();
    const content = [];
    for (const block of answer.content ?? []) {
        if (block.type === "text") content.push({ type: "text", text: block.text });
        else if (block.type === "thinking")
            content.push({ type: "thinking", thinking: block.thinking });
        else if (block.type === "tool_use")
            content.push({ type: "toolCall", name: block.name, arguments: block.input });
        else throw new Error(`Live mode cannot translate a ${block.type} block.`);
    }
    return paced({ content });
}

// ---------------------------------------------------------------- helpers

function sessionFindInContext(context) {
    const messages = Array.isArray(context?.messages) ? context.messages : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role !== "user") continue;
        const found = turnFind(contentText(message.content));
        if (found) return found.session;
    }
    return undefined;
}

function latestUserText(context) {
    const messages = Array.isArray(context?.messages) ? context.messages : [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role !== "user") continue;
        return contentText(message.content);
    }
    return "";
}

function contentText(content) {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
        .map((block) =>
            typeof block === "string" ? block : block?.type === "text" ? block.text : "",
        )
        .join("\n");
}

async function bodyRead(request) {
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
        length += chunk.length;
        if (length > 32 * 1024 * 1024) throw new Error("Request too large.");
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
}
