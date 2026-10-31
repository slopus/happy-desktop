import { appendFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

import type {
    GymContentBlock,
    GymInferenceRequest,
    GymInferenceResponse,
    GymInferenceServer,
    GymManifest,
    GymProfile,
} from "./types.js";

/** Opens a turn the inference server streams slowly enough to be stopped mid-way. */
export const GYM_STOP_SHIMMER_PROMPT = "Take your time. gym-stop-shimmer";

export function gymLiveToolMutationLineCount(profile: GymProfile): number {
    if (profile === "smoke") return 96;
    if (profile === "realistic") return 320;
    return 640;
}

export function gymFixtureLargeChangedLines(profile: GymProfile): number {
    if (profile === "smoke") return 160;
    if (profile === "realistic") return 900;
    return 1_800;
}

export function gymInferenceServerCreate(
    manifest: GymManifest,
    logPath: string,
): GymInferenceServer {
    return new DeterministicInferenceServer(manifest, logPath);
}

class DeterministicInferenceServer implements GymInferenceServer {
    readonly #manifest: GymManifest;
    readonly #logPath: string;
    readonly #token = randomBytes(24).toString("hex");
    readonly #liveToolRequestedSessionIds = new Set<string>();
    readonly #liveToolCompletedSessionIds = new Set<string>();
    readonly #toolCallEmittedScriptKeys = new Set<string>();
    #server: Server | undefined;
    #url: string | undefined;
    #callIndex = 0;
    #logInitialized = false;

    constructor(manifest: GymManifest, logPath: string) {
        this.#manifest = manifest;
        this.#logPath = logPath;
    }

    get url(): string {
        if (this.#url === undefined) throw new Error("Gym inference server has not started.");
        return this.#url;
    }

    get token(): string {
        return this.#token;
    }

    async start(): Promise<void> {
        if (this.#server !== undefined) return;
        if (!this.#logInitialized) {
            // A daemon restart creates a new server object, but the inference
            // log belongs to the durable Gym run and must remain append-only.
            await appendFile(this.#logPath, "", "utf8");
            this.#logInitialized = true;
        }
        const server = createServer((request, response) => {
            void this.#respond(request, response);
        });
        await new Promise<void>((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", () => {
                server.off("error", reject);
                resolve();
            });
        });
        const address = server.address();
        if (address === null || typeof address === "string") {
            server.close();
            throw new Error("Gym inference server did not receive a TCP port.");
        }
        this.#server = server;
        this.#url = `http://127.0.0.1:${(address as AddressInfo).port}/inference`;
        await appendFile(
            this.#logPath,
            `${JSON.stringify({
                kind: "inference-server-started",
                url: this.#url,
                timestamp: new Date().toISOString(),
            })}\n`,
            "utf8",
        );
    }

    async stop(): Promise<void> {
        const server = this.#server;
        this.#server = undefined;
        this.#url = undefined;
        if (server === undefined) return;
        await appendFile(
            this.#logPath,
            `${JSON.stringify({
                kind: "inference-server-stopping",
                timestamp: new Date().toISOString(),
            })}\n`,
            "utf8",
        );
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error === undefined ? resolve() : reject(error)));
        });
    }

    async #respond(request: IncomingMessage, response: ServerResponse): Promise<void> {
        try {
            if (request.method !== "POST" || request.url !== "/inference") {
                sendText(response, 404, "Unknown Gym inference route.");
                return;
            }
            if (request.headers.authorization !== `Bearer ${this.#token}`) {
                sendText(response, 401, "Invalid Gym inference token.");
                return;
            }
            const payload = parseRequest(JSON.parse(await readBody(request)));
            const callIndex = this.#callIndex++;
            await appendFile(
                this.#logPath,
                `${JSON.stringify({
                    callIndex,
                    receivedAt: new Date().toISOString(),
                    modelId: payload.modelId,
                    providerId: payload.providerId,
                    options: payload.options,
                    // Provider contexts can contain the complete durable
                    // transcript, tool schemas, and a large system prompt.
                    // Persisting that object once per request makes the
                    // diagnostic log grow quadratically with history (the
                    // realistic seed reached multiple gigabytes before 200
                    // calls). Durable history is already persisted by Happy Agent;
                    // the Gym log keeps bounded, synthetic request evidence.
                    contextSummary: contextSummaryRead(payload.context),
                })}\n`,
                "utf8",
            );
            const reply = this.#reply(payload);
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify(reply));
        } catch (error) {
            await appendFile(
                this.#logPath,
                `${JSON.stringify({
                    error: error instanceof Error ? error.message : String(error),
                    kind: "inference-server-error",
                    timestamp: new Date().toISOString(),
                })}\n`,
                "utf8",
            ).catch(() => undefined);
            sendText(response, 500, error instanceof Error ? error.message : String(error));
        }
    }

    #reply(request: GymInferenceRequest): GymInferenceResponse {
        if (request.options.intent === "compaction") {
            const summary = contextSummaryRead(request.context);
            return {
                content: [{ type: "text", text: "Gym compacted deterministic context." }],
                // Happy Agent retains the complete transcript separately. The
                // provider context only needs a small native checkpoint so
                // subsequent seed turns do not re-serialize every prior
                // response and exhaust the daemon's heap.
                compactionContext: {
                    messages: [
                        {
                            role: "compaction",
                            content: null,
                            encryptedContent: `gym:compacted:${String(summary.messageCount)}`,
                            timestamp: Date.now(),
                        },
                    ],
                },
                compactionSummary: "Gym deterministic compaction",
            } as GymInferenceResponse;
        }
        if (request.options.sessionId && String(request.options.sessionId).endsWith(":title")) {
            return {
                content: [
                    {
                        type: "text",
                        text: "<title>Gym performance session</title>\n<recap>Deterministic durable history.</recap>",
                    },
                ],
            };
        }

        const latestUserText = contextLatestUserText(request.context);
        const scriptKey = responseScriptKey(request, latestUserText);
        const latestPrompt = contextLatestPromptText(request.context);
        if (latestPrompt.startsWith(GYM_STOP_SHIMMER_PROMPT)) {
            // A turn slow enough to still be streaming when the person presses
            // Stop: about a minute of small deltas, which the abort cuts short.
            return {
                content: [
                    { type: "text", text: `script=${scriptKey} ${"still going ".repeat(400)}` },
                ],
                textDeltaChunkSize: 12,
                textDeltaDelayMs: 150,
                completionDelayMs: 0,
            };
        }
        const longChat = this.longChatRequest(latestUserText);
        const toolHeavy = toolHeavyCall(this.#manifest, scriptKey, latestUserText);
        const replay = replayRequest(latestUserText);
        const sessionId =
            typeof request.options.sessionId === "string" ? request.options.sessionId : undefined;
        const liveTool = this.liveToolResponseNeeded(latestUserText, sessionId);
        if (liveTool) {
            // Happy Agent invokes the provider again after executing a tool call. Keep
            // the deterministic script finite: one tool block per stable
            // prompt marker, followed by a terminal text-only response.
            this.#toolCallEmittedScriptKeys.add(scriptKey);
            return {
                content: [
                    {
                        type: "thinking",
                        thinking: deterministicThinking(this.#manifest, scriptKey, sessionId),
                    },
                    {
                        type: "text",
                        text: deterministicText(
                            this.#manifest,
                            scriptKey,
                            toolHeavy,
                            longChat,
                            replay,
                        ),
                    },
                    {
                        type: "toolCall",
                        name: "exec_command",
                        arguments: {
                            cmd: liveToolMutationCommand(
                                sessionId ?? "unknown-session",
                                gymLiveToolMutationLineCount(this.#manifest.profile),
                            ),
                            max_output_tokens: 400,
                        },
                    },
                ],
                thinkingDeltaChunkSize: 96,
                thinkingDeltaDelayMs: 4,
                toolCallDeltaDelayMs: 180,
                completionDelayMs: 20,
            };
        }
        if (scriptKey.includes("gym-tool-settle")) {
            if (!this.#toolCallEmittedScriptKeys.has(scriptKey)) {
                this.#toolCallEmittedScriptKeys.add(scriptKey);
                const fixturePath = `.happy-gym-tool-settle-${scriptKey}.txt`;
                return {
                    content: [
                        {
                            type: "text",
                            text: `Preparing the deterministic edit. script=${scriptKey}`,
                        },
                        {
                            type: "toolCall",
                            name: "apply_patch",
                            arguments: {
                                patch: [
                                    "*** Begin Patch",
                                    `*** Add File: ${fixturePath}`,
                                    `+Deterministic Gym tool settlement for ${scriptKey}.`,
                                    "*** End Patch",
                                ].join("\n"),
                            },
                        },
                    ],
                    textDeltaChunkSize: 16,
                    textDeltaDelayMs: 24,
                    // Keep the generic running row painted long enough for the
                    // frame probe to establish its real geometry before Happy Agent
                    // replaces it with the file-diff presentation.
                    toolCallDeltaDelayMs: 600,
                    completionDelayMs: 20,
                };
            }
            return {
                content: [
                    {
                        type: "text",
                        text: `The deterministic edit is complete. script=${scriptKey}`,
                    },
                ],
                textDeltaChunkSize: 16,
                textDeltaDelayMs: 24,
                completionDelayMs: 20,
            };
        }
        if (
            sessionId !== undefined &&
            this.#liveToolRequestedSessionIds.has(sessionId) &&
            !this.#liveToolCompletedSessionIds.has(sessionId)
        ) {
            this.#liveToolCompletedSessionIds.add(sessionId);
        }

        const text = deterministicText(this.#manifest, scriptKey, toolHeavy, longChat, replay);
        const content: GymContentBlock[] = [];
        if (replay) {
            content.push({
                type: "thinking",
                thinking: deterministicThinking(this.#manifest, scriptKey, sessionId),
            });
        }
        content.push({ type: "text", text });
        // Replay responses must stay thinking+text only. Happy Agent asks the provider
        // again after a tool result, and treating every replay inference as a
        // tool request creates an unbounded tool → inference loop. History
        // tool-heavy turns may retain one deterministic tool call per script,
        // while the mixed lane's real mutation remains guarded above.
        if (toolHeavy && !replay && !this.#toolCallEmittedScriptKeys.has(scriptKey)) {
            this.#toolCallEmittedScriptKeys.add(scriptKey);
            content.push({
                type: "toolCall",
                name: "exec_command",
                arguments: {
                    cmd:
                        process.platform === "win32"
                            ? "Write-Output 'gym deterministic tool output'"
                            : "printf 'gym deterministic tool output\\n'",
                    max_output_tokens: 200,
                },
            });
        }
        const streamingPaint = scriptKey.includes("gym-streaming-paint");
        const streamingUnstick = scriptKey.includes("gym-mixed-replay-stream-unstick");
        const composerTyping = composerTypingRequest(scriptKey);
        return {
            content,
            ...(streamingPaint
                ? {
                      textDeltaChunkSize: 8,
                      textDeltaDelayMs: 48,
                  }
                : composerTyping
                  ? {
                        // Small deltas, several per frame across the four
                        // streams, for longer than the typing lane takes, so
                        // every keystroke lands mid-stream.
                        textDeltaChunkSize: 24,
                        textDeltaDelayMs: 32,
                    }
                  : streamingUnstick
                    ? {
                          textDeltaChunkSize: 64,
                          textDeltaDelayMs: 12,
                      }
                    : replay
                      ? {
                            thinkingDeltaChunkSize: 96,
                            thinkingDeltaDelayMs: 4,
                            textDeltaChunkSize: 256,
                            textDeltaDelayMs: 4,
                        }
                      : {
                            textDeltaChunkSize:
                                latestUserText.includes("gym-history-") || longChat ? 16_384 : 96,
                            textDeltaDelayMs:
                                latestUserText.includes("gym-history-") ||
                                this.#manifest.profile === "smoke"
                                    ? 0
                                    : 1,
                        }),
            completionDelayMs: replay ? 20 : this.#manifest.profile === "smoke" ? 0 : 2,
        };
    }

    private longChatRequest(latestUserText: string): boolean {
        return (
            this.#manifest.seed.longChatSessionCount > 0 &&
            latestUserText.includes("gym-long-chat-session")
        );
    }

    private liveToolResponseNeeded(latestUserText: string, sessionId: string | undefined): boolean {
        if (
            sessionId === undefined ||
            sessionId.endsWith(":title") ||
            !replayRequest(latestUserText) ||
            !latestUserText.includes("gym-mixed-replay-live-tool")
        ) {
            return false;
        }
        if (this.#liveToolRequestedSessionIds.has(sessionId)) return false;
        this.#liveToolRequestedSessionIds.add(sessionId);
        return true;
    }
}

function toolHeavyCall(manifest: GymManifest, scriptKey: string, latestUserText: string): boolean {
    const totalHistoryTurns = Math.max(1, manifest.target.turns);
    const requested = Math.min(manifest.seed.toolHeavyTurns, totalHistoryTurns);
    if (latestUserText.includes("deterministic tool-heavy")) return true;
    if (requested <= 0) return false;
    return stableHash(scriptKey) % totalHistoryTurns < requested;
}

function deterministicText(
    manifest: GymManifest,
    scriptKey: string,
    toolHeavy: boolean,
    longChat: boolean,
    replay: boolean,
): string {
    if (scriptKey.includes("gym-streaming-paint"))
        return [
            `script=${scriptKey}`,
            "",
            "Streaming fixture anchor. This completed paragraph must keep one stable DOM and layout identity while later blocks arrive.",
            "",
            "| Surface | Short value | Detail |",
            "| --- | --- | --- |",
            "| Alpha | One | Compact content. |",
            "| Beta | Two | A deliberately much longer cell arrives later and must not resize columns already shown above. |",
            "| Gamma | Three | Final table row. |",
            "",
            "The trailing paragraph arrives after the complete table.",
        ].join("\n");
    const lineCount = composerTypingRequest(scriptKey)
        ? COMPOSER_TYPING_RESPONSE_LINES
        : longChat
          ? manifest.seed.longChatResponseLines
          : toolHeavy
            ? Math.max(8, manifest.seed.longTranscriptLines)
            : replay
              ? 128
              : 8;
    const lines = Array.from({ length: lineCount }, (_, index) => {
        const line = index + 1;
        return [
            `Gym transcript line ${line}`,
            `script=${scriptKey}`,
            `profile=${manifest.profile}`,
            "The same durable response is intentionally long enough to exercise transcript projection, markdown layout, and syntax/highlight caches.",
        ].join(" · ");
    });
    // A transcript names the files it worked on, and clicking one is how a
    // reader opens it beside the conversation. The panel-file lane needs a real
    // link to click, so every response ends by naming a file in the fixture.
    // It is deliberately not one of the files the warm/highlight lanes read:
    // that lane types into what it opens, and a lane must not hand the next one
    // a fixture it has quietly rewritten.
    lines.push("", "Edited [scripts/build.mjs](scripts/build.mjs) in this checkout.");
    return lines.join("\n");
}

function deterministicThinking(
    manifest: GymManifest,
    scriptKey: string,
    sessionId: string | undefined,
): string {
    return [
        "Gym deterministic replay reasoning stream.",
        `profile=${manifest.profile}`,
        `script=${scriptKey}`,
        `session=${sessionId ?? "unknown"}`,
        "This thinking payload is intentionally chunked so foreground UI work overlaps durable Happy Agent streaming.",
        "The mixed lane keeps this stream correlated with session switches, transcript scrolls, and file watcher updates.",
    ].join(" · ");
}

/**
 * Lines in the response streamed while the composer lane types. At 24 bytes
 * every 32ms they stream for longer than typing takes, so the typing phase is
 * compared against the same stream it started on. A longer response is not
 * the way to stretch it: every delta costs the daemon more as the message
 * grows, and the run would outlast the barrier that waits for it.
 */
const COMPOSER_TYPING_RESPONSE_LINES = 120;

function composerTypingRequest(scriptKey: string): boolean {
    return scriptKey.includes("gym-composer-typing");
}

function replayRequest(latestUserText: string): boolean {
    return latestUserText.includes("gym-mixed-replay");
}

function liveToolMutationCommand(sessionId: string, lineCount: number): string {
    const lines = Array.from(
        { length: lineCount },
        (_, index) =>
            `Gym live tool mutation · mixed replay · session ${sessionId} · line ${String(index + 1).padStart(3, "0")}`,
    );
    if (process.platform === "win32") {
        return (
            `@(${lines.map((line) => `'${line.replaceAll("'", "''")}'`).join(",")}) ` +
            "| Add-Content -LiteralPath 'src/changes/modified/deep/large-modified.md' -Encoding UTF8"
        );
    }
    return (
        // The command runs in the session's own workspace checkout, so the path is relative.
        `printf '%s\\n' ${lines.map(shellQuote).join(" ")} ` +
        ">> src/changes/modified/deep/large-modified.md"
    );
}

function responseScriptKey(request: GymInferenceRequest, latestUserText: string): string {
    const marker = [...latestUserText.matchAll(/gym-[A-Za-z0-9_-]+/gu)].at(-1)?.[0];
    if (marker !== undefined) return marker;
    const sessionId =
        typeof request.options.sessionId === "string" ? request.options.sessionId : "session";
    return `${sessionId}:${request.providerSessionGeneration}`;
}

function contextLatestUserText(context: unknown): string {
    if (!isRecord(context) || !Array.isArray(context.messages)) return "";
    for (let index = context.messages.length - 1; index >= 0; index -= 1) {
        const message = context.messages[index];
        if (!isRecord(message) || message.role !== "user") continue;
        return messageContentTextRead(message.content);
    }
    return "";
}

/**
 * The latest prompt from the person or another agent. An agent's message
 * reaches its recipient inside a "Message from agent …" envelope, which is
 * left off so both read the same.
 */
function contextLatestPromptText(context: unknown): string {
    if (!isRecord(context) || !Array.isArray(context.messages)) return "";
    for (let index = context.messages.length - 1; index >= 0; index -= 1) {
        const message = context.messages[index];
        if (!isRecord(message) || (message.role !== "user" && message.role !== "agent")) continue;
        const text = messageContentTextRead(message.content);
        return message.role === "agent" ? text.replace(/^Message from agent \S+:\n\n/u, "") : text;
    }
    return "";
}

function contextSummaryRead(context: unknown): {
    readonly kind: "provider-context" | "unknown";
    readonly messageCount: number;
    readonly roleCounts: Readonly<Record<string, number>>;
    readonly latestUserText: string;
    readonly systemPromptChars: number;
    readonly toolCount: number;
} {
    if (!isRecord(context)) {
        return {
            kind: "unknown",
            messageCount: 0,
            roleCounts: {},
            latestUserText: "",
            systemPromptChars: 0,
            toolCount: 0,
        };
    }
    const messages = Array.isArray(context.messages) ? context.messages : [];
    const roleCounts: Record<string, number> = {};
    for (const message of messages) {
        if (!isRecord(message) || typeof message.role !== "string") continue;
        roleCounts[message.role] = (roleCounts[message.role] ?? 0) + 1;
    }
    return {
        kind: "provider-context",
        messageCount: messages.length,
        roleCounts,
        latestUserText: contextLatestUserText(context).slice(0, 512),
        systemPromptChars:
            typeof context.systemPrompt === "string" ? context.systemPrompt.length : 0,
        toolCount: Array.isArray(context.tools) ? context.tools.length : 0,
    };
}

function messageContentTextRead(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
        .map((block) => {
            if (typeof block === "string") return block;
            if (isRecord(block) && block.type === "text" && typeof block.text === "string")
                return block.text;
            return "";
        })
        .join("\n");
}

function stableHash(value: string): number {
    let hash = 2_166_136_261;
    for (const character of value) {
        hash ^= character.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 16_777_619);
    }
    return hash >>> 0;
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

function parseRequest(value: unknown): GymInferenceRequest {
    if (!isRecord(value)) throw new Error("Gym inference payload must be an object.");
    if (!isRecord(value.options)) throw new Error("Gym inference options must be an object.");
    if (typeof value.modelId !== "string") throw new Error("Gym inference modelId is required.");
    if (typeof value.providerId !== "string")
        throw new Error("Gym inference providerId is required.");
    if (
        typeof value.providerSessionGeneration !== "number" ||
        !Number.isInteger(value.providerSessionGeneration)
    ) {
        throw new Error("Gym inference providerSessionGeneration is required.");
    }
    return {
        context: value.context,
        modelId: value.modelId,
        options: value.options,
        providerSessionGeneration: value.providerSessionGeneration,
        providerId: value.providerId,
    };
}

async function readBody(request: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        length += buffer.length;
        if (length > 32 * 1024 * 1024) {
            throw new Error("Gym inference request is too large.");
        }
        chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
}

function sendText(response: ServerResponse, status: number, body: string): void {
    response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
    response.end(body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
