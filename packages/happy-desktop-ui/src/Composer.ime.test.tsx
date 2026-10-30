import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/avatar.css";
import "./styles/button.css";
import "./styles/command-picker.css";
import "./styles/composer.css";
import "./styles/icon.css";
import "./styles/audience-toggle.css";
import { Composer, type ComposerProps } from "./Composer";
import { createRenderer } from "./testing";

// These are browser event-contract regressions, not an OS IME simulation.
// Callbacks are local spies; no app, transport, or real conversation is mounted.
async function renderComposer(overrides: Partial<ComposerProps> = {}) {
    const onSend = vi.fn();
    const onCommandSelect = vi.fn();
    const onMentionSelect = vi.fn();
    const onStop = vi.fn();
    const onAudienceChange = vi.fn();
    function Harness() {
        const [value, setValue] = useState("中文草稿");
        return (
            <Composer
                onAudienceChange={onAudienceChange}
                onCommandSelect={onCommandSelect}
                onMentionSelect={onMentionSelect}
                onSend={onSend}
                onStop={onStop}
                onValueChange={setValue}
                value={value}
                {...overrides}
            />
        );
    }
    const view = createRenderer().render(() => <Harness />, {
        width: 620,
        height: 460,
        padding: 20,
    });
    await view.ready();
    const textarea = view.$('[data-happy-desktop-ui="composer-textarea"]')
        .element as HTMLTextAreaElement;
    await userEvent.click(textarea);
    return { view, textarea, onSend, onCommandSelect, onMentionSelect, onStop, onAudienceChange };
}

function compose(textarea: HTMLTextAreaElement, type: "compositionstart" | "compositionend") {
    flushSync(() => {
        textarea.dispatchEvent(new CompositionEvent(type, { bubbles: true, data: "中文" }));
    });
}

function keydown(textarea: HTMLTextAreaElement, init: KeyboardEventInit = {}) {
    const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
        ...init,
    });
    flushSync(() => textarea.dispatchEvent(event));
    return event;
}

const imeSequences = [
    "native flag",
    "composition lifecycle",
    "end before keydown",
    "229 only",
] as const;
type ImeSequence = (typeof imeSequences)[number];
function imeKey(
    textarea: HTMLTextAreaElement,
    sequence: ImeSequence,
    init: KeyboardEventInit = {},
) {
    if (sequence === "composition lifecycle" || sequence === "end before keydown") {
        compose(textarea, "compositionstart");
    }
    if (sequence === "end before keydown") compose(textarea, "compositionend");
    return keydown(textarea, {
        ...init,
        isComposing: sequence === "native flag",
        keyCode: sequence === "end before keydown" || sequence === "229 only" ? 229 : 13,
    });
}

it.each(imeSequences)(
    "leaves IME Enter to the browser (%s), then sends on the next Enter",
    async (sequence) => {
        const { textarea, view, onSend } = await renderComposer();
        const event = imeKey(textarea, sequence);
        expect(onSend).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
        expect(textarea.value).toBe("中文草稿");
        expect(document.activeElement).toBe(textarea);
        expect(view.$('[data-happy-desktop-ui="composer-textarea"]').element).toBe(textarea);
        if (sequence === "native flag" || sequence === "composition lifecycle") {
            compose(textarea, "compositionend");
        }
        // No sleep/cooldown: an immediately following ordinary Enter is a send.
        expect(keydown(textarea).defaultPrevented).toBe(true);
        expect(onSend).toHaveBeenCalledTimes(1);
    },
);

it.each([{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }])(
    "leaves modified IME Enter alone (%j)",
    async (modifiers) => {
        const { textarea, onSend } = await renderComposer();
        expect(imeKey(textarea, "native flag", modifiers).defaultPrevented).toBe(false);
        expect(onSend).not.toHaveBeenCalled();
    },
);

it("preserves normal Enter, Cmd/Ctrl+Enter, and Shift+Enter behavior", async () => {
    const { textarea, onSend } = await renderComposer();
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    expect(textarea.value).toContain("\n");
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onSend).toHaveBeenCalledTimes(3);
});

it("clears composition tracking on blur even without compositionend", async () => {
    const { textarea, onSend } = await renderComposer();
    compose(textarea, "compositionstart");
    expect(keydown(textarea).defaultPrevented).toBe(false);
    expect(onSend).not.toHaveBeenCalled();
    textarea.blur();
    textarea.focus();
    keydown(textarea);
    expect(onSend).toHaveBeenCalledTimes(1);
});

it.each(["mention", "command"] as const)(
    "gives IME priority over an open %s picker",
    async (picker) => {
        const { view, textarea, onSend, onCommandSelect, onMentionSelect } = await renderComposer(
            picker === "command"
                ? {
                      commands: [
                          { id: "agents", slash: "/agents", description: "Agents", icon: "users" },
                          { id: "help", slash: "/help", description: "Help", icon: "users" },
                      ],
                  }
                : {
                      mentions: [
                          { id: "ada", name: "Ada", initials: "AL", tone: "amber" },
                          { id: "codex", name: "Codex", initials: "CX", tone: "mint" },
                      ],
                  },
        );
        await userEvent.fill(textarea, picker === "mention" ? "@" : "/");
        const selector = `[data-happy-desktop-ui="${picker}-picker"]`;
        expect(view.container.querySelector(selector)).not.toBeNull();
        const draft = textarea.value;
        const highlighted = () =>
            view.container.querySelector(`${selector} [aria-selected="true"]`);
        const originalHighlight = highlighted();
        expect(originalHighlight).not.toBeNull();
        for (const sequence of imeSequences) {
            for (const key of ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]) {
                expect(imeKey(textarea, sequence, { key }).defaultPrevented).toBe(false);
                expect(onSend).not.toHaveBeenCalled();
                expect(onCommandSelect).not.toHaveBeenCalled();
                expect(onMentionSelect).not.toHaveBeenCalled();
                expect(textarea.value).toBe(draft);
                expect(view.container.querySelector(selector)).not.toBeNull();
                expect(highlighted()).toBe(originalHighlight);
                compose(textarea, "compositionend");
            }
        }
        await userEvent.keyboard("{Enter}");
        expect(picker === "mention" ? onMentionSelect : onCommandSelect).toHaveBeenCalledTimes(1);
        expect(onSend).not.toHaveBeenCalled();
    },
);

it("does not stop the run or change audience with IME Escape or Shift+Tab", async () => {
    const { textarea, onStop, onAudienceChange } = await renderComposer({
        running: true,
        audience: "people",
    });
    for (const sequence of imeSequences) {
        expect(imeKey(textarea, sequence, { key: "Escape" }).defaultPrevented).toBe(false);
        expect(imeKey(textarea, sequence, { key: "Tab", shiftKey: true }).defaultPrevented).toBe(
            false,
        );
        expect(onStop).not.toHaveBeenCalled();
        expect(onAudienceChange).not.toHaveBeenCalled();
        compose(textarea, "compositionend");
    }
    keydown(textarea, { key: "Escape" });
    keydown(textarea, { key: "Tab", shiftKey: true });
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onAudienceChange).toHaveBeenCalledExactlyOnceWith("agents");
});
