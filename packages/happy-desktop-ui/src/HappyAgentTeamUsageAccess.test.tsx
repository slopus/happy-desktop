import { expect, it } from "vitest";
import "./styles.css";
import {
    HappyAgentUserProfilePage,
    type HappyAgentUserProfileView,
} from "./pages/people/HappyAgentUserProfilePage";
import { HappyAgentUsageSettings } from "./pages/settings/HappyAgentUsageSettings";
import { createRenderer } from "./testing";

/*
 * A role without `usage.view_team` sees neither the team's usage nor another
 * member's tokens: Settings › Usage says so in place of the accounts, and a
 * profile keeps its task and activity tiles but has no token tiles.
 */

const noop = () => undefined;

const member: HappyAgentUserProfileView = {
    name: "Maya Chen",
    placeholderSeed: "user-maya",
    tasks: { total: 3, active: 1 },
    activeDays: 2,
    lastActive: "12m",
    tokens: { hour: 1_000, day: 2_000, week: 3_000, month: 4_000 },
    recentTasks: [],
};

it("says the role doesn't include team usage instead of reading accounts", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ width: "720px" }}>
                <HappyAgentUsageSettings forbidden providers={[{ providerId: "claude" }]} />
            </div>
        ),
        { width: 760, height: 400, padding: 16 },
    );
    await view.ready();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Your role doesn't include team usage");
    expect(text).not.toContain("claude");
    expect(text).not.toContain("Loading usage");
});

it("keeps a member's tasks and activity but shows no tokens where they are hidden", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", gap: "16px" }}>
                <div data-testid="shown" style={{ height: "640px", width: "480px" }}>
                    <HappyAgentUserProfilePage loading={false} onTaskOpen={noop} profile={member} />
                </div>
                <div data-testid="hidden" style={{ height: "640px", width: "480px" }}>
                    <HappyAgentUserProfilePage
                        loading={false}
                        onTaskOpen={noop}
                        profile={{ ...member, tokens: undefined }}
                    />
                </div>
            </div>
        ),
        { width: 1000, height: 680, padding: 8 },
    );
    await view.ready();
    const text = (id: string) => view.$(`[data-testid="${id}"]`).element.textContent ?? "";
    expect(text("shown")).toContain("Tokens");
    expect(text("hidden")).not.toContain("Tokens");
    expect(text("hidden")).toContain("Active days");
    expect(text("hidden")).toContain("Last active");
});
