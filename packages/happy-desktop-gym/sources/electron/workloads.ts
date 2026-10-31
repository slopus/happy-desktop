import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { testDepthRead } from "../testDepth.js";
import type { ElectronApplication, Locator, Page } from "playwright";

import { gymGoldReplayMaterialRead, type GymGoldReplayMaterial } from "./goldReplay.js";
import { hiddenWindowRun } from "./hiddenWindow.js";
import { mobileDirectExperimentRun } from "./mobileDirectExperiment.js";
import { jumpShimmerRun } from "./jumpShimmer.js";
import { stopShimmerRun } from "./stopShimmer.js";
import { windowZoomRun } from "./windowZoom.js";
import { GYM_STOP_SHIMMER_PROMPT, gymLiveToolMutationLineCount } from "./inferenceServer.js";
import { gymElectronInvisibleAssert, gymElectronLaunch } from "./launch.js";
import { electronEntrypointResolve } from "./paths.js";
import { gymProfilerArtifactReferenceRead } from "./profilerArtifacts.js";
import type { HappyAgentJournalEvent, HappyAgentStreamHandle } from "./happyAgentProtocol.js";
import type { StartedHappyAgentRuntime } from "./happyAgentRuntime.js";
import type {
    ElectronRunResult,
    GymProfilerArtifactReference,
    GymManifest,
    GymMeasurement,
    GymProject,
    GymRunPaths,
    GymScenarioMark,
    GymWorkloadName,
} from "./types.js";

interface GymProfilerBridge {
    profilerStart(request: { readonly durationMs: number }): Promise<GymProfilerSnapshot>;
    profilerStop(): Promise<GymProfilerSnapshot>;
}

interface GymProfilerArtifact {
    readonly bytes: number;
    readonly finishedAt: number;
    readonly partial: boolean;
    readonly path: string;
    readonly sessionId: string;
}

interface GymProfilerSnapshot {
    readonly artifact?: GymProfilerArtifact;
    readonly error?: string;
    readonly sessionId?: string;
    readonly startedAt?: number;
    readonly status:
        | "stopped"
        | "starting"
        | "running"
        | "stopping"
        | "partial"
        | "error"
        | "unavailable";
}

interface MixedSessionTarget {
    readonly id: string;
    readonly projectId?: string;
    readonly route: string;
    readonly scopeRoute: string;
    readonly workspaceId?: string;
    readonly workspace: boolean;
}

interface MixedSubmission {
    readonly baselineEventCount: number;
    readonly liveTool?: boolean;
    readonly marker: string;
    readonly messageId: string;
    readonly prompt: string;
    readonly route: string;
    readonly baselineCursor?: string;
    readonly runId: string;
    readonly sessionId: string;
    readonly submittedAt: string;
}

interface SessionRunBarrier {
    readonly durationMs: number;
    readonly eventCount: number;
    readonly eventTypes: readonly string[];
    readonly finished: boolean;
    readonly sessionId: string;
    readonly streamObserved: boolean;
    readonly toolCallObserved: boolean;
}

type SessionRunEventObserver = (
    event: HappyAgentJournalEvent,
    observedAt: string,
) => void | Promise<void>;

interface PreAttachedSessionStream {
    readonly events: readonly HappyAgentJournalEvent[];
    readonly handle: HappyAgentStreamHandle;
    readonly ready: Promise<void>;
    cursorCreate(): SessionStreamCursor;
}

interface SessionStreamCursor extends AsyncIterableIterator<HappyAgentJournalEvent> {
    close(): void;
}

interface FileSequenceMeasurement {
    readonly durationsMs: readonly number[];
    readonly firstMs?: number;
    readonly loadingObserved: readonly boolean[];
    readonly paths: readonly string[];
    readonly reason?: string;
    readonly status: "ok" | "skipped";
    readonly warmMs?: number;
    readonly markdownFencedCodeObserved?: boolean;
}

/**
 * What opening a file out of the transcript actually produced.
 *
 * The panel and the main content are meant to be one surface, so this records
 * the editor's presence on both sides and the behaviour that only a real editor
 * has: typing marks the file unsaved, and Command-S writes it back.
 */
interface PanelFileEditMeasurement {
    /** The editor mounted inside the panel rather than a read-only viewer. */
    readonly panelEditorMounted: boolean;
    /** The panel's editor exposes the same editable body the main content does. */
    readonly panelEditorEditable: boolean;
    /** The same file opened in a main-content tab mounts the same component. */
    readonly mainEditorMounted: boolean;
    /** Typing into the panel's editor marked its tab unsaved. */
    readonly dirtyAfterType: boolean;
    /** Command-S cleared that mark, so the write reached the checkout. */
    readonly savedAfterCommandS: boolean;
    /** The text the editor held after saving, proving the edit is what persisted. */
    readonly savedTextObserved: boolean;
    readonly reason?: string;
    readonly status: "ok" | "skipped";
}

/**
 * A workspace archived out from under an open window, over the host connection
 * rather than this window's menus — the case it cannot see coming. What it owes
 * the reader then is to leave, and to forget every remembered address naming
 * that workspace, so Back cannot walk into a row that is gone.
 */
interface ArchiveReconcileMeasurement {
    /** The route the window was standing on when the archive was requested. */
    readonly addressedRoute: string;
    /** The window left that address on its own, without being navigated. */
    readonly leftArchivedGroup: boolean;
    /** Where it went instead. */
    readonly settledRoute: string;
    /** How long the window took to notice, from the host's acknowledgement. */
    readonly reconcileMs: number;
    /** Back was pressed this many times, walking the whole remembered stack. */
    readonly backSteps: number;
    /** Every address Back arrived at, in order. */
    readonly walkedRoutes: readonly string[];
    /** No remembered address named the archived workspace afterwards. */
    readonly archivedGroupForgotten: boolean;
    /** The workspace's own sidebar row went with it. */
    readonly sidebarRowRemoved: boolean;
    readonly reason?: string;
    readonly status: "ok" | "skipped";
}

interface ChangedFileStatsMeasurement {
    readonly deletions: string;
    readonly insertions: string;
    readonly path: string;
    readonly selectors: {
        readonly deletions: string;
        readonly insertions: string;
    };
}

interface DiffSelectionSample {
    readonly anchorConnected: boolean;
    readonly atMs: 0 | 100 | 500 | 1_000 | 2_000;
    readonly focusConnected: boolean;
    readonly inside: boolean;
    readonly length: number;
    readonly observedAtMs: number;
    readonly text: string;
}

interface DiffSelectionTimelineEvent {
    readonly anchorConnected: boolean;
    readonly focusConnected: boolean;
    readonly kind: "mutation" | "selectionchange";
    readonly tMs: number;
    readonly text: string;
}

interface DiffSelectionStabilityObservation {
    readonly finalMode?: string;
    readonly initialMode?: string;
    readonly selectionSamples: readonly DiffSelectionSample[];
    readonly selectionTimeline: readonly DiffSelectionTimelineEvent[];
    readonly stableViewMutated: boolean;
}

interface DiffSelectionMeasurement {
    readonly afterLength: number;
    readonly beforeLength: number;
    readonly durationMs: number;
    readonly inputMode: "native-dom-range";
    readonly path: string;
    readonly selectionSamples: readonly DiffSelectionSample[];
    readonly selectionTimeline: readonly DiffSelectionTimelineEvent[];
    readonly stableViewMutationObserved: boolean;
    readonly stableViewNodesPreserved: boolean;
    readonly stable: boolean;
}

interface ScrollInteractionMeasurement {
    readonly actualFraction: number;
    readonly clientHeight: number;
    readonly durationMs: number;
    readonly longTaskCount: number;
    readonly longTaskDurationMs: number;
    readonly maxScrollTop: number;
    readonly requestedFraction: number;
    readonly renderedRows: number;
    readonly scrollHeight: number;
    readonly scrollTop: number;
    readonly virtualized: boolean;
    readonly historyLoaderObserved?: boolean;
    readonly historyScrollHeightBefore?: number;
    readonly historyScrollHeightAfter?: number;
}

interface TranscriptViewportMeasurement {
    readonly clientHeight: number;
    readonly renderedRows: number;
    readonly scrollHeight: number;
    readonly scrollTop: number;
    readonly virtualized: boolean;
}

interface ScrollStabilityFrame {
    readonly anchorOffset?: number;
    readonly anchorIndex?: number;
    readonly anchorSource: "row" | "text";
    readonly bottomDistance: number;
    readonly clientHeight: number;
    readonly clientWidth: number;
    readonly elapsedMs: number;
    readonly firstRowBottom?: number;
    readonly firstRowTop?: number;
    readonly listIdentityPreserved: boolean;
    readonly modelAnchorIndex?: number;
    readonly modelAnchorOffset?: number;
    readonly panelWidth?: number;
    readonly rowOverlapCount: number;
    readonly scrollHeight: number;
    readonly scrollTop: number;
    readonly settledStatusColor?: string;
    readonly settledStatusFontSize?: string;
    readonly settledStatusGap?: number;
    readonly settledStatusHeight?: number;
    readonly settledStatusLineHeight?: string;
    readonly sidebarWidth?: number;
    readonly statusColor?: string;
    readonly statusFontSize?: string;
    readonly statusGap?: number;
    readonly statusHeight?: number;
    readonly statusLineHeight?: string;
    readonly stableRowPairCount: number;
    readonly stableRowSpacingDeltaMax: number;
    readonly trackedBodyHeight?: number;
    readonly trackedProgressiveTableParagraph?: boolean;
    readonly trackedPrefixPreserved?: boolean;
    readonly trackedRowHeight?: number;
    readonly trackedTableColumns?: readonly number[];
    readonly trackedTableRows?: number;
    readonly trackedTextLength?: number;
    readonly trackedToolActivityHeight?: number;
    readonly trackedToolFileSummaryHeight?: number;
    readonly trackedToolHeaderHeight?: number;
    readonly trackedToolPresentation?: string;
    readonly trackedToolStatsHeight?: number;
    readonly trackedToolStatus?: string;
    readonly trackedToolTextHeight?: number;
    readonly trackedToolVirtualRowHeight?: number;
    readonly trackedVirtualHeight?: number;
    readonly windowWidth: number;
}

interface ScrollStabilityPhase {
    readonly action:
        | "composer-grow"
        | "composer-shrink"
        | "panel-resize"
        | "panel-toggle"
        | "sidebar-resize"
        | "sidebar-toggle"
        | "stream-send"
        | "window-resize";
    readonly anchorIndex?: number;
    readonly anchorOffset?: number;
    readonly anchorContract: "bottom" | "model" | "text";
    readonly anchorMode: "following" | "parked";
    readonly anchorBreakCount: number;
    readonly frames: readonly ScrollStabilityFrame[];
    readonly layoutChangeObserved: boolean;
    readonly maxBottomDistance: number;
    readonly maxRowOverlapCount: number;
    readonly modelAnchorObserved: boolean;
    readonly nonMonotonicAnchorCorrections: number;
    readonly stable: boolean;
    readonly textAnchorObserved: boolean;
}

interface ScrollStabilityMeasurement {
    readonly composerGrowth: ScrollStabilityPhase;
    readonly composerParkedGrowth: ScrollStabilityPhase;
    readonly composerParkedShrink: ScrollStabilityPhase;
    readonly composerShrink: ScrollStabilityPhase;
    readonly panelParkedResize: ScrollStabilityPhase;
    readonly panelParkedToggle: ScrollStabilityPhase;
    readonly panelResize: ScrollStabilityPhase;
    readonly sidebarParkedResize: ScrollStabilityPhase;
    readonly sidebarParkedToggle: ScrollStabilityPhase;
    readonly stable: boolean;
    readonly windowParkedResize: ScrollStabilityPhase;
}

interface StreamingScrollPhase extends ScrollStabilityPhase {
    readonly scrollTopMax?: number;
    readonly scrollTopMin?: number;
    readonly scrollTopSpread?: number;
    readonly statusGapMax?: number;
    readonly statusGapMin?: number;
    readonly statusGapSpread?: number;
    readonly statusObserved: boolean;
}

interface StreamingScrollMeasurement {
    readonly following: StreamingScrollPhase;
    readonly microUnstick: StreamingMicroUnstickMeasurement;
    readonly paint: StreamingPaintMeasurement;
    readonly parked: StreamingScrollPhase;
    readonly stable: boolean;
    readonly toolSettle: StreamingToolSettleMeasurement;
    readonly unstick: StreamingScrollPhase;
}

interface StreamingMicroUnstickMeasurement extends StreamingScrollPhase {
    readonly escapeBottomDistance: number;
    readonly escapeFirstRowBottomDelta: number;
    readonly escapeFirstRowIndexStable: boolean;
    readonly escapeFirstRowTopDelta: number;
    readonly escapeObserved: boolean;
    readonly escapeScrollDelta: number;
    readonly firstRowBottomSpread: number;
    readonly firstRowTopSpread: number;
    readonly maxStableRowSpacingDelta: number;
    readonly stableRowPairFrameCount: number;
}

interface StreamingToolSettleMeasurement {
    readonly fileDiffFrameCount: number;
    readonly fileSummaryBaselineExcessMax?: number;
    readonly fileSummaryHeightMax?: number;
    readonly genericFrameCount: number;
    readonly maxBottomDistance: number;
    readonly maxStableRowSpacingDelta: number;
    readonly stableRowPairFrameCount: number;
    readonly stable: boolean;
    readonly toolActivityHeightMax?: number;
    readonly toolActivityHeightMin?: number;
    readonly transitionCount: number;
    readonly frames: readonly ScrollStabilityFrame[];
}

interface StreamingPaintMeasurement {
    readonly delayedRowGeometryCorrections: number;
    readonly frameCount: number;
    readonly frames: readonly ScrollStabilityFrame[];
    readonly maxBottomDistance: number;
    readonly maxRowOverlapCount: number;
    readonly maxStableRowSpacingDelta: number;
    readonly progressiveTableParagraphObserved: boolean;
    readonly prefixCaptureFrameCount: number;
    readonly prefixNodePreserved: boolean;
    readonly settledStatusFrameCount: number;
    readonly settledStatusGapMax?: number;
    readonly settledStatusGapMin?: number;
    readonly settledStatusHeightMax?: number;
    readonly settledStatusHeightMin?: number;
    readonly stable: boolean;
    readonly stableRowPairFrameCount: number;
    readonly statusGapMax?: number;
    readonly statusGapMin?: number;
    readonly statusGapSpread?: number;
    readonly statusTransitionContinuous: boolean;
    readonly statusTransitionScrollHeightDelta?: number;
    readonly statusTransitionSlotDelta?: number;
    readonly statusTypographyMatched: boolean;
    readonly tableColumnReflows: number;
    readonly tableObserved: boolean;
    readonly tableStructureTransitions: number;
}

export async function electronWorkloadsRun(options: {
    readonly paths: GymRunPaths;
    readonly manifest: GymManifest;
    readonly runtime: StartedHappyAgentRuntime;
    readonly projects: readonly GymProject[];
    readonly sessionIds: readonly string[];
    readonly clusterSessionIds: readonly string[];
    readonly workload: GymWorkloadName;
    readonly uiTrace: boolean;
}): Promise<ElectronRunResult> {
    testDepthRead(process.env.HAPPY_TEST_DEPTH);
    const startedAt = new Date().toISOString();
    const entrypoint = electronEntrypointResolve(options.paths.workspaceRoot);
    const app = await gymElectronLaunch({
        // Electron reads userData from this command-line switch before app
        // startup; an environment label alone would not isolate app.getPath().
        args: [`--user-data-dir=${options.paths.electronUserData}`, entrypoint.main],
        cwd: options.paths.workspaceRoot,
        env: {
            ...options.runtime.environment,
            ...linuxDisplayEnvironment(),
            // The optimized profile is a checked-in Electron build flavor. Do
            // not point the gym at the Vite dev server: its timings include
            // development-only transforms and are not representative.
            HAPPY_DESKTOP_PROFILE: "1",
            HAPPY_DESKTOP_PROFILE_MODE: "optimized",
            HAPPY_DESKTOP_GYM_PROFILE: options.manifest.profile,
            HAPPY_DESKTOP_GYM_ELECTRON_USER_DATA: options.paths.electronUserData,
        },
        executablePath: entrypoint.executable,
        timeout: 60_000,
    });
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForSelector("body", { timeout: 30_000 });
    await gymElectronInvisibleAssert(app).catch(async (error: unknown) => {
        await app.close().catch(() => undefined);
        throw error;
    });

    const workloads =
        options.workload === "all"
            ? ([
                  "hidden-window",
                  "boot",
                  "catalog-switch",
                  "long-transcript",
                  "long-chat-scroll",
                  "window-edge-resize",
                  "session-switch-load",
                  "file-switch-warm",
                  "highlight-warm",
                  "changed-files-warm",
                  "panel-file-edit",
                  "streaming",
                  "mixed-replay",
                  "memory-idle",
                  "archive-reconcile",
              ] as const)
            : [options.workload];
    const samples: GymMeasurement[] = [];
    const artifacts: string[] = [];
    let nativeProfilerRunning = false;
    let nativeProfilerAvailable = false;
    try {
        await completeOnboarding(page);
        // Let the final onboarding-to-workspace transition settle before the
        // native profiler attaches. Otherwise its route replacement callback
        // can close the capture before React's profiling handshake arrives.
        await page.waitForTimeout(500);
        for (const workload of workloads) {
            const uiTraceArtifact = join(options.paths.artifacts, `${workload}.zip`);
            let uiTraceStarted = false;
            if (options.uiTrace) {
                await page.context().tracing.start({
                    screenshots: true,
                    snapshots: true,
                    sources: false,
                });
                uiTraceStarted = true;
            }
            const sampleStarted = performance.now();
            const sampleStartedAt = new Date().toISOString();
            let measurementResult: GymMeasurement;
            try {
                measurementResult = await workloadRun(workload, page, app, {
                    ...options,
                    profilerStart: async () => {
                        const started = await nativeProfilerStart(page).catch((error: unknown) => ({
                            status: "unavailable",
                            reason: error instanceof Error ? error.message : String(error),
                        }));
                        nativeProfilerRunning =
                            started.status === "running" || started.status === "starting";
                        nativeProfilerAvailable = nativeProfilerRunning;
                    },
                    profilerActive: () => nativeProfilerAvailable,
                });
            } catch (error) {
                measurementResult = measurement(
                    workload,
                    sampleStarted,
                    {
                        error: error instanceof Error ? error.message : String(error),
                        status: "failed",
                    },
                    [],
                    sampleStartedAt,
                );
            }
            const stopped = nativeProfilerRunning ? await nativeProfilerStop(page) : undefined;
            nativeProfilerRunning = false;
            nativeProfilerAvailable = false;
            let sampleProfilerArtifacts: readonly GymProfilerArtifactReference[] = [];
            if (stopped?.artifact?.path) {
                const reference = await gymProfilerArtifactReferenceRead(stopped.artifact.path);
                sampleProfilerArtifacts = [reference];
                for (const path of [
                    reference.manifestPath,
                    reference.reportPath,
                    reference.metricsPath,
                    reference.tracePath,
                    ...reference.reactBackendProfilePaths,
                ]) {
                    if (!artifacts.includes(path)) artifacts.push(path);
                }
            }
            samples.push({ ...measurementResult, profilerArtifacts: sampleProfilerArtifacts });
            // Every workload ends where it began: off every screen.
            await gymElectronInvisibleAssert(app);
            if (uiTraceStarted) {
                await page
                    .context()
                    .tracing.stop({ path: uiTraceArtifact })
                    .catch(() => undefined);
                uiTraceStarted = false;
                if (await fileExists(uiTraceArtifact)) artifacts.push(uiTraceArtifact);
            }
        }
    } finally {
        if (nativeProfilerRunning) {
            await nativeProfilerStop(page).catch(() => undefined);
        }
        await app.close();
    }
    return {
        workload: options.workload,
        startedAt,
        finishedAt: new Date().toISOString(),
        samples,
        artifacts,
    };
}

async function nativeProfilerStart(page: Page): Promise<GymProfilerSnapshot> {
    return page.evaluate(async () => {
        const bridge = (window as Window & { readonly happyDesktop?: GymProfilerBridge })
            .happyDesktop;
        if (!bridge)
            return {
                status: "unavailable",
            };
        return bridge.profilerStart({ durationMs: 10 * 60_000 });
    });
}

/**
 * The launch environment is an exact allowlist, so a Linux host's display
 * server coordinates must be handed through deliberately or the launched
 * Electron cannot open a window at all — under xvfb in CI, DISPLAY exists only
 * in the harness's own environment. ELECTRON_DISABLE_SANDBOX rides along for
 * hosts whose kernel restrictions (CI runners) refuse Chromium's sandbox;
 * setting it remains the operator's decision.
 */
function linuxDisplayEnvironment(): Record<string, string> {
    if (process.platform !== "linux") return {};
    const passthrough: Record<string, string> = {};
    for (const name of [
        "DISPLAY",
        "WAYLAND_DISPLAY",
        "XAUTHORITY",
        "XDG_RUNTIME_DIR",
        "ELECTRON_DISABLE_SANDBOX",
    ]) {
        const value = process.env[name];
        if (value !== undefined && value !== "") passthrough[name] = value;
    }
    return passthrough;
}

/**
 * Every run receives fresh Electron user data so it cannot accidentally read
 * the operator's settings. That also means the real Welcome/onboarding flow is
 * present on the first launch. Drive only the public controls here; the gym
 * must exercise the same renderer and IPC boundary as a person, not seed
 * desktop settings behind the app.
 */
export async function completeOnboarding(page: Page): Promise<void> {
    const deadline = Date.now() + 45_000;
    // The welcome deck mounts after the renderer's first paint. Waiting for its
    // owned action avoids treating a not-yet-mounted button as proof that no
    // onboarding exists (which would leave the later workload on the welcome
    // screen and make every session route look broken).
    await page
        .locator('[data-happy-desktop-ui="welcome-screen"]')
        .waitFor({ state: "visible", timeout: 5_000 })
        .catch(() => undefined);
    let welcomeClicked = await clickButtonIfVisible(page, "Go Happy");
    let sawOnboarding = false;
    const clickIfVisible = async (label: string | RegExp): Promise<boolean> => {
        return clickButtonIfVisible(page, label);
    };

    while (Date.now() < deadline) {
        if (!welcomeClicked) {
            const welcomeAction = page
                .locator('[data-happy-desktop-ui="welcome-screen"] .happy-welcome-screen__action')
                .first();
            if (
                (await welcomeAction.count()) > 0 &&
                (await welcomeAction.isVisible().catch(() => false))
            ) {
                await welcomeAction.click();
                welcomeClicked = true;
                continue;
            }
        }
        const onboarding = page.locator('[data-testid="local-onboarding-screen"]');
        const onboardingVisible =
            (await onboarding.count()) > 0 &&
            (await onboarding
                .first()
                .isVisible()
                .catch(() => false));
        if (onboardingVisible) sawOnboarding = true;
        if (sawOnboarding && !onboardingVisible) {
            // The screen is removed only after the main process has accepted
            // the last answer and the workspace gate can mount.
            return;
        }
        // A configured isolated daemon can skip native onboarding entirely
        // after the welcome deck. Its mounted shell is the completion barrier.
        if (
            !onboardingVisible &&
            (await page
                .locator(".happy-sidebar-footer")
                .isVisible()
                .catch(() => false))
        )
            return;
        if (await clickIfVisible("Continue")) continue;
        if (await clickIfVisible("Not now")) continue;
        if (await clickIfVisible("Skip")) continue;
        if (
            (await page.getByRole("button", { name: /Choose a folder/ }).count()) > 0 ||
            (await page.getByRole("button", { name: /Install the CLI/ }).count()) > 0
        ) {
            throw new Error(
                "Happy onboarding requires a native project chooser or Happy Agent install; the isolated Gym could not continue through the public UI.",
            );
        }
        if (!sawOnboarding && !welcomeClicked) return;
        await page.waitForTimeout(250);
    }
    const bodyText = await page
        .locator("body")
        .innerText()
        .catch(() => "");
    throw new Error(`Timed out completing Happy onboarding: ${bodyText.slice(0, 500)}`);
}

async function clickButtonIfVisible(page: Page, label: string | RegExp): Promise<boolean> {
    const button = page.getByRole("button", { name: label }).first();
    if (
        (await button.count()) === 0 ||
        !(await button.isVisible().catch(() => false)) ||
        !(await button.isEnabled().catch(() => false))
    )
        return false;
    await button.click();
    await page.waitForTimeout(150);
    return true;
}

async function nativeProfilerStop(page: Page): Promise<GymProfilerSnapshot | undefined> {
    return page
        .evaluate(async () => {
            const bridge = (window as Window & { readonly happyDesktop?: GymProfilerBridge })
                .happyDesktop;
            if (!bridge) return undefined;
            return bridge.profilerStop();
        })
        .catch(() => undefined);
}

