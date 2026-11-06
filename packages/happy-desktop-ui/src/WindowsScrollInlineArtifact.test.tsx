import { useRef } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type {
    ComposerSnapshot,
    ConversationAuthor,
    ConversationEntry,
    HappyAgentArtifactId,
    HappyAgentInlineArtifactsSnapshot,
} from "happy-desktop-state";
import { expect, it } from "vitest";
import { commands } from "vitest/browser";
import {
    guestFitHeight,
    guestFitScript,
} from "../../happy-desktop-electron/sources/shared/guestFitScript";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import type { InlinePageFit } from "./inlinePageFit";
import type { MessageListScrollPosition } from "./Message";

declare module "vitest/browser" {
    interface BrowserCommands {
        scrollReproWheel: (deltaY: number, count: number) => Promise<void>;
    }
}

const author: ConversationAuthor = {
    id: "inline-resize-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const composer: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "inline-resize",
    submission: { status: "idle" },
    text: "",
};
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const rowSelector = ".happy-message-list__virtual-row[data-index]";
const html = `<!doctype html><html><head><style>
html,body { margin:0; height:auto!important; min-height:0!important; max-height:none!important; overflow:hidden!important; }
body { display:flex; flex-direction:column; }
#content { height:600px; flex:none; background:#303030; color:white; }
</style></head><body><div id="content">Real artifact iframe: 600 → 200px</div></body></html>`;

type FitReport = { time: number; height: number };

/**
 * Real iframe layout and the production guestFitScript ResizeObserver/long poll.
 * Only the host adapter differs: postMessage replaces Electron isolated-world
 * IPC. This does not exercise Electron webview lifecycle or guest IPC security.
 * InlinePage, conversationInlinePage, row geometry and anchoring are unmodified.
 */
function ArtifactFrame({ fit, reports }: { fit: InlinePageFit; reports: FitReport[] }) {
    const currentFit = useRef(fit);
    currentFit.current = fit;
    return (
        <iframe
            title="Inline artifact resize fixture"
            srcDoc={html}
            style={{ display: "flex", width: "100%", height: "100%", border: 0 }}
            ref={(iframe) => {
                if (!iframe) return;
                const request = (previous: number) => {
                    const doc = iframe.contentDocument;
                    if (!doc) throw new Error("Missing artifact document");
                    const script = doc.createElement("script");
                    script.textContent = `Promise.resolve(${guestFitScript(previous)}).then(height => parent.postMessage({type:"inline-resize-height",height}, "*"));`;
                    doc.head.append(script);
                    script.remove();
                };
                const receive = (event: MessageEvent<unknown>) => {
                    if (event.source !== iframe.contentWindow) return;
                    const value = event.data;
                    if (
                        typeof value !== "object" ||
                        value === null ||
                        !("type" in value) ||
                        value.type !== "inline-resize-height" ||
                        !("height" in value)
                    )
                        return;
                    const height = guestFitHeight(value.height);
                    if (height === undefined || typeof value.height !== "number") return;
                    reports.push({ time: performance.now(), height });
                    currentFit.current.heightChanged(height);
                    request(value.height);
                };
                const ready = () => request(-1);
                window.addEventListener("message", receive);
                iframe.addEventListener("load", ready);
                return () => {
                    window.removeEventListener("message", receive);
                    iframe.removeEventListener("load", ready);
                };
            }}
        />
    );
}

function message(id: string, sequence: number, chatId: string): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id: `${chatId}-${id}`,
            chatId,
            sequence: String(sequence),
            changePts: "1",
            sender: author,
            text: `${id} stable transcript text.`,
            attachments: [],
            reactions: [],
            createdAt: "2026-09-06T12:34:00.000Z",
            generationStatus: "complete",
        },
    };
}

