import { describe, expect, it, vi } from "vitest";

// The package index starts code-highlighting workers, which Node cannot run;
// the view types are all this needs from it.
vi.mock("happy-desktop-ui", () => import("../../../happy-desktop-ui/src/LocalOnboardingScreen"));
vi.mock("./happyAgentDirectoryStore", () => ({ LOCAL_HAPPY_AGENT_ID: "local" }));
import {
    localOnboardingReachedStage,
    localOnboardingView,
    type LocalOnboardingViewSnapshot,
} from "./localOnboardingStore";
import type { LocalOnboardingSnapshot } from "../shared/desktopContract";

function view(
    onboarding: Partial<LocalOnboardingSnapshot>,
    pending = false,
): LocalOnboardingViewSnapshot {
    return {
        agentStarting: false,
        chiefOfStaffReady: false,
        onboarding: { busy: false, freshness: "used", stage: "sandbox", ...onboarding },
        pending,
        providerAuthentication: { complete: false },
    };
}

describe("the Windows sandbox step", () => {
    it("explains before the first attempt, waits on Windows, and offers another try", () => {
        expect(localOnboardingView(view({ sandbox: { settingUp: false } }))).toEqual({
            kind: "windows-sandbox",
            state: "before",
        });
        expect(localOnboardingView(view({ sandbox: { settingUp: true } }))).toEqual({
            kind: "windows-sandbox",
            state: "waiting",
        });
        // The press itself is still on its way to the shell.
        expect(localOnboardingView(view({ sandbox: { settingUp: false } }, true))).toEqual({
            kind: "windows-sandbox",
            state: "waiting",
        });
        for (const previousAttempt of ["cancelled", "failed"] as const)
            expect(
                localOnboardingView(view({ sandbox: { settingUp: false, previousAttempt } })),
            ).toEqual({ kind: "windows-sandbox", state: "unfinished" });
    });

    it("keeps the bar's progress when an earlier step is revisited", () => {
        expect(
            localOnboardingReachedStage(view({ stage: "agentReady", reachedStage: "sandbox" })),
        ).toBe("sandbox");
    });
});