async function workloadRun(
    workload: Exclude<GymWorkloadName, "all">,
    page: Page,
    app: ElectronApplication,
    options: {
        readonly paths: GymRunPaths;
        readonly manifest: GymManifest;
        readonly runtime: StartedHappyAgentRuntime;
        readonly projects: readonly GymProject[];
        readonly sessionIds: readonly string[];
        readonly clusterSessionIds: readonly string[];
        profilerStart(): Promise<void>;
        profilerActive(): boolean;
    },
): Promise<GymMeasurement> {
    const depth = testDepthRead(process.env.HAPPY_TEST_DEPTH);
    const started = performance.now();
    const scenarioStartedAt = new Date().toISOString();
    const marks: GymScenarioMark[] = [];
    const mark = (name: string): Promise<void> =>
        scenarioMark(page, marks, started, `${workload}:${name}`);
    const finish = async (details: Record<string, unknown>): Promise<GymMeasurement> => {
        await mark("scenario-end");
        return measurement(workload, started, { depth, ...details }, marks, scenarioStartedAt);
    };

    await mark("scenario-start");
    if (workload === "background-drafts") {
        const targets = await mixedSessionTargetsRead(
            options.manifest.publicRepository?.sessionIds ?? options.clusterSessionIds,
            options.runtime,
        );
        if (targets.length < 2)
            throw new Error("Background drafts need two durable conversations.");
        const [visible, background] = targets;
        await navigateRoute(page, visible!.route);
        await waitForSessionUiReady(page, visible!.route, visible!.id);
        await page.waitForTimeout(500);
        const original = await options.runtime.client.draftRead(background!.id);
        await options.profilerStart();
        await mark("background-drafts-start");
        const before = await performanceCapture(page, app, options.profilerActive());
        const updateStarted = performance.now();
        const updates = depth === "full" ? 100 : 20;
        try {
            for (let index = 0; index < updates; index += 1) {
                await options.runtime.client.draftSave(background!.id, {
                    text: `A phone edits a background conversation: ${"review ".repeat(index + 1)}`,
                    providerId: "gym",
                    modelId: "openai/gym",
                    effort: "medium",
                    permissionMode: "full_access",
                    serviceTier: null,
                });
            }
        } finally {
            await options.runtime.client.draftSave(background!.id, original);
        }
        const updateDurationMs = performance.now() - updateStarted;
        await page.waitForTimeout(500);
        await mark("background-drafts-complete");
        const selected = await page
            .locator(`[data-happy-desktop-ui="tab"][data-tab-id="${visible!.id}"]`)
            .first()
            .getAttribute("aria-selected");
        if (selected !== "true")
            throw new Error("Background drafts changed the selected conversation.");
        await page.screenshot({ path: join(options.paths.artifacts, "background-drafts.png") });
        return finish({
            updates,
            updateDurationMs,
            before,
            after: await performanceCapture(page, app, options.profilerActive()),
            selectedSessionPreserved: true,
        });
    }
    if (workload === "boot") {
        await options.profilerStart();
        await mark("profiler-started");
        await page.waitForSelector("body");
        await mark("boot-ready");
        return finish(await performanceCapture(page, app, options.profilerActive()));
    }
    if (workload === "archive-reconcile") {
        await options.profilerStart();
        await mark("profiler-started");
        const details = await archiveReconcileRun(page, options, mark);
        if (details.status === "ok" && !details.leftArchivedGroup) {
            throw new Error(
                `The window stayed on an archived workspace: ${JSON.stringify(details)}`,
            );
        }
        if (details.status === "ok" && !details.archivedGroupForgotten) {
            throw new Error(`Back walked into an archived workspace: ${JSON.stringify(details)}`);
        }
        return finish({
            ...details,
            ...(await performanceCapture(page, app, options.profilerActive())),
        });
    }
    if (workload === "mixed-replay") {
        const material = await gymGoldReplayMaterialRead(options.paths.workspaceRoot);
        const targets = await mixedSessionTargetsRead(options.clusterSessionIds, options.runtime);
        if (targets.length < 3) {
            return finish({
                reason: `Mixed replay needs three durable sessions; found ${targets.length}.`,
                status: "skipped",
            });
        }
        await options.profilerStart();
        await mark("profiler-started");
        return finish(await mixedReplayRun(page, app, options, material, targets, mark));
    }
    if (
        workload === "long-chat-scroll" ||
        workload === "session-switch-load" ||
        workload === "public-repository"
    ) {
        const sessionIds =
            workload === "public-repository"
                ? (options.manifest.publicRepository?.sessionIds ?? [])
                : options.clusterSessionIds;
        const targets = await mixedSessionTargetsRead(sessionIds, options.runtime);
        if (targets.length < 3) {
            return finish({
                reason: `${workload} needs three durable sessions; found ${targets.length}.`,
                status: "skipped",
            });
        }
        const material = await gymGoldReplayMaterialRead(options.paths.workspaceRoot);
        await options.profilerStart();
        await mark("profiler-started");
        return finish(
            workload !== "session-switch-load"
                ? await longChatScrollRun(page, app, options, material, targets, mark)
                : await sessionSwitchLoadRun(page, app, options, material, targets, mark),
        );
    }
    if (workload === "window-zoom") {
        const result = await windowZoomRun(page, app, {
            artifacts: options.paths.artifacts,
            zooms: [0.8, 0.9, 1, 1.1, 1.25, 1.5],
        });
        await writeFile(
            join(options.paths.artifacts, "window-zoom.json"),
            JSON.stringify(result, null, 2),
        );
        if (result.problems.length > 0)
            throw new Error(`The window's controls are misplaced:\n${result.problems.join("\n")}`);
        return finish({ steps: result.steps.length });
    }
    const location = await firstSessionLocation(
        options.sessionIds,
        options.runtime,
        workload === "file-switch-warm" || workload === "highlight-warm",
    );
    if (workload === "catalog-switch") {
        const project = options.projects[0];
        if (project === undefined)
            return finish({ reason: "No seeded project.", status: "skipped" });
        await options.profilerStart();
        await mark("profiler-started");
        await navigateRoute(page, `/chats/local/${project.id}`);
        for (const candidate of options.projects.slice(0, 4)) {
            await navigateRoute(page, `/chats/local/${candidate.id}`);
        }
        await mark("catalog-ready");
        return finish({
            projectsVisited: Math.min(options.projects.length, 4),
            ...(await performanceCapture(page, app, options.profilerActive())),
        });
    }
    if (workload === "jump-shimmer") {
        if (location === undefined)
            return finish({ reason: "No seeded session location.", status: "skipped" });
        await page.reload();
        // Back out of Settings if an earlier run left the window there.
        const back = page.locator('[data-happy-desktop-ui="sidebar"] button[aria-label="Back"]');
        await page
            .locator('[data-happy-desktop-ui="sidebar"]')
            .first()
            .waitFor({ state: "visible", timeout: 45_000 });
        if (await back.first().isVisible()) await back.first().click();
        await navigateRoute(page, location.route);
        await waitForSessionUiReady(page, location.route, location.sessionId);
        await mark("route-ready");
        return finish({
            ...(await jumpShimmerRun(page, options.runtime.client, {
                artifacts: options.paths.artifacts,
                sessionId: location.sessionId,
            })),
        });
    }
    if (workload === "stop-shimmer") {
        if (location === undefined)
            return finish({ reason: "No seeded session location.", status: "skipped" });
        await page.reload();
        await navigateRoute(page, location.route);
        await waitForSessionUiReady(page, location.route, location.sessionId);
        await mark("classic-ready");
        const results = [
            await stopShimmerRun(page, options.runtime.client, {
                artifacts: options.paths.artifacts,
                sidebar: "classic",
                start: async () => {
                    await options.runtime.client.sendMessage(
                        location.sessionId,
                        `${GYM_STOP_SHIMMER_PROMPT}-${Date.now()}`,
                    );
                    return location.sessionId;
                },
                video: true,
            }),
        ];
        await mark("classic-stopped");
        const problems = results.flatMap((result) =>
            result.problems.map((problem) => `${result.sidebar}: ${problem}`),
        );
        if (problems.length > 0)
            throw new Error(`Stop left the sidebar working:\n${problems.join("\n")}`);
        return finish({
            settledMs: Object.fromEntries(
                results.map((result) => [result.sidebar, result.settledMs]),
            ),
        });
    }
    if (location === undefined)
        return finish({ reason: "No seeded session location.", status: "skipped" });
    await navigateRoute(page, location.route);
    await waitForSessionUiReady(page, location.route, location.sessionId);
    await mark("route-ready");
    if (workload === "hidden-window")
        return finish(await hiddenWindowRun(page, app, options.paths.artifacts, mark));
    if (workload === "mobile-direct-experiment")
        return finish({ ...(await mobileDirectExperimentRun(page, options.paths.artifacts)) });
    await options.profilerStart();
    await mark("profiler-started");
    if (workload === "long-transcript") {
        await waitForAny(page, [
            '[data-happy-desktop-ui="conversation"]',
            '[data-happy-desktop-ui="composer"]',
        ]);
        await page.locator("body").evaluate((body) => {
            for (const element of body.querySelectorAll<HTMLElement>(
                '[data-happy-desktop-ui="conversation"], [data-happy-desktop-ui="conversation-scroll"]',
            )) {
                element.scrollTop = element.scrollHeight;
                element.scrollTop = 0;
            }
        });
        await mark("transcript-ready");
        return finish(await performanceCapture(page, app, options.profilerActive()));
    }
    if (workload === "window-edge-resize") {
        return finish(
            await windowEdgeResizeRun(page, app, options.paths, location.sessionId, mark),
        );
    }
    if (
        workload === "file-switch-warm" ||
        workload === "highlight-warm" ||
        workload === "changed-files-warm"
    ) {
        const details = await fileSwitch(
            page,
            workload === "highlight-warm"
                ? "highlight"
                : workload === "changed-files-warm"
                  ? "changed"
                  : "document",
        );
        await mark("file-switch-complete");
        return finish({
            ...details,
            ...(workload === "highlight-warm"
                ? { cacheEvidence: cacheEvidence("highlight-cache", details) }
                : {}),
            ...(await performanceCapture(page, app, options.profilerActive())),
        });
    }
    if (workload === "panel-file-edit") {
        const details = await panelFileEditRun(page, mark);
        await mark("panel-file-edit-complete");
        return finish({
            ...details,
            ...(await performanceCapture(page, app, options.profilerActive())),
        });
    }
    if (workload === "streaming") {
        const composer = page.locator('[data-happy-desktop-ui="composer-textarea"]').first();
        await composer.waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
        if ((await composer.count()) === 0 || !(await composer.isVisible().catch(() => false))) {
            return finish({ reason: "The composer is not mounted.", status: "skipped" });
        }
        const streamingScroll = await streamingScrollRun(page, composer, mark);
        if (!streamingScroll.stable) {
            throw new Error(
                `Real streaming scroll stability failed: ${JSON.stringify(streamingScroll)}`,
            );
        }
        await mark("stream-complete");
        return finish({
            streamingScroll,
            ...(await performanceCapture(page, app, options.profilerActive())),
        });
    }
    if (workload === "memory-idle") {
        const before = await performanceCapture(page, app, options.profilerActive());
        const cycles = depth === "full" ? 3 : 1;
        for (let index = 0; index < cycles; index += 1) {
            await navigateRoute(page, location.route);
            await waitForAny(page, ["body"]);
            await mark(`memory-cycle-${index + 1}`);
        }
        const after = await performanceCapture(page, app, options.profilerActive());
        return finish({ before, after, cycles });
    }
    return finish({ reason: "No implementation for workload.", status: "skipped" });
}

/**
 * A workspace retired while this window stands in it. The archive goes over the
 * host connection, so nothing here initiated it or waits for it — the window has
 * to find out by reconciling the catalog, as it would for another machine.
 *
 * It must then leave, and forget: the stack is an array precisely so entries
 * naming the dead workspace can be removed rather than left as steps Back walks
 * into. The second is proved by walking the whole stack backwards afterwards.
 */
async function archiveReconcileRun(
    page: Page,
    options: {
        readonly runtime: StartedHappyAgentRuntime;
        readonly projects: readonly GymProject[];
    },
    mark: (name: string) => Promise<void>,
): Promise<ArchiveReconcileMeasurement> {
    const skipped = (reason: string): ArchiveReconcileMeasurement => ({
        addressedRoute: "",
        archivedGroupForgotten: false,
        backSteps: 0,
        leftArchivedGroup: false,
        reason,
        reconcileMs: 0,
        settledRoute: "",
        sidebarRowRemoved: false,
        status: "skipped",
        walkedRoutes: [],
    });
    const project = options.projects[0];
    if (project === undefined) return skipped("No seeded project to make a workspace in.");
    // The lane makes what it retires: the dataset every other lane measures
    // against has to survive this one, and be the same on the next run.
    const created = await options.runtime.client.createWorkspace(
        project.id,
        `archive-reconcile-${Date.now().toString(36)}`,
    );
    const victim = await options.runtime.client.waitForWorkspace(
        created.workspace.id,
        "ready",
        90_000,
    );
    await mark("workspace-created");
    const victimRoute = `/chats/local/${victim.id}`;
    const projectRoute = `/chats/local/${project.id}`;
    // The doomed workspace twice, with a real place on either side: one archive
    // has to take out every entry naming it, not merely the one on screen.
    for (const route of [projectRoute, victimRoute, projectRoute, victimRoute]) {
        await navigateRoute(page, route);
        await waitForAny(page, ["body"]);
    }
    await mark("stack-built");
    const addressedRoute = await routeRead(page);
    const sidebarRowBefore = await sidebarGroupRowCount(page, victim.id);
    const requestedAt = performance.now();
    await options.runtime.client.archiveWorkspace(victim);
    await options.runtime.client.waitForWorkspace(victim.id, "archived", 90_000);
    await mark("host-archived");
    // The window is never told to move; it is watched until it moves itself.
    const left = await page
        .waitForFunction((dead: string) => !location.hash.startsWith(`#${dead}`), victimRoute, {
            timeout: 60_000,
        })
        .then(
            () => true,
            () => false,
        );
    const reconcileMs = performance.now() - requestedAt;
    await mark("window-left");
    const settledRoute = await routeRead(page);
    // More steps than were put in, so the far end is proved to hold rather than
    // wrap.
    const walkedRoutes: string[] = [];
    for (let step = 0; step < 6; step += 1) {
        await historyBack(page);
        walkedRoutes.push(await routeRead(page));
    }
    await mark("stack-walked");
    const namesVictim = (route: string): boolean => route.startsWith(victimRoute);
    return {
        addressedRoute,
        archivedGroupForgotten: !namesVictim(settledRoute) && !walkedRoutes.some(namesVictim),
        backSteps: walkedRoutes.length,
        leftArchivedGroup: left,
        reconcileMs: Math.round(reconcileMs),
        settledRoute,
        sidebarRowRemoved:
            sidebarRowBefore > 0 && (await sidebarGroupRowCount(page, victim.id)) === 0,
        status: "ok",
        walkedRoutes,
    };
}

/** The address the window is showing, without the leading hash. */
async function routeRead(page: Page): Promise<string> {
    return page.evaluate(() => location.hash.replace(/^#/, ""));
}

/**
 * One press of Back, as a mouse delivers it. macOS hands the side buttons to the
 * page as pointer buttons rather than to the shell, so this is the real path.
 */
async function historyBack(page: Page): Promise<void> {
    await page.evaluate(() => {
        window.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 3 }));
    });
    await page.waitForTimeout(150);
}

/** How many sidebar rows name one group; rows carry Happy Agent then group. */
async function sidebarGroupRowCount(page: Page, groupId: string): Promise<number> {
    return page.locator(`[data-item-id="local/${groupId}"]`).count();
}

/**
 * Opening a file out of the transcript, editing it, and saving it.
 *
 * A file path in a message is a click, and the file it names opens beside the
 * conversation. This lane proves that what opens there is the product's editor —
 * the same component a file tab holds — rather than a read-only viewer of the
 * same bytes: it types into the panel, watches the tab take the unsaved mark,
 * saves with Command-S, and confirms the mark clears and the typed text is what
 * the reopened file holds.
 */
async function panelFileEditRun(
    page: Page,
    mark: (name: string) => Promise<void>,
): Promise<PanelFileEditMeasurement> {
    const skipped = (reason: string): PanelFileEditMeasurement => ({
        dirtyAfterType: false,
        mainEditorMounted: false,
        panelEditorEditable: false,
        panelEditorMounted: false,
        reason,
        savedAfterCommandS: false,
        savedTextObserved: false,
        status: "skipped",
    });
    const showPanel = page.locator('button[aria-label="Show panel"]').first();
    if (await showPanel.isVisible().catch(() => false)) await showPanel.click();
    // The transcript names the file it worked on. Clicking that name is the
    // whole entry point this lane exists to cover.
    const fileLink = page.locator('[data-happy-desktop-ui="message-md-file"]').first();
    await fileLink.waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
    if ((await fileLink.count()) === 0) return skipped("No file path in the transcript to open.");
    const linkedPath = (await fileLink.getAttribute("data-path")) ?? "README.md";
    const panel = page.locator('[data-happy-desktop-ui="app-shell-panel"]').first();
    const panelEditor = panel.locator('[data-happy-desktop-ui="file-editor"]').first();
    for (let attempt = 0; attempt < 4; attempt += 1) {
        await fileLink.click().catch(() => undefined);
        await panelEditor.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
        if ((await panelEditor.count()) > 0) break;
        await page.waitForTimeout(1_000);
    }
    await mark("panel-file-opened");
    // The editor, in the panel. A read-only viewer here is the regression.
    if ((await panelEditor.count()) === 0) {
        const seen = await panel
            .evaluate((node) =>
                [
                    ...new Set(
                        [...node.querySelectorAll("[data-happy-desktop-ui]")].map(
                            (element) => element.getAttribute("data-happy-desktop-ui") ?? "",
                        ),
                    ),
                ].join(","),
            )
            .catch(() => "<unreadable>");
        return skipped(
            `The panel did not open ${linkedPath} in the file editor. Panel held: ${seen}`,
        );
    }
    // A Markdown file opens on its reading face; the text is behind Source,
    // which is the same control the main content offers.
    const sourceFace = panel
        .locator('[data-happy-desktop-ui="segmented-control-segment"]')
        .filter({ hasText: "Source" })
        .first();
    if (await sourceFace.isVisible().catch(() => false)) await sourceFace.click();
    const panelSurface = panel.locator('[data-happy-desktop-ui="code-editor"]').first();
    const panelBody = panelSurface.locator(".cm-content").first();
    await panelBody.waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
    const panelEditorEditable =
        (await panelBody.count()) > 0 &&
        (await panelBody.getAttribute("contenteditable").catch(() => null)) === "true";
    if (!panelEditorEditable)
        return {
            ...skipped(`The panel's ${linkedPath} is not editable.`),
            panelEditorMounted: true,
        };

    // Typing is what makes the file unsaved, and the tab is where that is said.
    const stamp = `gym-panel-edit-${String(Date.now())}`;
    await panelBody.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(`\n${stamp}`);
    const dirtyTab = panel.locator('[data-happy-desktop-ui="tab-dirty"]').first();
    await dirtyTab.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
    const dirtyAfterType = (await dirtyTab.count()) > 0;
    await mark("panel-file-dirty");

    // Command-S is the save affordance; there is no button to press.
    await panelBody.press("ControlOrMeta+s");
    await page
        .waitForFunction(
            () =>
                document
                    .querySelector('[data-happy-desktop-ui="app-shell-panel"]')
                    ?.querySelector('[data-happy-desktop-ui="tab-dirty"]') === null,
            undefined,
            { timeout: 20_000 },
        )
        .catch(() => undefined);
    const savedAfterCommandS = (await dirtyTab.count()) === 0;
    await mark("panel-file-saved");
    // What the checkout now holds, read back through the editor rather than
    // trusted from the keystroke: a save that did not land shows here.
    const savedTextObserved = ((await panelBody.textContent().catch(() => "")) || "").includes(
        stamp,
    );

    // The same file in a main-content tab is the same component. Moving it
    // there is what the product does when the reader settles on it.
    const panelTab = panel
        .locator('[data-happy-desktop-ui="tab"]')
        .filter({
            hasText: linkedPath.split("/").at(-1) ?? linkedPath,
        })
        .first();
    if ((await panelTab.count()) > 0) await panelTab.dblclick().catch(() => undefined);
    const mainEditor = page
        .locator('[data-happy-desktop-ui="app-shell-main"] [data-happy-desktop-ui="file-editor"]')
        .first();
    await mainEditor.waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
    const mainEditorMounted = (await mainEditor.count()) > 0;
    await mark("panel-file-main-checked");

    return {
        dirtyAfterType,
        mainEditorMounted,
        panelEditorEditable,
        panelEditorMounted: true,
        savedAfterCommandS,
        savedTextObserved,
        status: "ok",
    };
}

async function fileSwitch(
    page: Page,
    mode: "changed" | "document" | "highlight",
): Promise<FileSequenceMeasurement> {
    const paths =
        mode === "highlight"
            ? ["README.md", "src/long-transcript.md", "README.md"]
            : mode === "changed"
              ? [
                    "src/changes/modified/deep/large-modified.md",
                    "src/changes/added/deep/added-large.md",
                    "src/changes/renamed/renamed-source.ts",
                    "src/changes/modified/deep/large-modified.md",
                    "src/changes/added/deep/added-large.md",
                ]
              : ["README.md", "src/long-transcript.md", "README.md"];
    const sequence = await fileSwitchSequence(
        page,
        paths,
        undefined,
        mode === "changed" ? "changed" : "all",
    );
    if (mode === "highlight" && sequence.status === "ok") {
        if (!sequence.markdownFencedCodeObserved) {
            throw new Error(
                "Highlight lane completed without observing the README Markdown fenced-code Pierre barrier.",
            );
        }
    }
    return sequence;
}

async function fileSwitchSequence(
    page: Page,
    paths: readonly string[],
    onInteraction?: (
        path: string,
        index: number,
        durationMs: number,
        timestamps: { readonly finishedAt: string; readonly startedAt: string },
    ) => Promise<void>,
    scope: "all" | "changed" = "all",
    beforeOpen?: (path: string, index: number) => Promise<void>,
    afterOpen?: (path: string, index: number) => Promise<void>,
): Promise<FileSequenceMeasurement> {
    const showPanel = page.locator('button[aria-label="Show panel"]').first();
    if (await showPanel.isVisible().catch(() => false)) await showPanel.click();
    const filesTab = page.getByText("Files", { exact: true }).first();
    await filesTab.waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
    if ((await filesTab.count()) === 0 || !(await filesTab.isVisible().catch(() => false)))
        return {
            durationsMs: [],
            loadingObserved: [],
            paths,
            reason: "Files tab unavailable",
            status: "skipped",
        };
    await filesTab.click();
    // The scope segment is found by the value it stands for, not by its label:
    // a lane that reads the whole checkout must land on the whole checkout, and
    // a rename of "All Files" must not quietly leave it reading the diff. A
    // missing or ineffective control fails here rather than further down as a
    // file that is simply absent from the listing.
    const scopeSelector =
        '[data-happy-desktop-ui="file-browser-controls"] ' +
        `[data-happy-desktop-ui="segmented-control-segment"][data-value="${scope}"]`;
    await page.locator(scopeSelector).waitFor({ state: "visible", timeout: 20_000 });
    await page.locator(scopeSelector).click();
    await page.waitForSelector(`${scopeSelector}[data-active]`, { timeout: 20_000 });
    if (scope === "changed") {
        const listFiles = page.locator('button[aria-label="List files"]').first();
        if (
            (await listFiles.count()) > 0 &&
            (await listFiles.getAttribute("aria-pressed")) !== "true"
        )
            await listFiles.click().catch(() => undefined);
    }
    try {
        await page.waitForSelector('[data-happy-desktop-ui="file-tree"][data-virtualized]', {
            timeout: 20_000,
        });
    } catch (error) {
        const browserText = await page
            .locator('[data-happy-desktop-ui="file-browser"]')
            .innerText()
            .catch(() => "");
        throw new Error(
            `File tree did not mount for ${scope} scope: ` +
                `${error instanceof Error ? error.message : String(error)} ` +
                `browser=${browserText.slice(0, 1_000)}`,
        );
    }
    const durations: number[] = [];
    const loadingObserved: boolean[] = [];
    const seenPaths = new Set<string>();
    let markdownFencedCodeObserved = false;
    for (const [index, path] of paths.entries()) {
        const row = await fileTreeRowEnsureMounted(page, path);
        if (row === undefined) {
            return {
                durationsMs: durations,
                loadingObserved,
                paths,
                reason: `File row not visible: ${path}`,
                status: "skipped",
            };
        }
        const started = performance.now();
        const startedAt = new Date().toISOString();
        const warmReturn = seenPaths.has(path);
        const loadingObserverKey = `__happyDesktopGymFileLoadingObserver_${String(index)}`;
        await fileLoadingObserverStart(page, loadingObserverKey);
        let observedLoading = false;
        let beforeOpenDurationMs = 0;
        try {
            await row.click();
            if (beforeOpen !== undefined) {
                const beforeOpenStarted = performance.now();
                await beforeOpen(path, index);
                beforeOpenDurationMs = performance.now() - beforeOpenStarted;
            }
            const contentSelector =
                scope === "changed"
                    ? '[data-happy-desktop-ui="changed-file-diff-body"]'
                    : '[data-happy-desktop-ui="file-editor"]';
            await page.waitForSelector(contentSelector, { timeout: 20_000 });
            await page.waitForFunction(
                (expected) => {
                    const tab = [
                        ...document.querySelectorAll(
                            '[data-happy-desktop-ui="tab"][aria-selected="true"]',
                        ),
                    ].find((candidate) => candidate.textContent?.includes(expected) === true);
                    const pane = tab?.closest('[data-happy-desktop-ui="tabbed-pane"]');
                    return (
                        pane !== null &&
                        // The editor heads itself with a file path label, whose
                        // name span is the file it is showing.
                        (pane
                            ?.querySelector(
                                '[data-happy-desktop-ui="file-editor"] ' +
                                    '[data-happy-desktop-ui="file-path-label-name"]',
                            )
                            ?.textContent?.includes(expected) === true ||
                            pane
                                ?.querySelector('[data-happy-desktop-ui="changed-file-diff"]')
                                ?.getAttribute("aria-label")
                                ?.includes(expected) === true)
                    );
                },
                path.split("/").at(-1) ?? path,
                { timeout: 30_000 },
            );
            await afterOpen?.(path, index);
            if (scope === "all" && /\.(?:md|markdown|mdx)$/iu.test(path)) {
                const fenced = path === "README.md";
                await markdownCompletionBarrier(page, fenced, path.split("/").at(-1) ?? path);
                markdownFencedCodeObserved ||= fenced;
            }
            observedLoading = await fileLoadingObserverStop(page, loadingObserverKey);
        } catch (error) {
            await fileLoadingObserverStop(page, loadingObserverKey).catch(() => undefined);
            throw error;
        }
        loadingObserved.push(observedLoading);
        if (warmReturn && observedLoading) {
            throw new Error(
                `Warm file revisit displayed Loading file… for ${path} at sequence index ${index}.`,
            );
        }
        seenPaths.add(path);
        const durationMs = Math.max(0, performance.now() - started - beforeOpenDurationMs);
        const finishedAt = new Date().toISOString();
        durations.push(durationMs);
        await onInteraction?.(path, index, durationMs, { finishedAt, startedAt });
    }
    return {
        durationsMs: durations,
        firstMs: durations[0],
        loadingObserved,
        paths,
        status: "ok",
        warmMs: durations.at(-1),
        markdownFencedCodeObserved,
    };
}

async function fileLoadingObserverStart(page: Page, key: string): Promise<void> {
    await page.evaluate((observerKey) => {
        type FileLoadingObserverState = {
            readonly observer: MutationObserver;
            observed: boolean;
        };
        const windowWithObserver = window as Window & {
            __happyDesktopGymFileLoadingObservers?: Record<
                string,
                FileLoadingObserverState | undefined
            >;
        };
        const observers = (windowWithObserver.__happyDesktopGymFileLoadingObservers ??= {});
        observers[observerKey]?.observer.disconnect();
        const state: FileLoadingObserverState = {
            observed: false,
            observer: new MutationObserver(() => {
                const selectedTab = document.querySelector<HTMLElement>(
                    '[data-happy-desktop-ui="tab"][aria-selected="true"]',
                );
                const pane = selectedTab?.closest<HTMLElement>(
                    '[data-happy-desktop-ui="tabbed-pane"]',
                );
                state.observed ||=
                    pane?.querySelector('[data-happy-desktop-ui="file-preview-loading"]') !==
                        null || pane?.textContent?.includes("Loading file…") === true;
            }),
        };
        const selectedTab = document.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="tab"][aria-selected="true"]',
        );
        const pane = selectedTab?.closest<HTMLElement>('[data-happy-desktop-ui="tabbed-pane"]');
        state.observed =
            pane?.querySelector('[data-happy-desktop-ui="file-preview-loading"]') !== null ||
            pane?.textContent?.includes("Loading file…") === true;
        observers[observerKey] = state;
        state.observer.observe(document.documentElement ?? document, {
            attributes: true,
            attributeFilter: ["aria-selected", "data-happy-desktop-ui"],
            characterData: true,
            childList: true,
            subtree: true,
        });
    }, key);
}

async function fileLoadingObserverStop(page: Page, key: string): Promise<boolean> {
    return page.evaluate((observerKey) => {
        type FileLoadingObserverState = {
            readonly observer: MutationObserver;
            observed: boolean;
        };
        const windowWithObserver = window as Window & {
            __happyDesktopGymFileLoadingObservers?: Record<
                string,
                FileLoadingObserverState | undefined
            >;
        };
        const observers = windowWithObserver.__happyDesktopGymFileLoadingObservers;
        const state = observers?.[observerKey];
        if (state === undefined) return false;
        state.observer.disconnect();
        delete observers?.[observerKey];
        return state.observed;
    }, key);
}

async function fileTreeRowEnsureMounted(page: Page, path: string): Promise<Locator | undefined> {
    const row = page.locator(`[data-happy-desktop-ui="file-tree-row"][data-path="${path}"]`);
    const tree = page.locator('[data-happy-desktop-ui="file-tree"][data-virtualized]').first();
    for (let fraction = 0; fraction <= 1 && (await row.count()) === 0; fraction += 0.1) {
        await tree
            .evaluate(async (element, offset) => {
                const scroll = element as HTMLElement;
                scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) * offset;
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            }, fraction)
            .catch(() => undefined);
    }
    if ((await row.count()) === 0) {
        await row.waitFor({ state: "attached", timeout: 5_000 }).catch(() => undefined);
    }
    if ((await row.count()) === 0) return undefined;
    await row.scrollIntoViewIfNeeded().catch(() => undefined);
    return row;
}

async function changedFileStatsBarrier(
    page: Page,
    path: string,
    expectedInsertions: number,
    expectedDeletions: number,
): Promise<ChangedFileStatsMeasurement> {
    const row = await fileTreeRowEnsureMounted(page, path);
    if (row === undefined) {
        throw new Error(`Changed-file virtual row did not mount for ${path}.`);
    }
    const expected = {
        deletions: `−${String(expectedDeletions)}`,
        insertions: `+${String(expectedInsertions)}`,
        path,
    };
    try {
        await page.waitForFunction(
            ({ deletions, insertions, path: expectedPath }) => {
                const row = [
                    ...document.querySelectorAll<HTMLElement>(
                        '[data-happy-desktop-ui="file-tree-row"][data-path]',
                    ),
                ].find((candidate) => candidate.dataset.path === expectedPath);
                if (row === undefined) return false;
                // The data attributes are the explicit contract when present. The
                // class selectors keep this gym compatible with the currently
                // shipped FileTree, which exposes the same two spans under the
                // file-tree-stat marker.
                const insertion =
                    row.querySelector<HTMLElement>(
                        '[data-happy-desktop-ui="file-tree-insertions"]',
                    ) ?? row.querySelector<HTMLElement>(".happy-file-tree__stat-added");
                const deletion =
                    row.querySelector<HTMLElement>(
                        '[data-happy-desktop-ui="file-tree-deletions"]',
                    ) ?? row.querySelector<HTMLElement>(".happy-file-tree__stat-deleted");
                return (
                    insertion?.textContent?.trim() === insertions &&
                    deletion?.textContent?.trim() === deletions
                );
            },
            expected,
            { timeout: 90_000 },
        );
    } catch (error) {
        const actual = await page
            .evaluate((expectedPath) => {
                const row = [
                    ...document.querySelectorAll<HTMLElement>(
                        '[data-happy-desktop-ui="file-tree-row"][data-path]',
                    ),
                ].find((candidate) => candidate.dataset.path === expectedPath);
                const insertion =
                    row?.querySelector<HTMLElement>(
                        '[data-happy-desktop-ui="file-tree-insertions"]',
                    ) ?? row?.querySelector<HTMLElement>(".happy-file-tree__stat-added");
                const deletion =
                    row?.querySelector<HTMLElement>(
                        '[data-happy-desktop-ui="file-tree-deletions"]',
                    ) ?? row?.querySelector<HTMLElement>(".happy-file-tree__stat-deleted");
                return {
                    rowText: row?.textContent?.trim(),
                    insertion: insertion?.textContent?.trim(),
                    deletion: deletion?.textContent?.trim(),
                    summary: document
                        .querySelector('[data-happy-desktop-ui="file-browser-summary"]')
                        ?.textContent?.trim(),
                };
            }, path)
            .catch(() => undefined);
        throw new Error(
            `Changed-file stats barrier timed out for ${path}: ` +
                `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)} ` +
                `${error instanceof Error ? error.message : String(error)}`,
        );
    }
    const observed = await page.evaluate((expectedPath) => {
        const row = [
            ...document.querySelectorAll<HTMLElement>(
                '[data-happy-desktop-ui="file-tree-row"][data-path]',
            ),
        ].find((candidate) => candidate.dataset.path === expectedPath);
        if (row === undefined) return undefined;
        const insertion =
            row.querySelector<HTMLElement>('[data-happy-desktop-ui="file-tree-insertions"]') ??
            row.querySelector<HTMLElement>(".happy-file-tree__stat-added");
        const deletion =
            row.querySelector<HTMLElement>('[data-happy-desktop-ui="file-tree-deletions"]') ??
            row.querySelector<HTMLElement>(".happy-file-tree__stat-deleted");
        if (insertion === null || deletion === null) return undefined;
        return {
            deletions: deletion.textContent?.trim() ?? "",
            insertions: insertion.textContent?.trim() ?? "",
            selectors: {
                deletions:
                    deletion.getAttribute("data-happy-desktop-ui") ??
                    ".happy-file-tree__stat-deleted",
                insertions:
                    insertion.getAttribute("data-happy-desktop-ui") ??
                    ".happy-file-tree__stat-added",
            },
        };
    }, path);
    if (observed === undefined) {
        throw new Error(`Changed-file stats disappeared after the barrier for ${path}.`);
    }
    return { ...observed, path };
}