for (const mode of ["parked-artifact-above", "parked-artifact-below", "following"] as const) {
    it(`records a real inline artifact iframe shrinking 600→200px while ${mode}`, async () => {
        const chatId = `inline-resize-${mode}`;
        const artifactId = chatId as HappyAgentArtifactId;
        const artifact: ConversationEntry = {
            kind: "agentActivity",
            id: `${chatId}-tool`,
            sequence: "17",
            activity: {
                kind: "tool",
                tool: {
                    toolCallId: `${chatId}-tool`,
                    toolName: "create_artifact",
                    arguments: { title: "RESIZING-ARTIFACT", type: "html" },
                    status: "success",
                    failed: false,
                    presentation: {
                        type: "artifact",
                        artifactId,
                        version: 1,
                        artifactType: "html",
                        title: "RESIZING-ARTIFACT",
                        shows: "latest",
                    },
                },
            },
        };
        const artifacts: HappyAgentInlineArtifactsSnapshot = new Map([
            [
                artifactId,
                {
                    type: "ready",
                    title: "RESIZING-ARTIFACT",
                    status: "active",
                    artifactType: "html",
                    latestVersion: 1,
                    display: "inline_expanded",
                    pageMode: "page",
                    site: {
                        type: "opened",
                        version: 1,
                        url: `https://inline-resize.invalid/${mode}`,
                    },
                },
            ],
        ]);
        const entries = [
            ...Array.from({ length: 16 }, (_, i) => message(`HISTORY-${i}`, i + 1, chatId)),
            artifact,
            ...Array.from({ length: mode === "following" ? 2 : 30 }, (_, i) =>
                message(`AFTER-${i}`, i + 18, chatId),
            ),
        ];
        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);
        const reports: FitReport[] = [];
        let position: MessageListScrollPosition | undefined;
        let animation = 0;
        try {
            flushSync(() =>
                root.render(
                    <div
                        className="happy-theme-dark"
                        style={{ display: "flex", width: 700, height: 600 }}
                    >
                        <ConversationView
                            agentAuthor={author}
                            conversationId={chatId}
                            entries={entries}
                            running
                            motion="calm"
                            onScrollPositionChange={(next) => {
                                position = next;
                            }}
                            inlinePages={{
                                artifacts,
                                artifactsRequest: () => {},
                                artifactsContentRequest: () => {},
                                artifactRender: (_url, fit) => (
                                    <ArtifactFrame fit={fit} reports={reports} />
                                ),
                                artifactOpen: () => {},
                                pageOpen: () => {},
                            }}
                            dock={
                                <ConversationDock
                                    composer={composer}
                                    onComposerSend={() => {}}
                                    onComposerValueChange={() => {}}
                                    running
                                />
                            }
                        />
                    </div>,
                ),
            );
            await document.fonts.ready;
            const viewport = container.querySelector<HTMLElement>("[data-scrollbar-viewport]");
            if (!viewport) throw new Error("Missing transcript viewport");
            if (mode !== "following") {
                // Materialize the artifact before parking: an offscreen guest
                // cannot report its first size until virtualized into the DOM.
                for (let top = 0; top < viewport.scrollHeight; top += 250) {
                    viewport.scrollTop = top;
                    await delay(50);
                    if (container.querySelector("iframe")) break;
                }
            }
            await expect.poll(() => reports.some((report) => report.height === 600)).toBe(true);
            await delay(200);
            const content = container.querySelector<HTMLElement>(
                '[data-happy-desktop-ui="inline-page-content"]',
            );
            const iframe = container.querySelector<HTMLIFrameElement>("iframe");
            if (!content || !iframe) throw new Error("Missing real InlinePage iframe");
            expect(content.getBoundingClientRect().height).toBe(600);
            expect(iframe.getBoundingClientRect().height).toBe(600);

            if (mode !== "following") {
                const view = viewport.getBoundingClientRect();
                const box = content.getBoundingClientRect();
                const targetTop = mode === "parked-artifact-above" ? -850 : view.height + 50;
                viewport.scrollTop += box.top - view.top - targetTop + 100;
                await delay(150);
                await commands.scrollReproWheel(-100 * devicePixelRatio, 1);
                await delay(450);
                expect(position?.type, "trusted wheel parks the transcript").toBe("row");
                expect(
                    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
                ).toBeGreaterThan(100);
                const parked = content.getBoundingClientRect();
                if (mode === "parked-artifact-above") expect(parked.bottom).toBeLessThan(view.top);
                else expect(parked.top).toBeGreaterThan(view.bottom);
            } else {
                expect(
                    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
                ).toBeLessThanOrEqual(1);
            }
            expect(iframe.isConnected, "the offscreen artifact is actually mounted").toBe(true);
            expect(
                iframe.closest("[data-measuring]"),
                "the measured iframe is the visible copy",
            ).toBeNull();

            const read = () => {
                const view = viewport.getBoundingClientRect();
                const rows = [...viewport.querySelectorAll<HTMLElement>(rowSelector)].map((row) => {
                    const box = row.getBoundingClientRect();
                    return {
                        key: row.dataset.itemId ?? row.dataset.index ?? "unknown",
                        label: row.textContent?.match(
                            /HISTORY-\d+|AFTER-\d+|RESIZING-ARTIFACT/,
                        )?.[0],
                        top: box.top - view.top,
                        bottom: box.bottom - view.top,
                    };
                });
                return {
                    time: performance.now(),
                    scrollTop: viewport.scrollTop,
                    scrollHeight: viewport.scrollHeight,
                    viewportHeight: viewport.clientHeight,
                    bottomDistance:
                        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
                    contentHeight: content.getBoundingClientRect().height,
                    iframeHeight: iframe.getBoundingClientRect().height,
                    position,
                    rows,
                    points: [view.height / 4, view.height / 2, view.height - 32].map((y) => ({
                        y,
                        row: rows.find((row) => row.top <= y && row.bottom > y) ?? null,
                    })),
                };
            };
            const baseline = read();
            const held = baseline.rows.filter(
                (row) =>
                    row.label !== "RESIZING-ARTIFACT" &&
                    row.bottom > 0 &&
                    row.top < baseline.viewportHeight,
            );
            expect(held.length, "reader sees real transcript rows").toBeGreaterThan(0);
            const samples: ReturnType<typeof read>[] = [];
            const capture = () => {
                samples.push(read());
                animation = requestAnimationFrame(capture);
            };
            animation = requestAnimationFrame(capture);
            await delay(80);
            const guestContent = iframe.contentDocument?.getElementById("content");
            if (!guestContent) throw new Error("Missing artifact body content");
            const changedAt = performance.now();
            guestContent.style.height = "200px";
            await expect.poll(() => content.getBoundingClientRect().height).toBe(200);
            await delay(500);
            cancelAnimationFrame(animation);
            expect(iframe.getBoundingClientRect().height).toBe(200);
            expect(reports.map((report) => report.height)).toEqual([600, 200]);
            const maxDrift = Math.max(
                0,
                ...samples.flatMap((sample) =>
                    held.map((before) => {
                        const after = sample.rows.find((row) => row.key === before.key);
                        return after ? Math.abs(after.top - before.top) : Infinity;
                    }),
                ),
            );
            console.log(
                "INLINE_ARTIFACT_RESIZE_TRACE " +
                    JSON.stringify({
                        mode,
                        dpr: devicePixelRatio,
                        boundary:
                            "production guestFitScript in real iframe; postMessage host adapter, no Electron guest IPC",
                        changedAt,
                        reports,
                        maxDrift,
                        baseline,
                        samples,
                    }),
            );
            expect(samples.length).toBeGreaterThan(3);
            if (mode === "following") {
                expect(
                    Math.max(...samples.map((sample) => sample.bottomDistance)),
                    "follower remains at the bottom in every frame",
                ).toBeLessThanOrEqual(1);
            } else {
                expect(maxDrift, "parked visible rows never move by 1px").toBeLessThan(1);
            }
        } finally {
            cancelAnimationFrame(animation);
            root.unmount();
            container.remove();
        }
    }, 30_000);
}
