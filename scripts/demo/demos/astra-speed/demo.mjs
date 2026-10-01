import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as world from "./world.mjs";

const viewport = { width: 780, height: 664 };
const hook = (name) => `[data-happy-desktop-ui="${name}"]`;
const evidence = [];
let workspaceId;
let timing;

async function until(demo, read, label, timeout = 180000) {
    const deadline = Date.now() + timeout;
    for (;;) {
        const value = await read();
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`Astra demo: timed out waiting for ${label}.`);
        await demo.hold(100);
    }
}

async function turn(demo, gym, output, label, serviceTier) {
    const page = demo.page;
    assert.match(
        await page.locator(hook("composer-model-control-trigger")).first().innerText(),
        /Low/,
    );
    const previous = new Set(evidence.map((run) => run.agentId));
    const agent = await until(
        demo,
        async () => {
            const { workspace } = await gym.client.getWorkspace(workspaceId);
            const created = workspace.agents.filter((agent) => !previous.has(agent.id));
            assert.ok(created.length <= 1, "The UI must create one fresh conversation.");
            return created[0];
        },
        "the real conversation",
    );
    assert.equal((await gym.client.getMessages(agent.id, { limit: 32 })).runs.length, 0);
    await demo.click(page.locator(hook("composer-textarea")).first(), { after: 80 });
    await demo.caption(`${label} · Count to 1,000 internally. Reply only “done”.`);
    await demo.type(world.prompt, { perKey: 34, after: 850 });
    await page.screenshot({ path: join(output, `${label.toLowerCase()}-prompt.png`) });
    await demo.press("Enter", { before: 0, after: 100, badge: 0 });
    await demo.pointerVisible(false);
    await demo.hold(1000);
    // Native inference/capture clocks stay real; only waiting footage receives
    // the existing, visible 4× editorial badge, identically for both speeds.
    demo.playbackSpeed(4);
    await demo.caption(`${label} · Waiting footage shortened`);
    const run = await until(
        demo,
        async () => {
            const { runs } = await gym.client.getMessages(agent.id, { limit: 32 });
            assert.ok(runs.length <= 1, "Each speed runs in an empty conversation.");
            const run = runs[0];
            if (run?.status === "failed" || run?.status === "aborted")
                throw new Error(`${label} ended ${run.status}.`);
            return run?.status === "completed" ? run : undefined;
        },
        `${label} completion`,
    );
    demo.playbackSpeed(1);
    const user = run.messages.find((message) => message.role === "user");
    assert.equal(
        user?.content
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join(""),
        world.prompt,
    );
    assert.equal(user.mode.modelId, "openai/gpt-6-astra");
    assert.equal(user.mode.providerId, "codex");
    assert.equal(user.mode.effort, world.effort);
    assert.equal(user.mode.serviceTier, serviceTier);
    const finalText = run.messages
        .filter((message) => message.role === "agent")
        .flatMap((message) => message.content)
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
    assert.equal(finalText, "done");
    assert.ok(run.endedAt !== null && run.endedAt >= run.startedAt);
    const elapsedMs = run.endedAt - run.startedAt;
    const summary = page.locator(hook("turn-summary")).last();
    await summary.locator(hook("turn-summary-label")).waitFor({ timeout: 15000 });
    const summaryText = await summary.innerText();
    assert.match(summaryText, /Completed in\s/);
    await demo.caption(`${label} · ${(elapsedMs / 1000).toFixed(3)} seconds total`);
    demo.sound("arrive");
    await demo.hold(2200);
    await page.screenshot({ path: join(output, `${label.toLowerCase()}-completed.png`) });
    evidence.push({
        label,
        agentId: agent.id,
        runId: run.id,
        mode: user.mode,
        prompt: world.prompt,
        finalText,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        elapsedMs,
        summaryText,
    });
    await writeFile(join(output, "runs.json"), JSON.stringify(evidence, null, 2));
}