async function changedFileSelectionBarrier(
    page: Page,
    path: string,
    alreadyOpen = false,
): Promise<DiffSelectionMeasurement> {
    if (!alreadyOpen) {
        const row = await fileTreeRowEnsureMounted(page, path);
        if (row === undefined)
            throw new Error(`Changed-file virtual row did not mount for ${path}.`);
        await row.click();
    }
    const started = performance.now();
    const observation = await diffSelectionStabilityObserve(page, path);
    const before = observation.selectionSamples[0];
    const after = observation.selectionSamples.at(-1);
    if (before === undefined || after === undefined || before.length < 2)
        throw new Error(`Changed-file diff selection did not start for ${path}.`);
    const stableViewNodesPreserved =
        observation.selectionSamples.length === 5 &&
        observation.selectionSamples.every(
            (sample) =>
                sample.text === before.text &&
                sample.length === before.length &&
                sample.inside &&
                sample.anchorConnected &&
                sample.focusConnected,
        );
    if (
        observation.initialMode !== observation.finalMode ||
        observation.stableViewMutated ||
        !stableViewNodesPreserved
    ) {
        throw new Error(
            `Settled changed-file diff identity was unstable for ${path}: ` +
                `mode=${String(observation.finalMode)} expectedMode=${observation.initialMode} ` +
                `stableViewMutation=${String(observation.stableViewMutated)} ` +
                `nodesPreserved=${String(stableViewNodesPreserved)} ` +
                `before=${String(before.length)} after=${String(after.length)}.`,
        );
    }
    return {
        afterLength: after.length,
        beforeLength: before.length,
        durationMs: performance.now() - started,
        inputMode: "native-dom-range",
        path,
        selectionSamples: observation.selectionSamples,
        selectionTimeline: observation.selectionTimeline,
        stable: stableViewNodesPreserved,
        stableViewMutationObserved: observation.stableViewMutated,
        stableViewNodesPreserved,
    };
}

async function diffSelectionStabilityObserve(
    page: Page,
    path: string,
): Promise<DiffSelectionStabilityObservation> {
    const expectedFileName = path.split("/").at(-1) ?? path;
    return page.evaluate(
        async ({ expected }) =>
            new Promise<DiffSelectionStabilityObservation>((resolve, reject) => {
                const sampleTimes = [0, 100, 500, 1_000, 2_000] as const;
                const samples: DiffSelectionSample[] = [];
                const timeline: DiffSelectionTimelineEvent[] = [];
                let completed = false;
                let diff: HTMLElement | undefined;
                let documentObserver: MutationObserver | undefined;
                let stableObserver: MutationObserver | undefined;
                let selectedAt = 0;
                let initialMode: string | undefined;
                let stableViewMutated = false;
                let selectionStarted = false;
                let staged = false;
                const selectionAbort = new AbortController();
                let stageTimeout = 0;

                documentObserver = new MutationObserver(() => {
                    if (staged || completed) return;
                    const selectedTab = document.querySelector<HTMLElement>(
                        '[data-happy-desktop-ui="tab"][aria-selected="true"]',
                    );
                    const pane = selectedTab?.closest<HTMLElement>(
                        '[data-happy-desktop-ui="tabbed-pane"]',
                    );
                    const candidateDiff = pane?.querySelector<HTMLElement>(
                        '[data-happy-desktop-ui="changed-file-diff"]',
                    );
                    if (candidateDiff?.getAttribute("aria-label")?.includes(expected) !== true)
                        return;
                    const renderer = candidateDiff.querySelector<HTMLElement>("diffs-container");
                    const candidateRoot = renderer?.shadowRoot;
                    if (
                        renderer === null ||
                        renderer === undefined ||
                        candidateRoot === null ||
                        candidateRoot === undefined
                    )
                        return;
                    let target:
                        | {
                              readonly end: number;
                              readonly start: number;
                              readonly text: Text;
                          }
                        | undefined;
                    for (const line of candidateRoot.querySelectorAll<HTMLElement>(
                        "[data-code] [data-line][data-line-index]",
                    )) {
                        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
                        while (walker.nextNode()) {
                            const text = walker.currentNode as Text;
                            const start = text.data.search(/\S/u);
                            if (start < 0 || text.data.length - start < 2) continue;
                            target = {
                                end: Math.min(text.data.length, start + 16),
                                start,
                                text,
                            };
                            break;
                        }
                        if (target !== undefined) break;
                    }
                    if (target === undefined) return;
                    staged = true;
                    diff = candidateDiff;
                    initialMode = candidateDiff.dataset.mode;
                    documentObserver?.disconnect();
                    {
                        const settledTarget = target;
                        const selection = window.getSelection();
                        if (selection === null) return;
                        selectionStarted = true;
                        selectedAt = performance.now();
                        document.addEventListener(
                            "selectionchange",
                            () => {
                                if (timeline.length >= 64) return;
                                const current = window.getSelection();
                                const anchor = current?.anchorNode;
                                const focus = current?.focusNode;
                                timeline.push({
                                    anchorConnected:
                                        anchor !== null &&
                                        anchor !== undefined &&
                                        anchor.isConnected &&
                                        candidateRoot.contains(anchor),
                                    focusConnected:
                                        focus !== null &&
                                        focus !== undefined &&
                                        focus.isConnected &&
                                        candidateRoot.contains(focus),
                                    kind: "selectionchange",
                                    tMs: Math.max(0, performance.now() - selectedAt),
                                    text: current?.toString() ?? "",
                                });
                            },
                            { signal: selectionAbort.signal },
                        );
                        stableObserver = new MutationObserver(() => {
                            stableViewMutated = true;
                            if (timeline.length >= 64) return;
                            const current = window.getSelection();
                            const anchor = current?.anchorNode;
                            const focus = current?.focusNode;
                            timeline.push({
                                anchorConnected:
                                    anchor !== null &&
                                    anchor !== undefined &&
                                    anchor.isConnected &&
                                    candidateRoot.contains(anchor),
                                focusConnected:
                                    focus !== null &&
                                    focus !== undefined &&
                                    focus.isConnected &&
                                    candidateRoot.contains(focus),
                                kind: "mutation",
                                tMs: Math.max(0, performance.now() - selectedAt),
                                text: current?.toString() ?? "",
                            });
                        });
                        stableObserver.observe(candidateRoot, {
                            characterData: true,
                            childList: true,
                            subtree: true,
                        });
                        renderer.dispatchEvent(
                            new PointerEvent("pointerdown", {
                                bubbles: true,
                                button: 0,
                                composed: true,
                                pointerId: 1,
                                pointerType: "mouse",
                            }),
                        );
                        selection.setBaseAndExtent(
                            settledTarget.text,
                            settledTarget.start,
                            settledTarget.text,
                            settledTarget.end,
                        );
                        document.dispatchEvent(new Event("selectionchange"));
                        renderer.dispatchEvent(
                            new PointerEvent("pointerup", {
                                bubbles: true,
                                button: 0,
                                composed: true,
                                pointerId: 1,
                                pointerType: "mouse",
                            }),
                        );
                        for (const atMs of sampleTimes) {
                            if (atMs === 0) {
                                const current = window.getSelection();
                                const anchor = current?.anchorNode;
                                const focus = current?.focusNode;
                                const anchorConnected =
                                    anchor !== null &&
                                    anchor !== undefined &&
                                    anchor.isConnected &&
                                    candidateRoot.contains(anchor);
                                const focusConnected =
                                    focus !== null &&
                                    focus !== undefined &&
                                    focus.isConnected &&
                                    candidateRoot.contains(focus);
                                const text = current?.toString() ?? "";
                                samples.push({
                                    anchorConnected,
                                    atMs,
                                    focusConnected,
                                    inside: anchorConnected && focusConnected,
                                    length: text.length,
                                    observedAtMs: Math.max(0, performance.now() - selectedAt),
                                    text,
                                });
                                continue;
                            }
                            window.setTimeout(() => {
                                const current = window.getSelection();
                                const anchor = current?.anchorNode;
                                const focus = current?.focusNode;
                                const anchorConnected =
                                    anchor !== null &&
                                    anchor !== undefined &&
                                    anchor.isConnected &&
                                    candidateRoot.contains(anchor);
                                const focusConnected =
                                    focus !== null &&
                                    focus !== undefined &&
                                    focus.isConnected &&
                                    candidateRoot.contains(focus);
                                const text = current?.toString() ?? "";
                                samples.push({
                                    anchorConnected,
                                    atMs,
                                    focusConnected,
                                    inside: anchorConnected && focusConnected,
                                    length: text.length,
                                    observedAtMs: Math.max(0, performance.now() - selectedAt),
                                    text,
                                });
                                if (atMs !== 2_000 || completed) return;
                                completed = true;
                                documentObserver?.disconnect();
                                stableObserver?.disconnect();
                                selectionAbort.abort();
                                window.clearTimeout(stageTimeout);
                                resolve({
                                    finalMode: diff?.dataset.mode,
                                    initialMode,
                                    selectionSamples: samples,
                                    selectionTimeline: timeline,
                                    stableViewMutated,
                                });
                            }, atMs);
                        }
                    }
                });
                documentObserver.observe(document.documentElement ?? document, {
                    attributes: true,
                    attributeFilter: [
                        "aria-selected",
                        "data-happy-desktop-gym-selection-arm",
                        "data-mode",
                    ],
                    childList: true,
                    subtree: true,
                });
                stageTimeout = window.setTimeout(() => {
                    if (selectionStarted || completed) return;
                    completed = true;
                    documentObserver?.disconnect();
                    stableObserver?.disconnect();
                    selectionAbort.abort();
                    reject(
                        new Error(`Selectable settled diff text did not appear for ${expected}.`),
                    );
                }, 30_000);
                document.documentElement?.toggleAttribute("data-happy-desktop-gym-selection-arm");
                document.documentElement?.toggleAttribute("data-happy-desktop-gym-selection-arm");
            }),
        { expected: expectedFileName },
    );
}

async function markdownCompletionBarrier(
    page: Page,
    requireFence: boolean,
    expectedTabLabel: string,
): Promise<void> {
    try {
        await page.waitForFunction(
            (expected) => {
                const tab = [
                    ...document.querySelectorAll(
                        '[data-happy-desktop-ui="tab"][aria-selected="true"]',
                    ),
                ].find((candidate) => candidate.textContent?.includes(expected) === true);
                const pane = tab?.closest('[data-happy-desktop-ui="tabbed-pane"]');
                return pane?.querySelector('[data-happy-desktop-ui="markdown-document"]') !== null;
            },
            expectedTabLabel,
            { timeout: 90_000 },
        );
    } catch (error) {
        const state = await page
            .evaluate((expected) => {
                const tabs = [
                    ...document.querySelectorAll(
                        '[data-happy-desktop-ui="tab"][aria-selected="true"]',
                    ),
                ].map((tab) => tab.textContent?.trim());
                const tab = [
                    ...document.querySelectorAll(
                        '[data-happy-desktop-ui="tab"][aria-selected="true"]',
                    ),
                ].find((candidate) => candidate.textContent?.includes(expected) === true);
                const pane = tab?.closest('[data-happy-desktop-ui="tabbed-pane"]');
                return {
                    activeTabs: tabs,
                    editorName: pane?.querySelector(
                        '[data-happy-desktop-ui="file-editor"] ' +
                            '[data-happy-desktop-ui="file-path-label-name"]',
                    )?.textContent,
                    editorText: pane
                        ?.querySelector('[data-happy-desktop-ui="file-editor"]')
                        ?.textContent?.slice(0, 500),
                    markdownCount:
                        pane?.querySelectorAll('[data-happy-desktop-ui="markdown-document"]')
                            .length ?? 0,
                };
            }, expectedTabLabel)
            .catch(() => undefined);
        throw new Error(
            `Markdown completion barrier did not mount for ${expectedTabLabel}: ${JSON.stringify(state)}; ` +
                `${error instanceof Error ? error.message : String(error)}`,
        );
    }
    await page.waitForFunction(
        ({ expected, mustHaveFence }) => {
            const tab = [
                ...document.querySelectorAll('[data-happy-desktop-ui="tab"][aria-selected="true"]'),
            ].find((candidate) => candidate.textContent?.includes(expected) === true);
            const pane = tab?.closest('[data-happy-desktop-ui="tabbed-pane"]');
            const documentRoot = pane?.querySelector('[data-happy-desktop-ui="markdown-document"]');
            const fence = documentRoot?.querySelector(
                '[data-happy-desktop-ui="markdown-document-code"]',
            );
            const renderer = fence?.querySelector("diffs-container") as HTMLElement | null;
            if (!mustHaveFence) return (documentRoot?.textContent?.trim().length ?? 0) > 0;
            return (
                fence !== null &&
                renderer !== null &&
                (renderer.shadowRoot?.textContent?.trim().length ?? 0) > 0
            );
        },
        { expected: expectedTabLabel, mustHaveFence: requireFence },
        { timeout: 90_000 },
    );
}

async function concurrentSubmissions(
    client: StartedHappyAgentRuntime["client"],
    material: GymGoldReplayMaterial,
    targets: readonly MixedSessionTarget[],
    label: string,
): Promise<{
    readonly collectors: ReadonlyMap<string, PreAttachedSessionStream>;
    readonly durationMs: number;
    readonly submissions: readonly MixedSubmission[];
}> {
    const baselineResults = await Promise.all(
        targets.map(async (target) => (await client.agentEvents(target.id)).events),
    );
    const collectors = new Map<string, PreAttachedSessionStream>();
    await Promise.all(
        targets.map(async (target, index) => {
            const baseline = baselineResults[index] ?? [];
            collectors.set(
                target.id,
                await agentStreamCollectorCreate(
                    client,
                    target.id,
                    eventCursorRead(baseline.at(-1)),
                ),
            );
        }),
    );
    const started = performance.now();
    const submissions = await Promise.all(
        targets.map(async (target, index): Promise<MixedSubmission> => {
            const materialMessage = material.messages[index % material.messages.length]!;
            const baseline = baselineResults[index] ?? [];
            const baselineEventCount = baseline.length;
            const marker = `gym-${label}-${String(index + 1)}-${target.id.slice(-6)}-e${baselineEventCount}`;
            const prompt = `${materialMessage.text}\n\n[${marker}]`;
            const submittedAt = new Date().toISOString();
            const submitted = await client.sendMessage(target.id, prompt);
            return {
                baselineEventCount,
                baselineCursor: eventCursorRead(baseline.at(-1)),
                marker,
                messageId: submitted.messageId,
                prompt,
                route: target.route,
                runId: submitted.runId,
                sessionId: target.id,
                submittedAt,
            };
        }),
    );
    return { collectors, durationMs: performance.now() - started, submissions };
}

async function agentStreamCollectorCreate(
    client: StartedHappyAgentRuntime["client"],
    sessionId: string,
    after: string | undefined,
): Promise<PreAttachedSessionStream> {
    const events: HappyAgentJournalEvent[] = [];
    const cursorWakeups = new Set<() => void>();
    const handle = client.agentStream(sessionId, after, async (event) => {
        events.push(event);
        for (const wake of cursorWakeups) wake();
    });
    // Do not submit until the daemon has accepted this SSE connection. The
    // `after` cursor is still the recovery boundary for events that arrive
    // between the durable snapshot and hello.
    await handle.ready;
    const cursorCreate = (): SessionStreamCursor => {
        let index = 0;
        let closed = false;
        let wakeup: (() => void) | undefined;
        const notify = (): void => {
            const resolve = wakeup;
            wakeup = undefined;
            resolve?.();
        };
        const close = (): void => {
            if (closed) return;
            closed = true;
            cursorWakeups.delete(notify);
            notify();
        };
        const cursor: SessionStreamCursor = {
            async next(): Promise<IteratorResult<HappyAgentJournalEvent>> {
                if (index < events.length) {
                    return { done: false, value: events[index++]! };
                }
                if (closed) return { done: true, value: undefined };
                await new Promise<void>((resolve) => {
                    wakeup = resolve;
                });
                return this.next();
            },
            async return(): Promise<IteratorResult<HappyAgentJournalEvent>> {
                close();
                return { done: true, value: undefined };
            },
            [Symbol.asyncIterator](): SessionStreamCursor {
                return this;
            },
            close,
        };
        cursorWakeups.add(notify);
        return cursor;
    };
    return {
        events,
        handle,
        ready: handle.ready,
        cursorCreate,
    };
}

async function longChatScrollRun(
    page: Page,
    app: ElectronApplication,
    options: {
        readonly paths: GymRunPaths;
        readonly runtime: StartedHappyAgentRuntime;
        readonly sessionIds: readonly string[];
        profilerActive(): boolean;
    },
    material: GymGoldReplayMaterial,
    targets: readonly MixedSessionTarget[],
    mark: (name: string) => Promise<void>,
): Promise<Record<string, unknown>> {
    const target = targets[0]!;
    await navigateRoute(page, target.route);
    await waitForSessionUiReady(page, target.route, target.id);
    const initialViewport = await transcriptViewportRead(page);
    if (!initialViewport.virtualized || initialViewport.renderedRows === 0) {
        throw new Error(
            `Long-chat scroll needs a hydrated virtual transcript: ${JSON.stringify(initialViewport)}.`,
        );
    }
    if (initialViewport.scrollHeight <= initialViewport.clientHeight) {
        throw new Error(
            `Long-chat scroll needs scrollable content: ${JSON.stringify(initialViewport)}.`,
        );
    }
    await mark("virtualized-transcript-ready");
    // The reader is at the newest message of a long, hydrated transcript: type
    // into it while it and its neighbours stream.
    const composerTyping = await composerTypingRun(
        page,
        options.runtime.client,
        options.paths,
        material,
        targets,
        mark,
    );
    // Hydrate first so the streams overlap scrolling instead of finishing during cold layout.
    const before = await performanceCapture(page, app, options.profilerActive());
    const submission = await concurrentSubmissions(
        options.runtime.client,
        material,
        targets,
        "long-chat-scroll",
    );
    await mark("concurrent-submissions-accepted");
    const barriers = submission.submissions.map((entry) =>
        sessionRunBarrierWait(
            options.runtime.client,
            entry,
            undefined,
            submission.collectors.get(entry.sessionId),
        ),
    );
    const scrollInteractions = await transcriptScrollSequence(
        page,
        [1, 0, 0.78, 0.22, 0.92, 0.08, 0.64, 0],
        mark,
    );
    const historyInteractions = scrollInteractions.filter(
        (interaction) => interaction.requestedFraction === 0,
    );
    const historyGrowthObserved = historyInteractions.some(
        (interaction) =>
            interaction.historyLoaderObserved === true ||
            (interaction.historyScrollHeightAfter ?? 0) >
                (interaction.historyScrollHeightBefore ?? Number.POSITIVE_INFINITY),
    );
    const durableBarriers = await Promise.all(barriers);
    await mark("durable-stream-barriers-complete");
    const finalViewport = await transcriptViewportRead(page);
    const after = await performanceCapture(page, app, options.profilerActive());
    return {
        after,
        before,
        composerTyping,
        durableBarriers,
        finalViewport,
        goldReplay: goldReplayDetails(material),
        responsiveness: responsivenessDetails(options.profilerActive()),
        scrollInteractions,
        historyGrowthObserved,
        submissions: {
            count: submission.submissions.length,
            concurrent: true,
            durationMs: submission.durationMs,
            runIds: submission.submissions.map((entry) => entry.runId),
        },
        transcript: {
            initialViewport,
            virtualizationExercised:
                initialViewport.virtualized &&
                initialViewport.scrollHeight > initialViewport.clientHeight,
        },
    };
}

/**
 * What a person types into the composer while the transcript streams. Plain
 * prose: a leading `/` or an `@` would open a popover the lane is not about.
 */
const COMPOSER_TYPING_TEXT =
    "Can you check whether this keeps up while the transcript streams? I am typing quickly, with commas, numbers like 42, and a question.";

/**
 * A correction made in the middle of what was typed, after the measurement.
 * The pause after each key outlasts the connection's draft-save debounce, so
 * every save reaches the host and its answer comes back while the next key
 * goes in.
 */
const COMPOSER_TYPING_CORRECTION = { before: " while ", text: " really", pauseMs: 330 } as const;

/** Milliseconds between keystrokes; roughly a fast typist's cadence. */
const COMPOSER_TYPING_KEY_INTERVAL_MS = 60;

/**
 * How long the stream runs untouched before typing and again after it. The
 * response grows the whole time, so the two windows on either side of typing
 * are the control it is compared with, rather than an earlier, shorter part.
 */
const COMPOSER_TYPING_STREAM_ONLY_MS = 3_000;

/**
 * Components whose per-keystroke render counts the lane reports by name. The
 * composer and its dock are the only ones a keystroke should reach; the rest
 * are the transcript, header, window, and palette surfaces around it.
 */
const COMPOSER_TYPING_COMPONENTS = {
    composer: ["HappyAgentComposerDock", "ConversationDock", "Composer"],
    transcript: ["MessageList", "ConversationEntryView"],
    header: ["ChannelHeader", "Tabs"],
    surface: [
        "ConversationView",
        "HappyAgentWorkspaceSurface",
        "HappyAgentConversationBody",
        "HappyAgentSurfaceChat",
        "HappyAgentWindowDialogs",
        "AppShell",
        "Sidebar",
    ],
    palette: [
        "HappyAgentCommandPaletteSurface",
        "HappyAgentQuickActionsSurface",
        "HappyAgentCommandPalette",
        "HappyAgentQuickActions",
    ],
} as const;

interface ComposerTypingKeystroke {
    readonly key: string;
    /** The keydown's own timestamp: when the browser received the key. */
    readonly keydownAt: number;
    /** Synchronous keydown, beforeinput, and input handling, React's render and commit included. */
    readonly handlerMs: number;
    /** Keydown timestamp until every handler of the resulting input event returned. */
    readonly keydownToInputHandledMs: number;
    /** Keydown timestamp until the first animation frame after the input. */
    readonly keydownToNextFrameMs?: number;
    /**
     * Keydown timestamp until a task posted from that frame ran: after the
     * frame's callbacks, style, layout, and paint, so after the work that
     * frame did for anything else.
     */
    readonly keydownToFrameEndMs?: number;
    /** React commits inside this keystroke's own event dispatch. */
    readonly commits: number;
    /** React's render time for those commits, from the profiling build. */
    readonly reactRenderMs: number;
    /** Components React rendered inside this keystroke's dispatch, by name. */
    readonly rendered: Readonly<Record<string, number>>;
}

/** The stream alone, then typing over it, then the stream alone again. */
type ComposerTypingPhase = "streamOnly" | "typing" | "streamOnlyAfter";

interface ComposerTypingProbeCapture {
    readonly reactHook: boolean;
    readonly keystrokes: readonly ComposerTypingKeystroke[];
    readonly untrustedEvents: number;
    readonly eventTimings: readonly {
        readonly name: string;
        readonly startTime: number;
        readonly duration: number;
        readonly processingMs: number;
        readonly inputDelayMs: number;
    }[];
    /** Commits outside any keystroke dispatch, by phase: the frame-coalesced stream work. */
    readonly background: Readonly<
        Record<
            ComposerTypingPhase,
            {
                readonly durationMs: number;
                readonly commits: number;
                readonly renderMs: number;
                readonly rendered: Readonly<Record<string, number>>;
            }
        >
    >;
}

/**
 * Starts recording keystroke timing and React commits in the renderer.
 *
 * React reports every commit to the DevTools global hook the profile build
 * installs; walking the committed tree the way DevTools does names each
 * component that actually rendered. A commit made while a key's events are
 * being dispatched is that keystroke's own work; anything else is the
 * frame-coalesced stream. Event Timing adds the browser's view of slow events.
 */
