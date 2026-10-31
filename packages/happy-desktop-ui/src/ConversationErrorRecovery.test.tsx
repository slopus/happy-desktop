import { afterEach, expect, it, vi } from "vitest";
import type {
    ConversationError,
    ConversationErrorAssistance,
    ConversationServiceNoticeEntry,
} from "happy-desktop-state";
import { ConversationErrorCard } from "./ConversationErrorCard";
import { ConversationEntryView } from "./ConversationEntryView";
import { conversationRowHeight, conversationRowHeightCacheCreate } from "./conversationRowHeight";
import { conversationErrorTitle } from "./conversationErrorTitle";
import { createRenderer } from "./testing";
import "./styles.css";

const error: ConversationError = {
    code: "authentication_failed",
    modelName: "Opus 5.5",
    mode: {
        providerId: "claude_extra",
        providerType: "claude",
        account: { id: "work-account", label: "Work" },
        modelId: "anthropic/opus-5-5",
        effort: "high",
        permissionMode: "auto",
        serviceTier: null,
    },
    credentialSource: {
        kind: "native_login",
        location: "Claude Code sign-in (default configuration)",
        host: "Agent host",
    },
    recovery: {
        steps: [
            "Retry this chat first.",
            "If it still fails, sign in on Agent host as the same operating-system user that runs the agent, then retry this chat.",
        ],
        actions: ["ask_chief"],
        commands: [{ label: "Sign in to Claude Code", command: "claude auth login" }],
    },
};
const reason =
    "The provider rejected authentication.\n\nDetails:\n  Your conversation and draft are preserved.\n  This is not proof that you are signed out.";
const unavailable: ConversationErrorAssistance = {
    status: "unavailable",
    reason: "Chief of Staff is not available on this Happy Agent.",
};
afterEach(() => vi.restoreAllMocks());

it.each([360, 720])(
    "keeps full errors, manual recovery and exact virtual-row geometry at %ipx without Chief",
    async (width) => {
        const view = createRenderer();
        view.render(
            () => (
                <ConversationErrorCard
                    error={error}
                    reason={reason}
                    title="Authentication failed"
                    assistance={unavailable}
                />
            ),
            { width, height: 1400 },
        );
        await view.ready();
        await document.fonts.ready;
        const card = view.$('[data-happy-desktop-ui="conversation-error-card"]')
            .element as HTMLElement;
        const text = view.$('[data-happy-desktop-ui="conversation-error-reason"]').element;
        expect(text.textContent).toBe(reason);
        const style = getComputedStyle(text);
        expect(style.whiteSpace).toBe("pre-wrap");
        expect(style.overflowWrap).toBe("anywhere");
        expect(style.fontSize).toBe("14px");
        expect(style.lineHeight).toBe("20px");
        expect(
            getComputedStyle(card).getPropertyValue("user-select") ||
                getComputedStyle(card).getPropertyValue("-webkit-user-select"),
        ).toBe("text");
        expect(card.scrollWidth).toBe(card.clientWidth);
        const icon = view.$('[data-happy-desktop-ui="conversation-error-icon"]');
        const glyph = view.$(
            '[data-happy-desktop-ui="conversation-error-icon"] [data-happy-desktop-ui="vector-icon"]',
        );
        expect((await glyph.visibleMetrics()).pixelCount).toBeGreaterThan(0);
        const iconBox = icon.bounds();
        const glyphBox = glyph.bounds();
        expect([iconBox.width, iconBox.height, glyphBox.width, glyphBox.height]).toEqual([
            14, 20, 14, 14,
        ]);
        expect(
            Math.abs(glyphBox.y + glyphBox.height / 2 - iconBox.y - iconBox.height / 2),
        ).toBeLessThanOrEqual(0.5);
        expect(card.textContent).toContain("Provider: claude_extra (claude)");
        expect(card.textContent).toContain("Account: Work (work-account)");
        expect(card.textContent).toContain("Model: Opus 5.5");
        expect(card.textContent).not.toContain("Model: anthropic/opus-5-5");
        expect(card.textContent).toContain("Host: Agent host");
        const chief = card.querySelector<HTMLButtonElement>(
            ".happy-conversation-error-card__assistance-action",
        )!;
        expect(chief.disabled).toBe(true);
        const command = view.$('[data-happy-desktop-ui="setup-command"]').element;
        expect(command.getBoundingClientRect().height).toBe(36);
        const copy = command.querySelector<HTMLButtonElement>("button")!;
        expect(copy.disabled).toBe(false);
        const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
        copy.click();
        await expect.poll(() => write.mock.calls).toEqual([["claude auth login"]]);
        const entry: ConversationServiceNoticeEntry = {
            kind: "notice",
            variant: "notice",
            id: "error",
            sequence: "1",
            level: "error",
            title: "Failure",
            text: reason,
            error,
        };
        const modeled = conversationRowHeight(
            [entry],
            0,
            { surface: "chat", width, errorAssistance: unavailable },
            conversationRowHeightCacheCreate(),
        );
        expect(Math.abs(card.getBoundingClientRect().height - modeled!)).toBeLessThanOrEqual(1);
        expect(window.devicePixelRatio).toBe(2);
        await view.screenshot(`ConversationErrorRecovery-${String(width)}.test`);
    },
);

it("ignores unknown actions, labels unknown sources generically and invents no sign-in command", async () => {
    const unknown: ConversationError = {
        ...error,
        modelName: undefined,
        credentialSource: {
            kind: "future_source",
            location: "Custom credential source",
            host: null,
        },
        recovery: {
            steps: ["Contact the host owner."],
            actions: ["run_command", "unknown_action"],
        },
    };
    const view = createRenderer();
    const request = vi.fn();
    view.render(
        () => (
            <ConversationErrorCard
                error={unknown}
                reason={reason}
                title="Failure"
                assistance={{ status: "ready" }}
                onAssistanceRequest={request}
            />
        ),
        { width: 720, height: 700 },
    );
    await view.ready();
    expect(view.container.textContent).toContain("Credential source: Custom credential source");
    expect(view.container.textContent).toContain("Contact the host owner.");
    expect(view.container.textContent).toContain("Model: anthropic/opus-5-5");
    expect(view.container.textContent).not.toContain("Native sign-in");
    expect(view.container.querySelectorAll("button")).toHaveLength(0);
    expect(request).not.toHaveBeenCalled();
});

it("renders compact configuration text with exact row height and recognizes the real auth code", async () => {
    const entry: ConversationServiceNoticeEntry = {
        kind: "notice",
        variant: "configuration",
        id: "configuration",
        sequence: "1",
        level: "info",
        text: "Account Work → Personal",
    };
    const view = createRenderer();
    view.render(() => <ConversationEntryView entry={entry} />, { width: 720, height: 200 });
    await view.ready();
    const row = view.$('[data-happy-desktop-ui="system-notice"]').element;
    expect(row.textContent).toContain("Account Work → Personal");
    expect(row.getBoundingClientRect().height).toBe(
        conversationRowHeight([entry], 0, { surface: "chat", width: 720 }),
    );
    expect(conversationErrorTitle({ ...entry, error })).toBe("Authentication failed");
    expect(conversationErrorTitle({ ...entry, error: { ...error, code: "authentication" } })).toBe(
        "Error",
    );
});
