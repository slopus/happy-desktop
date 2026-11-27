import { describe, expect, it } from "vitest";
import {
    HAPPY_AGENT_UNTITLED_SESSION_TITLE,
    type HappyAgentSessionSummary,
} from "happy-desktop-state";
import { workspaceChatsMenuChoice, workspaceChatsMenuItems } from "../sources/workspaceChatsMenu";

/*
 * The menu at the end of a workspace's tab strip: its chats, open and closed,
 * so one closed with Command-W can be found again and carried on from.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

const archived = (
    id: string,
    fields: Partial<HappyAgentSessionSummary> & { readonly title?: string },
): HappyAgentSessionSummary =>
    ({ id, projectId: "prj_one", cwd: "/work", ...fields }) as HappyAgentSessionSummary;

const OPEN = [
    { id: "ses_old", title: "Refactor the router", updatedAt: NOW - 3 * HOUR },
    { id: "ses_new", title: "Fix the upload test", updatedAt: NOW - 5 * MINUTE },
];

const ARCHIVED = [
    archived("ses_shut_early", { title: "Weekly plan usage", archivedAt: NOW - 2 * HOUR }),
    archived("ses_shut_late", { title: "  Rebuild the composer  ", archivedAt: NOW - 12 * MINUTE }),
    // Closed a moment ago: the host has not dated it yet.
    archived("ses_shut_now", { title: "Address sessions by URL" }),
    // Nobody named it, so it goes by the name an unnamed one has everywhere.
    archived("ses_shut_blank", { title: "   ", archivedAt: NOW - 20 * HOUR }),
    // Another project's, a workspace's, and a delegated chat: none is this place's to offer.
    archived("ses_elsewhere", { title: "Elsewhere", projectId: "prj_two" as never }),
    archived("ses_worktree", { title: "In a workspace", worktreeId: "wt_one" as never }),
    archived("ses_delegated", { title: "Delegated", parentSessionId: "ses_old" as never }),
];

const input = {
    archivedSessions: ARCHIVED,
    groupId: "prj_one",
    now: NOW,
    online: true,
    open: OPEN,
};

const rows = (items: ReturnType<typeof workspaceChatsMenuItems>) =>
    items.map((item) =>
        item.kind === "item"
            ? `${item.id} | ${item.label} | ${item.detail ?? ""} | ${item.icon ?? ""}${item.disabled ? " | disabled" : ""}`
            : item.kind === "label"
              ? `# ${item.label}`
              : "---",
    );

describe("a workspace's chats menu", () => {
    it("lists the open chats, then the closed ones, each most recent first and saying when", () => {
        expect(rows(workspaceChatsMenuItems(input))).toEqual([
            "# Open",
            "chat:ses_new | Fix the upload test | 5m | chat",
            "chat:ses_old | Refactor the router | 3h | chat",
            "---",
            "# Closed",
            // Closed a moment ago comes first, then by when each was closed.
            "chat:ses_shut_now | Address sessions by URL | now | archive",
            "chat:ses_shut_late | Rebuild the composer | 12m | archive",
            "chat:ses_shut_early | Weekly plan usage | 2h | archive",
            `chat:ses_shut_blank | ${HAPPY_AGENT_UNTITLED_SESSION_TITLE} | 20h | archive`,
        ]);
    });

    it("lists a workspace's own closed chats in that workspace, and not its project's", () => {
        expect(rows(workspaceChatsMenuItems({ ...input, groupId: "wt_one", open: [] }))).toEqual([
            "# Closed",
            "chat:ses_worktree | In a workspace | now | archive",
        ]);
    });

    it("never lists a chat twice: one the strip still holds is open, whatever the archive says", () => {
        const items = workspaceChatsMenuItems({
            ...input,
            archivedSessions: [archived("ses_new", { title: "Fix the upload test" })],
        });
        expect(rows(items)).toEqual([
            "# Open",
            "chat:ses_new | Fix the upload test | 5m | chat",
            "chat:ses_old | Refactor the router | 3h | chat",
        ]);
    });

    it("keeps open chats to go to while out of touch, and marks closed ones unavailable", () => {
        const items = workspaceChatsMenuItems({ ...input, online: false });
        expect(rows(items).filter((row) => row.endsWith("| disabled"))).toEqual([
            "chat:ses_shut_now | Address sessions by URL | now | archive | disabled",
            "chat:ses_shut_late | Rebuild the composer | 12m | archive | disabled",
            "chat:ses_shut_early | Weekly plan usage | 2h | archive | disabled",
            `chat:ses_shut_blank | ${HAPPY_AGENT_UNTITLED_SESSION_TITLE} | 20h | archive | disabled`,
        ]);
        expect(rows(items).slice(0, 3)).toEqual([
            "# Open",
            "chat:ses_new | Fix the upload test | 5m | chat",
            "chat:ses_old | Refactor the router | 3h | chat",
        ]);
    });

    it("says so when the place has no chat at all, with nothing to choose", () => {
        expect(rows(workspaceChatsMenuItems({ ...input, archivedSessions: [], open: [] }))).toEqual(
            ["empty | No chats yet |  | chat | disabled"],
        );
    });

    it("reads a chosen row against the list as it is now", () => {
        expect(workspaceChatsMenuChoice("chat:ses_new", input)).toEqual({
            kind: "open",
            sessionId: "ses_new",
        });
        expect(workspaceChatsMenuChoice("chat:ses_shut_late", input)).toEqual({
            kind: "closed",
            sessionId: "ses_shut_late",
        });
        // Reopened elsewhere since the menu opened: it is simply gone to.
        expect(
            workspaceChatsMenuChoice("chat:ses_shut_late", {
                ...input,
                open: [...OPEN, { id: "ses_shut_late", title: "Rebuild", updatedAt: NOW }],
            }),
        ).toEqual({ kind: "open", sessionId: "ses_shut_late" });
        // Not a chat of this place, or not a chat row at all: nothing happens.
        expect(workspaceChatsMenuChoice("chat:ses_elsewhere", input)).toBeUndefined();
        expect(workspaceChatsMenuChoice("chat:ses_delegated", input)).toBeUndefined();
        expect(workspaceChatsMenuChoice("chat:ses_gone", input)).toBeUndefined();
        expect(workspaceChatsMenuChoice("empty", input)).toBeUndefined();
    });
});