function composerTypingProbeInstall(): void {
    {
        interface Fiber {
            readonly tag: number;
            readonly type: unknown;
            readonly flags: number;
            readonly alternate: Fiber | null;
            readonly child: Fiber | null;
            readonly sibling: Fiber | null;
            readonly actualDuration?: number;
        }
        interface Hook {
            onCommitFiberRoot?: (
                id: unknown,
                root: { current: Fiber },
                ...rest: unknown[]
            ) => unknown;
        }
        interface Pending {
            key: string;
            keydownAt: number;
            handlerMs: number;
            handlerStartedAt?: number;
            commits: number;
            renderMs: number;
            rendered: Record<string, number>;
        }
        interface Background {
            startedAt: number;
            durationMs: number;
            commits: number;
            renderMs: number;
            rendered: Record<string, number>;
        }
        const hook = (window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: Hook })
            .__REACT_DEVTOOLS_GLOBAL_HOOK__;
        type Phase = "streamOnly" | "typing" | "streamOnlyAfter";
        const background: Record<Phase, Background> = {
            streamOnly: {
                startedAt: performance.now(),
                durationMs: 0,
                commits: 0,
                renderMs: 0,
                rendered: {},
            },
            typing: { startedAt: 0, durationMs: 0, commits: 0, renderMs: 0, rendered: {} },
            streamOnlyAfter: { startedAt: 0, durationMs: 0, commits: 0, renderMs: 0, rendered: {} },
        };
        let phase: Phase = "streamOnly";
        const phaseNext = (next: Phase): void => {
            const now = performance.now();
            background[phase].durationMs = now - background[phase].startedAt;
            background[next].startedAt = now;
            phase = next;
        };
        const keystrokes: object[] = [];
        const eventTimings: object[] = [];
        let untrustedEvents = 0;
        let pending: Pending | undefined;

        const nameOf = (fiber: Fiber): string => {
            const type = fiber.type as
                | { displayName?: string; name?: string; type?: unknown; render?: unknown }
                | undefined;
            if (typeof type === "function")
                return (
                    (type as { displayName?: string }).displayName ??
                    (type as { name?: string }).name ??
                    "Anonymous"
                );
            const inner = (type?.type ?? type?.render) as
                | { displayName?: string; name?: string }
                | undefined;
            return type?.displayName ?? inner?.displayName ?? inner?.name ?? "Anonymous";
        };
        // Function, class, forwardRef, and simple-memo fibers. A memo
        // wrapper's inner component is its own child fiber, counted there.
        const componentTags = new Set([0, 1, 11, 15]);
        const PERFORMED_WORK = 1;
        const visit = (first: Fiber | null, rendered: Record<string, number>): void => {
            for (let fiber = first; fiber !== null; fiber = fiber.sibling) {
                const previous = fiber.alternate;
                if (
                    componentTags.has(fiber.tag) &&
                    (previous === null || (fiber.flags & PERFORMED_WORK) !== 0)
                ) {
                    const name = nameOf(fiber);
                    rendered[name] = (rendered[name] ?? 0) + 1;
                }
                // A subtree React bailed out of keeps its previous children.
                if (previous === null || fiber.child !== previous.child)
                    visit(fiber.child, rendered);
            }
        };
        const original = hook?.onCommitFiberRoot;
        if (hook && original) {
            hook.onCommitFiberRoot = function (id, root, ...rest) {
                try {
                    const target = pending ?? background[phase];
                    target.commits += 1;
                    target.renderMs += root.current.actualDuration ?? 0;
                    visit(root.current.child, target.rendered);
                } catch {
                    // Measurement must never break the renderer it observes.
                }
                return original.call(this, id, root, ...rest);
            };
        }

        const keydownCapture = (event: KeyboardEvent): void => {
            if (!event.isTrusted) untrustedEvents += 1;
            pending = {
                key: event.key,
                keydownAt: event.timeStamp,
                handlerMs: 0,
                handlerStartedAt: performance.now(),
                commits: 0,
                renderMs: 0,
                rendered: {},
            };
        };
        const handlerStart = (): void => {
            if (pending) pending.handlerStartedAt = performance.now();
        };
        const handlerEnd = (): void => {
            if (!pending || pending.handlerStartedAt === undefined) return;
            pending.handlerMs += performance.now() - pending.handlerStartedAt;
            pending.handlerStartedAt = undefined;
        };
        const inputBubble = (event: Event): void => {
            if (!event.isTrusted) untrustedEvents += 1;
            handlerEnd();
            const finished = pending;
            pending = undefined;
            if (!finished) return;
            const handledAt = performance.now();
            const record: Record<string, unknown> = {
                key: finished.key,
                keydownAt: finished.keydownAt,
                handlerMs: finished.handlerMs,
                keydownToInputHandledMs: handledAt - finished.keydownAt,
                commits: finished.commits,
                reactRenderMs: finished.renderMs,
                rendered: finished.rendered,
            };
            keystrokes.push(record);
            requestAnimationFrame(() => {
                record.keydownToNextFrameMs = performance.now() - finished.keydownAt;
                // A message posted from the frame is delivered once the frame
                // has been produced.
                const channel = new MessageChannel();
                channel.port1.onmessage = () => {
                    record.keydownToFrameEndMs = performance.now() - finished.keydownAt;
                    channel.port1.close();
                };
                channel.port2.postMessage(undefined);
            });
        };
        const keyupCapture = (): void => {
            // A key that produced no input still ends its dispatch here.
            pending = undefined;
        };
        window.addEventListener("keydown", keydownCapture, true);
        window.addEventListener("keydown", handlerEnd, false);
        window.addEventListener("beforeinput", handlerStart, true);
        window.addEventListener("beforeinput", handlerEnd, false);
        window.addEventListener("input", handlerStart, true);
        window.addEventListener("input", inputBubble, false);
        window.addEventListener("keyup", keyupCapture, true);

        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as PerformanceEventTiming[]) {
                if (!["keydown", "keypress", "beforeinput", "input", "keyup"].includes(entry.name))
                    continue;
                eventTimings.push({
                    name: entry.name,
                    startTime: entry.startTime,
                    duration: entry.duration,
                    processingMs: entry.processingEnd - entry.processingStart,
                    inputDelayMs: entry.processingStart - entry.startTime,
                });
            }
        });
        observer.observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit);

        const probe = {
            typingStart(): void {
                phaseNext("typing");
            },
            typingEnd(): void {
                phaseNext("streamOnlyAfter");
            },
            stop(): unknown {
                background[phase].durationMs = performance.now() - background[phase].startedAt;
                observer.disconnect();
                for (const entry of observer.takeRecords() as PerformanceEventTiming[])
                    eventTimings.push({
                        name: entry.name,
                        startTime: entry.startTime,
                        duration: entry.duration,
                        processingMs: entry.processingEnd - entry.processingStart,
                        inputDelayMs: entry.processingStart - entry.startTime,
                    });
                window.removeEventListener("keydown", keydownCapture, true);
                window.removeEventListener("keydown", handlerEnd, false);
                window.removeEventListener("beforeinput", handlerStart, true);
                window.removeEventListener("beforeinput", handlerEnd, false);
                window.removeEventListener("input", handlerStart, true);
                window.removeEventListener("input", inputBubble, false);
                window.removeEventListener("keyup", keyupCapture, true);
                if (hook && original) hook.onCommitFiberRoot = original;
                const summary = (entry: Background) => ({
                    durationMs: entry.durationMs,
                    commits: entry.commits,
                    renderMs: entry.renderMs,
                    rendered: entry.rendered,
                });
                return {
                    reactHook: original !== undefined,
                    keystrokes,
                    untrustedEvents,
                    eventTimings,
                    background: {
                        streamOnly: summary(background.streamOnly),
                        typing: summary(background.typing),
                        streamOnlyAfter: summary(background.streamOnlyAfter),
                    },
                };
            },
        };
        (
            window as unknown as { __happyGymComposerTyping?: typeof probe }
        ).__happyGymComposerTyping = probe;
    }
}

async function composerTypingProbeStart(page: Page): Promise<void> {
    // tsx names the installer's inner functions through a helper that only
    // exists in Node; the serialized copy gets an identity stand-in.
    await page.evaluate(
        `(() => { const __name = (value) => value; (${composerTypingProbeInstall.toString()})(); })()`,
    );
}

async function composerTypingProbeTypingStart(page: Page): Promise<void> {
    await page.evaluate(() =>
        (
            window as unknown as { __happyGymComposerTyping?: { typingStart(): void } }
        ).__happyGymComposerTyping?.typingStart(),
    );
}

async function composerTypingProbeTypingEnd(page: Page): Promise<void> {
    await page.evaluate(() =>
        (
            window as unknown as { __happyGymComposerTyping?: { typingEnd(): void } }
        ).__happyGymComposerTyping?.typingEnd(),
    );
}

async function composerTypingProbeStop(page: Page): Promise<ComposerTypingProbeCapture> {
    const capture = await page.evaluate(() => {
        const host = window as unknown as {
            __happyGymComposerTyping?: { stop(): unknown };
        };
        const probe = host.__happyGymComposerTyping;
        delete host.__happyGymComposerTyping;
        return probe?.stop();
    });
    if (capture === undefined) throw new Error("The composer typing probe was not installed.");
    return capture as ComposerTypingProbeCapture;
}

function latencyStats(values: readonly number[]): {
    readonly count: number;
    readonly p50: number;
    readonly p95: number;
    readonly max: number;
    readonly mean: number;
} {
    const sorted = [...values].sort((left, right) => left - right);
    const at = (fraction: number): number =>
        sorted.length === 0
            ? 0
            : sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)]!;
    const round = (value: number): number => Math.round(value * 100) / 100;
    return {
        count: sorted.length,
        p50: round(at(0.5)),
        p95: round(at(0.95)),
        max: round(sorted.at(-1) ?? 0),
        mean: round(sorted.reduce((total, value) => total + value, 0) / Math.max(1, sorted.length)),
    };
}

/** Rendered components summed over several commits' tallies. */
function renderedSum(
    tallies: readonly Readonly<Record<string, number>>[],
): Readonly<Record<string, number>> {
    const total: Record<string, number> = {};
    for (const tally of tallies)
        for (const [name, count] of Object.entries(tally)) total[name] = (total[name] ?? 0) + count;
    return total;
}

/** One phase's frame-coalesced work, per second. */
function backgroundReport(
    phase: ComposerTypingProbeCapture["background"][ComposerTypingPhase],
): Record<string, unknown> {
    const seconds = phase.durationMs / 1_000;
    return {
        durationMs: phase.durationMs,
        commits: phase.commits / seconds,
        renderMs: phase.renderMs / seconds,
        ...renderedReport(phase.rendered, seconds),
    };
}

/** Each tracked component's renders, and every component's, divided by `per`. */
function renderedReport(
    rendered: Readonly<Record<string, number>>,
    per: number,
): Record<string, unknown> {
    const rate = (count: number): number => Math.round((count / Math.max(1, per)) * 100) / 100;
    const tracked = Object.fromEntries(
        Object.entries(COMPOSER_TYPING_COMPONENTS).map(([group, names]) => [
            group,
            Object.fromEntries(names.map((name) => [name, rate(rendered[name] ?? 0)])),
        ]),
    );
    const all = Object.values(rendered).reduce((total, count) => total + count, 0);
    return {
        tracked,
        allComponents: rate(all),
        top: Object.entries(rendered)
            .sort((left, right) => right[1] - left[1])
            .slice(0, 30)
            .map(([name, count]) => [name, rate(count)]),
    };
}

/**
 * Moves the caret back into the typed text with arrow keys and inserts a
 * word there a key at a time, while the responses still stream and each key's
 * draft save and the host's answer to it arrive. The value, the caret, and
 * focus must all be where the keys left them.
 */
async function composerTypingCorrect(
    page: Page,
    composer: Locator,
): Promise<{
    readonly expected: string;
    readonly value: string;
    readonly valueMatches: boolean;
    readonly caret: { readonly start: number; readonly end: number; readonly expected: number };
    readonly caretKept: boolean;
    readonly focused: boolean;
}> {
    const at = COMPOSER_TYPING_TEXT.indexOf(COMPOSER_TYPING_CORRECTION.before);
    for (let index = COMPOSER_TYPING_TEXT.length; index > at; index -= 1)
        await page.keyboard.press("ArrowLeft");
    for (const character of COMPOSER_TYPING_CORRECTION.text) {
        await page.keyboard.type(character);
        await page.waitForTimeout(COMPOSER_TYPING_CORRECTION.pauseMs);
    }
    // The last key's save and its answer.
    await page.waitForTimeout(COMPOSER_TYPING_CORRECTION.pauseMs * 2);
    const expected =
        COMPOSER_TYPING_TEXT.slice(0, at) +
        COMPOSER_TYPING_CORRECTION.text +
        COMPOSER_TYPING_TEXT.slice(at);
    const caretExpected = at + COMPOSER_TYPING_CORRECTION.text.length;
    const state = await composer.evaluate((element) => {
        const textarea = element as HTMLTextAreaElement;
        return {
            value: textarea.value,
            start: textarea.selectionStart,
            end: textarea.selectionEnd,
            focused: document.activeElement === textarea,
        };
    });
    return {
        expected,
        value: state.value,
        valueMatches: state.value === expected,
        caret: { start: state.start, end: state.end, expected: caretExpected },
        caretKept: state.start === caretExpected && state.end === caretExpected,
        focused: state.focused,
    };
}

/**
 * Types into the open conversation's composer while long responses stream
 * into it and its neighbours, and measures what each keystroke costs.
 *
 * Every key is a trusted keyboard event, delivered one at a time at a typing
 * cadence; nothing is filled. For each one the lane records how long the
 * browser spent handling it and how soon the next frame followed, and which
 * React components rendered inside that key's own dispatch. A keystroke should
 * reach the composer alone: the transcript, header, and window around it
 * re-render only for the stream, at frame cadence. The final text must equal
 * what was typed, so a lost character fails the lane rather than a timing.
 */
async function composerTypingRun(
    page: Page,
    client: StartedHappyAgentRuntime["client"],
    paths: GymRunPaths,
    material: GymGoldReplayMaterial,
    targets: readonly MixedSessionTarget[],
    mark: (name: string) => Promise<void>,
): Promise<Record<string, unknown>> {
    const composer = page.locator('[data-happy-desktop-ui="composer-textarea"]').first();
    await composer.waitFor({ state: "visible", timeout: 20_000 });
    // An earlier run that failed mid-lane can leave its words behind.
    if ((await composer.inputValue()) !== "") {
        await composer.focus();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.press("Backspace");
    }
    const submission = await concurrentSubmissions(client, material, targets, "composer-typing");
    const visible = submission.submissions.find((entry) => entry.sessionId === targets[0]!.id)!;
    // When each response's text first and last arrived, as the daemon
    // delivered it, so every phase is known to have run under every stream.
    const streamWindows = new Map<string, { firstAt?: number; lastAt?: number }>(
        submission.submissions.map((entry) => [entry.sessionId, {}]),
    );
    // Followed from the start, so a failure anywhere below can still wait for
    // the runs it started rather than leave them streaming into later phases.
    const barriers = Promise.all(
        submission.submissions.map((entry) =>
            sessionRunBarrierWait(
                client,
                entry,
                (streamEvent, observedAt) => {
                    const type = streamEvent.event.type;
                    if (type !== "message.delta" && type !== "message.updated") return;
                    const window = streamWindows.get(entry.sessionId)!;
                    const at = Date.parse(observedAt);
                    window.firstAt ??= at;
                    window.lastAt = at;
                },
                submission.collectors.get(entry.sessionId),
            ),
        ),
    );
    barriers.catch(() => undefined);
    let probing = false;
    let typed = false;
    let capture: ComposerTypingProbeCapture;
    let finalValue: string;
    let correction: Awaited<ReturnType<typeof composerTypingCorrect>>;
    let measuredFrom: number;
    let measuredUntil: number;
    try {
        // Typing starts once the open conversation's own response is arriving.
        await page.waitForFunction(
            (marker) =>
                document
                    .querySelector('[data-happy-desktop-ui="conversation-view"]')
                    ?.textContent?.includes(`script=${String(marker)}`) === true,
            visible.marker,
            { timeout: 30_000 },
        );
        await mark("composer-typing-stream-started");
        measuredFrom = Date.now();
        await composerTypingProbeStart(page);
        probing = true;
        await page.waitForTimeout(COMPOSER_TYPING_STREAM_ONLY_MS);
        await composer.focus();
        await composerTypingProbeTypingStart(page);
        await mark("composer-typing-start");
        typed = true;
        for (const character of COMPOSER_TYPING_TEXT) {
            await page.keyboard.type(character);
            await page.waitForTimeout(COMPOSER_TYPING_KEY_INTERVAL_MS);
        }
        await page.waitForTimeout(500);
        await mark("composer-typing-complete");
        await composerTypingProbeTypingEnd(page);
        await page.waitForTimeout(COMPOSER_TYPING_STREAM_ONLY_MS);
        capture = await composerTypingProbeStop(page);
        probing = false;
        finalValue = await composer.inputValue();
        correction = await composerTypingCorrect(page, composer);
        measuredUntil = Date.now();
    } finally {
        if (probing) await composerTypingProbeStop(page).catch(() => undefined);
        // Leave the conversation as it was found, with keys rather than a fill.
        if (typed)
            await composer
                .focus()
                .then(() => page.keyboard.press("ControlOrMeta+a"))
                .then(() => page.keyboard.press("Backspace"))
                .catch(() => undefined);
        await barriers.catch(() => undefined);
        for (const collector of submission.collectors.values()) collector.handle.close();
    }
    const runs = await barriers;
    await mark("composer-typing-streams-complete");
    const keystrokes = capture.keystrokes;
    const streams = submission.submissions.map((entry) => {
        const window = streamWindows.get(entry.sessionId)!;
        return {
            sessionId: entry.sessionId,
            textFirstAt: window.firstAt,
            textLastAt: window.lastAt,
            spannedMeasurement:
                window.firstAt !== undefined &&
                window.lastAt !== undefined &&
                window.firstAt <= measuredFrom &&
                window.lastAt >= measuredUntil,
        };
    });
    // Event Timing reports only events that took over 16ms to present, so a
    // key it names nothing for was presented within that.
    const presentedMs = keystrokes.map((entry, index) => {
        const until = keystrokes[index + 1]?.keydownAt ?? Number.POSITIVE_INFINITY;
        const ends = capture.eventTimings
            .filter((timing) => timing.startTime >= entry.keydownAt && timing.startTime < until)
            .map((timing) => timing.startTime + timing.duration - entry.keydownAt);
        return ends.length === 0 ? 16 : Math.max(...ends);
    });
    const { streamOnly, typing, streamOnlyAfter } = capture.background;
    const details = {
        typedCharacters: [...COMPOSER_TYPING_TEXT].length,
        keyIntervalMs: COMPOSER_TYPING_KEY_INTERVAL_MS,
        streamsIntended: targets.length,
        streams,
        finalValueMatches: finalValue === COMPOSER_TYPING_TEXT,
        correction,
        untrustedEvents: capture.untrustedEvents,
        keystrokesObserved: keystrokes.length,
        latencyMs: {
            handler: latencyStats(keystrokes.map((entry) => entry.handlerMs)),
            reactRender: latencyStats(keystrokes.map((entry) => entry.reactRenderMs)),
            keydownToInputHandled: latencyStats(
                keystrokes.map((entry) => entry.keydownToInputHandledMs),
            ),
            keydownToNextFrame: latencyStats(
                keystrokes.flatMap((entry) =>
                    entry.keydownToNextFrameMs === undefined ? [] : [entry.keydownToNextFrameMs],
                ),
            ),
            keydownToFrameEnd: latencyStats(
                keystrokes.flatMap((entry) =>
                    entry.keydownToFrameEndMs === undefined ? [] : [entry.keydownToFrameEndMs],
                ),
            ),
            // The browser's own measure: keydown until the frame showing it.
            keydownToPresented: {
                ...latencyStats(presentedMs),
                over50ms: presentedMs.filter((value) => value > 50).length,
            },
        },
        eventTiming: {
            over16ms: capture.eventTimings.length,
            duration: latencyStats(capture.eventTimings.map((entry) => entry.duration)),
            processing: latencyStats(capture.eventTimings.map((entry) => entry.processingMs)),
        },
        reactProfiler: capture.reactHook
            ? {
                  perKeystroke: {
                      commits:
                          Math.round(
                              (keystrokes.reduce((total, entry) => total + entry.commits, 0) /
                                  Math.max(1, keystrokes.length)) *
                                  100,
                          ) / 100,
                      ...renderedReport(
                          renderedSum(keystrokes.map((entry) => entry.rendered)),
                          keystrokes.length,
                      ),
                  },
                  // Frame-coalesced stream work per second: the stream alone on
                  // either side of typing, together and apart, then with typing.
                  streamOnlyPerSecond: backgroundReport({
                      durationMs: streamOnly.durationMs + streamOnlyAfter.durationMs,
                      commits: streamOnly.commits + streamOnlyAfter.commits,
                      renderMs: streamOnly.renderMs + streamOnlyAfter.renderMs,
                      rendered: renderedSum([streamOnly.rendered, streamOnlyAfter.rendered]),
                  }),
                  streamOnlyBeforePerSecond: backgroundReport(streamOnly),
                  streamOnlyAfterPerSecond: backgroundReport(streamOnlyAfter),
                  typingBackgroundPerSecond: backgroundReport(typing),
              }
            : { status: "unavailable", reason: "No React DevTools hook in this build." },
        barriers: runs,
    };
    // Kept on its own as well, so a later phase of the lane failing does not
    // take the typing measurement down with it.
    await writeFile(
        join(paths.artifacts, "composer-typing.json"),
        `${JSON.stringify(details, null, 2)}\n`,
        "utf8",
    );
    if (!details.finalValueMatches)
        throw new Error(
            `The composer lost typed input: expected ${JSON.stringify(COMPOSER_TYPING_TEXT)}, got ${JSON.stringify(finalValue)}.`,
        );
    if (keystrokes.length !== details.typedCharacters || capture.untrustedEvents > 0)
        throw new Error(`Composer typing was not measured key by key: ${JSON.stringify(details)}`);
    if (!correction.valueMatches || !correction.caretKept || !correction.focused)
        throw new Error(
            `A correction in the middle of the draft did not hold: ${JSON.stringify(correction)}`,
        );
    if (
        keystrokes.some(
            (entry) =>
                entry.keydownToNextFrameMs === undefined || entry.keydownToFrameEndMs === undefined,
        )
    )
        throw new Error("A keystroke's frame was never sampled, so its latency is unknown.");
    // Every response was streaming before the first window and still after the
    // last one, so typing and both controls ran under the same load.
    if (
        streams.length !== details.streamsIntended ||
        streams.some((stream) => !stream.spannedMeasurement)
    )
        throw new Error(
            `The streams did not span the measurement: ${JSON.stringify({ measuredFrom, measuredUntil, streams })}`,
        );
    if (!capture.reactHook) return details;
    // A keystroke reaches the composer and nothing drawn around it.
    const keyRendered = renderedSum(keystrokes.map((entry) => entry.rendered));
    const leaked = [
        ...COMPOSER_TYPING_COMPONENTS.transcript,
        ...COMPOSER_TYPING_COMPONENTS.header,
        ...COMPOSER_TYPING_COMPONENTS.surface,
        ...COMPOSER_TYPING_COMPONENTS.palette,
    ].filter((name) => (keyRendered[name] ?? 0) > 0);
    if (leaked.length > 0)
        throw new Error(
            `Keystrokes re-rendered ${leaked.join(", ")}: ${JSON.stringify(details.reactProfiler)}`,
        );
    // Frame-coalesced surface work while typing, against the stream alone on
    // either side of it, is reported in `streamOnlyPerSecond` and
    // `typingBackgroundPerSecond` rather than asserted.
    return details;
}

async function sessionSwitchLoadRun(
    page: Page,
    app: ElectronApplication,
    options: {
        readonly runtime: StartedHappyAgentRuntime;
        readonly sessionIds: readonly string[];
        profilerActive(): boolean;
    },
    material: GymGoldReplayMaterial,
    targets: readonly MixedSessionTarget[],
    mark: (name: string) => Promise<void>,
): Promise<Record<string, unknown>> {
    const before = await performanceCapture(page, app, options.profilerActive());
    const submission = await concurrentSubmissions(
        options.runtime.client,
        material,
        targets,
        "session-switch-load",
    );
    await mark("concurrent-submissions-accepted");
    const barriers = submission.submissions.map((entry) =>
        sessionRunBarrierWait(
            options.runtime.client,
            entry,
            undefined,
            submission.collectors.get(entry.sessionId),
        ),
    );
    const sessionSwitches = await sessionSwitchSequence(
        page,
        targets,
        [0, 1, 2, 0, 3, 1, 2, 0, 2, 3, 1, 0],
        mark,
        "load-session-switch",
    );
    const durableBarriers = await Promise.all(barriers);
    await mark("durable-stream-barriers-complete");
    const after = await performanceCapture(page, app, options.profilerActive());
    return {
        after,
        before,
        durableBarriers,
        goldReplay: goldReplayDetails(material),
        responsiveness: responsivenessDetails(options.profilerActive()),
        sessionSwitches,
        submissions: {
            count: submission.submissions.length,
            concurrent: true,
            durationMs: submission.durationMs,
            runIds: submission.submissions.map((entry) => entry.runId),
        },
    };
}

