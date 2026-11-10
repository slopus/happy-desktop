import { expect, it } from "vitest";
import {
    happyAgentConversationSummaryProject,
    type HappyAgentConversationSummaryInput,
} from "./happyAgentConversationAuthors.js";
import type { HappyAgentSessionId } from "./happyAgentTypes.js";

const session = (
    overrides: Partial<HappyAgentConversationSummaryInput> = {},
): HappyAgentConversationSummaryInput => ({
    id: "fmwagqeub003o904c1r8eey9" as HappyAgentSessionId,
    cwd: "/work",
    displayCwd: "/work",
    providerId: "claude",
    modelId: "opus",
    permissionMode: "auto",
    status: "running",
    activeSubagentCount: 0,
    pendingQuestion: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
});

it("calls a session with no title yet a new task, never by its id", () => {
    expect(happyAgentConversationSummaryProject(session()).title).toBe("New task");
    expect(happyAgentConversationSummaryProject(session({ title: "  " })).title).toBe("New task");
    expect(happyAgentConversationSummaryProject(session({ recap: "Fixing the build" })).title).toBe(
        "Fixing the build",
    );
    expect(
        happyAgentConversationSummaryProject(session({ title: "Say the word OK", recap: "x" }))
            .title,
    ).toBe("Say the word OK");
});
