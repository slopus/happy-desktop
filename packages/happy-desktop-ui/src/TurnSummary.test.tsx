import { expect, it } from "vitest";
import "./theme.css";
import "./styles/icon.css";
import "./styles/turn-summary.css";
import { TurnSummary } from "./TurnSummary";
import { createRenderer } from "./testing";

it("describes work interrupted by compaction without claiming compaction completed", async () => {
    const view = createRenderer().render(
        () => <TurnSummary durationMs={81_000} reason="compaction" status="complete" />,
        { width: 320, height: 80, padding: 16 },
    );
    await view.ready();

    expect(view.$('[data-happy-desktop-ui="turn-summary-label"]').element.textContent).toBe(
        "Worked for\u00a01m\u00a021s",
    );
});
