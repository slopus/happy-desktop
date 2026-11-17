import { useState } from "react";
import { expect, it } from "vitest";
import type { ConversationEntry } from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { createRenderer } from "./testing";
import { genUiMessageDocument, genUiMessageEntry } from "../dev/genUiMessageFixture";
import type { GenUiAction } from "./genUi/genUiRender";
import { genUiMessageDocumentParse } from "./genUi/genUiMessageDocument";
import { conversationToolSections } from "./conversationToolSections";
import stats from "../dev/assets/genui/01-stats.render.json";

it("renders direct history without artifact services, measures it, and preserves control identity", async () => {
    const actions: GenUiAction[] = [];
    const view = createRenderer();
    function Surface() {
        const [revision, setRevision] = useState(0);
        return (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <button data-testid="notify" onClick={() => setRevision(revision + 1)}>
                    Notify
                </button>
                <ConversationView
                    conversationId="direct-history"
                    elapsedMs={revision}
                    entries={[genUiMessageEntry]}
                    dock={null}
                    genUi={{
                        // Even an overly permissive host cannot enable privileged actions here.
                        actionsSupported: new Set([
                            "message",
                            "open",
                            "copy",
                            "tool",
                            "plugin",
                            "secret",
                            "cluster_secret",
                        ]),
                        onAction: (_key, action) => {
                            actions.push(action);
                        },
                    }}
                />
            </div>
        );
    }
    view.render(Surface, { width: 720, height: 640, padding: 0 });
    await view.ready();
    const root = () =>
        view.container.querySelector<HTMLElement>('[data-testid="conversation-gen-ui"]');
    await expect.poll(() => root()?.getBoundingClientRect().height ?? 0).toBeGreaterThan(40);
    expect(root()?.querySelector('[data-happy-desktop-ui="inline-page-title"]')).toBeNull();
    expect(root()?.querySelector('[data-happy-desktop-ui="inline-page-open"]')).toBeNull();
    const measured = root()?.querySelector<HTMLElement>(".gen-ui-message__measure");
    expect(root()!.getBoundingClientRect().height).toBeCloseTo(
        Math.ceil(measured!.getBoundingClientRect().height),
        0,
    );
    const buttons = [...root()!.querySelectorAll<HTMLButtonElement>(".gen-ui-button")];
    expect(buttons.map((button) => [button.textContent, button.disabled])).toEqual([
        ["Review", false],
        ["Copy", false],
        ["Open", false],
        ["Run tool", true],
        ["Plugin", true],
        ["Secret", true],
        ["Cluster secret", true],
    ]);
    await view.screenshot("ConversationGenUi.test");
    const review = buttons[0]!;
    review.focus();
    view.container.querySelector<HTMLButtonElement>('[data-testid="notify"]')!.click();
    await expect.poll(() => root()!.querySelector(".gen-ui-button")).toBe(review);
    expect(document.activeElement).toBe(review);
    review.click();
    buttons[1]!.click();
    buttons[2]!.click();
    buttons[3]!.click();
    await expect.poll(() => actions.length).toBe(3);
    expect(actions).toEqual([
        { type: "message", text: "Review this release" },
        { type: "copy", text: "Release ready" },
        { type: "open", url: "https://example.com/release" },
    ]);
});

it("keeps malformed direct content visible rather than grouping it into tool traces", async () => {
    const malformed: ConversationEntry = {
        ...genUiMessageEntry,
        kind: "agentActivity",
        activity: {
            kind: "tool",
            tool: {
                toolCallId: "malformed",
                toolName: "gen_ui",
                status: "success",
                arguments: {},
                failed: false,
                presentation: {
                    type: "gen_ui",
                    document: { ...genUiMessageDocument, root: "missing" },
                },
            },
        },
    };
    const grouped = conversationToolSections([malformed], false, new Set());
    expect(grouped.rows).toEqual([malformed]);
    expect(grouped.sections.size).toBe(0);
    const view = createRenderer();
    view.render(
        () => (
            <ConversationView conversationId="malformed-direct" entries={[malformed]} dock={null} />
        ),
        { width: 720, height: 640, padding: 0 },
    );
    await view.ready();
    await expect
        .poll(() => view.container.querySelector(".gen-ui-fallback")?.textContent)
        .toBe(genUiMessageDocument.fallback);
    await expect
        .poll(
            () =>
                view.container
                    .querySelector('[data-testid="conversation-gen-ui"]')
                    ?.getBoundingClientRect().height ?? 0,
        )
        .toBeGreaterThan(0);
});

it("falls back on images and malformed input, and removes unsafe links and open actions", () => {
    expect(genUiMessageDocumentParse(stats).root).toBeDefined();
    for (const value of [
        null,
        "not JSON",
        { genuiRender: 2 },
        { ...genUiMessageDocument, root: "missing", fallback: "" },
    ]) {
        expect(genUiMessageDocumentParse(value).root).toBeUndefined();
        expect(genUiMessageDocumentParse(value).fallback).toBeTruthy();
    }
    const picture = {
        genuiRender: 1,
        root: "pic",
        fallback: "Picture unavailable",
        elements: {
            pic: {
                type: "image",
                props: {
                    file: "https://example.com/private.png",
                    width: 4,
                    height: 3,
                    thumbhash: "",
                    alt: "Private",
                },
            },
        },
    };
    expect(genUiMessageDocumentParse(picture)).toEqual({
        fallback: "Picture unavailable",
        viewers: new Map(),
    });
    expect(
        genUiMessageDocumentParse({
            ...genUiMessageDocument,
            fallback: "x".repeat(4_194_305),
        }).root,
    ).toBeUndefined();
    const deep: Record<string, { type: string; props: {}; children: string[] }> = {};
    for (let index = 0; index < 100; index += 1)
        deep[String(index)] = { type: "box", props: {}, children: [String(index + 1)] };
    expect(
        genUiMessageDocumentParse({ ...genUiMessageDocument, root: "0", elements: deep }).root,
    ).toBeDefined();
    for (const link of [
        "http://example.com",
        "javascript:alert(1)",
        "https://u:p@example.com",
        "https://example.com\\path",
        "https://example.com/a b",
        "https:example.com",
    ]) {
        const parsed = genUiMessageDocumentParse({
            genuiRender: 1,
            root: "root",
            elements: {
                root: { type: "box", props: {}, children: ["label", "open"] },
                label: { type: "text", props: { spans: [{ text: "Unsafe", link }] } },
                open: {
                    type: "button",
                    props: { label: "Unsafe", action: { type: "open", url: link } },
                },
            },
        });
        if (parsed.root?.type !== "box") throw new Error("Expected box");
        expect(parsed.root.children[0]).toMatchObject({
            type: "text",
            spans: [{ text: "Unsafe" }],
        });
        const button = parsed.root.children[1];
        expect(button?.type === "button" && button.action).toBeUndefined();
    }
});
