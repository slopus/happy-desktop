import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import {
    agentAuthor,
    type ConversationAuthor,
    type ConversationEntry,
    type ConversationMessageEntry,
} from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { createRenderer } from "./testing";

/*
 * A message the server sent that this build could not read is one muted italic
 * line in its place, with Report bug beside it. The messages around it draw as
 * they always do, and the row is the height the list reserved for it.
 */

const reader: ConversationAuthor = {
    id: "reader",
    displayName: "Kirill",
    username: "kirill",
    kind: "human",
};

const message = (id: string, text: string, human: boolean): ConversationMessageEntry => ({
    kind: "message",
    source: "server",
    delivery: "sent",
    message: {
        id,
        chatId: "invalid",
        sequence: id,
        changePts: id,
        sender: human ? reader : agentAuthor,
        text,
        attachments: [],
        reactions: [],
        createdAt: "2026-11-25T09:41:00.000Z",
    },
});

const ERRORS = ["/content/1/presentation/answers: Expected object"];

const entries: readonly ConversationEntry[] = [
    message("1", "Who should review this?", true),
    {
        kind: "invalidMessage",
        id: "invalid:msgclustercancelled000001",
        sequence: "2",
        occurredAt: 1_764_100_000_000,
        messageId: "msgclustercancelled000001",
        errors: ERRORS,
    },
    message("3", "Steve should.", false),
];

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

it("draws a message that failed to display between its neighbours, and reports it", async () => {
    const report = vi.fn();
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ width: 640, height: 480 }}>
                <ConversationView
                    agentAuthor={agentAuthor}
                    conversationId="invalid"
                    entries={entries}
                    motion="calm"
                    onInvalidMessageReport={report}
                    viewerId={reader.id}
                />
            </div>
        ),
        { width: 800, height: 600 },
    );
    await view.ready();
    await frame();
    await frame();

    await expect.element(page.getByText("Who should review this?")).toBeVisible();
    await expect.element(page.getByText("Hey, this message failed to display.")).toBeVisible();
    await expect.element(page.getByText("Steve should.")).toBeVisible();

    const line = view.container.querySelector<HTMLElement>(
        '[data-happy-desktop-ui="invalid-message"]',
    )!;
    const text = line.querySelector<HTMLElement>(".happy-invalid-message__text")!;
    // Italic, in the muted text the transcript's secondary lines use.
    const muted = document.createElement("span");
    muted.style.color = "var(--text-secondary)";
    line.append(muted);
    expect(getComputedStyle(text).fontStyle).toBe("italic");
    expect(getComputedStyle(text).color).toBe(getComputedStyle(muted).color);
    muted.remove();

    // The list reserved exactly the row the line paints.
    const rows = [
        ...view.container.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
    ];
    const index = rows.findIndex((row) => row.contains(line));
    const next = rows[index + 1]!;
    const delta =
        Number.parseFloat(next.style.transform.slice("translateY(".length)) -
        Number.parseFloat(rows[index]!.style.transform.slice("translateY(".length));
    expect(delta).toBeCloseTo(rows[index]!.getBoundingClientRect().height, 0);

    await page.getByRole("button", { name: "Report bug" }).click();
    expect(report).toHaveBeenCalledWith("msgclustercancelled000001", ERRORS);
});