export default {
    id: "astra-speed",
    title: "GPT-6 Astra: Regular to Ultrafast",
    subtitle: "The same internal-thinking request, twice",
    manualOnly: true,
    rawWindow: true,
    subtitles: "below",
    transitions: "none",
    inferenceModes: ["native"],
    world,
    async run(demo, gym, { output }) {
        const page = demo.page;
        evidence.length = 0;
        await page.setViewportSize(viewport);
        await page.locator(hook("sidebar")).waitFor();
        // Same rehearsal cleanup as the core demo. Preserve prior run evidence
        // before archiving these disposable workspaces; never select for latency.
        const { workspaces: rehearsals } = await gym.client.listWorkspaces({
            projectId: gym.world.projectId,
            limit: 100,
        });
        const prior = [];
        for (const workspace of rehearsals) {
            if (workspace.id === gym.world.projectId || world.worktrees.includes(workspace.name))
                continue;
            for (const agent of workspace.agents) {
                const history = await gym.client.getMessages(agent.id, { limit: 32 });
                for (const run of history.runs) {
                    prior.push({
                        agentId: agent.id,
                        runId: run.id,
                        status: run.status,
                        startedAt: run.startedAt,
                        endedAt: run.endedAt,
                        elapsedMs: run.endedAt === null ? null : run.endedAt - run.startedAt,
                        mode: run.messages.find((message) => message.role === "user")?.mode,
                        finalText: run.messages
                            .filter((message) => message.role === "agent")
                            .flatMap((message) => message.content)
                            .filter((block) => block.type === "text")
                            .map((block) => block.text)
                            .join("")
                            .trim(),
                    });
                }
                if (agent.archivedAt === null) await gym.client.archiveAgent(agent.id);
            }
            const { workspace: previous } = await gym.client.getWorkspace(workspace.id);
            const { workspace: renamed } = await gym.client.renameWorkspace(
                workspace.id,
                { name: `take-${workspace.id}` },
                { ifMatch: previous.version },
            );
            await gym.client.archiveWorkspace(workspace.id, { ifMatch: renamed.version });
        }
        await writeFile(join(output, "prior-rehearsals.json"), JSON.stringify(prior, null, 2));
        const { workspaces: before } = await gym.client.listWorkspaces({
            projectId: gym.world.projectId,
            limit: 100,
        });
        const existing = new Set(before.map((workspace) => workspace.id));
        await page.getByText("happy", { exact: true }).first().click();
        await page.getByText("happy", { exact: true }).first().hover();
        await page.getByLabel("New workspace in happy", { exact: true }).click();
        await page.locator(hook("composer-textarea")).first().waitFor();
        await page.waitForTimeout(1500);
        const { workspaces: after } = await gym.client.listWorkspaces({
            projectId: gym.world.projectId,
            limit: 100,
        });
        const created = after.filter((workspace) => !existing.has(workspace.id));
        assert.equal(created.length, 1);
        workspaceId = created[0].id;
        // Identical off-camera catalog bootstrap to core/demo.mjs.
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.locator(hook("composer-textarea")).first().waitFor();
        const panel = page.getByRole("button", { name: "Hide panel", exact: true });
        if (await panel.isVisible()) await panel.click();
        const splitter = page.getByRole("separator", { name: "Resize sidebar", exact: true });
        await splitter.focus();
        await page.keyboard.press("Home");
        await page.waitForTimeout(650);
        const model = page.locator(hook("composer-model-control-trigger")).first();
        assert.match(await model.innerText(), /GPT-6 Astra/);
        assert.match(await model.innerText(), /Low/);
        const speed = page.getByTestId("happy-agent-control-tier").getByRole("button").first();
        assert.match(await speed.innerText(), /Regular/);
        const framing = await demo.framingPrepare(page.locator(hook("conversation-view")).first(), {
            rawWindow: true,
        });
        await writeFile(join(output, "framing.json"), JSON.stringify(framing, null, 2));

        await demo.caption("Same GPT-6 Astra. Low effort. Regular → Ultrafast.");
        await demo.moveTo(model, { duration: 350 });
        await demo.hold(650);
        await turn(demo, gym, output, "Regular", null);
        await demo.caption("Switch to Ultrafast. Keep the same Low effort.");
        await demo.click(
            page.getByRole("button", { name: "Create a session in this project", exact: true }),
            {
                after: 250,
            },
        );
        await demo.moveTo(model, { duration: 400 });
        await demo.hold(500);
        // The speed menu opens on hover. Never open the model-picker modal.
        await demo.moveTo(speed, { duration: 350 });
        const ultrafast = page.getByRole("menuitem", { name: "Ultrafast", exact: true });
        await ultrafast.waitFor();
        await demo.hold(850);
        await page.screenshot({ path: join(output, "speed-hover.png") });
        await demo.click(ultrafast, { after: 300 });
        assert.match(await speed.innerText(), /Ultrafast/);
        assert.match(await model.innerText(), /Low/);
        await demo.caption("Ultrafast selected · Same Astra · Same Low effort");
        await turn(demo, gym, output, "Ultrafast", "ultrafast");
        await demo.caption(
            `One live take · Regular ${(evidence[0].elapsedMs / 1000).toFixed(3)}s · Ultrafast ${(evidence[1].elapsedMs / 1000).toFixed(3)}s`,
        );
        await demo.hold(4000);
        timing = demo.timing;
    },
    async assert(page, gym) {
        assert.equal(gym.inference, "native");
        assert.equal(evidence.length, 2);
        assert.notEqual(evidence[0].agentId, evidence[1].agentId);
        assert.equal(
            await page.getByRole("dialog", { name: "Model configuration", exact: true }).count(),
            0,
        );
        return {
            inference: "native",
            runtime: gym.nativeRuntimeEvidence,
            model: "openai/gpt-6-astra",
            effort: world.effort,
            playback: {
                capture: 1,
                interactionsAndResults: 1,
                thinkingWaits: 4,
                workBadgeVisible: true,
            },
            measurement:
                "Daemon run endedAt minus startedAt, including run overhead; not provider-only latency.",
            caveat: "One run per speed. Requesting internal counting does not verify the model's private reasoning. Requested tier is recorded; no provider-served-tier claim.",
            runs: evidence,
            timing,
        };
    },
};