async function sessionSwitchSequence(
    page: Page,
    targets: readonly MixedSessionTarget[],
    indexes: readonly number[],
    mark: (name: string) => Promise<void>,
    markPrefix: string,
    onInteraction?: (interaction: Record<string, unknown>) => void,
): Promise<readonly Record<string, unknown>[]> {
    const interactions: Array<Record<string, unknown>> = [];
    if (targets.length === 0) return interactions;
    // Mixed replay has already opened every clustered session while taking its
    // UI baseline. The focused session-switch workload may not have, so route
    // only genuinely missing tabs once before the measured click sequence.
    // Re-routing an already materialized tab during active streams creates an
    // unrelated workspace-projection lifetime boundary.
    for (const target of targets) {
        const tab = page.locator(`[data-happy-desktop-ui="tab"][data-tab-id="${target.id}"]`);
        if ((await tab.count()) > 0) continue;
        await navigateRoute(page, target.route);
        await waitForSessionUiReady(page, target.route, target.id);
    }
    for (const [interactionIndex, targetIndex] of indexes.entries()) {
        const target = targets[targetIndex % targets.length]!;
        const started = performance.now();
        const startedAt = new Date().toISOString();
        const tab = page.locator(`[data-happy-desktop-ui="tab"][data-tab-id="${target.id}"]`);
        await tab.waitFor({ state: "visible", timeout: 20_000 });
        if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
        try {
            await page.waitForFunction(
                (expected) =>
                    document
                        .querySelector(`[data-happy-desktop-ui="tab"][data-tab-id="${expected}"]`)
                        ?.getAttribute("aria-selected") === "true" &&
                    document.querySelector('[data-happy-desktop-ui="conversation-view"]') !== null,
                target.id,
                { timeout: 30_000 },
            );
        } catch (error) {
            const state = await page
                .evaluate((expected) => {
                    const tabs = [
                        ...document.querySelectorAll<HTMLElement>(
                            '[data-happy-desktop-ui="tab"][data-tab-id]',
                        ),
                    ].map((tab) => ({
                        id: tab.dataset.tabId,
                        selected: tab.getAttribute("aria-selected"),
                        text: tab.textContent?.trim(),
                    }));
                    return {
                        conversationMounted:
                            document.querySelector(
                                '[data-happy-desktop-ui="conversation-view"]',
                            ) !== null,
                        expected,
                        hash: location.hash,
                        tabs,
                    };
                }, target.id)
                .catch(() => undefined);
            throw new Error(
                `Session tab ${target.id} did not become active at interaction ${String(
                    interactionIndex + 1,
                )}: state=${JSON.stringify(state)}; ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
        const latencyMs = performance.now() - started;
        const finishedAt = new Date().toISOString();
        interactions.push({
            finishedAt,
            interaction: interactionIndex + 1,
            latencyMs,
            route: target.route,
            sessionId: target.id,
            startedAt,
            workspace: target.workspace,
        });
        onInteraction?.(interactions.at(-1)!);
        await mark(`${markPrefix}-${interactionIndex + 1}`);
    }
    return interactions;
}

async function transcriptViewportRead(page: Page): Promise<TranscriptViewportMeasurement> {
    await page.waitForSelector('[data-happy-desktop-ui="message-list"]', {
        state: "attached",
        timeout: 90_000,
    });
    return page.evaluate(() => {
        const list = document.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]',
        );
        const content = document.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="message-list-content"]',
        );
        const virtual = document.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="message-list-virtual"]',
        );
        if (!list || !content) throw new Error("The conversation message list did not mount.");
        return {
            clientHeight: list.clientHeight,
            renderedRows:
                virtual?.querySelectorAll(".happy-message-list__virtual-row[data-index]").length ??
                0,
            scrollHeight: list.scrollHeight,
            scrollTop: list.scrollTop,
            virtualized:
                content.dataset.virtualized !== undefined &&
                virtual !== null &&
                virtual.querySelector(".happy-message-list__virtual-row[data-index]") !== null,
        };
    });
}

async function transcriptScrollSequence(
    page: Page,
    fractions: readonly number[],
    mark: (name: string) => Promise<void>,
    onInteraction?: (
        interaction: ScrollInteractionMeasurement & { readonly index: number },
    ) => void,
): Promise<readonly ScrollInteractionMeasurement[]> {
    const interactions: ScrollInteractionMeasurement[] = [];
    let historyLoadAttempted = false;
    for (const [index, requestedFraction] of fractions.entries()) {
        if (requestedFraction < 1) await transcriptReaderControlTake(page);
        const startedAt = new Date().toISOString();
        const measurement = await page.evaluate(async (fraction) => {
            const list = document.querySelector<HTMLElement>(
                '[data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]',
            );
            const content = document.querySelector<HTMLElement>(
                '[data-happy-desktop-ui="message-list-content"]',
            );
            const virtual = document.querySelector<HTMLElement>(
                '[data-happy-desktop-ui="message-list-virtual"]',
            );
            if (!list || !content) throw new Error("The conversation message list did not mount.");
            const started = performance.now();
            const observedLongTasks: PerformanceEntry[] = [];
            let longTaskObserver: PerformanceObserver | undefined;
            if (
                typeof PerformanceObserver !== "undefined" &&
                PerformanceObserver.supportedEntryTypes.includes("longtask")
            ) {
                longTaskObserver = new PerformanceObserver((entryList) => {
                    observedLongTasks.push(...entryList.getEntries());
                });
                longTaskObserver.observe({ buffered: true, type: "longtask" });
            }
            const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
            const historyScrollHeightBefore = list.scrollHeight;
            list.scrollTop = maxScrollTop * fraction;
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            if (longTaskObserver !== undefined) {
                observedLongTasks.push(...longTaskObserver.takeRecords());
                longTaskObserver.disconnect();
            }
            const finished = performance.now();
            const longTasks = observedLongTasks.filter(
                (entry) =>
                    entry.startTime < finished && entry.startTime + entry.duration >= started,
            );
            return {
                actualFraction: maxScrollTop === 0 ? 0 : list.scrollTop / maxScrollTop,
                clientHeight: list.clientHeight,
                durationMs: finished - started,
                longTaskCount: longTasks.length,
                longTaskDurationMs: longTasks.reduce((total, entry) => total + entry.duration, 0),
                maxScrollTop,
                requestedFraction: fraction,
                renderedRows:
                    virtual?.querySelectorAll(".happy-message-list__virtual-row[data-index]")
                        .length ?? 0,
                scrollHeight: list.scrollHeight,
                scrollTop: list.scrollTop,
                virtualized:
                    content.dataset.virtualized !== undefined &&
                    virtual !== null &&
                    virtual.querySelector(".happy-message-list__virtual-row[data-index]") !== null,
                historyLoaderObserved: false,
                historyScrollHeightBefore,
                historyScrollHeightAfter: list.scrollHeight,
            };
        }, requestedFraction);
        if (Math.abs(measurement.scrollTop - measurement.maxScrollTop * requestedFraction) > 8) {
            throw new Error(
                `The transcript did not reach the requested scroll position: ${JSON.stringify(measurement)}.`,
            );
        }
        if (
            requestedFraction === 0 &&
            !historyLoadAttempted &&
            measurement.historyScrollHeightBefore !== undefined
        ) {
            historyLoadAttempted = true;
            const beforeHeight = measurement.historyScrollHeightBefore;
            await page
                .waitForFunction(
                    (before) => {
                        const list = document.querySelector<HTMLElement>(
                            '[data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]',
                        );
                        const conversation = document.querySelector<HTMLElement>(
                            '[data-happy-desktop-ui="conversation-view"]',
                        );
                        return (
                            list !== null &&
                            (list.scrollHeight > before ||
                                conversation?.textContent?.includes("Loading earlier messages") ===
                                    true)
                        );
                    },
                    beforeHeight,
                    { timeout: 15_000 },
                )
                .catch(() => undefined);
            const history = await page.evaluate((before) => {
                const list = document.querySelector<HTMLElement>(
                    '[data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]',
                );
                const conversation = document.querySelector<HTMLElement>(
                    '[data-happy-desktop-ui="conversation-view"]',
                );
                const text = conversation?.textContent ?? "";
                return {
                    after: list?.scrollHeight ?? before,
                    loader: text.includes("Loading earlier messages"),
                };
            }, beforeHeight);
            measurement.historyLoaderObserved = history.loader || history.after > beforeHeight;
            measurement.historyScrollHeightAfter = history.after;
        }
        const finishedAt = new Date().toISOString();
        const timestampedMeasurement = { ...measurement, finishedAt, startedAt };
        interactions.push(timestampedMeasurement);
        onInteraction?.({ ...timestampedMeasurement, index: index + 1 });
        await mark(`transcript-scroll-${index + 1}`);
    }
    return interactions;
}

async function transcriptReaderControlTake(page: Page): Promise<void> {
    const list = page
        .locator('[data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]')
        .first();
    const box = await list.boundingBox();
    if (!box) throw new Error("The conversation message list has no wheel target.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    /*
     * Programmatic positioning is only fixture setup. Give the reader the
     * viewport first through the same trusted upward intent that parks a
     * real transcript; a synthetic scroll event cannot stand in for that
     * ownership boundary while follow mode is active.
     */
    await page.mouse.wheel(0, -4);
    await page.waitForTimeout(16);
}

async function scrollListToFraction(page: Page, fraction: number): Promise<void> {
    if (fraction < 1) await transcriptReaderControlTake(page);
    await page.evaluate(
        (requestedFraction) =>
            new Promise<void>((resolve, reject) => {
                const started = performance.now();
                let consecutiveFrames = 0;
                const samples: Array<{
                    readonly clientHeight: number;
                    readonly maxScrollTop: number;
                    readonly scrollHeight: number;
                    readonly scrollTop: number;
                    readonly target: number;
                }> = [];
                const browserWindow = window as Window & {
                    __happyDesktopGymSettleScrollFraction?: () => void;
                };
                browserWindow.__happyDesktopGymSettleScrollFraction = () => {
                    const list = document.querySelector<HTMLElement>(
                        '[data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]',
                    );
                    if (!list) {
                        if (performance.now() - started > 10_000) {
                            delete browserWindow.__happyDesktopGymSettleScrollFraction;
                            reject(new Error("The conversation message list did not mount."));
                            return;
                        }
                        requestAnimationFrame(browserWindow.__happyDesktopGymSettleScrollFraction!);
                        return;
                    }
                    const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
                    const target = maxScrollTop * requestedFraction;
                    samples.push({
                        clientHeight: list.clientHeight,
                        maxScrollTop,
                        scrollHeight: list.scrollHeight,
                        scrollTop: list.scrollTop,
                        target,
                    });
                    if (samples.length > 12) samples.shift();
                    if (Math.abs(list.scrollTop - target) <= 8) {
                        consecutiveFrames += 1;
                    } else {
                        /*
                         * This is precondition setup, not measured compensation:
                         * reapply only while late virtual measurements settle,
                         * and stop writing before the interaction begins.
                         */
                        list.scrollTop = target;
                        list.dispatchEvent(new Event("scroll"));
                        consecutiveFrames = 0;
                    }
                    if (consecutiveFrames >= 3) {
                        delete browserWindow.__happyDesktopGymSettleScrollFraction;
                        resolve();
                        return;
                    }
                    if (performance.now() - started > 10_000) {
                        delete browserWindow.__happyDesktopGymSettleScrollFraction;
                        reject(
                            new Error(
                                `The conversation did not settle at scroll fraction ${requestedFraction}: ${JSON.stringify(samples)}.`,
                            ),
                        );
                        return;
                    }
                    requestAnimationFrame(browserWindow.__happyDesktopGymSettleScrollFraction!);
                };
                browserWindow.__happyDesktopGymSettleScrollFraction();
            }),
        fraction,
    );
}

async function scrollStabilityCapture(
    page: Page,
    action: () => Promise<void>,
    trackedText?: string,
): Promise<readonly ScrollStabilityFrame[]> {
    const framesPromise = page.evaluate(
        (tracked) =>
            new Promise<ScrollStabilityFrame[]>((resolve) => {
                const frames: ScrollStabilityFrame[] = [];
                const started = performance.now();
                let trackedPrefixNode: Node | undefined;
                let trackedToolCall: HTMLElement | undefined;
                let trackedToolSeen = false;
                let previousRows = new Map<
                    number,
                    { readonly height: number; readonly top: number }
                >();
                let frameHandle = 0;
                let timerHandle = 0;
                let stopped = false;
                const listAtStart = document.querySelector<HTMLElement>(
                    '[data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]',
                );
                const listRectAtStart = listAtStart?.getBoundingClientRect();
                let textAnchor:
                    | {
                          readonly extent: number;
                          readonly index: number | undefined;
                          readonly node: Node;
                          readonly offset: number;
                      }
                    | undefined;
                if (listAtStart && listRectAtStart) {
                    const x = listRectAtStart.left + listRectAtStart.width / 2;
                    for (const inset of [8, 20, 32, 48, 72, 104]) {
                        const position = document.caretPositionFromPoint?.(
                            x,
                            listRectAtStart.bottom - inset,
                        );
                        if (!position || !listAtStart.contains(position.offsetNode)) continue;
                        const parent =
                            position.offsetNode instanceof Element
                                ? position.offsetNode
                                : position.offsetNode.parentElement;
                        const row = parent?.closest<HTMLElement>(
                            ".happy-message-list__virtual-row[data-index]",
                        );
                        const index = Number.parseInt(row?.dataset.index ?? "", 10);
                        const textLength =
                            position.offsetNode.nodeType === Node.TEXT_NODE
                                ? (position.offsetNode.textContent?.length ?? 0)
                                : 0;
                        textAnchor = {
                            extent: textLength > 0 ? 1 : 0,
                            index: Number.isFinite(index) ? index : undefined,
                            node: position.offsetNode,
                            offset:
                                textLength > 0
                                    ? Math.min(position.offset, textLength - 1)
                                    : position.offset,
                        };
                        break;
                    }
                }
                const browserWindow = window as Window & {
                    __happyDesktopGymScrollStabilityFrameCount?: () => number;
                    __happyDesktopGymSampleScrollStability?: () => void;
                    __happyDesktopGymStopScrollStability?: () => void;
                };
                browserWindow.__happyDesktopGymScrollStabilityFrameCount = () => frames.length;
                browserWindow.__happyDesktopGymSampleScrollStability = () => {
                    /*
                     * rAF itself runs before the frame's ResizeObserver delivery.
                     * Measure from the following task so this records geometry
                     * the browser was able to paint, not an internal pre-layout
                     * state that TanStack corrects before presentation.
                     */
                    timerHandle = window.setTimeout(() => {
                        if (stopped) return;
                        const list = document.querySelector<HTMLElement>(
                            '[data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]',
                        );
                        const virtual = document.querySelector<HTMLElement>(
                            '[data-happy-desktop-ui="message-list-virtual"]',
                        );
                        const panel = document.querySelector<HTMLElement>(
                            '[data-happy-desktop-ui="app-shell-panel"]',
                        );
                        const sidebar = document.querySelector<HTMLElement>(
                            '[data-happy-desktop-ui="app-shell-sidebar"]',
                        );
                        const statusLine = document.querySelector<HTMLElement>(
                            '[data-happy-desktop-ui="conversation-status-line"]',
                        );
                        const statusState = statusLine?.querySelector<HTMLElement>(
                            '[data-happy-desktop-ui="agent-working-status-state"]',
                        );
                        const trackedMessage =
                            tracked === undefined
                                ? undefined
                                : [
                                      ...document.querySelectorAll<HTMLElement>(
                                          '[data-happy-desktop-ui="message"][data-agent]',
                                      ),
                                  ]
                                      .filter((message) => message.textContent?.includes(tracked))
                                      .at(-1);
                        const trackedBody = trackedMessage?.querySelector<HTMLElement>(
                            '[data-happy-desktop-ui="message-body"]',
                        );
                        const trackedRow = trackedMessage?.closest<HTMLElement>(
                            ".happy-message-list__virtual-row[data-index]",
                        );
                        const trackedIndex = Number.parseInt(trackedRow?.dataset.index ?? "", 10);
                        const settledStatus = Number.isFinite(trackedIndex)
                            ? [
                                  ...document.querySelectorAll<HTMLElement>(
                                      '[data-happy-desktop-ui="turn-summary"]',
                                  ),
                              ].find((summary) => {
                                  const row = summary.closest<HTMLElement>(
                                      ".happy-message-list__virtual-row[data-index]",
                                  );
                                  const index = Number.parseInt(row?.dataset.index ?? "", 10);
                                  return Number.isFinite(index) && index > trackedIndex;
                              })
                            : undefined;
                        const trackedTable = trackedBody?.querySelector("table");
                        if (!trackedToolCall?.isConnected) {
                            const activityCalls = [
                                ...document.querySelectorAll<HTMLElement>(
                                    '[data-happy-desktop-ui="agent-activity-call"]',
                                ),
                            ];
                            const runningPatch = activityCalls
                                .filter(
                                    (call) =>
                                        call.dataset.status === "running" &&
                                        call.dataset.presentation === "generic" &&
                                        call.textContent?.includes("Apply patch") === true,
                                )
                                .at(-1);
                            const settledPatch = trackedToolSeen
                                ? activityCalls
                                      .filter(
                                          (call) =>
                                              call.dataset.presentation === "fileDiff" &&
                                              call.textContent?.includes(
                                                  ".happy-gym-tool-settle-",
                                              ) === true,
                                      )
                                      .at(-1)
                                : undefined;
                            trackedToolCall = runningPatch ?? settledPatch;
                            if (trackedToolCall) trackedToolSeen = true;
                        }
                        const trackedToolActivity = trackedToolCall?.closest<HTMLElement>(
                            '[data-happy-desktop-ui="agent-activity-row"]',
                        );
                        const trackedToolVirtualRow = trackedToolCall?.closest<HTMLElement>(
                            ".happy-message-list__virtual-row[data-index]",
                        );
                        const trackedToolHeader = trackedToolCall?.querySelector<HTMLElement>(
                            '[data-happy-desktop-ui="agent-activity-header"]',
                        );
                        const trackedToolFileSummary = trackedToolCall?.querySelector<HTMLElement>(
                            '[data-happy-desktop-ui="agent-activity-file-summary"]',
                        );
                        const trackedToolText = trackedToolCall?.querySelector<HTMLElement>(
                            '[data-happy-desktop-ui="agent-activity-text"]',
                        );
                        const trackedToolStats = trackedToolCall?.querySelector<HTMLElement>(
                            '[data-happy-desktop-ui="agent-activity-stats"]',
                        );
                        if (trackedBody && trackedPrefixNode === undefined) {
                            const walker = document.createTreeWalker(
                                trackedBody,
                                NodeFilter.SHOW_TEXT,
                            );
                            for (
                                let node = walker.nextNode();
                                node !== null;
                                node = walker.nextNode()
                            ) {
                                if (!node.textContent?.includes("Streaming fixture anchor"))
                                    continue;
                                trackedPrefixNode = node;
                                break;
                            }
                        }
                        if (list) {
                            const listRect = list.getBoundingClientRect();
                            const statusRect = statusLine?.getBoundingClientRect();
                            const statusStyle =
                                statusRect && statusRect.height > 0 && statusState
                                    ? getComputedStyle(statusState)
                                    : undefined;
                            const settledStatusRect = settledStatus?.getBoundingClientRect();
                            const settledStatusStyle =
                                settledStatus && settledStatusRect && settledStatusRect.height > 0
                                    ? getComputedStyle(settledStatus)
                                    : undefined;
                            const rows = virtual
                                ? [
                                      ...virtual.querySelectorAll<HTMLElement>(
                                          ".happy-message-list__virtual-row[data-index]",
                                      ),
                                  ]
                                      .map((row) => {
                                          const rect = row.getBoundingClientRect();
                                          return {
                                              bottom: rect.bottom,
                                              height: rect.height,
                                              index: Number.parseInt(row.dataset.index ?? "", 10),
                                              top: rect.top,
                                          };
                                      })
                                      .filter(
                                          (row) =>
                                              Number.isFinite(row.index) &&
                                              row.bottom > listRect.top &&
                                              row.top < listRect.bottom,
                                      )
                                      .sort((left, right) => left.top - right.top)
                                : [];
                            const stableRows = rows.filter((row) => {
                                const previous = previousRows.get(row.index);
                                return previous && Math.abs(previous.height - row.height) <= 1;
                            });
                            const changedRowIndices = rows
                                .filter((row) => {
                                    const previous = previousRows.get(row.index);
                                    return (
                                        previous !== undefined &&
                                        Math.abs(previous.height - row.height) > 1
                                    );
                                })
                                .map((row) => row.index);
                            let stableRowPairCount = 0;
                            let stableRowSpacingDeltaMax = 0;
                            for (let left = 0; left < stableRows.length; left += 1) {
                                for (let right = left + 1; right < stableRows.length; right += 1) {
                                    const leftRow = stableRows[left]!;
                                    const rightRow = stableRows[right]!;
                                    if (
                                        changedRowIndices.some(
                                            (index) =>
                                                index > leftRow.index && index < rightRow.index,
                                        )
                                    )
                                        continue;
                                    const previousLeft = previousRows.get(leftRow.index)!;
                                    const previousRight = previousRows.get(rightRow.index)!;
                                    const previousSpacing = previousRight.top - previousLeft.top;
                                    const spacing = rightRow.top - leftRow.top;
                                    stableRowSpacingDeltaMax = Math.max(
                                        stableRowSpacingDeltaMax,
                                        Math.abs(spacing - previousSpacing),
                                    );
                                    stableRowPairCount += 1;
                                }
                            }
                            previousRows = new Map(
                                rows.map((row) => [
                                    row.index,
                                    { height: row.height, top: row.top },
                                ]),
                            );
                            let rowOverlapCount = 0;
                            for (let index = 1; index < rows.length; index += 1) {
                                if (rows[index - 1]!.bottom > rows[index]!.top + 1)
                                    rowOverlapCount += 1;
                            }
                            const first = rows[0];
                            const edge = rows.at(-1);
                            /* Match MessageList's model-space point exactly. The
                               model uses clientHeight, which excludes a painted
                               horizontal-scrollbar gutter from the viewport. */
                            const modelPoint =
                                listRect.top + list.clientHeight - Math.min(32, list.clientHeight);
                            const modelAnchorRow = rows.find(
                                (row) => row.top <= modelPoint + 1 && row.bottom >= modelPoint - 1,
                            );
                            let anchorIndex = edge?.index;
                            let anchorOffset =
                                edge === undefined ? undefined : listRect.bottom - edge.bottom;
                            let anchorSource: ScrollStabilityFrame["anchorSource"] = "row";
                            if (textAnchor?.node.isConnected) {
                                const maximumOffset =
                                    textAnchor.node.nodeType === Node.TEXT_NODE
                                        ? (textAnchor.node.textContent?.length ?? 0)
                                        : textAnchor.node.childNodes.length;
                                const range = document.createRange();
                                const offset = Math.min(
                                    textAnchor.offset,
                                    Math.max(0, maximumOffset - textAnchor.extent),
                                );
                                range.setStart(textAnchor.node, offset);
                                if (textAnchor.extent > 0)
                                    range.setEnd(textAnchor.node, offset + textAnchor.extent);
                                else range.collapse(true);
                                const rect =
                                    range.getClientRects()[0] ?? range.getBoundingClientRect();
                                if (rect.height > 0 || rect.width > 0) {
                                    anchorIndex = textAnchor.index;
                                    anchorOffset = listRect.bottom - rect.top;
                                    anchorSource = "text";
                                }
                            }
                            frames.push({
                                anchorIndex,
                                anchorOffset,
                                anchorSource,
                                bottomDistance: Math.max(
                                    0,
                                    list.scrollHeight - list.scrollTop - list.clientHeight,
                                ),
                                clientHeight: list.clientHeight,
                                clientWidth: list.clientWidth,
                                elapsedMs: performance.now() - started,
                                firstRowBottom: first?.bottom,
                                firstRowTop: first?.top,
                                listIdentityPreserved: list === listAtStart,
                                modelAnchorIndex: modelAnchorRow?.index,
                                modelAnchorOffset:
                                    modelAnchorRow === undefined
                                        ? undefined
                                        : modelPoint - modelAnchorRow.top,
                                panelWidth: panel?.getBoundingClientRect().width ?? 0,
                                rowOverlapCount,
                                scrollHeight: list.scrollHeight,
                                scrollTop: list.scrollTop,
                                settledStatusColor: settledStatusStyle?.color,
                                settledStatusFontSize: settledStatusStyle?.fontSize,
                                settledStatusGap:
                                    settledStatusRect && settledStatusRect.height > 0
                                        ? listRect.bottom - settledStatusRect.bottom
                                        : undefined,
                                settledStatusHeight:
                                    settledStatusRect && settledStatusRect.height > 0
                                        ? settledStatusRect.height
                                        : undefined,
                                settledStatusLineHeight: settledStatusStyle?.lineHeight,
                                sidebarWidth: sidebar?.getBoundingClientRect().width ?? 0,
                                statusColor: statusStyle?.color,
                                statusFontSize: statusStyle?.fontSize,
                                statusGap:
                                    statusRect && statusRect.height > 0
                                        ? listRect.bottom - statusRect.bottom
                                        : undefined,
                                statusHeight:
                                    statusRect && statusRect.height > 0
                                        ? statusRect.height
                                        : undefined,
                                statusLineHeight: statusStyle?.lineHeight,
                                stableRowPairCount,
                                stableRowSpacingDeltaMax,
                                trackedBodyHeight: trackedBody?.getBoundingClientRect().height,
                                trackedProgressiveTableParagraph: trackedBody
                                    ? [...trackedBody.querySelectorAll("p")].some((paragraph) =>
                                          paragraph.textContent?.includes("| Surface |"),
                                      )
                                    : undefined,
                                trackedPrefixPreserved:
                                    trackedPrefixNode === undefined
                                        ? undefined
                                        : trackedPrefixNode.isConnected &&
                                          trackedBody?.contains(trackedPrefixNode) === true,
                                trackedRowHeight: trackedRow?.getBoundingClientRect().height,
                                trackedTableColumns:
                                    trackedTable === null || trackedTable === undefined
                                        ? undefined
                                        : [
                                              ...trackedTable.querySelectorAll<HTMLElement>(
                                                  "thead th",
                                              ),
                                          ].map((cell) => cell.getBoundingClientRect().width),
                                trackedTableRows: trackedTable?.querySelectorAll("tbody tr").length,
                                trackedTextLength: trackedBody?.textContent?.length,
                                trackedToolActivityHeight:
                                    trackedToolActivity?.getBoundingClientRect().height,
                                trackedToolFileSummaryHeight:
                                    trackedToolFileSummary?.getBoundingClientRect().height,
                                trackedToolHeaderHeight:
                                    trackedToolHeader?.getBoundingClientRect().height,
                                trackedToolPresentation: trackedToolCall?.dataset.presentation,
                                trackedToolStatsHeight:
                                    trackedToolStats?.getBoundingClientRect().height,
                                trackedToolStatus: trackedToolCall?.dataset.status,
                                trackedToolTextHeight:
                                    trackedToolText?.getBoundingClientRect().height,
                                trackedToolVirtualRowHeight:
                                    trackedToolVirtualRow?.getBoundingClientRect().height,
                                trackedVirtualHeight: virtual?.getBoundingClientRect().height,
                                windowWidth: window.innerWidth,
                            });
                        }
                        if (!stopped)
                            frameHandle = requestAnimationFrame(
                                browserWindow.__happyDesktopGymSampleScrollStability!,
                            );
                    }, 0);
                };
                browserWindow.__happyDesktopGymStopScrollStability = () => {
                    if (stopped) return;
                    stopped = true;
                    cancelAnimationFrame(frameHandle);
                    clearTimeout(timerHandle);
                    delete browserWindow.__happyDesktopGymScrollStabilityFrameCount;
                    delete browserWindow.__happyDesktopGymSampleScrollStability;
                    delete browserWindow.__happyDesktopGymStopScrollStability;
                    resolve(frames);
                };
                frameHandle = requestAnimationFrame(
                    browserWindow.__happyDesktopGymSampleScrollStability,
                );
            }),
        trackedText,
    );
    try {
        await page.waitForFunction(
            () => {
                const browserWindow = window as Window & {
                    __happyDesktopGymScrollStabilityFrameCount?: () => number;
                };
                return (browserWindow.__happyDesktopGymScrollStabilityFrameCount?.() ?? 0) > 0;
            },
            undefined,
            { timeout: 5_000 },
        );
        await action();
        await page.waitForTimeout(300);
    } finally {
        await page.evaluate(() => {
            const browserWindow = window as Window & {
                __happyDesktopGymStopScrollStability?: () => void;
            };
            browserWindow.__happyDesktopGymStopScrollStability?.();
        });
    }
    return framesPromise;
}

function scrollStabilityPhaseBuild(
    action: ScrollStabilityPhase["action"],
    anchorMode: ScrollStabilityPhase["anchorMode"],
    frames: readonly ScrollStabilityFrame[],
): ScrollStabilityPhase {
    const first = frames[0];
    const widthReflowAction =
        action === "panel-resize" ||
        action === "panel-toggle" ||
        action === "sidebar-resize" ||
        action === "sidebar-toggle" ||
        action === "window-resize";
    const anchorContract =
        anchorMode === "following" ? "bottom" : widthReflowAction ? "model" : "text";
    const maxBottomDistance = frames.reduce(
        (maximum, frame) => Math.max(maximum, frame.bottomDistance),
        0,
    );
    const maxRowOverlapCount = frames.reduce(
        (maximum, frame) => Math.max(maximum, frame.rowOverlapCount),
        0,
    );
    let anchorBreakCount = 0;
    let nonMonotonicAnchorCorrections = 0;
    if (anchorMode === "following") {
        let anchorWasBroken = false;
        for (const frame of frames) {
            if (frame.bottomDistance > 8) {
                anchorBreakCount += 1;
                anchorWasBroken = true;
            } else if (anchorWasBroken) {
                nonMonotonicAnchorCorrections += 1;
                anchorWasBroken = false;
            }
        }
    }
    const textAnchorStable =
        anchorContract !== "text" ||
        (first?.anchorIndex !== undefined &&
            frames.every(
                (frame) =>
                    frame.anchorIndex === first.anchorIndex &&
                    frame.anchorOffset !== undefined &&
                    first.anchorOffset !== undefined &&
                    Math.abs(frame.anchorOffset - first.anchorOffset) <= 2,
            ));
    const modelAnchorStable =
        anchorContract !== "model" ||
        (first?.modelAnchorIndex !== undefined &&
            frames.every(
                (frame) =>
                    frame.modelAnchorIndex === first.modelAnchorIndex &&
                    frame.modelAnchorOffset !== undefined &&
                    first.modelAnchorOffset !== undefined &&
                    Math.abs(frame.modelAnchorOffset - first.modelAnchorOffset) <= 2,
            ));
    const listWidths = frames.map((frame) => frame.clientWidth);
    const listHeights = frames.map((frame) => frame.clientHeight);
    const panelWidths = frames.flatMap((frame) =>
        frame.panelWidth === undefined ? [] : [frame.panelWidth],
    );
    const sidebarWidths = frames.flatMap((frame) =>
        frame.sidebarWidth === undefined ? [] : [frame.sidebarWidth],
    );
    const windowWidths = frames.map((frame) => frame.windowWidth);
    const scrollHeights = frames.map((frame) => frame.scrollHeight);
    const layoutChangeObserved =
        action === "panel-resize" || action === "panel-toggle"
            ? Math.max(...listWidths) - Math.min(...listWidths) >= 24 &&
              panelWidths.length > 0 &&
              Math.max(...panelWidths) - Math.min(...panelWidths) >= 24
            : action === "sidebar-resize" || action === "sidebar-toggle"
              ? Math.max(...listWidths) - Math.min(...listWidths) >= 24 &&
                sidebarWidths.length > 0 &&
                Math.max(...sidebarWidths) - Math.min(...sidebarWidths) >= 24
              : action === "window-resize"
                ? Math.max(...listWidths) - Math.min(...listWidths) >= 24 &&
                  Math.max(...windowWidths) - Math.min(...windowWidths) >= 24
                : action === "stream-send"
                  ? Math.max(...scrollHeights) - Math.min(...scrollHeights) >= 24
                  : Math.max(...listHeights) - Math.min(...listHeights) >= 16;
    const parkedReaderObserved = anchorMode !== "parked" || (first?.bottomDistance ?? 0) > 8;
    const textAnchorObserved =
        anchorContract !== "text" || frames.every((frame) => frame.anchorSource === "text");
    const modelAnchorObserved =
        anchorContract !== "model" ||
        frames.every(
            (frame) =>
                frame.modelAnchorIndex !== undefined && frame.modelAnchorOffset !== undefined,
        );
    const stable =
        frames.length >= 2 &&
        layoutChangeObserved &&
        parkedReaderObserved &&
        textAnchorObserved &&
        modelAnchorObserved &&
        maxRowOverlapCount === 0 &&
        (anchorMode === "following"
            ? maxBottomDistance <= 8 && nonMonotonicAnchorCorrections === 0
            : textAnchorStable && modelAnchorStable);
    return {
        action,
        anchorContract,
        anchorIndex: anchorContract === "model" ? first?.modelAnchorIndex : first?.anchorIndex,
        anchorMode,
        anchorOffset: anchorContract === "model" ? first?.modelAnchorOffset : first?.anchorOffset,
        anchorBreakCount,
        frames,
        layoutChangeObserved,
        maxBottomDistance,
        maxRowOverlapCount,
        modelAnchorObserved,
        nonMonotonicAnchorCorrections,
        stable,
        textAnchorObserved,
    };
}

async function scrollStabilityRun(
    page: Page,
    mark: (name: string) => Promise<void>,
): Promise<ScrollStabilityMeasurement> {
    await page.waitForSelector('[data-happy-desktop-ui="message-list"]', {
        state: "visible",
        timeout: 30_000,
    });
    await page.waitForSelector('[data-happy-desktop-ui="message-list-virtual"]', {
        state: "attached",
        timeout: 30_000,
    });
    const showPanel = page.locator('button[aria-label="Show panel"]').first();
    if (await showPanel.isVisible().catch(() => false)) await showPanel.click();
    const handle = page.locator(
        '[data-happy-desktop-ui="app-shell-resize-handle"][data-edge="left"]',
    );
    await handle.waitFor({ state: "visible", timeout: 30_000 });
    const splitterDragCapture = async (
        splitter: Locator,
        deltas: readonly number[],
    ): Promise<readonly ScrollStabilityFrame[]> => {
        const handleBox = await splitter.boundingBox();
        if (handleBox === null) throw new Error("The splitter resize handle has no layout box.");
        const handleX = handleBox.x + handleBox.width / 2;
        const handleY = handleBox.y + handleBox.height / 2;
        return scrollStabilityCapture(page, async () => {
            await page.mouse.move(handleX, handleY);
            await page.mouse.down();
            try {
                for (const delta of deltas) {
                    await page.mouse.move(handleX + delta, handleY);
                    await page.waitForTimeout(16);
                }
            } finally {
                await page.mouse.up();
            }
        });
    };
    const panelResizeDeltas = async (): Promise<readonly number[]> => {
        const panelWidth = await page
            .locator('[data-happy-desktop-ui="app-shell-panel"]')
            .evaluate((panel) => panel.getBoundingClientRect().width);
        /* The panel width is durable UI state. Expand a narrow panel and shrink
           a wide one so a reused Gym root always has room for the measured
           round trip, then return the splitter to its exact starting point. */
        const direction = panelWidth <= 400 ? -1 : 1;
        return [24, 48, 72, 96, 72, 48, 24, 0].map((delta) => delta * direction);
    };
    await scrollListToFraction(page, 1);
    const panelResize = scrollStabilityPhaseBuild(
        "panel-resize",
        "following",
        await splitterDragCapture(handle, await panelResizeDeltas()),
    );
    await mark("scroll-stability-panel-resize");

    const composer = page.locator('[data-happy-desktop-ui="composer-textarea"]').first();
    await composer.waitFor({ state: "visible", timeout: 30_000 });
    const originalComposerValue = await composer.inputValue();
    const multilineComposerValue = [
        "Gym scroll stability line one",
        "Gym scroll stability line two",
        "Gym scroll stability line three",
        "Gym scroll stability line four",
    ].join("\n");
    await scrollListToFraction(page, 1);
    const composerGrowth = scrollStabilityPhaseBuild(
        "composer-grow",
        "following",
        await scrollStabilityCapture(page, async () => {
            await composer.fill(multilineComposerValue);
        }),
    );
    await mark("scroll-stability-composer-grow");
    const composerShrink = scrollStabilityPhaseBuild(
        "composer-shrink",
        "following",
        await scrollStabilityCapture(page, async () => {
            await composer.fill(originalComposerValue);
        }),
    );
    await mark("scroll-stability-composer-shrink");

    await scrollListToFraction(page, 0.5);
    const panelParkedResize = scrollStabilityPhaseBuild(
        "panel-resize",
        "parked",
        await splitterDragCapture(handle, await panelResizeDeltas()),
    );
    await mark("scroll-stability-parked-panel-resize");
    const sidebarHandle = page
        .locator('[data-happy-desktop-ui="app-shell-resize-handle"][data-edge="right"]')
        .first();
    await sidebarHandle.waitFor({ state: "visible", timeout: 30_000 });
    const sidebarParkedResize = scrollStabilityPhaseBuild(
        "sidebar-resize",
        "parked",
        await splitterDragCapture(sidebarHandle, [24, 48, 72, 96, 72, 48, 24, 0]),
    );
    await mark("scroll-stability-parked-sidebar-resize");
    const sidebarCollapse = page
        .locator('[data-happy-desktop-ui="app-shell-sidebar-collapse"]')
        .first();
    await sidebarCollapse.waitFor({ state: "visible", timeout: 30_000 });
    const sidebarParkedToggle = scrollStabilityPhaseBuild(
        "sidebar-toggle",
        "parked",
        await scrollStabilityCapture(page, async () => {
            await sidebarCollapse.click();
            const sidebarReveal = page
                .locator('[data-happy-desktop-ui="app-shell-reveal-button"]')
                .first();
            await sidebarReveal.waitFor({ state: "visible", timeout: 5_000 });
            await page.waitForTimeout(80);
            await sidebarReveal.click();
            await sidebarCollapse.waitFor({ state: "visible", timeout: 5_000 });
        }),
    );
    await mark("scroll-stability-parked-sidebar-toggle");
    const hidePanel = page.locator('button[aria-label="Hide panel"]').first();
    await hidePanel.waitFor({ state: "visible", timeout: 30_000 });
    const panelParkedToggle = scrollStabilityPhaseBuild(
        "panel-toggle",
        "parked",
        await scrollStabilityCapture(page, async () => {
            await hidePanel.click();
            const panelReveal = page.locator('button[aria-label="Show panel"]').first();
            await panelReveal.waitFor({ state: "visible", timeout: 5_000 });
            await page.waitForTimeout(80);
            await panelReveal.click();
            await hidePanel.waitFor({ state: "visible", timeout: 5_000 });
        }),
    );
    await mark("scroll-stability-parked-panel-toggle");
    const originalWindowSize = await page.evaluate(() => ({
        height: window.outerHeight,
        width: window.outerWidth,
    }));
    const windowParkedResize = scrollStabilityPhaseBuild(
        "window-resize",
        "parked",
        await scrollStabilityCapture(page, async () => {
            for (const delta of [20, 40, 60, 80, 100, 120, 100, 80, 60, 40, 20, 0]) {
                await page.evaluate(
                    ({ delta, height, width }) => window.resizeTo(width - delta, height),
                    { ...originalWindowSize, delta },
                );
                await page.waitForTimeout(16);
            }
            await page.waitForTimeout(550);
        }),
    );
    await mark("scroll-stability-parked-window-resize");
    const composerParkedGrowth = scrollStabilityPhaseBuild(
        "composer-grow",
        "parked",
        await scrollStabilityCapture(page, async () => {
            await composer.fill(multilineComposerValue);
        }),
    );
    await mark("scroll-stability-parked-grow");
    const composerParkedShrink = scrollStabilityPhaseBuild(
        "composer-shrink",
        "parked",
        await scrollStabilityCapture(page, async () => {
            await composer.fill(originalComposerValue);
        }),
    );
    await mark("scroll-stability-parked-shrink");
    await scrollListToFraction(page, 1);
    const phases = [
        panelResize,
        panelParkedResize,
        panelParkedToggle,
        sidebarParkedResize,
        sidebarParkedToggle,
        windowParkedResize,
        composerGrowth,
        composerShrink,
        composerParkedGrowth,
        composerParkedShrink,
    ];
    const measurement = {
        composerGrowth,
        composerParkedGrowth,
        composerParkedShrink,
        composerShrink,
        panelParkedResize,
        panelParkedToggle,
        panelResize,
        sidebarParkedResize,
        sidebarParkedToggle,
        stable: phases.every((phase) => phase.stable),
        windowParkedResize,
    };
    if (!measurement.stable) {
        throw new Error(
            `Transcript scroll stability failed: ${JSON.stringify(
                phases.map((phase) => ({
                    action: phase.action,
                    anchorContract: phase.anchorContract,
                    anchorMode: phase.anchorMode,
                    anchorBreakCount: phase.anchorBreakCount,
                    layoutChangeObserved: phase.layoutChangeObserved,
                    ...(phase.stable ? {} : { frames: phase.frames }),
                    maxBottomDistance: phase.maxBottomDistance,
                    maxRowOverlapCount: phase.maxRowOverlapCount,
                    modelAnchorObserved: phase.modelAnchorObserved,
                    nonMonotonicAnchorCorrections: phase.nonMonotonicAnchorCorrections,
                    stable: phase.stable,
                    textAnchorObserved: phase.textAnchorObserved,
                })),
            )}`,
        );
    }
    return measurement;
}

interface WindowEdgeResizeFrame {
    readonly chatWidth: number;
    readonly elapsedMs: number;
    readonly innerWidth: number;
    readonly panelLeft: number;
    readonly panelRight: number;
    readonly panelWidth: number;
    readonly renderedRows: number;
    readonly screenX: number;
    readonly sidebarWidth: number;
}

interface WindowEdgeResizeLongTask {
    readonly durationMs: number;
    readonly elapsedMs: number;
}

interface WindowEdgeResizeCapture {
    readonly frames: readonly WindowEdgeResizeFrame[];
    readonly longTasks: readonly WindowEdgeResizeLongTask[];
}

interface WindowEdgeResizeStep {
    readonly at: number;
    readonly width: number;
    readonly x: number;
}

const WINDOW_EDGE_RESIZE_DISTANCE = 380;
const WINDOW_EDGE_RESIZE_INTERVAL_MS = 5;
const WINDOW_EDGE_RESIZE_MIN_WIDTH = 720;
const WINDOW_EDGE_RESIZE_STEP = 2;
const WINDOW_EDGE_RESIZE_TRANSCRIPT_MARKER = "[gym-long-chat-session]";

/**
 * One monotone V-sweep changes direction exactly once, at the turnaround.
 * Further changes expose backtracking; one large delivered step exposes frames
 * the renderer could not present between two sampled widths.
 */
function sweepStats(values: readonly number[]): {
    readonly directionChanges: number;
    readonly largestStep: number;
} {
    let direction = 0;
    let directionChanges = 0;
    let largestStep = 0;
    let previous = values[0] ?? 0;
    for (const value of values.slice(1)) {
        const delta = value - previous;
        previous = value;
        if (Math.abs(delta) <= 1) continue;
        largestStep = Math.max(largestStep, Math.abs(delta));
        const next = Math.sign(delta);
        if (direction !== 0 && next !== direction) directionChanges += 1;
        direction = next;
    }
    return { directionChanges, largestStep };
}

function windowEdgeResizePhaseSummarize(
    capture: WindowEdgeResizeCapture,
    steps: readonly WindowEdgeResizeStep[],
): Record<string, unknown> {
    const frames = capture.frames;
    const innerWidths = frames.map((frame) => frame.innerWidth);
    const panelWidths = frames.map((frame) => frame.panelWidth);
    const panelRights = frames.map((frame) => frame.panelRight);
    const renderedRows = frames.map((frame) => frame.renderedRows);
    const rightGaps = frames.map((frame) => frame.innerWidth - frame.panelRight);
    const initialWidth = frames[0]?.innerWidth;
    const firstActive = frames.findIndex((frame) => frame.innerWidth !== initialWidth);
    let lastActive = -1;
    for (let index = frames.length - 1; index >= 0; index -= 1) {
        if (frames[index]?.innerWidth === initialWidth) continue;
        lastActive = index;
        break;
    }
    const activeFrames =
        firstActive >= 0 && lastActive >= firstActive
            ? frames.slice(firstActive, lastActive + 1)
            : frames;
    const gapsOf = (captured: readonly WindowEdgeResizeFrame[]) =>
        captured.slice(1).map((frame, index) => frame.elapsedMs - captured[index]!.elapsedMs);
    const gaps = gapsOf(activeFrames).sort((left, right) => left - right);
    const idleGaps = [
        ...gapsOf(firstActive > 0 ? frames.slice(0, firstActive) : []),
        ...gapsOf(lastActive >= 0 ? frames.slice(lastActive + 1) : []),
    ].sort((left, right) => left - right);
    const frameIntervalMs = idleGaps[Math.floor(idleGaps.length * 0.5)] ?? 0;
    const droppedFrameEstimate =
        frameIntervalMs > 0
            ? gaps.reduce(
                  (total, gap) => total + Math.max(0, Math.round(gap / frameIntervalMs) - 1),
                  0,
              )
            : 0;
    const longFrameCount =
        frameIntervalMs > 0 ? gaps.filter((gap) => gap > frameIntervalMs * 1.5).length : 0;
    const resizeStarted = activeFrames[0]?.elapsedMs ?? 0;
    const resizeFinished = activeFrames.at(-1)?.elapsedMs ?? resizeStarted;
    const activeLongTasks = capture.longTasks.filter(
        (task) =>
            task.elapsedMs < resizeFinished && task.elapsedMs + task.durationMs >= resizeStarted,
    );
    const stepDurationMs = Math.max(0, (steps.at(-1)?.at ?? 0) - (steps[0]?.at ?? 0));
    return {
        distinctInnerWidths: new Set(innerWidths).size,
        estimatedDroppedFrames: droppedFrameEstimate,
        frameCount: frames.length,
        framesDuringResize: activeFrames.length,
        idleFrameCadenceMs: frameIntervalMs,
        stepCount: steps.length,
        stepDurationMs,
        stepsPerSecond: stepDurationMs > 0 ? (steps.length * 1_000) / stepDurationMs : 0,
        frameGapMaxMs: gaps.at(-1) ?? 0,
        frameGapP95Ms: gaps[Math.floor(gaps.length * 0.95)] ?? 0,
        innerWidth: sweepStats(innerWidths),
        innerWidthMin: Math.min(...innerWidths),
        innerWidthMax: Math.max(...innerWidths),
        longFrameCount,
        longTaskCount: activeLongTasks.length,
        longTaskDurationMs: activeLongTasks.reduce((total, task) => total + task.durationMs, 0),
        panelWidth: sweepStats(panelWidths),
        panelWidthMin: Math.min(...panelWidths),
        panelWidthMax: Math.max(...panelWidths),
        renderedRowsMin: Math.min(...renderedRows),
        panelRight: sweepStats(panelRights),
        rightGapMin: Math.min(...rightGaps),
        rightGapMax: Math.max(...rightGaps),
    };
}

/** Per-frame geometry sampler for the resize probes. Stop with samplerStop. */
function samplerStart(page: Page): Promise<void> {
    return page.evaluate(() => {
        const frames: WindowEdgeResizeFrame[] = [];
        const longTasks: WindowEdgeResizeLongTask[] = [];
        const started = performance.now();
        const browserWindow = window as Window & {
            __happyDesktopGymEdgeResizeFrames?: WindowEdgeResizeFrame[];
            __happyDesktopGymEdgeResizeHandle?: number;
            __happyDesktopGymEdgeResizeLongTaskObserver?: PerformanceObserver;
            __happyDesktopGymEdgeResizeLongTasks?: WindowEdgeResizeLongTask[];
            __happyDesktopGymEdgeResizeStarted?: number;
            __happyDesktopGymSampleEdgeResize?: () => void;
        };
        browserWindow.__happyDesktopGymEdgeResizeFrames = frames;
        browserWindow.__happyDesktopGymEdgeResizeLongTasks = longTasks;
        browserWindow.__happyDesktopGymEdgeResizeStarted = started;
        if (
            typeof PerformanceObserver !== "undefined" &&
            PerformanceObserver.supportedEntryTypes.includes("longtask")
        ) {
            const observer = new PerformanceObserver((entries) => {
                for (const entry of entries.getEntries()) {
                    longTasks.push({
                        durationMs: entry.duration,
                        elapsedMs: entry.startTime - started,
                    });
                }
            });
            observer.observe({ type: "longtask" });
            browserWindow.__happyDesktopGymEdgeResizeLongTaskObserver = observer;
        }
        browserWindow.__happyDesktopGymSampleEdgeResize = () => {
            const panel = document
                .querySelector('[data-happy-desktop-ui="app-shell-panel"]')
                ?.getBoundingClientRect();
            const mains = document.querySelectorAll('[data-happy-desktop-ui="app-shell-main"]');
            const chat = mains[mains.length - 1]?.getBoundingClientRect();
            const sidebar = document
                .querySelector('[data-happy-desktop-ui="app-shell-sidebar"]')
                ?.getBoundingClientRect();
            const renderedRows = document.querySelectorAll(
                ".happy-message-list__virtual-row[data-index]",
            ).length;
            frames.push({
                chatWidth: chat?.width ?? 0,
                elapsedMs: performance.now() - started,
                innerWidth: window.innerWidth,
                panelLeft: panel?.left ?? 0,
                panelRight: panel?.right ?? 0,
                panelWidth: panel?.width ?? 0,
                renderedRows,
                screenX: window.screenX,
                sidebarWidth: sidebar?.width ?? 0,
            });
            browserWindow.__happyDesktopGymEdgeResizeHandle = requestAnimationFrame(
                browserWindow.__happyDesktopGymSampleEdgeResize!,
            );
        };
        browserWindow.__happyDesktopGymEdgeResizeHandle = requestAnimationFrame(
            browserWindow.__happyDesktopGymSampleEdgeResize,
        );
    });
}

function samplerStop(page: Page): Promise<WindowEdgeResizeCapture> {
    return page.evaluate(() => {
        const browserWindow = window as Window & {
            __happyDesktopGymEdgeResizeFrames?: WindowEdgeResizeFrame[];
            __happyDesktopGymEdgeResizeHandle?: number;
            __happyDesktopGymEdgeResizeLongTaskObserver?: PerformanceObserver;
            __happyDesktopGymEdgeResizeLongTasks?: WindowEdgeResizeLongTask[];
            __happyDesktopGymEdgeResizeStarted?: number;
            __happyDesktopGymSampleEdgeResize?: () => void;
        };
        if (browserWindow.__happyDesktopGymEdgeResizeHandle !== undefined)
            cancelAnimationFrame(browserWindow.__happyDesktopGymEdgeResizeHandle);
        const observer = browserWindow.__happyDesktopGymEdgeResizeLongTaskObserver;
        if (observer !== undefined) {
            const started = browserWindow.__happyDesktopGymEdgeResizeStarted ?? performance.now();
            for (const entry of observer.takeRecords()) {
                browserWindow.__happyDesktopGymEdgeResizeLongTasks?.push({
                    durationMs: entry.duration,
                    elapsedMs: entry.startTime - started,
                });
            }
            observer.disconnect();
        }
        const capture = {
            frames: browserWindow.__happyDesktopGymEdgeResizeFrames ?? [],
            longTasks: browserWindow.__happyDesktopGymEdgeResizeLongTasks ?? [],
        };
        delete browserWindow.__happyDesktopGymEdgeResizeFrames;
        delete browserWindow.__happyDesktopGymEdgeResizeHandle;
        delete browserWindow.__happyDesktopGymEdgeResizeLongTaskObserver;
        delete browserWindow.__happyDesktopGymEdgeResizeLongTasks;
        delete browserWindow.__happyDesktopGymEdgeResizeStarted;
        delete browserWindow.__happyDesktopGymSampleEdgeResize;
        return capture;
    });
}

/**
 * Models each edge's bounds while the right panel is open. `left-fixed` keeps
 * the origin fixed like a right-edge drag; `right-fixed` moves it like a
 * left-edge drag. This intentionally does not enter AppKit's native live-resize
 * loop: it isolates renderer layout from presentation-time compositor lag.
 */
async function windowEdgeResizeRun(
    page: Page,
    app: ElectronApplication,
    paths: GymRunPaths,
    sessionId: string,
    mark: (name: string) => Promise<void>,
): Promise<Record<string, unknown>> {
    await waitForReplayMarker(page, WINDOW_EDGE_RESIZE_TRANSCRIPT_MARKER);
    const transcriptBefore = await windowEdgeResizeTranscriptRead(page);
    await mark("hydrated-transcript-ready");
    const showPanel = page.locator('button[aria-label="Show panel"]').first();
    if (await showPanel.isVisible().catch(() => false)) await showPanel.click();
    await page.waitForSelector('[data-happy-desktop-ui="app-shell-panel"]', {
        state: "visible",
        timeout: 30_000,
    });
    const geometry = await app.evaluate(({ BrowserWindow, screen }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (!window) throw new Error("The desktop window is gone.");
        const original = window.getBounds();
        const workArea = screen.getDisplayMatching(original).workArea;
        const width = Math.min(Math.max(original.width, 1_100), workArea.width);
        const x = Math.max(workArea.x, Math.min(original.x, workArea.x + workArea.width - width));
        const measured = { ...original, width, x };
        window.setBounds(measured);
        return { measured, original };
    });
    await page.waitForTimeout(250);
    const narrowest = Math.max(
        WINDOW_EDGE_RESIZE_MIN_WIDTH,
        geometry.measured.width - WINDOW_EDGE_RESIZE_DISTANCE,
    );
    const widths = [geometry.measured.width];
    for (
        let width = geometry.measured.width - WINDOW_EDGE_RESIZE_STEP;
        width > narrowest;
        width -= WINDOW_EDGE_RESIZE_STEP
    )
        widths.push(width);
    widths.push(narrowest);
    for (
        let width = narrowest + WINDOW_EDGE_RESIZE_STEP;
        width < geometry.measured.width;
        width += WINDOW_EDGE_RESIZE_STEP
    )
        widths.push(width);
    widths.push(geometry.measured.width);
    const phaseRun = async (
        anchor: "left-fixed" | "right-fixed",
    ): Promise<WindowEdgeResizeCapture & { readonly steps: readonly WindowEdgeResizeStep[] }> => {
        await samplerStart(page);
        await page.waitForTimeout(250);
        const steps = await app.evaluate(
            async ({ BrowserWindow }, input) => {
                const window = BrowserWindow.getAllWindows()[0];
                if (!window) throw new Error("The desktop window is gone.");
                const origin = window.getBounds();
                const rightEdge = origin.x + origin.width;
                const applied: { at: number; width: number; x: number }[] = [];
                for (const width of input.widths) {
                    const x = input.anchor === "left-fixed" ? origin.x : rightEdge - width;
                    window.setBounds({ x, y: origin.y, width, height: origin.height });
                    applied.push({ at: Date.now(), width, x });
                    await new Promise<void>((resolveSleep) =>
                        setTimeout(resolveSleep, input.intervalMs),
                    );
                }
                window.setBounds(origin);
                return applied;
            },
            { anchor, intervalMs: WINDOW_EDGE_RESIZE_INTERVAL_MS, widths },
        );
        await page.waitForTimeout(250);
        return { ...(await samplerStop(page)), steps };
    };
    let movingOrigin:
        | (WindowEdgeResizeCapture & { readonly steps: readonly WindowEdgeResizeStep[] })
        | undefined;
    let fixedOrigin:
        | (WindowEdgeResizeCapture & { readonly steps: readonly WindowEdgeResizeStep[] })
        | undefined;
    try {
        fixedOrigin = await phaseRun("left-fixed");
        await mark("fixed-origin-sweep");
        await page.waitForTimeout(250);
        movingOrigin = await phaseRun("right-fixed");
        await mark("moving-origin-sweep");
    } finally {
        await app.evaluate(({ BrowserWindow }, bounds) => {
            BrowserWindow.getAllWindows()[0]?.setBounds(bounds);
        }, geometry.original);
    }
    if (!movingOrigin || !fixedOrigin)
        throw new Error("The rapid window resize sweep did not finish.");
    for (const [name, sweep] of [
        ["moving-origin", movingOrigin],
        ["fixed-origin", fixedOrigin],
    ] as const) {
        if (sweep.frames.length === 0)
            throw new Error(`The ${name} resize sweep captured no animation frames.`);
        if (sweep.frames.some((frame) => frame.renderedRows === 0))
            throw new Error(`The hydrated transcript became empty during the ${name} sweep.`);
    }
    const transcriptAfter = await windowEdgeResizeTranscriptRead(page);
    const artifact = join(paths.artifacts, "window-edge-resize-frames.json");
    await writeFile(
        artifact,
        `${JSON.stringify(
            {
                fixedOrigin,
                movingOrigin,
                sessionId,
                sweep: {
                    distancePx: geometry.measured.width - narrowest,
                    intervalMs: WINDOW_EDGE_RESIZE_INTERVAL_MS,
                    stepPx: WINDOW_EDGE_RESIZE_STEP,
                    updateCount: widths.length,
                },
                transcriptAfter,
                transcriptBefore,
            },
            null,
            2,
        )}\n`,
        "utf8",
    );
    return {
        artifact,
        fixedOrigin: windowEdgeResizePhaseSummarize(fixedOrigin, fixedOrigin.steps),
        movingOrigin: windowEdgeResizePhaseSummarize(movingOrigin, movingOrigin.steps),
        sessionId,
        sweep: {
            distancePx: geometry.measured.width - narrowest,
            intervalMs: WINDOW_EDGE_RESIZE_INTERVAL_MS,
            stepPx: WINDOW_EDGE_RESIZE_STEP,
            updateCount: widths.length,
        },
        transcriptAfter,
        transcriptBefore,
    };
}

async function windowEdgeResizeTranscriptRead(
    page: Page,
): Promise<TranscriptViewportMeasurement & { readonly textLength: number }> {
    const viewport = await transcriptViewportRead(page);
    const textLength = await page
        .locator('[data-happy-desktop-ui="message-list"]')
        .evaluate((element) => element.textContent?.trim().length ?? 0);
    if (textLength === 0) throw new Error("The window resize workload opened an empty transcript.");
    if (!viewport.virtualized || viewport.renderedRows === 0) {
        throw new Error(
            `The window resize workload needs a hydrated virtual transcript: ${JSON.stringify(viewport)}.`,
        );
    }
    if (viewport.scrollHeight <= viewport.clientHeight) {
        throw new Error(
            `The window resize workload needs scrollable chat content: ${JSON.stringify(viewport)}.`,
        );
    }
    return { ...viewport, textLength };
}

function streamingScrollPhaseBuild(
    anchorMode: ScrollStabilityPhase["anchorMode"],
    frames: readonly ScrollStabilityFrame[],
): StreamingScrollPhase {
    const base = scrollStabilityPhaseBuild("stream-send", anchorMode, frames);
    const statusGaps = frames.flatMap((frame) =>
        frame.statusGap === undefined ? [] : [frame.statusGap],
    );
    const statusGapMin = statusGaps.length > 0 ? Math.min(...statusGaps) : undefined;
    const statusGapMax = statusGaps.length > 0 ? Math.max(...statusGaps) : undefined;
    const statusGapSpread =
        statusGapMin === undefined || statusGapMax === undefined
            ? undefined
            : statusGapMax - statusGapMin;
    const scrollTops = frames.map((frame) => frame.scrollTop);
    const scrollTopMin = Math.min(...scrollTops);
    const scrollTopMax = Math.max(...scrollTops);
    const scrollTopSpread = scrollTopMax - scrollTopMin;
    const statusObserved = anchorMode === "parked" || statusGaps.length >= 2;
    const listIdentityPreserved = frames.every((frame) => frame.listIdentityPreserved);
    return {
        ...base,
        stable: base.stable && listIdentityPreserved,
        scrollTopMax,
        scrollTopMin,
        scrollTopSpread,
        statusGapMax,
        statusGapMin,
        statusGapSpread,
        statusObserved,
    };
}

function streamingPaintMeasurementBuild(
    frames: readonly ScrollStabilityFrame[],
): StreamingPaintMeasurement {
    let delayedRowGeometryCorrections = 0;
    let tableColumnReflows = 0;
    let tableStructureTransitions = 0;
    let previous: ScrollStabilityFrame | undefined;
    for (const frame of frames) {
        const tableStructureTransition =
            (previous?.trackedTableRows ?? 0) === 0 && (frame.trackedTableRows ?? 0) > 0;
        const statusSettlementTransition =
            previous?.statusHeight !== undefined && frame.settledStatusHeight !== undefined;
        if (
            previous?.trackedTextLength !== undefined &&
            frame.trackedTextLength === previous.trackedTextLength &&
            !tableStructureTransition &&
            !statusSettlementTransition &&
            (Math.abs((frame.trackedBodyHeight ?? 0) - (previous.trackedBodyHeight ?? 0)) > 1 ||
                Math.abs((frame.trackedRowHeight ?? 0) - (previous.trackedRowHeight ?? 0)) > 1)
        )
            delayedRowGeometryCorrections += 1;
        const columns = frame.trackedTableColumns;
        const previousColumns = previous?.trackedTableColumns;
        if (
            columns &&
            previousColumns &&
            (columns.length !== previousColumns.length ||
                columns.some((width, index) => Math.abs(width - previousColumns[index]!) > 1))
        )
            tableColumnReflows += 1;
        if (tableStructureTransition) tableStructureTransitions += 1;
        previous = frame;
    }
    const maxBottomDistance = frames.reduce(
        (maximum, frame) => Math.max(maximum, frame.bottomDistance),
        0,
    );
    const maxRowOverlapCount = frames.reduce(
        (maximum, frame) => Math.max(maximum, frame.rowOverlapCount),
        0,
    );
    const maxStableRowSpacingDelta = frames.reduce(
        (maximum, frame) => Math.max(maximum, frame.stableRowSpacingDeltaMax),
        0,
    );
    const stableRowPairFrameCount = frames.filter((frame) => frame.stableRowPairCount > 0).length;
    const tableObserved = frames.some((frame) => (frame.trackedTableRows ?? 0) >= 3);
    const progressiveTableParagraphObserved = frames.some(
        (frame) => frame.trackedProgressiveTableParagraph === true,
    );
    const prefixFrames = frames.filter((frame) => frame.trackedPrefixPreserved !== undefined);
    const prefixCaptureFrameCount = prefixFrames.length;
    const prefixNodePreserved = prefixFrames.every(
        (frame) => frame.trackedPrefixPreserved === true,
    );
    const statusGaps = frames.flatMap((frame) =>
        frame.statusGap === undefined ? [] : [frame.statusGap],
    );
    const statusGapMin = statusGaps.length > 0 ? Math.min(...statusGaps) : undefined;
    const statusGapMax = statusGaps.length > 0 ? Math.max(...statusGaps) : undefined;
    const statusGapSpread =
        statusGapMin === undefined || statusGapMax === undefined
            ? undefined
            : statusGapMax - statusGapMin;
    const settledStatusFrames = frames.filter(
        (frame) =>
            frame.settledStatusGap !== undefined &&
            frame.settledStatusHeight !== undefined &&
            frame.settledStatusColor !== undefined &&
            frame.settledStatusFontSize !== undefined &&
            frame.settledStatusLineHeight !== undefined,
    );
    const settledStatusGaps = settledStatusFrames.map((frame) => frame.settledStatusGap!);
    const settledStatusHeights = settledStatusFrames.map((frame) => frame.settledStatusHeight!);
    const settledStatusGapMin =
        settledStatusGaps.length > 0 ? Math.min(...settledStatusGaps) : undefined;
    const settledStatusGapMax =
        settledStatusGaps.length > 0 ? Math.max(...settledStatusGaps) : undefined;
    const settledStatusHeightMin =
        settledStatusHeights.length > 0 ? Math.min(...settledStatusHeights) : undefined;
    const settledStatusHeightMax =
        settledStatusHeights.length > 0 ? Math.max(...settledStatusHeights) : undefined;
    const liveTypography = frames.find(
        (frame) =>
            frame.statusColor !== undefined &&
            frame.statusFontSize !== undefined &&
            frame.statusLineHeight !== undefined,
    );
    const statusTypographyMatched =
        liveTypography !== undefined &&
        settledStatusFrames.length > 0 &&
        settledStatusFrames.every(
            (frame) =>
                frame.settledStatusColor === liveTypography.statusColor &&
                frame.settledStatusFontSize === liveTypography.statusFontSize &&
                frame.settledStatusLineHeight === liveTypography.statusLineHeight,
        );
    const firstSettledStatusIndex = frames.findIndex(
        (frame) => frame.settledStatusHeight !== undefined,
    );
    const firstSettledStatus =
        firstSettledStatusIndex < 0 ? undefined : frames[firstSettledStatusIndex];
    const lastLiveStatus =
        firstSettledStatusIndex <= 0 ? undefined : frames[firstSettledStatusIndex - 1];
    const statusTransitionSlotDelta =
        firstSettledStatus?.settledStatusHeight === undefined ||
        lastLiveStatus?.statusHeight === undefined
            ? undefined
            : Math.abs(firstSettledStatus.settledStatusHeight - lastLiveStatus.statusHeight);
    const statusTransitionScrollHeightDelta =
        firstSettledStatus === undefined || lastLiveStatus === undefined
            ? undefined
            : Math.abs(firstSettledStatus.scrollHeight - lastLiveStatus.scrollHeight);
    const statusTransitionContinuous =
        statusTransitionSlotDelta !== undefined &&
        statusTransitionSlotDelta <= 0.5 &&
        statusTransitionScrollHeightDelta !== undefined &&
        statusTransitionScrollHeightDelta <= 1;
    return {
        delayedRowGeometryCorrections,
        frameCount: frames.length,
        frames,
        maxBottomDistance,
        maxRowOverlapCount,
        maxStableRowSpacingDelta,
        progressiveTableParagraphObserved,
        prefixCaptureFrameCount,
        prefixNodePreserved,
        settledStatusFrameCount: settledStatusFrames.length,
        settledStatusGapMax,
        settledStatusGapMin,
        settledStatusHeightMax,
        settledStatusHeightMin,
        stable:
            frames.length > 2 &&
            delayedRowGeometryCorrections === 0 &&
            maxBottomDistance <= 1 &&
            maxRowOverlapCount === 0 &&
            maxStableRowSpacingDelta <= 1 &&
            stableRowPairFrameCount >= 2 &&
            progressiveTableParagraphObserved &&
            prefixCaptureFrameCount >= 2 &&
            prefixNodePreserved &&
            statusGapMin !== undefined &&
            Math.abs(statusGapMin - 24) <= 1 &&
            statusGapSpread !== undefined &&
            statusGapSpread <= 1 &&
            settledStatusFrames.length >= 2 &&
            settledStatusGapMin !== undefined &&
            Math.abs(settledStatusGapMin - 24) <= 1 &&
            settledStatusGapMax !== undefined &&
            Math.abs(settledStatusGapMax - 24) <= 1 &&
            settledStatusHeightMin !== undefined &&
            Math.abs(settledStatusHeightMin - 32) <= 0.5 &&
            settledStatusHeightMax !== undefined &&
            Math.abs(settledStatusHeightMax - 32) <= 0.5 &&
            statusTransitionContinuous &&
            statusTypographyMatched &&
            tableObserved &&
            tableStructureTransitions === 1,
        stableRowPairFrameCount,
        statusGapMax,
        statusGapMin,
        statusGapSpread,
        statusTransitionContinuous,
        statusTransitionScrollHeightDelta,
        statusTransitionSlotDelta,
        statusTypographyMatched,
        tableColumnReflows,
        tableObserved,
        tableStructureTransitions,
    };
}

function streamingToolSettleMeasurementBuild(
    frames: readonly ScrollStabilityFrame[],
): StreamingToolSettleMeasurement {
    const trackedFrames = frames.filter((frame) => frame.trackedToolPresentation !== undefined);
    const genericFrames = trackedFrames.filter(
        (frame) =>
            frame.trackedToolPresentation === "generic" && frame.trackedToolStatus === "running",
    );
    const fileDiffFrames = trackedFrames.filter(
        (frame) => frame.trackedToolPresentation === "fileDiff",
    );
    let transitionCount = 0;
    for (let index = 1; index < trackedFrames.length; index += 1) {
        if (
            trackedFrames[index - 1]!.trackedToolPresentation === "generic" &&
            trackedFrames[index]!.trackedToolPresentation === "fileDiff"
        )
            transitionCount += 1;
    }
    const toolActivityHeights = trackedFrames.flatMap((frame) =>
        frame.trackedToolActivityHeight === undefined ? [] : [frame.trackedToolActivityHeight],
    );
    const fileSummaryHeights = fileDiffFrames.flatMap((frame) =>
        frame.trackedToolFileSummaryHeight === undefined
            ? []
            : [frame.trackedToolFileSummaryHeight],
    );
    const fileSummaryBaselineExcesses = fileDiffFrames.flatMap((frame) => {
        if (
            frame.trackedToolFileSummaryHeight === undefined ||
            frame.trackedToolTextHeight === undefined ||
            frame.trackedToolStatsHeight === undefined
        )
            return [];
        return [
            frame.trackedToolFileSummaryHeight -
                Math.max(frame.trackedToolTextHeight, frame.trackedToolStatsHeight),
        ];
    });
    const fileSummaryBaselineExcessMax =
        fileSummaryBaselineExcesses.length > 0
            ? Math.max(...fileSummaryBaselineExcesses)
            : undefined;
    const fileSummaryHeightMax =
        fileSummaryHeights.length > 0 ? Math.max(...fileSummaryHeights) : undefined;
    const toolActivityHeightMin =
        toolActivityHeights.length > 0 ? Math.min(...toolActivityHeights) : undefined;
    const toolActivityHeightMax =
        toolActivityHeights.length > 0 ? Math.max(...toolActivityHeights) : undefined;
    const maxBottomDistance = frames.reduce(
        (maximum, frame) => Math.max(maximum, frame.bottomDistance),
        0,
    );
    const maxStableRowSpacingDelta = frames.reduce(
        (maximum, frame) => Math.max(maximum, frame.stableRowSpacingDeltaMax),
        0,
    );
    const stableRowPairFrameCount = frames.filter((frame) => frame.stableRowPairCount > 0).length;
    return {
        fileDiffFrameCount: fileDiffFrames.length,
        fileSummaryBaselineExcessMax,
        fileSummaryHeightMax,
        frames,
        genericFrameCount: genericFrames.length,
        maxBottomDistance,
        maxStableRowSpacingDelta,
        stableRowPairFrameCount,
        stable:
            genericFrames.length >= 2 &&
            fileDiffFrames.length >= 2 &&
            transitionCount === 1 &&
            toolActivityHeightMin !== undefined &&
            Math.abs(toolActivityHeightMin - 32) <= 0.1 &&
            toolActivityHeightMax !== undefined &&
            Math.abs(toolActivityHeightMax - 32) <= 0.1 &&
            fileSummaryHeightMax !== undefined &&
            Math.abs(fileSummaryHeightMax - 20) <= 0.1 &&
            fileSummaryBaselineExcessMax !== undefined &&
            fileSummaryBaselineExcessMax <= 0.1 &&
            maxBottomDistance <= 1 &&
            maxStableRowSpacingDelta <= 1 &&
            stableRowPairFrameCount >= 2,
        toolActivityHeightMax,
        toolActivityHeightMin,
        transitionCount,
    };
}

async function streamingScrollRun(
    page: Page,
    composer: Locator,
    mark: (name: string) => Promise<void>,
): Promise<StreamingScrollMeasurement> {
    const list = page
        .locator('[data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]')
        .first();
    const armFollowing = async () => {
        await scrollListToFraction(page, 1);
        const box = await list.boundingBox();
        if (!box) throw new Error("The streaming transcript has no wheel target.");
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        /*
         * Setting scrollTop is only fixture positioning. The trusted downward
         * wheel tick is the reader intent that actually re-arms follow mode.
         */
        await page.mouse.wheel(0, 4);
        await page.waitForTimeout(16);
    };
    const run = async (
        anchorMode: ScrollStabilityPhase["anchorMode"],
        ordinal: number,
    ): Promise<StreamingScrollPhase> => {
        if (anchorMode === "following") await armFollowing();
        else await scrollListToFraction(page, 0.5);
        /*
         * The helper writes scrollTop in page context. Let the browser deliver
         * that real scroll and TanStack's scroll-end notification before a
         * later keyboard action; a human cannot wheel and press Enter in the
         * same JavaScript task either.
         */
        await page.waitForTimeout(200);
        const marker = `gym-mixed-replay-stream-${anchorMode}-${String(ordinal)}-${Date.now().toString(36)}`;
        const prompt =
            anchorMode === "parked"
                ? `Exercise real ${anchorMode} streaming.\nKeep the parked glyph fixed when this multiline composer clears.\n[${marker}]`
                : `Exercise real ${anchorMode} streaming. [${marker}]`;
        await composer.fill(prompt);
        const runningStatus = page.locator(
            '[data-happy-desktop-ui="sidebar-item"][data-active][data-status="working"]',
        );
        const frames = await scrollStabilityCapture(page, async () => {
            await composer.press("Enter");
            await runningStatus.waitFor({ state: "visible", timeout: 30_000 });
            if (anchorMode === "following") {
                await page.waitForFunction(
                    (scriptMarker) =>
                        document
                            .querySelector('[data-happy-desktop-ui="conversation-view"]')
                            ?.textContent?.includes(`script=${String(scriptMarker)}`) === true,
                    marker,
                    { timeout: 90_000 },
                );
            }
            await runningStatus.waitFor({ state: "hidden", timeout: 90_000 });
        });
        const phase = streamingScrollPhaseBuild(anchorMode, frames);
        await mark(`streaming-scroll-${anchorMode}`);
        return phase;
    };
    const following = await run("following", 1);
    const parked = await run("parked", 2);
    await armFollowing();
    await page.waitForTimeout(200);
    const unstickMarker = `gym-mixed-replay-stream-unstick-3-${Date.now().toString(36)}`;
    await composer.fill(`Exercise real mid-stream unstick. [${unstickMarker}]`);
    const runningStatus = page.locator(
        '[data-happy-desktop-ui="sidebar-item"][data-active][data-status="working"]',
    );
    await composer.press("Enter");
    await runningStatus.waitFor({ state: "visible", timeout: 30_000 });
    const listBox = await list.boundingBox();
    if (!listBox) throw new Error("The streaming transcript has no wheel target.");
    await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + listBox.height / 2);
    await page.mouse.wheel(0, -Math.max(800, listBox.height * 2));
    await page.waitForFunction(
        () => {
            const element = document.querySelector<HTMLElement>(
                '[data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]',
            );
            return (
                element !== null &&
                element.scrollHeight - element.scrollTop - element.clientHeight > 100
            );
        },
        undefined,
        { timeout: 5_000 },
    );
    const unstickFrames = await scrollStabilityCapture(page, async () => {
        await runningStatus.waitFor({ state: "hidden", timeout: 90_000 });
    });
    const unstick = streamingScrollPhaseBuild("parked", unstickFrames);
    if (!following.stable || !parked.stable || !unstick.stable) {
        throw new Error(
            `Streaming reader anchoring failed: ${JSON.stringify({ following, parked, unstick })}`,
        );
    }
    await mark("streaming-scroll-unstick");
    await armFollowing();
    await page.waitForTimeout(200);
    const paintMarker = `gym-streaming-paint-${Date.now().toString(36)}`;
    await composer.fill(`Exercise real streaming paint stability. [${paintMarker}]`);
    const paintFrames = await scrollStabilityCapture(
        page,
        async () => {
            await composer.press("Enter");
            await runningStatus.waitFor({ state: "visible", timeout: 30_000 });
            await runningStatus.waitFor({ state: "hidden", timeout: 90_000 });
            await page.waitForFunction(
                (marker) => {
                    const trackedMessage = [
                        ...document.querySelectorAll<HTMLElement>(
                            '[data-happy-desktop-ui="message"][data-agent]',
                        ),
                    ]
                        .filter((message) => message.textContent?.includes(String(marker)))
                        .at(-1);
                    const trackedRow = trackedMessage?.closest<HTMLElement>(
                        ".happy-message-list__virtual-row[data-index]",
                    );
                    const trackedIndex = Number.parseInt(trackedRow?.dataset.index ?? "", 10);
                    if (!Number.isFinite(trackedIndex)) return false;
                    return [
                        ...document.querySelectorAll<HTMLElement>(
                            '[data-happy-desktop-ui="turn-summary"]',
                        ),
                    ].some((summary) => {
                        const row = summary.closest<HTMLElement>(
                            ".happy-message-list__virtual-row[data-index]",
                        );
                        const index = Number.parseInt(row?.dataset.index ?? "", 10);
                        return Number.isFinite(index) && index > trackedIndex;
                    });
                },
                paintMarker,
                { timeout: 10_000 },
            );
            // Completion is gated above. This hold is only a measurement
            // window, retaining several painted settled frames after it.
            await page.waitForTimeout(100);
        },
        paintMarker,
    );
    const paint = streamingPaintMeasurementBuild(paintFrames);
    if (!paint.stable)
        throw new Error(
            `Streaming paint stability failed: ${JSON.stringify({
                ...paint,
                frames: `${String(paint.frames.length)} captured frames`,
            })}`,
        );
    await mark("streaming-paint");
    await armFollowing();
    await page.waitForTimeout(200);
    const toolSettleMarker = `gym-tool-settle-${Date.now().toString(36)}`;
    await composer.fill(`Exercise real apply-patch settlement. [${toolSettleMarker}]`);
    const toolSettleFrames = await scrollStabilityCapture(
        page,
        async () => {
            await composer.press("Enter");
            await runningStatus.waitFor({ state: "visible", timeout: 30_000 });
            await runningStatus.waitFor({ state: "hidden", timeout: 90_000 });
            await page.waitForTimeout(100);
        },
        toolSettleMarker,
    );
    const toolSettle = streamingToolSettleMeasurementBuild(toolSettleFrames);
    await mark("streaming-tool-settle");
    await armFollowing();
    await page.waitForTimeout(200);
    const microUnstickMarker = `gym-mixed-replay-stream-unstick-micro-${Date.now().toString(36)}`;
    await composer.fill(`Exercise a tiny real mid-stream unstick. [${microUnstickMarker}]`);
    await composer.press("Enter");
    await runningStatus.waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForFunction(
        (marker) =>
            document
                .querySelector('[data-happy-desktop-ui="conversation-view"]')
                ?.textContent?.includes(String(marker)) === true,
        microUnstickMarker,
        { timeout: 30_000 },
    );
    const microList = page
        .locator('[data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]')
        .first();
    const microListBox = await microList.boundingBox();
    if (!microListBox) throw new Error("The tiny unstick transcript has no wheel target.");
    await page.mouse.move(
        microListBox.x + microListBox.width / 2,
        microListBox.y + microListBox.height / 2,
    );
    await microList.evaluate((element) => {
        const browserWindow = window as Window & {
            __happyDesktopGymWheelBaseline?: {
                readonly bottomDistance: number;
                readonly firstRowBottom?: number;
                readonly firstRowIndex?: string;
                readonly firstRowTop?: number;
                readonly scrollTop: number;
            };
        };
        element.addEventListener(
            "wheel",
            () => {
                const listRect = element.getBoundingClientRect();
                const firstRow = [
                    ...element.querySelectorAll<HTMLElement>(
                        ".happy-message-list__virtual-row[data-index]",
                    ),
                ]
                    .filter((row) => {
                        const rect = row.getBoundingClientRect();
                        return rect.bottom > listRect.top && rect.top < listRect.bottom;
                    })
                    .sort(
                        (left, right) =>
                            left.getBoundingClientRect().top - right.getBoundingClientRect().top,
                    )[0];
                const firstRowRect = firstRow?.getBoundingClientRect();
                browserWindow.__happyDesktopGymWheelBaseline = {
                    bottomDistance: Math.max(
                        0,
                        element.scrollHeight - element.scrollTop - element.clientHeight,
                    ),
                    firstRowBottom: firstRowRect?.bottom,
                    firstRowIndex: firstRow?.dataset.index,
                    firstRowTop: firstRowRect?.top,
                    scrollTop: element.scrollTop,
                };
            },
            { capture: true, once: true },
        );
    });
    await page.mouse.wheel(0, -4);
    await page.evaluate(
        () =>
            new Promise<void>((resolve) => {
                requestAnimationFrame(() => window.setTimeout(resolve, 0));
            }),
    );
    const microBefore = await page.evaluate(() => {
        const browserWindow = window as Window & {
            __happyDesktopGymWheelBaseline?: {
                readonly bottomDistance: number;
                readonly firstRowBottom?: number;
                readonly firstRowIndex?: string;
                readonly firstRowTop?: number;
                readonly scrollTop: number;
            };
        };
        const snapshot = browserWindow.__happyDesktopGymWheelBaseline;
        delete browserWindow.__happyDesktopGymWheelBaseline;
        if (!snapshot) throw new Error("The tiny unstick wheel event was not observed.");
        return snapshot;
    });
    const microEscape = await microList.evaluate((element, baselineIndex) => {
        const firstRow = [
            ...element.querySelectorAll<HTMLElement>(
                ".happy-message-list__virtual-row[data-index]",
            ),
        ].find((row) => row.dataset.index === baselineIndex);
        const firstRowRect = firstRow?.getBoundingClientRect();
        return {
            bottomDistance: Math.max(
                0,
                element.scrollHeight - element.scrollTop - element.clientHeight,
            ),
            firstRowBottom: firstRowRect?.bottom,
            firstRowIndex: firstRow?.dataset.index,
            firstRowTop: firstRowRect?.top,
            scrollTop: element.scrollTop,
        };
    }, microBefore.firstRowIndex);
    const microFrames = await scrollStabilityCapture(page, async () => {
        await runningStatus.waitFor({ state: "hidden", timeout: 90_000 });
    });
    const microBase = streamingScrollPhaseBuild("parked", microFrames);
    const escapeScrollDelta = microBefore.scrollTop - microEscape.scrollTop;
    const escapeFirstRowTopDelta =
        microBefore.firstRowTop === undefined || microEscape.firstRowTop === undefined
            ? Number.NaN
            : microEscape.firstRowTop - microBefore.firstRowTop;
    const escapeFirstRowBottomDelta =
        microBefore.firstRowBottom === undefined || microEscape.firstRowBottom === undefined
            ? Number.NaN
            : microEscape.firstRowBottom - microBefore.firstRowBottom;
    const escapeFirstRowIndexStable =
        microBefore.firstRowIndex !== undefined &&
        microBefore.firstRowIndex === microEscape.firstRowIndex;
    const escapeObserved =
        microEscape.bottomDistance >= 0.5 &&
        escapeScrollDelta >= 0.5 &&
        escapeScrollDelta <= 8 &&
        escapeFirstRowIndexStable &&
        escapeFirstRowTopDelta >= 0.5 &&
        escapeFirstRowTopDelta <= 8 &&
        Math.abs(escapeFirstRowBottomDelta - escapeFirstRowTopDelta) <= 1;
    const firstRowTops = microFrames.flatMap((frame) =>
        frame.firstRowTop === undefined ? [] : [frame.firstRowTop],
    );
    const firstRowBottoms = microFrames.flatMap((frame) =>
        frame.firstRowBottom === undefined ? [] : [frame.firstRowBottom],
    );
    const firstRowTopSpread =
        firstRowTops.length === 0
            ? Number.POSITIVE_INFINITY
            : Math.max(...firstRowTops) - Math.min(...firstRowTops);
    const firstRowBottomSpread =
        firstRowBottoms.length === 0
            ? Number.POSITIVE_INFINITY
            : Math.max(...firstRowBottoms) - Math.min(...firstRowBottoms);
    const maxStableRowSpacingDelta = microFrames.reduce(
        (maximum, frame) => Math.max(maximum, frame.stableRowSpacingDeltaMax),
        0,
    );
    const stableRowPairFrameCount = microFrames.filter(
        (frame) => frame.stableRowPairCount > 0,
    ).length;
    const microUnstick: StreamingMicroUnstickMeasurement = {
        ...microBase,
        escapeBottomDistance: microEscape.bottomDistance,
        escapeFirstRowBottomDelta,
        escapeFirstRowIndexStable,
        escapeFirstRowTopDelta,
        escapeObserved,
        escapeScrollDelta,
        firstRowBottomSpread,
        firstRowTopSpread,
        maxStableRowSpacingDelta,
        stableRowPairFrameCount,
        stable:
            microFrames.length >= 2 &&
            microBase.layoutChangeObserved &&
            microBase.maxRowOverlapCount === 0 &&
            escapeObserved &&
            microBase.scrollTopSpread !== undefined &&
            microBase.scrollTopSpread <= 1 &&
            firstRowTopSpread <= 1 &&
            firstRowBottomSpread <= 1 &&
            maxStableRowSpacingDelta <= 1 &&
            stableRowPairFrameCount >= 2,
    };
    await mark("streaming-micro-unstick");
    return {
        following,
        microUnstick,
        paint,
        parked,
        stable:
            following.stable &&
            microUnstick.stable &&
            paint.stable &&
            parked.stable &&
            toolSettle.stable &&
            unstick.stable,
        toolSettle,
        unstick,
    };
}

function goldReplayDetails(material: GymGoldReplayMaterial): Record<string, unknown> {
    return {
        durationMs: material.durationMs,
        frameCount: material.frameCount,
        id: material.id,
        label: material.label,
        messageCount: material.messages.length,
        messageSources: material.messages.map((message) => message.source),
        path: material.path,
        replayMode: "gold-submitted-message-patterns-through-real-happy-agent",
    };
}

function responsivenessDetails(nativeProfilerActive: boolean): Record<string, string> {
    return nativeProfilerActive
        ? {
              longTasks:
                  "See the unchanged Chromium timeline, paint, input, and React timestamp evidence referenced by profilerArtifacts.",
              metrics:
                  "See the unchanged native raw metrics samples referenced by profilerArtifacts.",
              source: "happy-desktop-native",
          }
        : {
              longTasks: "Bounded browser long-task entries and CDP fallback.",
              metrics: "Renderer metrics are included in the before/after captures.",
              source: "gym-cdp-fallback",
          };
}

async function mixedReplayRun(
    page: Page,
    app: ElectronApplication,
    options: {
        readonly manifest: GymManifest;
        readonly paths: GymRunPaths;
        readonly runtime: StartedHappyAgentRuntime;
        readonly projects: readonly GymProject[];
        readonly sessionIds: readonly string[];
        profilerActive(): boolean;
    },
    material: GymGoldReplayMaterial,
    targets: readonly MixedSessionTarget[],
    mark: (name: string) => Promise<void>,
): Promise<Record<string, unknown>> {
    const before = await performanceCapture(page, app, options.profilerActive());
    const overlapStarted = performance.now();
    const overlapEvents: Array<Record<string, unknown>> = [];
    const overlapEvent = (kind: string, details: Record<string, unknown> = {}): void => {
        overlapEvents.push({
            kind,
            ...details,
            timestamp: new Date().toISOString(),
            elapsedMs: performance.now() - overlapStarted,
        });
    };
    await mark("baseline-captured");

    const baselineMessages = new Map<string, number>();
    const baselineEvents = new Map<string, number>();
    const baselineCursors = new Map<string, string | undefined>();
    for (const target of targets) {
        await navigateRoute(page, target.route);
        await waitForSessionUiReady(page, target.route, target.id);
        baselineMessages.set(
            target.id,
            await page.locator('[data-happy-desktop-ui="message"]').count(),
        );
    }
    await mark("session-baselines-captured");
    await Promise.all(
        targets.map(async (target) => {
            const events = (await options.runtime.client.agentEvents(target.id)).events;
            baselineEvents.set(target.id, events.length);
            baselineCursors.set(target.id, eventCursorRead(events.at(-1)));
        }),
    );
    const collectors = new Map<string, PreAttachedSessionStream>();
    await Promise.all(
        targets.map(async (target) => {
            collectors.set(
                target.id,
                await agentStreamCollectorCreate(
                    options.runtime.client,
                    target.id,
                    baselineCursors.get(target.id),
                ),
            );
        }),
    );

    // The prepared runtime mounts the actual ready managed worktree at
    // /workspace. Pick a clustered workspace session so the real agent tool
    // mutation lands in the same checkout that the foreground UI renders.
    const liveToolTargetIndex = Math.max(
        0,
        targets.findIndex((target) => target.workspace),
    );
    const liveToolTarget = targets[liveToolTargetIndex]!;
    const liveToolProjectId =
        liveToolTarget.projectId ??
        options.projects.find((project) =>
            liveToolTarget.workspaceId === undefined
                ? false
                : project.worktreeIds.includes(liveToolTarget.workspaceId),
        )?.id;
    if (liveToolTarget.workspaceId === undefined || liveToolProjectId === undefined) {
        throw new Error("Mixed replay target is not a managed workspace with a project owner.");
    }
    const watchedBefore = await options.runtime.client.watchGit([liveToolTarget.workspaceId]);
    overlapEvent("git-watch-registered", {
        phase: "before-tool",
        projectId: liveToolProjectId,
        workspaceId: liveToolTarget.workspaceId,
        snapshotCount: Array.isArray(watchedBefore.snapshots)
            ? watchedBefore.snapshots.length
            : undefined,
    });
    const liveToolMarker = "Gym live tool mutation · mixed replay";
    const liveToolLineCount = gymLiveToolMutationLineCount(options.manifest.profile);
    const liveFilePath = join(
        options.paths.happyAgentWorkspacePath,
        "src/changes/modified/deep/large-modified.md",
    );
    const baselineLiveFileLines = (await readFile(liveFilePath, "utf8"))
        .trimEnd()
        .split("\n").length;
    const expectedChangedLines = baselineLiveFileLines + liveToolLineCount;
    const liveFileMutationBarrier = waitForFileMutation(
        liveFilePath,
        liveToolMarker,
        expectedChangedLines,
    );
    const submissionStarted = performance.now();
    const submissions = await Promise.all(
        targets.map(async (target, index): Promise<MixedSubmission> => {
            const materialMessage = material.messages[index % material.messages.length]!;
            const baselineEventCount = baselineEvents.get(target.id) ?? 0;
            const marker = `gym-mixed-replay-${String(index + 1)}-${target.id.slice(-6)}-e${baselineEventCount}`;
            const liveTool = index === liveToolTargetIndex;
            const submittedAt = new Date().toISOString();
            const prompt =
                `${materialMessage.text}\n\n[${marker}]` +
                (liveTool ? "\n\n[gym-mixed-replay-live-tool]" : "");
            const submitted = await options.runtime.client.sendMessage(target.id, prompt);
            return {
                baselineEventCount,
                baselineCursor: baselineCursors.get(target.id),
                liveTool,
                marker,
                messageId: submitted.messageId,
                prompt,
                route: target.route,
                runId: submitted.runId,
                sessionId: target.id,
                submittedAt,
            };
        }),
    );
    const submissionDurationMs = performance.now() - submissionStarted;
    overlapEvent("turns-submitted", {
        count: submissions.length,
        liveToolSessionId: liveToolTarget.id,
        runIds: submissions.map((submission) => submission.runId),
    });
    await mark("concurrent-submissions-accepted");

    // Each barrier drains one ordered cursor over the append-only buffer fed by
    // the real session SSE stream. The server `after` cursor is the recovery
    // boundary; the run id and lifecycle sequence are the acceptance boundary.
    // The NDJSON artifact preserves every observed event/timestamp unchanged.
    const seenRunEvents = new Set<string>();
    const durableBarriers = submissions.map((submission) => {
        overlapEvent("durable-barrier-start", {
            runId: submission.runId,
            sessionId: submission.sessionId,
        });
        return sessionRunBarrierWait(
            options.runtime.client,
            submission,
            async (event, observedAt) => {
                const eventId = event.cursor;
                if (seenRunEvents.has(eventId)) return;
                seenRunEvents.add(eventId);
                await appendFile(
                    options.paths.streamLog,
                    `${JSON.stringify({
                        kind: "session-event",
                        event: event.event,
                        eventId,
                        observedAt,
                        runId: submission.runId,
                        sessionId: submission.sessionId,
                        sessionEventTimestamp: event.event.occurredAt,
                    })}\n`,
                    "utf8",
                );
                overlapEvent("stream-event", {
                    createdAt: event.event.occurredAt,
                    eventId,
                    eventType: event.event.type,
                    observedAt,
                    runId: submission.runId,
                    sessionId: submission.sessionId,
                });
            },
            collectors.get(submission.sessionId),
        );
    });

    overlapEvent("ui-lane-start", {
        foregroundSessionId: targets[0]?.id,
        liveToolSessionId: liveToolTarget.id,
    });
    const uiDriver = (async (): Promise<{
        readonly changedFiles: FileSequenceMeasurement;
        readonly changedFileStats: ChangedFileStatsMeasurement;
        readonly changedFileSelection: DiffSelectionMeasurement;
        readonly changedFileUiSummary: string;
        readonly documentSequence: FileSequenceMeasurement;
        readonly highlightSequence: FileSequenceMeasurement;
        readonly historyGrowthObserved: boolean;
        readonly initialTranscriptViewport: TranscriptViewportMeasurement;
        readonly longChatScrollInteractions: readonly ScrollInteractionMeasurement[];
        readonly scrollStability: ScrollStabilityMeasurement;
        readonly sessionSwitches: readonly Record<string, unknown>[];
        readonly streamUiInteractions: readonly Record<string, unknown>[];
    }> => {
        const routeIndexes = targets.length >= 4 ? [0, 1, 2, 0, 3, 2, 1, 0] : [0, 1, 2, 0, 1, 2, 0];
        const sessionSwitches = await sessionSwitchSequence(
            page,
            targets,
            routeIndexes,
            mark,
            "session-switch",
            (interaction) => overlapEvent("session-switch", interaction),
        );
        await mark("session-switches-complete");

        const scrollTarget = targets[0]!;
        await navigateRoute(page, scrollTarget.route);
        await waitForSessionUiReady(page, scrollTarget.route, scrollTarget.id);
        const initialTranscriptViewport = await transcriptViewportRead(page);
        overlapEvent("transcript-ready", { ...initialTranscriptViewport });
        const longChatScrollInteractions = await transcriptScrollSequence(
            page,
            [1, 0, 0.78, 0.22, 0.92, 0.08, 0.64, 0],
            mark,
            (interaction) => overlapEvent("transcript-scroll", { ...interaction }),
        );
        const historyGrowthObserved = longChatScrollInteractions.some(
            (interaction) =>
                interaction.requestedFraction === 0 &&
                (interaction.historyLoaderObserved === true ||
                    (interaction.historyScrollHeightAfter ?? 0) >
                        (interaction.historyScrollHeightBefore ?? Number.POSITIVE_INFINITY)),
        );
        await mark("long-chat-scroll-complete");
        const scrollStability = await scrollStabilityRun(page, mark);
        overlapEvent("scroll-stability-complete", {
            stable: scrollStability.stable,
            panelResizeFrames: scrollStability.panelResize.frames.length,
            panelParkedResizeFrames: scrollStability.panelParkedResize.frames.length,
            composerGrowthFrames: scrollStability.composerGrowth.frames.length,
            composerShrinkFrames: scrollStability.composerShrink.frames.length,
        });

        // Keep this checkout foregrounded while the isolated tool mutates its
        // deterministic file. The Changed-files projection is the UI/event
        // barrier for Git watcher → Happy Agent scanner → SSE → Happy reconciliation.
        await navigateRoute(page, liveToolTarget.route);
        await waitForSessionUiReady(page, liveToolTarget.route, liveToolTarget.id);
        const changedPaths = [
            "src/changes/modified/deep/large-modified.md",
            "src/changes/added/deep/added-large.md",
            "src/changes/renamed/renamed-source.ts",
            "src/changes/modified/deep/large-modified.md",
            "src/changes/added/deep/added-large.md",
        ];
        // Ensure the first open sees the live mutation before the cold
        // plain-to-highlight selection barrier starts. Otherwise the worker
        // may finish the pre-mutation document before the range is staged.
        await liveFileMutationBarrier;
        let changedFileSelection: DiffSelectionMeasurement | undefined;
        const changedFileInteraction = async (
            path: string,
            index: number,
            durationMs: number,
            timestamps: { readonly finishedAt: string; readonly startedAt: string },
        ): Promise<void> => {
            overlapEvent("changed-file-switch", {
                durationMs,
                ...timestamps,
                index: index + 1,
                path,
                sessionId: liveToolTarget.id,
            });
            await mark(`changed-file-${index + 1}-${fileMark(path)}-${durationMs.toFixed(0)}ms`);
        };
        const firstChangedFile = await fileSwitchSequence(
            page,
            changedPaths.slice(0, 1),
            changedFileInteraction,
            "changed",
            async (path, index) => {
                if (index === 0)
                    changedFileSelection = await changedFileSelectionBarrier(page, path, true);
            },
        );
        // `changedFiles` ends on added-large.md. Re-open the exact modified
        // row after the real tool mutation so the virtualized row itself,
        // rather than the currently selected diff body or aggregate summary,
        // proves Git watcher → Happy Agent → SSE → UI reconciliation.
        const changedFileStats = await changedFileStatsBarrier(
            page,
            changedPaths[0]!,
            expectedChangedLines,
            16,
        );
        if (changedFileSelection === undefined)
            throw new Error("Cold changed-file selection barrier did not run.");
        const remainingChangedFiles = await fileSwitchSequence(
            page,
            changedPaths.slice(1),
            (path, index, durationMs, timestamps) =>
                changedFileInteraction(path, index + 1, durationMs, timestamps),
            "changed",
        );
        const changedFiles: FileSequenceMeasurement = {
            durationsMs: [...firstChangedFile.durationsMs, ...remainingChangedFiles.durationsMs],
            firstMs: firstChangedFile.firstMs,
            loadingObserved: [
                ...firstChangedFile.loadingObserved,
                ...remainingChangedFiles.loadingObserved,
            ],
            paths: [...firstChangedFile.paths, ...remainingChangedFiles.paths],
            ...(firstChangedFile.reason === undefined && remainingChangedFiles.reason === undefined
                ? {}
                : { reason: firstChangedFile.reason ?? remainingChangedFiles.reason }),
            status:
                firstChangedFile.status === "ok" && remainingChangedFiles.status === "ok"
                    ? "ok"
                    : "skipped",
            warmMs: remainingChangedFiles.warmMs,
        };
        const changedFileUiSummary =
            (await page
                .locator('[data-happy-desktop-ui="file-browser-summary"]')
                .textContent()
                .catch(() => "")) ?? "";
        overlapEvent("file-reconciled", {
            changedPath: changedPaths[0],
            changedFileUiSummary,
            changedFileStats,
            expectedChangedLines,
            lineMutation: liveToolLineCount,
            sessionId: liveToolTarget.id,
        });

        const documentPaths = [
            "src/long-transcript.md",
            "docs/large/large-001.md",
            "src/long-transcript.md",
            "docs/large/large-001.md",
            "src/long-transcript.md",
        ];
        const documentSequence = await fileSwitchSequence(
            page,
            documentPaths,
            async (path, index, durationMs, timestamps) => {
                overlapEvent("document-switch", {
                    durationMs,
                    ...timestamps,
                    index: index + 1,
                    path,
                    sessionId: liveToolTarget.id,
                });
                await mark(
                    `document-cache-${index + 1}-${fileMark(path)}-${durationMs.toFixed(0)}ms`,
                );
            },
        );
        const pierreHighlightPaths = [
            "README.md",
            "src/long-transcript.md",
            "README.md",
            "src/long-transcript.md",
            "README.md",
        ];
        const highlightSequence = await fileSwitchSequence(
            page,
            pierreHighlightPaths,
            async (path, index, durationMs, timestamps) => {
                overlapEvent("highlight-switch", {
                    durationMs,
                    ...timestamps,
                    index: index + 1,
                    path,
                    sessionId: liveToolTarget.id,
                });
                await mark(
                    `highlight-cache-${index + 1}-${fileMark(path)}-${durationMs.toFixed(0)}ms`,
                );
            },
        );
        if (highlightSequence.status === "ok" && !highlightSequence.markdownFencedCodeObserved) {
            throw new Error(
                "Mixed replay highlight lane completed without observing the README Markdown fenced-code Pierre barrier.",
            );
        }
        await mark("cache-sequences-complete");

        const streamUiInteractions: Array<Record<string, unknown>> = [];
        for (const submission of submissions) {
            const targetStarted = performance.now();
            const targetStartedAt = new Date().toISOString();
            await navigateRoute(page, submission.route);
            await waitForSessionUiReady(page, submission.route, submission.sessionId);
            await waitForReplayMarker(page, submission.marker);
            const latencyMs = performance.now() - targetStarted;
            const interaction = {
                baselineEventCount: submission.baselineEventCount,
                baselineMessageCount: baselineMessages.get(submission.sessionId),
                finishedAt: new Date().toISOString(),
                latencyMs,
                marker: submission.marker,
                messageCount: await page.locator('[data-happy-desktop-ui="message"]').count(),
                runId: submission.runId,
                sessionId: submission.sessionId,
                startedAt: targetStartedAt,
            };
            streamUiInteractions.push(interaction);
            overlapEvent("stream-visible", interaction);
            await mark(`stream-visible-${submission.sessionId.slice(-6)}`);
        }
        await mark("streams-visible");
        return {
            changedFiles,
            changedFileStats,
            changedFileSelection,
            changedFileUiSummary,
            documentSequence,
            historyGrowthObserved,
            highlightSequence,
            initialTranscriptViewport,
            longChatScrollInteractions,
            scrollStability,
            sessionSwitches,
            streamUiInteractions,
        };
    })();
    const [ui, durableResults] = await Promise.all([uiDriver, Promise.all(durableBarriers)]);
    overlapEvent("ui-lane-complete", {
        changedFileStatus: ui.changedFiles.status,
        sessionSwitchCount: ui.sessionSwitches.length,
    });
    await mark("durable-stream-barriers-complete");

    const liveToolResult = durableResults[liveToolTargetIndex]!;
    if (!liveToolResult.toolCallObserved) {
        throw new Error(
            `Mixed replay did not observe the required real tool call in ${liveToolTarget.id}; ` +
                `eventTypes=${liveToolResult.eventTypes.join(",")}`,
        );
    }
    const liveFile = await readFile(liveFilePath, "utf8");
    const liveFileLines = liveFile.trimEnd().split("\n").length;
    const liveFileMutationObserved =
        liveFileLines >= expectedChangedLines && liveFile.includes(liveToolMarker);
    if (!liveFileMutationObserved) {
        throw new Error(
            `Mixed replay tool mutation did not reach the visible checkout: ` +
                `path=${liveFilePath} lines=${liveFileLines} expected=${expectedChangedLines}`,
        );
    }
    const watchedAfter = await options.runtime.client.watchGit([liveToolTarget.workspaceId]);
    overlapEvent("git-watch-registered", {
        phase: "after-tool",
        projectId: liveToolProjectId,
        workspaceId: liveToolTarget.workspaceId,
        snapshotCount: Array.isArray(watchedAfter.snapshots)
            ? watchedAfter.snapshots.length
            : undefined,
    });
    const uiStart = overlapEvents.find((event) => event.kind === "ui-lane-start");
    const uiEnd = overlapEvents.find((event) => event.kind === "ui-lane-complete");
    const uiStartMs = typeof uiStart?.elapsedMs === "number" ? uiStart.elapsedMs : 0;
    const uiEndMs =
        typeof uiEnd?.elapsedMs === "number" ? uiEnd.elapsedMs : Number.POSITIVE_INFINITY;
    const streamEventsDuringUi = overlapEvents.filter(
        (event) =>
            event.kind === "stream-event" &&
            typeof event.elapsedMs === "number" &&
            event.elapsedMs >= uiStartMs &&
            event.elapsedMs <= uiEndMs,
    );
    if (streamEventsDuringUi.length === 0) {
        throw new Error(
            "Mixed replay did not overlap durable streams with the foreground UI lane.",
        );
    }

    const after = await performanceCapture(page, app, options.profilerActive());
    const responsiveness = responsivenessDetails(options.profilerActive());
    return {
        after,
        cacheEvidence: {
            changedFiles: cacheEvidence("changed-files", ui.changedFiles),
            document: cacheEvidence("document-cache", ui.documentSequence),
            highlight: cacheEvidence("highlight-cache", ui.highlightSequence),
        },
        changedFiles: ui.changedFiles,
        changedFileStats: ui.changedFileStats,
        changedFileSelection: ui.changedFileSelection,
        changedFileUiSummary: ui.changedFileUiSummary,
        durableBarriers: durableResults,
        goldReplay: goldReplayDetails(material),
        longChatScroll: {
            initialViewport: ui.initialTranscriptViewport,
            interactions: ui.longChatScrollInteractions,
            historyGrowthObserved: ui.historyGrowthObserved,
            virtualizationExercised:
                ui.initialTranscriptViewport.virtualized &&
                ui.initialTranscriptViewport.scrollHeight >
                    ui.initialTranscriptViewport.clientHeight,
        },
        scrollStability: ui.scrollStability,
        liveToolMutation: {
            changedLinesBeforeTool: baselineLiveFileLines,
            expectedChangedLines,
            lineCount: liveToolLineCount,
            path: liveFilePath,
            sessionId: liveToolTarget.id,
            toolCallObserved: liveToolResult.toolCallObserved,
            mutationObserved: liveFileMutationObserved,
            usedWorkspace: liveToolTarget.workspace,
        },
        overlap: {
            eventCount: overlapEvents.length,
            events: overlapEvents,
            streamEventsDuringUi: streamEventsDuringUi.length,
            uiLane: "promise-coordinated-with-durable-barriers",
        },
        responsiveness,
        streamArtifact: options.paths.streamLog,
        sessionSwitches: ui.sessionSwitches,
        streamUiInteractions: ui.streamUiInteractions,
        submissions: {
            count: submissions.length,
            concurrent: true,
            durationMs: submissionDurationMs,
            liveToolSessionId: liveToolTarget.id,
            runIds: submissions.map((submission) => submission.runId),
        },
        before,
    };
}

async function mixedSessionTargetsRead(
    sessionIds: readonly string[],
    runtime: StartedHappyAgentRuntime,
): Promise<readonly MixedSessionTarget[]> {
    const targets = await Promise.all(
        sessionIds.map(async (id): Promise<MixedSessionTarget | undefined> => {
            const agent = (await runtime.client.getAgent(id)).agent;
            const location = agentLocation(agent);
            return location === undefined
                ? undefined
                : {
                      id,
                      projectId: location.projectId,
                      route: location.route,
                      scopeRoute: location.scopeRoute,
                      workspaceId: location.workspaceId,
                      workspace: location.workspace,
                  };
        }),
    );
    return targets
        .filter((target): target is MixedSessionTarget => target !== undefined)
        .slice(0, 4);
}

async function sessionRunBarrierWait(
    client: StartedHappyAgentRuntime["client"],
    submission: MixedSubmission,
    onEvent?: SessionRunEventObserver,
    preAttached?: PreAttachedSessionStream,
): Promise<SessionRunBarrier> {
    const started = performance.now();
    const collector =
        preAttached ??
        (await agentStreamCollectorCreate(client, submission.sessionId, submission.baselineCursor));
    const cursor = collector.cursorCreate();
    let eventCount = 0;
    let streamObserved = false;
    const eventTypes = new Set<string>();
    let toolCallObserved = false;
    let messageSubmittedSeen = false;
    let runStartedSeen = false;
    let firstAgentEventSeen = false;
    let settled = false;
    const seenEventIds = new Set<string>();
    const barrier = new Promise<SessionRunBarrier>((resolve, reject) => {
        const processEvent = async (streamEvent: HappyAgentJournalEvent): Promise<void> => {
            if (settled) return;
            const eventId = streamEvent.cursor;
            if (seenEventIds.has(eventId)) return;
            seenEventIds.add(eventId);
            const event = streamEvent.event;
            if (eventRunId(event) !== submission.runId) return;
            eventCount += 1;
            const type = event.type;
            eventTypes.add(type);
            if (
                type === "run.started" &&
                event.payload.acceptedMessageIds.includes(submission.messageId)
            ) {
                messageSubmittedSeen = true;
                runStartedSeen = true;
            }
            if (
                type === "run.boundary" &&
                event.payload.acceptedMessageIds.includes(submission.messageId)
            ) {
                messageSubmittedSeen = true;
                runStartedSeen = true;
            }
            if (
                (type === "message.created" || type === "message.updated") &&
                event.payload.message.role === "agent"
            ) {
                firstAgentEventSeen = true;
                streamObserved = true;
            }
            if (eventToolCallHas(event)) {
                toolCallObserved = true;
            }
            await onEvent?.(streamEvent, streamEvent.receivedAt);
            if (type === "run.finished" && event.payload.run.status === "failed") {
                settled = true;
                reject(
                    new Error(
                        `Happy Agent mixed replay run ${submission.runId} failed in ${submission.sessionId}: ${JSON.stringify(event).slice(0, 2_000)}`,
                    ),
                );
                collector.handle.close();
                return;
            }
            if (type === "run.finished") {
                settled = true;
                if (!messageSubmittedSeen || !runStartedSeen || !firstAgentEventSeen) {
                    reject(
                        new Error(
                            `Happy Agent stream barrier for ${submission.runId} violated the submitted→started→agent→finished sequence.`,
                        ),
                    );
                    collector.handle.close();
                    cursor.close();
                    return;
                }
                resolve({
                    durationMs: performance.now() - started,
                    eventCount,
                    eventTypes: [...eventTypes],
                    finished: true,
                    sessionId: submission.sessionId,
                    streamObserved,
                    toolCallObserved,
                });
                collector.handle.close();
                cursor.close();
            }
        };
        void (async () => {
            for await (const streamEvent of cursor) {
                await processEvent(streamEvent);
                if (settled) break;
            }
        })().catch((error: unknown) => {
            if (settled) return;
            settled = true;
            reject(error);
            collector.handle.close();
            cursor.close();
        });
        const timeout = setTimeout(() => {
            settled = true;
            reject(
                new Error(
                    `Timed out waiting for durable mixed replay run ${submission.runId} in ${submission.sessionId}.`,
                ),
            );
            collector.handle.close();
            cursor.close();
        }, 90_000);
        timeout.unref?.();
        void collector.handle.done
            .then(() => {
                if (settled) return;
                settled = true;
                reject(
                    new Error(
                        `Happy Agent session stream ended before run ${submission.runId} finished in ${submission.sessionId}.`,
                    ),
                );
                cursor.close();
            })
            .catch((error: unknown) => {
                if (settled) return;
                settled = true;
                reject(error);
                cursor.close();
            })
            .finally(() => {
                clearTimeout(timeout);
            });
    });
    return barrier;
}

async function waitForSessionUiReady(page: Page, route: string, sessionId?: string): Promise<void> {
    try {
        if (sessionId !== undefined) {
            const tab = page
                .locator(`[data-happy-desktop-ui="tab"][data-tab-id="${sessionId}"]`)
                .first();
            await tab.waitFor({ state: "visible", timeout: 20_000 });
            if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
            await page.waitForFunction(
                (expected) =>
                    document
                        .querySelector(`[data-happy-desktop-ui="tab"][data-tab-id="${expected}"]`)
                        ?.getAttribute("aria-selected") === "true",
                sessionId,
                { timeout: 20_000 },
            );
        }
        await page
            .locator('[data-happy-desktop-ui="conversation-view"]')
            .waitFor({ state: "attached", timeout: 20_000 });
    } catch (error) {
        throw new Error(
            `Session UI did not mount for ${route} at ${page.url()}: ` +
                `${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

async function waitForReplayMarker(page: Page, marker: string): Promise<void> {
    try {
        await page.waitForSelector('[data-happy-desktop-ui="message-list"]', {
            state: "attached",
            timeout: 90_000,
        });
        await page
            .locator('[data-happy-desktop-ui="message-list"] [data-scrollbar-viewport]')
            .evaluate(async (element) => {
                const list = element as HTMLElement;
                list.scrollTop = list.scrollHeight;
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            });
        await page.waitForFunction(
            (expected) =>
                document
                    .querySelector('[data-happy-desktop-ui="message-list"]')
                    ?.textContent?.includes(expected) === true,
            marker,
            {
                timeout: 90_000,
            },
        );
    } catch (error) {
        const conversation = await page
            .locator('[data-happy-desktop-ui="conversation-view"]')
            .innerText()
            .catch(() => "");
        throw new Error(
            `Timed out waiting for replay marker ${marker}: ` +
                `${error instanceof Error ? error.message : String(error)} ` +
                `conversation=${conversation.slice(0, 1_000)}`,
        );
    }
}

function eventRunId(event: HappyAgentJournalEvent["event"]): string | undefined {
    switch (event.type) {
        case "run.started":
            return event.payload.run.id;
        case "run.boundary":
            return event.payload.startedRun.id;
        case "run.finished":
            return event.payload.run.id;
        case "message.created":
        case "message.updated":
            return event.payload.runId ?? undefined;
        case "message.delta":
        case "message.deleted":
            return event.payload.runId;
        default:
            return undefined;
    }
}

function eventToolCallHas(event: HappyAgentJournalEvent["event"]): boolean {
    if (event.type !== "message.created" && event.type !== "message.updated") return false;
    return event.payload.message.content.some((block) => block.type === "tool_call");
}

function eventCursorRead(event: HappyAgentJournalEvent | undefined): string | undefined {
    return event?.cursor;
}

function cacheEvidence(name: string, sequence: FileSequenceMeasurement): Record<string, unknown> {
    const loadingObserved = sequence.loadingObserved;
    const warmInteractionIndexes = sequence.paths.flatMap((path, index) =>
        sequence.paths.slice(0, index).includes(path) ? [index] : [],
    );
    const warmLoadingObserved = warmInteractionIndexes.map(
        (index) => loadingObserved[index] === true,
    );
    if (sequence.status !== "ok" || sequence.durationsMs.length < 3) {
        return {
            evidence: "unavailable",
            loadingObserved,
            name,
            reason: sequence.reason ?? "A→B→A sequence did not complete.",
            status: sequence.status,
            warmLoadingObserved,
            warmNoLoading:
                warmLoadingObserved.length > 0 &&
                warmLoadingObserved.every((observed) => !observed),
        };
    }
    if (name === "highlight-cache" && !sequence.markdownFencedCodeObserved) {
        return {
            evidence: "unavailable",
            loadingObserved,
            name,
            reason: "Highlight sequence did not observe the Markdown fenced-code Pierre barrier.",
            status: sequence.status,
            warmLoadingObserved,
            warmNoLoading:
                warmLoadingObserved.length > 0 &&
                warmLoadingObserved.every((observed) => !observed),
        };
    }
    const coldMs = sequence.durationsMs[0]!;
    const warmReturns = sequence.durationsMs.filter(
        (_, index) => index > 0 && sequence.paths[index] === sequence.paths[0],
    );
    const warmMs = Math.min(...warmReturns);
    return {
        coldMs,
        evidence: "A→B→A UI interaction latency; cache hit is inferred from the warm return.",
        loadingObserved,
        ...(sequence.markdownFencedCodeObserved
            ? {
                  markdownFencedCodeObserved: true,
                  markdownRenderer: "Pierre Diffs via MarkdownDocument fenced block",
              }
            : {}),
        name,
        path: sequence.paths[0],
        status: sequence.status,
        warmLoadingObserved,
        warmNoLoading:
            warmLoadingObserved.length > 0 && warmLoadingObserved.every((observed) => !observed),
        warmNoLoadingEvidence:
            warmLoadingObserved.length > 0
                ? "MutationObserver saw no Loading file… face on repeated paths."
                : "No repeated path was present in this sequence.",
        warmSamples: warmReturns,
        warmFaster: warmMs <= coldMs,
        warmMs,
        warmVsColdDeltaMs: warmMs - coldMs,
        warmVsColdRatio: coldMs === 0 ? undefined : warmMs / coldMs,
    };
}

function fileMark(path: string): string {
    return path.replaceAll("/", "-").replaceAll(".", "-");
}

async function performanceCapture(
    page: Page,
    app: ElectronApplication,
    nativeProfilerActive: boolean,
): Promise<Record<string, unknown>> {
    const details: Record<string, unknown> = {};
    if (!nativeProfilerActive) {
        // The app-owned profiler is authoritative whenever its bridge is
        // running. Keep this bounded snapshot only for ordinary builds or a
        // missing bridge; otherwise Gym would collect the same heap/DOM/process
        // data a second time.
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Performance.enable").catch(() => undefined);
        const heap = await cdp.send("Runtime.getHeapUsage").catch(() => undefined);
        const dom = await cdp.send("Memory.getDOMCounters").catch(() => undefined);
        const metrics = await cdp.send("Performance.getMetrics").catch(() => undefined);
        if (heap !== undefined) details.heap = heap;
        if (dom !== undefined) details.dom = dom;
        if (metrics !== undefined) details.rendererMetrics = metrics;
        details.appMetrics = await app
            .evaluate(({ app: electronApp }) => ({
                processMemory: { ...process.memoryUsage() },
                appMetrics: electronApp.getAppMetrics(),
            }))
            .catch(() => undefined);
    } else {
        details.profiler = "happy-desktop-native";
    }
    details.url = page.url();
    details.title = await page.title().catch(() => "");
    const bodyText = await page.locator("body").innerText();
    details.textLength = bodyText.length;
    details.bodyText = bodyText.slice(0, 1_000);
    return details;
}

async function firstSessionLocation(
    sessionIds: readonly string[],
    runtime: StartedHappyAgentRuntime,
    preferWorkspace = false,
): Promise<{ readonly route: string; readonly sessionId: string } | undefined> {
    const ids = preferWorkspace ? [...sessionIds.slice(1), ...sessionIds.slice(0, 1)] : sessionIds;
    for (const id of ids) {
        const agent = (await runtime.client.getAgent(id)).agent;
        const location = agentLocation(agent);
        if (location === undefined) continue;
        if (!preferWorkspace || location.workspace) return { route: location.route, sessionId: id };
    }
    return undefined;
}

function agentLocation(agent: {
    readonly id: string;
    readonly projectId: string | null;
    readonly workspaceId: string;
}):
    | {
          readonly projectId: string;
          readonly route: string;
          readonly scopeRoute: string;
          readonly workspace: boolean;
          readonly workspaceId: string;
      }
    | undefined {
    // A bot's agent has no project to be located within. These workloads drive
    // project work, so such an agent simply has no location here.
    if (agent.projectId === null) return undefined;
    return {
        projectId: agent.projectId,
        route: `/chats/local/${agent.workspaceId}/${agent.id}`,
        scopeRoute: `/chats/local/${agent.workspaceId}`,
        workspace: agent.workspaceId !== agent.projectId,
        workspaceId: agent.workspaceId,
    };
}

async function navigateRoute(page: Page, path: string): Promise<void> {
    // Each desktop connection has its own memory router. A changed URL hash
    // no longer navigates it: use the same sidebar and tabs as the reader.
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    const [kind, connectionId, groupId, sessionId] = parts;
    if (kind !== "chats" || !connectionId || !groupId || parts.length > 4)
        throw new Error(`Gym has no public-control navigation for ${path}.`);
    const row = page.locator(
        `[data-happy-desktop-ui="sidebar-item"][data-item-id="${connectionId}/${groupId}"]`,
    );
    await row.waitFor({ state: "attached", timeout: 30_000 });
    if ((await row.getAttribute("aria-current")) !== "page") await row.click();
    await page.waitForFunction(
        (id) =>
            document
                .querySelector(`[data-happy-desktop-ui="sidebar-item"][data-item-id="${id}"]`)
                ?.getAttribute("aria-current") === "page",
        `${connectionId}/${groupId}`,
        { timeout: 30_000 },
    );
    if (sessionId) {
        const tab = page
            .locator(`[data-happy-desktop-ui="tab"][data-tab-id="${sessionId}"]`)
            .first();
        await tab.waitFor({ state: "attached", timeout: 30_000 });
        if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
        await page.waitForFunction(
            (id) =>
                document
                    .querySelector(`[data-happy-desktop-ui="tab"][data-tab-id="${id}"]`)
                    ?.getAttribute("aria-selected") === "true",
            sessionId,
            { timeout: 30_000 },
        );
    }
}

async function waitForAny(page: Page, selectors: readonly string[]): Promise<void> {
    const timeout = Math.max(1_000, Math.floor(20_000 / Math.max(1, selectors.length)));
    for (const selector of selectors) {
        try {
            await page.locator(selector).first().waitFor({ state: "visible", timeout });
            return;
        } catch {
            // Try the next surface selector.
        }
    }
    throw new Error(`None of the expected workload selectors mounted: ${selectors.join(", ")}`);
}

function measurement(
    name: string,
    started: number,
    details: Record<string, unknown>,
    marks: readonly GymScenarioMark[] = [],
    startedAt?: string,
): GymMeasurement {
    const durationMs = performance.now() - started;
    const finishedAtMilliseconds = Date.now();
    const finishedAt = new Date(finishedAtMilliseconds).toISOString();
    const scenarioStartedAt =
        startedAt ??
        new Date(finishedAtMilliseconds - Math.max(0, Math.round(durationMs))).toISOString();
    const resultMarks = [...marks];
    if (!resultMarks.some((mark) => mark.name.endsWith(":scenario-start"))) {
        resultMarks.unshift({
            elapsedMs: 0,
            name: `${name}:scenario-start`,
            timestamp: scenarioStartedAt,
        });
    }
    if (!resultMarks.some((mark) => mark.name.endsWith(":scenario-end"))) {
        resultMarks.push({
            elapsedMs: durationMs,
            name: `${name}:scenario-end`,
            timestamp: finishedAt,
        });
    }
    return {
        details,
        durationMs,
        finishedAt,
        marks: resultMarks,
        name,
        profilerArtifacts: [],
        startedAt: scenarioStartedAt,
    };
}

async function scenarioMark(
    page: Page,
    marks: GymScenarioMark[],
    started: number,
    name: string,
): Promise<void> {
    marks.push({
        elapsedMs: performance.now() - started,
        name,
        timestamp: new Date().toISOString(),
    });
    await page
        .evaluate((markName) => {
            performance.mark(markName);
        }, name)
        .catch(() => undefined);
}

async function waitForFileMutation(
    path: string,
    marker: string,
    minimumLines: number,
): Promise<void> {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
        try {
            const content = await readFile(path, "utf8");
            if (content.includes(marker) && content.trimEnd().split("\n").length >= minimumLines) {
                return;
            }
        } catch {
            // The managed checkout can be briefly unavailable while Happy Agent
            // materializes the worktree; keep the barrier alive until its
            // explicit deadline.
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for the real tool mutation at ${path}; marker=${marker}`);
}

async function fileExists(path: string): Promise<boolean> {
    try {
        await import("node:fs/promises").then(({ access }) => access(path));
        return true;
    } catch {
        return false;
    }
}
