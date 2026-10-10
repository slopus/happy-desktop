import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { ProjectRegistrationError } from "happy-desktop-state";
import type {
    DesktopDaemonSnapshot,
    DesktopRuntimeSnapshot,
    LocalAssistantId,
    LocalAppsSnapshot,
    LocalAssistantState,
    LocalOnboardingFreshness,
    LocalOnboardingSnapshot,
    LocalOnboardingStepBack,
} from "../shared/desktopContract";
import { localAppsDetect } from "./localApps";
import { localRuntimeProbe, type LocalRuntimeProbe } from "./localHappyAgent";

const recordVersion = 3;

/** The assistants setup asks about, in the order their cards are read. */
const LOCAL_ASSISTANT_IDS: readonly LocalAssistantId[] = ["claude", "codex", "grok"];

export type LocalHappyAgentOnboardingState =
    | { readonly state: "complete" | "provider_setup" }
    | { readonly message: string; readonly state: "happy_agent_unreachable" };

/**
 * How often the machine is re-examined while setup is waiting on something the
 * person does outside Happy — installing Node or Happy Agent, or repairing a Happy Agent that
 * stopped answering. Happy Agent's daemon has no
 * channel for "a command appeared in your shell", so this is the stopgap poll
 * the reactivity rule allows; it runs only on those stages and stops the moment
 * setup moves past them.
 */
const waitingPollMs = 3_000;
/**
 * How hard Happy tries to reach an agent it has just installed and started, and
 * how long it leaves between attempts. Roughly fifteen seconds in total: long
 * enough for a cold daemon to open its socket, short enough that a daemon which
 * is never coming up says so while the person is still watching.
 */
const startAttempts = 10;
const startAttemptSpacingMs = 1_500;
/**
 * A login shell that cannot be run at all leaves setup knowing nothing, which is
 * the one failure it must recover from by itself. It backs off from here to the
 * ceiling instead of asking again immediately.
 */
const probeRetryMinimumMs = 1_000;
const probeRetryMaximumMs = 30_000;

/**
 * Recognises the one daemon refusal that is a setup step rather than a fault.
 *
 * Happy Agent only runs coding assistants that are already signed in on the machine, so
 * a machine with none refuses to start with "No inference providers are
 * available", followed by the ids it looked at. That is the truthful last step of
 * setting a machine up, not a broken Happy Agent, and the ids are exactly what the
 * screen needs in order to say which assistants would satisfy it.
 *
 * Matching on the daemon's own sentence is the only channel available — it
 * reports this as a start-up error rather than as a state — so anything that
 * does not clearly say it returns nothing and the failure is shown as a failure.
 */
function providersMissingParse(message: string): readonly string[] | undefined {
    if (!message.includes("No inference providers are available")) return undefined;
    const named = [...message.matchAll(/'([a-z0-9_-]+)'/gi)].map(([, id]) => id as string);
    // Named or not, this is still the "sign in somewhere" case; the list only
    // decides how specific the screen can be about where.
    return [...new Set(named)];
}

/** The decisions first-run setup writes down, and nothing it can observe instead. */
export interface LocalOnboardingRecord {
    /** First-project setup was explicitly handed to an unsent Chief of Staff draft. */
    readonly chiefOfStaffSetup?: true;
    /** The last folder opened as a project, kept for display rather than for stages. */
    readonly projectPath?: string;
    readonly version: typeof recordVersion;
}

/**
 * Reads the durable record, treating anything unreadable as "nothing decided
 * yet".
 *
 * Validation is all-or-nothing on purpose. A record is a set of answers that
 * were only ever written together, so a file that disagrees with itself was not
 * written by this feature — and the safe reading of a file setup cannot account
 * for is that nothing has been decided, not that some of it can be kept. Keeping
 * fragments is the one failure that skips a question instead of repeating it.
 */
export async function localOnboardingRecordRead(
    path: string,
): Promise<LocalOnboardingRecord | undefined> {
    try {
        const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
        if (!isRecord(parsed)) return undefined;
        if (parsed.version === recordVersion) return recordParse(parsed);
        // Preserve the only still-relevant answer from pre-desktop-only records.
        if (parsed.version === 1 || parsed.version === 2)
            return recordParse({ version: recordVersion, projectPath: parsed.projectPath });
        return undefined;
    } catch (error) {
        if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT")
            return undefined;
        throw error;
    }
}

/**
 * Reads one stored record, whichever names its version used, and refuses it
 * whole unless every part of it is a shape and a combination this feature could
 * actually have written.
 */
function recordParse(parsed: Record<string, unknown>): LocalOnboardingRecord | undefined {
    const allowed = new Set(["version", "projectPath", "chiefOfStaffSetup"]);
    for (const key of Object.keys(parsed)) if (!allowed.has(key)) return undefined;

    const pathValue = parsed.projectPath;
    if (pathValue !== undefined && (typeof pathValue !== "string" || !pathValue)) return undefined;
    const projectPath = pathValue as string | undefined;
    if (parsed.chiefOfStaffSetup !== undefined && parsed.chiefOfStaffSetup !== true)
        return undefined;

    return {
        ...(parsed.chiefOfStaffSetup === true ? { chiefOfStaffSetup: true as const } : {}),
        ...(projectPath === undefined ? {} : { projectPath }),
        version: recordVersion,
    };
}

/**
 * Writes the record atomically, and only for a reader who is still the one being
 * written for.
 *
 * The prepared copy is put down beside the record and made authoritative by a
 * rename, so an interrupted write leaves the previous answers intact. That
 * rename is the instant the answer becomes this machine's, so `authorized` is
 * asked immediately before it and nowhere else: a document, a window, or a Happy Agent
 * may have been replaced while the bytes were being written, and answers given
 * to a reader who has since gone must not be committed on their successor's
 * behalf. Saying who a write is for is not optional, because a write with nobody
 * to answer for it is the thing this exists to prevent.
 *
 * The temporary name is random rather than counted, so two writers — including
 * two copies of Happy sharing a home directory — cannot pick the same one, and
 * it is created exclusively so an existing file is never written through. Every
 * path out of here that did not commit takes the temporary file with it, and a
 * failure to tidy up never replaces the failure worth reporting.
 */
export async function localOnboardingRecordWrite(
    path: string,
    record: LocalOnboardingRecord,
    authorized: () => boolean,
): Promise<boolean> {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    let committed = false;
    try {
        await handle.writeFile(`${JSON.stringify(record, undefined, 2)}\n`);
        await handle.close();
        // The last look, taken with the bytes already on disk and nothing left to
        // do but make them the record.
        if (!authorized()) return false;
        await rename(temporary, path);
        committed = true;
        return true;
    } finally {
        await handle.close().catch(() => undefined);
        // Whatever went wrong, or whoever went away, the half-written copy is not
        // left lying beside the record — and tidying up is never allowed to
        // become the error that gets reported.
        if (!committed) await rm(temporary, { force: true }).catch(() => undefined);
    }
}

/** The desktop runtime as first-run setup sees it: state to follow, never a connection to own. */
export interface LocalOnboardingRuntime {
    get(): DesktopRuntimeSnapshot;
    subscribe(listener: (snapshot: DesktopRuntimeSnapshot) => void): () => void;
    retry(): Promise<void>;
    localOnboardingResolve(connectionId: number): Promise<LocalHappyAgentOnboardingState>;
    localOnboardingFreshness(connectionId: number): Promise<"fresh" | "used">;
    localOnboardingProjectAdd(
        connectionId: number,
        path: string,
    ): Promise<{ readonly path: string }>;
}

/** The downloaded-daemon state first-run setup follows without owning it. */
export interface LocalOnboardingDaemon {
    get(): DesktopDaemonSnapshot;
    subscribe(listener: (snapshot: DesktopDaemonSnapshot) => void): () => void;
}

export interface LocalOnboardingOptions {
    readonly daemon?: LocalOnboardingDaemon;
    readonly recordPath: string;
    readonly runtime: LocalOnboardingRuntime;
    readonly probe?: () => Promise<LocalRuntimeProbe>;
    /** Looks for the machine's other coding apps, given the PATH the probe found. */
    readonly localAppsDetect?: (path: string | undefined) => Promise<LocalAppsSnapshot>;
    /** Opens the native folder picker; resolves to undefined when cancelled. */
    readonly directoryPick: () => Promise<string | undefined>;
    /**
     * Identity of the window currently presenting setup. It is read again at
     * every step of a long operation, so work started by a window that has since
     * been replaced stops instead of finishing on behalf of a reader who is no
     * longer there.
     */
    readonly presentation?: () => string;
}

/**
 * One durable action's claim on the reader and the machine it was started for.
 * `current` is asked again at every boundary the action crosses, because none of
 * what it captured is guaranteed to still be true on the other side of an await.
 */
interface LocalOnboardingWork {
    current(): boolean;
    readonly generation: string;
}

/**
 * Owns local first-run setup: what this machine has, what the person decided,
 * and which stage those two facts put setup in.
 *
 * Nothing here is a remembered position. Every stage is derived again from a
 * live login-shell probe, the desktop runtime's own state, the connected Happy Agent's
 * own catalog, and the durable record, so a restart, a reinstall that kept user
 * data, an interrupted install, a replaced Happy Agent data directory, or a Happy Agent that was
 * removed all resume at the truthful stage rather than at the one setup happened
 * to leave off at. The daemon is never started or stopped here — the desktop
 * runtime owns that, and it deliberately leaves the user's normal daemon running
 * when Happy exits.
 */
export class LocalOnboarding implements Disposable {
    private closed = false;
    private listeners = new Set<(snapshot: LocalOnboardingSnapshot) => void>();
    private busy = false;
    private message?: string;
    /** Why the machine could not be examined at all, kept apart from step messages. */
    private probeMessage?: string;
    private poll?: ReturnType<typeof setInterval>;
    private probing?: Promise<void>;
    private probed?: LocalRuntimeProbe;
    /** Looked for once per run, after the first probe that succeeds. */
    private localApps?: LocalAppsSnapshot;
    private localAppsDetecting = false;
    private probeRetry?: ReturnType<typeof setTimeout>;
    private probeRetryMs?: number;
    /**
     * Which question the probe in flight is answering. Anything that makes the
     * machine's facts obsolete advances it, so an answer to the previous
     * question is discarded rather than installed as if it were current.
     */
    private probeEpoch = 0;
    private probeRunId = 0;
    private freshness: LocalOnboardingFreshness = "checking";
    private happyAgentOnboarding?: LocalHappyAgentOnboardingState;
    /** The runtime connection the current freshness answer was read from. */
    private freshnessConnection?: number;
    /**
     * Whether the message on screen is only saying that Happy Agent is being asked what
     * happened. It stops being true the moment Happy Agent answers, so it is cleared then
     * rather than left standing over a step that has since moved on.
     */
    private messageAwaitsFreshness = false;
    /**
     * What a connection retry has already been asked for: the agent version
     * Happy installed. That arrival is what made another attempt worth making,
     * so one arrival buys exactly one attempt.
     */
    private retryRequestedFor?: string;
    /** What the daemon last said about whether this machine holds an agent. */
    private daemonInstallation?: "missing" | "installed";
    /**
     * The agent version this run of setup put on the machine, if it put one
     * there at all.
     *
     * An agent that was already here when Happy started is not this: the
     * difference decides whether a failing connection is worth one more attempt.
     * Something that has just arrived changes the machine the last attempt
     * failed against; something that was here all along does not, and retrying
     * against it would be attempting the same thing twice and calling it setup.
     */
    private agentInstalledHere?: string;
    /**
     * A connection Happy itself started, while it is running.
     *
     * The runtime deliberately keeps a failure on screen while it retries, which
     * is right for a person who pressed Try again and wrong for this: Happy
     * retries here because it has just removed the reason for the failure, so
     * the failure is stale from the moment the attempt begins. It is set before
     * the attempt is made, so no snapshot in between reports the old reason.
     */
    private connecting = false;
    /**
     * Whether the waiting poll's own connection attempt is still running, so the
     * attempts stay one at a time rather than queueing behind each other on a
     * daemon that is refusing every one of them.
     */
    private providersConnecting = false;
    /**
     * How many attempts the agent Happy just installed has already had.
     *
     * A freshly reloaded daemon is not listening the instant `reload` returns,
     * so one attempt is not enough and an unbounded run of them is a loop. This
     * counts the attempts made for the current arrival and stops at the ceiling,
     * where the failure is genuinely about the machine rather than about timing.
     */
    private connectAttempts = 0;
    private connectRetryTimer?: ReturnType<typeof setTimeout>;
    /**
     * Whether the person has passed the report of what this machine has. It
     * lives for this run only: it is not a decision about the machine, it is a
     * screen that has been read.
     */
    private assistantsAcknowledged = false;
    /**
     * The person chose to leave the provider-authentication report after its
     * checks found something usable. This is deliberately an in-memory
     * presentation decision: it neither changes provider config nor claims
     * credentials became valid.
     */
    private providerSetupAcknowledged = false;
    /**
     * A step the person deliberately went back to.
     *
     * Every stage is derived from what is true of the machine, so going back
     * cannot be a remembered position: it is one flag saying which finished
     * step is being looked at again, and finishing that step clears it and
     * hands the sequence back to the truth. Only one is ever set, which is what
     * keeps the flow linear.
     */
    private reopened?: LocalOnboardingStepBack;
    /** Where the sequence stands while a finished step is being looked at again. */
    private liveStage?: LocalOnboardingSnapshot["stage"];
    private runtimeKey?: string;
    /** Durable work runs one at a time, so two clicks cannot interleave writes. */
    private durableQueue: Promise<void> = Promise.resolve();
    /**
     * Whether a durable action has been admitted and not yet finished. It is set
     * before this method returns, so a second call in the same tick is refused
     * rather than queued behind the first.
     */
    private durablePending = false;
    private daemonUnsubscribe?: () => void;
    private runtimeUnsubscribe?: () => void;
    private snapshotValue: LocalOnboardingSnapshot = {
        busy: true,
        freshness: "checking",
        stage: "checking",
    };

    private constructor(
        private readonly options: LocalOnboardingOptions,
        private record: LocalOnboardingRecord,
    ) {}

    static async create(options: LocalOnboardingOptions): Promise<LocalOnboarding> {
        const record = (await localOnboardingRecordRead(options.recordPath)) ?? {
            version: recordVersion,
        };
        const onboarding = new LocalOnboarding(options, record);
        onboarding.daemonUnsubscribe = options.daemon?.subscribe(() => onboarding.refresh());
        onboarding.runtimeUnsubscribe = options.runtime.subscribe(() => onboarding.refresh());
        // The first look at the machine is the same decision as every later one:
        // it happens because Happy is being asked to run here, not because this
        // object was constructed.
        onboarding.refresh();
        return onboarding;
    }

    get(): LocalOnboardingSnapshot {
        return this.snapshotValue;
    }

    subscribe(listener: (snapshot: LocalOnboardingSnapshot) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Takes the report of what this machine has off the screen.
     *
     * Nothing durable is written, and nothing about the machine changes: the
     * person has read it, so setup stops showing it and goes on to whatever step
     * is actually true next. A restart replays it, which is right — a restart is
     * a new run, and after one the install it reported is no longer this run's
     * news either way.
     */
    assistantsContinue(): void {
        // The same button finishes a revisited step: whichever one is being
        // looked at again, continuing from it returns to the live sequence.
        // It must not also acknowledge the live subscriptions step beneath
        // that revisit — going Setup → Continue from Subscriptions still owes
        // Subscriptions, especially when no provider is usable yet.
        if (this.reopened !== undefined) {
            this.reopened = undefined;
            this.publish();
            return;
        }
        if (this.assistantsAcknowledged && this.providerSetupAcknowledged) return;
        this.assistantsAcknowledged = true;
        this.providerSetupAcknowledged = true;
        this.publish();
    }

    /**
     * Goes back to a step that is already done.
     *
     * Nothing is undone. Subscriptions un-acknowledges a report so the machine
     * is examined again; setup puts its finished step back on screen until it
     * is left. A step that is not behind the current one is refused,
     * because the bar only offers the ones that are.
     */
    stepBack(step: LocalOnboardingStepBack): void {
        if (this.closed) return;
        if (step === "subscriptions") {
            this.reopened = undefined;
            this.assistantsAcknowledged = false;
            this.providerSetupAcknowledged = false;
            this.publish();
            return;
        }
        this.reopened = step;
        this.publish();
    }

    /** Finishes the desktop decisions without discovering or registering a project. */
    async chiefOfStaffComplete(): Promise<void> {
        await this.durable("Happy could not finish setup", ["project"], async (working) => {
            await this.recordWrite({ ...this.record, chiefOfStaffSetup: true }, working.current);
        });
    }

    /**
     * Asks for a folder and registers it with Happy Agent as this machine's first
     * project.
     *
     * Happy Agent owns what a project is: `projects.add` decides whether the folder is a
     * Git top level, canonicalizes it, mints the project's identity, and answers
     * with the project entity. Happy asks no questions about the folder itself,
     * so there is nothing here that could disagree with the daemon about which
     * folders are acceptable. No session or chat is started — registering the
     * project is the whole of what the person asked for. It happens only while
     * this Happy Agent is demonstrably unused, so an established Happy Agent is never written to
     * on Happy's initiative.
     */
    async projectChoose(): Promise<void> {
        await this.durable("Happy could not open that project", ["project"], async (working) => {
            // Which Happy Agent said it was unused. Every conclusion below belongs to
            // this connection alone: a Happy Agent that has since been replaced answered
            // a different question, and its successor's answer is not this one's
            // to overwrite.
            const connection = this.freshnessConnection;
            const mine = () => working.current() && this.freshnessConnection === connection;
            const picked = await this.options.directoryPick();
            // Whether Happy Agent's own state changed is a fact about that Happy Agent, and it
            // outlives the document that asked. A reload cannot leave the same
            // still-connected Happy Agent described as unused when a project was just
            // registered with it, so this is asked for the connection alone.
            const reread = () => this.freshnessRecheck(connection);
            // A cancelled picker, a replaced window, a reloaded document, and a
            // replaced connection are all the same outcome here: nothing was
            // asked for, so nothing is said about it.
            if (!picked || !mine()) return;
            if (connection === undefined || this.freshness !== "fresh") {
                this.message = "Happy Agent is not ready for a first project yet.";
                return;
            }
            // Last look before the one thing here that changes someone else's
            // state.
            if (!mine()) return;
            let path: string;
            try {
                // Happy Agent answers with the project it holds, whose path is the
                // canonical one it stored — which is what setup shows, rather
                // than whatever the picker happened to hand over.
                path = (await this.options.runtime.localOnboardingProjectAdd(connection, picked))
                    .path;
            } catch (error) {
                const refusal = registrationRefusal(error);
                if (refusal) {
                    // Happy Agent decoded the request, examined it, and said no. That is a
                    // decision, not a lost answer: nothing was registered, so the
                    // step stays exactly as it is and nothing about this Happy Agent needs
                    // rereading. Only the reader who asked is told.
                    if (mine()) this.message = refusal;
                    return;
                }
                // The answer was lost rather than given, so Happy Agent may have committed
                // the project before it went. Nothing may be concluded — least of
                // all that it is safe to ask again. Freshness stops being an answer
                // and that Happy Agent is asked afresh, which is about the Happy Agent rather than
                // the document, so a reload does not leave a registered project
                // described as an unused Happy Agent. The step comes back only if its own
                // catalog still says it is unused.
                const rereading = reread();
                if (!mine()) return;
                this.message = rereading
                    ? `Happy could not confirm whether that project was registered: ${displayError(error)} Nothing has been repeated; Happy is asking Happy Agent what actually happened.`
                    : `Happy could not confirm whether that project was registered: ${displayError(error)} Nothing has been repeated.`;
                this.messageAwaitsFreshness = rereading;
                return;
            }
            if (mine()) {
                try {
                    await this.recordWrite({ ...this.record, projectPath: path }, mine);
                } catch {
                    // The project is registered with Happy Agent, and Happy Agent is what setup
                    // reads back. The remembered path is for display alone, so
                    // failing to write it must never be reported as a project that
                    // was not registered.
                    this.publish();
                }
            }
            // Whether setup is finished is Happy Agent's answer, not an assumption drawn
            // from a call that returned: the catalog that decided this step is read
            // again, and it now holds the project that was just registered.
            reread();
        });
    }

    [Symbol.dispose](): void {
        if (this.closed) return;
        this.closed = true;
        this.pollStop();
        this.probeRetryStop();
        this.connectAttemptsStop();
        this.daemonUnsubscribe?.();
        this.daemonUnsubscribe = undefined;
        this.runtimeUnsubscribe?.();
        this.runtimeUnsubscribe = undefined;
        this.listeners.clear();
    }

    /** Takes the message off screen, and with it the reason it was there. */
    private messageClear(): void {
        this.message = undefined;
        this.messageAwaitsFreshness = false;
    }

    /** Refuses an action that does not belong to the stage setup is actually on. */
    private stageRequire(...stages: readonly LocalOnboardingSnapshot["stage"][]): void {
        if (this.closed) throw new Error("First-run setup is closed.");
        if (!stages.includes(this.snapshotValue.stage))
            throw new Error("That first-run setup step is not the current one.");
    }

    /**
     * Admits one durable action and runs it alone.
     *
     * Admission is synchronous and happens before any microtask: the stage is
     * checked, a second request while one is outstanding is refused rather than
     * queued, and `busy` is true by the time this returns. The stage is then
     * checked again inside the task, because the world may have moved between
     * being admitted and being run — and a step that is no longer current is
     * abandoned silently rather than carried out late.
     */
    private durable(
        failure: string,
        stages: readonly LocalOnboardingSnapshot["stage"][],
        action: (working: LocalOnboardingWork) => Promise<void>,
    ): Promise<void> {
        this.stageRequire(...stages);
        if (this.durablePending)
            throw new Error("First-run setup is still working on the previous request.");
        // Who asked, captured while they are still the one asking.
        const generation = this.generation();
        const working: LocalOnboardingWork = {
            current: () =>
                !this.closed &&
                this.generation() === generation &&
                stages.includes(this.snapshotValue.stage),
            generation,
        };
        this.durablePending = true;
        this.busy = true;
        this.messageClear();
        this.publish();
        const run = this.durableQueue.then(async () => {
            try {
                if (!working.current()) return;
                await action(working);
            } catch (error) {
                // A failure belongs to whoever asked for the work. If they have
                // been replaced, the setup now on screen is not theirs to put an
                // error on, so it is dropped with the request it came from.
                if (working.current()) this.message = `${failure}: ${displayError(error)}`;
            } finally {
                this.durablePending = false;
                this.busy = false;
                this.publish();
            }
        });
        this.durableQueue = run.catch(() => undefined);
        return run;
    }

    /**
     * Who setup is working for right now: the window presenting it and the Happy Agent
     * connection behind it. A long operation reads this again before it does
     * anything irreversible, so work started for one reader and one Happy Agent never
     * lands on another.
     */
    private generation(): string {
        return `${this.options.presentation?.() ?? "window"}|${runtimeIdentity(
            this.options.runtime.get(),
        )}`;
    }

    /**
     * Re-examines the machine now; concurrent callers share one probe.
     *
     * A probe that was already in flight when its question stopped being the
     * current one is not the answer to the new one: it started before whatever
     * changed the machine, so its result is dropped and a fresh probe is what
     * anyone waiting gets.
     */
    private probeRun(): Promise<void> {
        if (this.closed) return Promise.resolve();
        this.probeRetryStop();
        if (this.probing) return this.probing;
        const epoch = this.probeEpoch;
        const runId = (this.probeRunId += 1);
        this.probing = (async () => {
            try {
                const probed = await (this.options.probe ?? localRuntimeProbe)();
                if (epoch !== this.probeEpoch) return;
                this.probed = probed;
                this.probeMessage = undefined;
                this.probeRetryMs = undefined;
                this.localAppsLook(probed);
            } catch (error) {
                if (epoch !== this.probeEpoch) return;
                // A probe that failed says nothing about the machine, and what
                // the last one found may already be false, so the facts are
                // dropped rather than shown as if they were current.
                this.probed = undefined;
                this.retryRequestedFor = undefined;
                this.probeMessage = `Happy could not examine this machine: ${displayError(error)}`;
                this.probeRetrySchedule();
            } finally {
                if (this.probeRunId === runId) this.probing = undefined;
                if (epoch === this.probeEpoch) this.refresh();
            }
        })();
        return this.probing;
    }

    private refresh(): void {
        if (this.closed) return;
        const runtime = this.options.runtime.get();
        const local = runtimeLocal(runtime);
        const previous = this.runtimeKey;
        const key = `${local ? "local" : "away"}:${runtimeIdentity(runtime)}`;
        this.runtimeKey = key;
        if (!local) {
            // Happy is being run somewhere else. Local setup has no opinion about
            // a machine nobody asked about, and no business examining it, asking
            // its daemon to start, or waiting for anything on it.
            this.probeRetryStop();
            this.retryRequestedFor = undefined;
            this.freshnessSynchronize(runtime);
            this.publish();
            return;
        }
        if (key !== previous) {
            // Each of these is new evidence about the machine rather than about
            // the connection: being asked to run here at all, a runtime that says
            // the agent is missing, and a connection that was replaced can each
            // mean a different machine than the one the last probe examined.
            const arrived = previous === undefined || previous.startsWith("away:");
            // With an agent Happy manages, none of the probe's original answers
            // are needed — it brings its own Node and its own agent — so the
            // machine used to go unexamined on this path entirely. The probe now
            // also carries which coding assistants are on the machine, which is
            // needed here exactly as much as anywhere else, so arriving is
            // reason enough to ask.
            if (
                arrived ||
                (!this.options.daemon && (runtime.phase === "error" || runtime.phase === "ready"))
            )
                void this.probeRun();
        }
        this.agentInstallWatch();
        this.connectionNudge(runtime);
        this.freshnessSynchronize(runtime);
        this.publish();
    }

    /**
     * Drops the current freshness answer and asks the connected Happy Agent again. It is
     * used where Happy stopped being able to vouch for what it last read — an
     * ambiguous write being the case that matters, since the alternative to
     * asking again is guessing about someone else's data.
     */
    private freshnessInvalidate(): void {
        this.freshness = "checking";
        this.happyAgentOnboarding = undefined;
        this.freshnessConnection = undefined;
        this.freshnessSynchronize(this.options.runtime.get());
    }

    /**
     * Asks one particular Happy Agent about itself again, and says whether it was asked.
     *
     * This is the connection half of ownership, deliberately separate from the
     * document half. Whether a Happy Agent still holds no projects is a fact about that
     * Happy Agent: once something has been registered with it, or may have been, the
     * answer Happy holds is stale no matter which window is on screen — so a
     * reload during the write must not leave a used Happy Agent described as unused, with
     * its first-project step still offered. The reread is bound to the runtime's
     * own connection identity, so an answer for a Happy Agent that has since been
     * replaced is discarded rather than landing on its successor, and a
     * connection that is already gone is left entirely alone: its successor was
     * asked its own question and this is not about it.
     */
    private freshnessRecheck(connection: number | undefined): boolean {
        const runtime = this.options.runtime.get();
        if (
            this.closed ||
            connection === undefined ||
            runtime.phase !== "ready" ||
            runtime.mode !== "local" ||
            runtime.connectionId !== connection
        )
            return false;
        this.freshnessInvalidate();
        return true;
    }

    /**
     * The three assistants as the login shell answered for them.
     *
     * The order is fixed rather than sorted by state: it is a short list a
     * person reads once, and one that rearranged itself between two probes would
     * make them find their place again for nothing.
     *
     * It says only what was asked — whether the command is on this machine —
     * and never whether it works. Two different screens read this, and what a
     * present command means differs between them: on the report after an install
     * it means the machine has it, and on the screen Happy Agent's refusal raises it
     * means the machine has it but nobody has signed in. That difference belongs
     * to the stage, which is the only thing that knows Happy Agent's answer.
     */
    /**
     * Looks once for the machine's other coding apps. They are only counted,
     * never shown, so one answer per run is enough and a failure stays unknown.
     */
    private localAppsLook(probed: LocalRuntimeProbe): void {
        if (this.localApps || this.localAppsDetecting) return;
        this.localAppsDetecting = true;
        const detect = this.options.localAppsDetect ?? ((path) => localAppsDetect({ path }));
        void detect(probed.environment.PATH)
            .catch(
                (): LocalAppsSnapshot => ({
                    agyCli: null,
                    antigravityApp: null,
                    claudeDesktop: null,
                    codexDesktop: null,
                }),
            )
            .then((found) => {
                this.localApps = found;
                this.localAppsDetecting = false;
                this.publish();
            });
    }

    private assistantsProject(): readonly LocalAssistantState[] {
        const commands = this.probed?.assistants ?? {};
        const refreshed = this.probed?.assistantsRefreshed ?? [];
        return LOCAL_ASSISTANT_IDS.map((id) => {
            const command = commands[id];
            return {
                ...(command ? { command } : {}),
                id,
                ...(command && refreshed.includes(id) ? { pathRefreshed: true as const } : {}),
                status: command ? ("found" as const) : ("missing" as const),
            };
        });
    }

    /**
     * Notices an agent arriving on this machine while setup is watching.
     *
     * Only the change is recorded, never the state: an agent that was already
     * installed when Happy started has always been there as far as this run is
     * concerned, and the whole point of the record is to tell that apart from
     * one Happy has just put down.
     */
    private agentInstallWatch(): void {
        const daemon = this.options.daemon?.get();
        if (!daemon) return;
        const previous = this.daemonInstallation;
        this.daemonInstallation = daemon.installation;
        if (previous === "missing" && daemon.installation === "installed")
            this.agentInstalledHere = daemon.installedVersion;
    }

    /**
     * Connects to the arrival that makes connecting worth trying again: the
     * agent Happy installed.
     *
     * That agent is given several attempts rather than one. Starting the daemon
     * returns when it has been asked to come up, not when its socket is
     * accepting, so the first attempt after an install regularly arrives too
     * early — and one attempt meant a person who had just watched a download
     * complete was shown a connection failure with nothing left to do but press
     * a button Happy could press itself. The attempts are spaced, bounded, and
     * reported as the install still running, so what is on screen stays
     * "Starting…" until it is genuinely ready or genuinely will not come up.
     *
     * Where Happy manages no agent there is nothing to wait for, so the arrival
     * buys exactly one attempt.
     *
     * This runs here rather than in the window because the agent has only just
     * been put on the machine, and a round trip out to a renderer and back is
     * long enough to paint the failure the install has already fixed.
     */
    private connectionNudge(runtime: DesktopRuntimeSnapshot): void {
        const daemon = this.options.daemon?.get();
        // The install starts the agent itself and says so meanwhile. Attempting
        // a connection across that would race the daemon's own reload.
        if (daemon?.operation === "installing") return;
        // Happy installs the agent, so its arrival is the install's own record.
        // A host that manages no agent has nothing to nudge for.
        const arrival = this.agentInstalledHere;
        if (!arrival) {
            this.retryRequestedFor = undefined;
            this.connectAttemptsStop();
            return;
        }
        if (runtime.phase === "ready") {
            this.connectAttemptsStop();
            return;
        }
        if (runtime.phase !== "error") return;
        if (this.retryRequestedFor !== arrival) {
            // A different arrival than the one the attempts so far were for, so
            // they start again from the beginning for this one.
            this.retryRequestedFor = arrival;
            this.connectAttempts = 0;
        }
        const ceiling = this.options.daemon ? startAttempts : 1;
        // The daemon came up and refused for a reason no number of attempts can
        // change: nothing on this machine is signed in. That is a screen, not a
        // timing problem, so the attempts are spent rather than spread over the
        // next fifteen seconds in front of somebody waiting to be told.
        if (providersMissingParse(runtime.message)) {
            this.connectAttempts = ceiling;
            this.connectRetryClear();
            return;
        }
        if (this.connectAttempts >= ceiling || this.connecting || this.connectRetryTimer) return;
        this.connectAttempts += 1;
        this.connecting = true;
        void this.options.runtime
            .retry()
            .catch(() => undefined)
            .finally(() => {
                this.connecting = false;
                if (this.closed) return;
                // However it went, the runtime's own snapshot now answers for
                // it: ready, or a failure that is genuinely about the machine as
                // it stands rather than as it stood before the install.
                const current = this.options.runtime.get();
                if (current.phase === "error" && this.connectAttempts < ceiling)
                    this.connectRetrySchedule();
                this.publish();
            });
    }

    /**
     * Waits out the gap between a daemon being told to start and that daemon
     * answering. `connecting` stays set across the wait, so the screen keeps
     * saying the install is still running rather than flickering the stale
     * failure between two attempts.
     */
    private connectRetrySchedule(): void {
        this.connecting = true;
        this.connectRetryTimer = setTimeout(() => {
            this.connectRetryTimer = undefined;
            this.connecting = false;
            if (this.closed) return;
            this.connectionNudge(this.options.runtime.get());
            // Only when the attempts are over. One that starts leaves the screen
            // exactly as it was, and publishes for itself when it ends.
            if (!this.connecting) this.publish();
        }, startAttemptSpacingMs);
        this.connectRetryTimer.unref?.();
    }

    /** Ends the waiting without forgetting how many attempts have been made. */
    private connectRetryClear(): void {
        if (!this.connectRetryTimer) return;
        clearTimeout(this.connectRetryTimer);
        this.connectRetryTimer = undefined;
        this.connecting = false;
    }

    private connectAttemptsStop(): void {
        this.connectAttempts = 0;
        this.connectRetryClear();
    }

    /**
     * Keeps freshness tied to the Happy Agent that answered it. Anything other than a
     * live local connection means there is no Happy Agent to be fresh, and a different
     * connection identity is a different Happy Agent until its own catalog says
     * otherwise — a Happy Agent whose data directory was replaced included.
     */
    private freshnessSynchronize(runtime: DesktopRuntimeSnapshot): void {
        if (runtime.phase !== "ready" || runtime.mode !== "local") {
            this.freshness = "checking";
            this.happyAgentOnboarding = undefined;
            this.freshnessConnection = undefined;
            return;
        }
        if (this.freshnessConnection === runtime.connectionId) return;
        this.freshnessConnection = runtime.connectionId;
        this.freshness = "checking";
        void this.freshnessRead(runtime.connectionId);
    }

    /**
     * Reads whether this Happy Agent holds any project of its own through the
     * agent client's bounded installation discovery and authoritative catalog. Any project
     * other than Happy Agent's automatic home project counts as prior use, including an
     * archived one, because archiving work does not make the Happy Agent new again.
     */
    private async freshnessRead(connectionId: number): Promise<void> {
        let freshness: LocalOnboardingFreshness;
        let onboarding: LocalHappyAgentOnboardingState | undefined;
        try {
            onboarding = await this.options.runtime.localOnboardingResolve(connectionId);
            freshness =
                onboarding.state === "complete"
                    ? await this.options.runtime.localOnboardingFreshness(connectionId)
                    : "checking";
        } catch (error) {
            freshness = "error";
            onboarding = undefined;
            this.message = displayError(error);
        }
        if (this.closed || this.freshnessConnection !== connectionId) return;
        this.freshness = freshness;
        this.happyAgentOnboarding = onboarding;
        if (onboarding) this.message = undefined;
        // Happy Agent has now said what happened — used, fresh, or unreadable — so a
        // message that existed only to say it was being asked has nothing left
        // to report.
        if (this.messageAwaitsFreshness) this.messageClear();
        this.publish();
    }

    /**
     * Commits answers for a reader who is still the one giving them. The write
     * is abandoned at the last moment if they are not, and nothing is remembered
     * or published on their successor's behalf.
     */
    private async recordWrite(
        record: LocalOnboardingRecord,
        authorized: () => boolean,
    ): Promise<boolean> {
        const committed = await localOnboardingRecordWrite(
            this.options.recordPath,
            record,
            authorized,
        );
        if (!committed) return false;
        this.record = record;
        this.messageClear();
        this.publish();
        return true;
    }

    private publish(): void {
        if (this.closed) return;
        const snapshot = this.snapshotBuild();
        this.snapshotValue = snapshot;
        this.pollSynchronize(snapshot.stage);
        for (const listener of this.listeners) listener(snapshot);
    }

    private snapshotBuild(): LocalOnboardingSnapshot {
        const probe = this.probed;
        const daemon = this.options.daemon?.get();
        const runtime = this.options.runtime.get();
        const ready = runtime.phase === "ready" && runtime.mode === "local";
        const node =
            probe?.nodeCommand && probe.nodeVersion
                ? { path: probe.nodeCommand, version: probe.nodeVersion }
                : undefined;
        const stage = this.stageDerive({
            daemon,
            local: runtimeLocal(runtime),
            node: !!node,
            probed: !!probe,
            ready,
        });
        const message = this.messageFor(stage, runtime);
        const assistants =
            stage === "providersMissing" || stage === "assistantsFound"
                ? this.assistantsProject()
                : undefined;
        const retrying = runtime.phase === "error" && runtime.retrying === true;
        // Only the first install is watched here. A background update fetched
        // for a machine that already works is not a step of setting one up, and
        // this snapshot has no business reporting it.
        const download = stage === "daemonDownload" ? daemon?.download : undefined;
        return {
            busy:
                this.busy ||
                stage === "checking" ||
                stage === "examining" ||
                // Nothing to press and nothing to decide: this stage is the
                // install seeing itself through.
                stage === "daemonStarting" ||
                (stage === "daemonDownload" && daemon?.operation === "installing"),
            ...(download ? { download } : {}),
            freshness: this.freshness,
            ...(message ? { message } : {}),
            ...(assistants ? { assistants, installShell: localInstallShell() } : {}),
            ...(assistants && this.localApps ? { localApps: this.localApps } : {}),
            ...(this.liveStage ? { reachedStage: this.liveStage } : {}),
            ...(retrying ? { retrying } : {}),
            ...(node ? { node } : {}),
            ...(this.record.projectPath ? { projectPath: this.record.projectPath } : {}),
            stage,
        };
    }

    private stageDerive(facts: {
        readonly daemon?: DesktopDaemonSnapshot;
        readonly local: boolean;
        readonly node: boolean;
        readonly ready: boolean;
        readonly probed: boolean;
    }): LocalOnboardingSnapshot["stage"] {
        if (!facts.local) return "inactive";
        if (facts.daemon) {
            // Whether the agent is here at all, never whether bytes are moving.
            // Happy downloads a found update on its own, and a machine that is
            // already set up and working must not be dropped back into setup
            // because a background download started: downloading interrupts
            // nobody, so it stays where it can be ignored. Setup keeps the
            // window through a first download because nothing is installed yet,
            // which this already says.
            if (facts.daemon.installation === "missing") return "daemonDownload";
            if (!facts.ready) {
                // The agent is here because Happy has just put it here. Starting
                // it and reaching it for the first time are the rest of that
                // install rather than a connection that failed, and they are
                // reported on the screen the person is already watching.
                if (this.agentStarting(facts.daemon)) return "daemonStarting";
                const runtime = this.options.runtime.get();
                return runtime.phase === "error" ? "connectFailed" : "connecting";
            }
        }
        if (!facts.ready) {
            if (!facts.probed) return "checking";
            if (!facts.node) return "nodeMissing";
            const runtime = this.options.runtime.get();
            if (this.connecting) return "connecting";
            if (runtime.phase !== "error") return "connecting";
            // A daemon that refuses only because no coding assistant is signed in
            // is not a broken daemon. Telling someone their Happy Agent is unreachable
            // when it is running perfectly well sends them to repair the wrong
            // thing, so this gets its own stage and its own, calmer screen.
            return providersMissingParse(runtime.message) ? "providersMissing" : "connectFailed";
        }
        const onboarding = this.happyAgentOnboarding;
        if (!onboarding) return this.freshness === "error" ? "connectFailed" : "examining";
        const next = ((): LocalOnboardingSnapshot["stage"] => {
            switch (onboarding.state) {
                case "provider_setup":
                    if (!this.providerSetupAcknowledged) return "providersMissing";
                // falls through
                case "complete":
                    return this.freshness === "fresh" && !this.record.chiefOfStaffSetup
                        ? "project"
                        : "complete";
                case "happy_agent_unreachable":
                    return "connectFailed";
            }
        })();
        // The agent is answering and the machine was read on the way here, so
        // what it turned out to have goes in front of the steps that are still
        // owed — which is where somebody wants it, since a machine with no
        // assistant on it is worth knowing about before picking a folder for it.
        //
        // It is tied to the steps that remain rather than to an install Happy
        // watched happen: whether this run was the one that fetched the agent is
        // a fact about Happy, and every way of arriving at unfinished setup
        // deserves the same report. A machine with nothing left to do never sees
        // it, because there is nothing for it to go in front of.
        const live =
            next === "project" && !this.assistantsAcknowledged && this.probed
                ? "assistantsFound"
                : next;
        // A step somebody went back to, shown only while the sequence has
        // genuinely moved past it. The step that would be current is reported
        // alongside, so the bar keeps drawing the work already done rather
        // than unwinding it.
        if (this.reopened === "setup") {
            this.liveStage = live;
            return "agentReady";
        }
        this.liveStage = undefined;
        return live;
    }

    /**
     * Whether what is happening is the tail of an install Happy performed: the
     * agent being started by that install, or the first connection to it.
     *
     * Both are things Happy is doing, not things that have gone wrong, and
     * neither is over until the runtime says so.
     */
    private agentStarting(daemon: DesktopDaemonSnapshot): boolean {
        if (daemon.operation === "installing") return true;
        // With an agent Happy manages, the only connection it starts by itself
        // is the one that follows an install it just performed.
        return this.connecting && this.retryRequestedFor === this.agentInstalledHere;
    }

    private messageFor(
        stage: LocalOnboardingSnapshot["stage"],
        runtime: DesktopRuntimeSnapshot,
    ): string | undefined {
        if (this.message) return this.message;
        if (stage === "daemonDownload") {
            const daemon = this.options.daemon?.get();
            return daemon?.error ?? daemon?.message;
        }
        if (stage === "daemonStarting") {
            const daemon = this.options.daemon?.get();
            // The install narrates its own half. Once it has finished, what is
            // left is this window reaching an agent that is already running, and
            // the screen says that better than the daemon's last line about
            // itself would.
            return daemon?.operation === "installing" ? daemon.message : undefined;
        }
        if (stage === "checking") return this.probeMessage;
        if (stage === "connectFailed" && runtime.phase === "error") return runtime.message;
        if (stage === "connectFailed") return onboardingFailureMessage(this.happyAgentOnboarding);
        return undefined;
    }

    /**
     * Keeps the waiting poll running for exactly the stages that wait on the
     * person doing something outside Happy, and stops it everywhere else so a
     * finished setup does no work. A failed connection waits here too: the agent
     * it was connecting to may have been removed, and only another probe can
     * find that out.
     */
    private pollSynchronize(stage: LocalOnboardingSnapshot["stage"]): void {
        const waiting =
            stage === "nodeMissing" ||
            stage === "connectFailed" ||
            stage === "providersMissing" ||
            // The subscriptions report waits on something done outside Happy
            // exactly as the others do: an assistant being installed or signed
            // in while the person is looking at the screen that says it is not.
            stage === "assistantsFound";
        if (waiting && !this.poll) {
            this.poll = setInterval(() => {
                void this.probeRun();
                // The stage is read at the tick rather than captured when the
                // interval was made: one interval outlives several waiting
                // stages, and a poll still asking the question its first stage
                // needed is watching for something nobody is waiting on.
                if (this.snapshotValue.stage === "providersMissing") this.providersRecheck();
            }, waitingPollMs);
            this.poll.unref?.();
        } else if (!waiting) this.pollStop();
    }

    /**
     * Asks again whether anything on this machine is signed in yet.
     *
     * Which question that is depends on where the refusal came from, and the
     * two are not the same question. A connected Happy Agent reporting provider
     * setup answers it itself, so its answer is dropped and read again. A daemon
     * that refused to start for the same reason is not connected at all, and
     * nothing it has said can change until something tries to start it again —
     * so the connection is what is retried there. Without that, signing in to an
     * assistant left this screen standing with nothing on it to press and
     * nothing behind it looking, which is a dead end rather than a step.
     *
     * The attempt is deliberately not `connecting`: that flag means an install
     * Happy is seeing through, and borrowing it here would swap this screen for
     * a connecting one every few seconds while the person is reading it.
     */
    private providersRecheck(): void {
        if (this.options.runtime.get().phase !== "error") {
            this.freshnessInvalidate();
            return;
        }
        if (this.providersConnecting) return;
        this.providersConnecting = true;
        void this.options.runtime
            .retry()
            .catch(() => undefined)
            .finally(() => {
                this.providersConnecting = false;
                if (!this.closed) this.publish();
            });
    }

    private pollStop(): void {
        if (!this.poll) return;
        clearInterval(this.poll);
        this.poll = undefined;
    }

    private probeRetrySchedule(): void {
        this.probeRetryMs = Math.min(
            this.probeRetryMs ? this.probeRetryMs * 2 : probeRetryMinimumMs,
            probeRetryMaximumMs,
        );
        this.probeRetry = setTimeout(() => {
            this.probeRetry = undefined;
            void this.probeRun();
        }, this.probeRetryMs);
        this.probeRetry.unref?.();
    }

    private probeRetryStop(): void {
        if (!this.probeRetry) return;
        clearTimeout(this.probeRetry);
        this.probeRetry = undefined;
    }
}

/** Identity of the runtime state setup reacts to: its phase, and which connection. */
function runtimeIdentity(runtime: DesktopRuntimeSnapshot): string {
    return runtime.phase === "ready" ? `ready:${runtime.connectionId}` : runtime.phase;
}

/**
 * Whether Happy is being asked to run on this machine. Choosing has not asked
 * for anything yet, a ready runtime says which mode it is in, and every other
 * phase is working on a request that names one.
 */
function runtimeLocal(runtime: DesktopRuntimeSnapshot): boolean {
    if (runtime.phase === "choosing") return false;
    if (runtime.phase === "ready") return runtime.mode === "local";
    return runtime.request.mode === "local";
}

function onboardingFailureMessage(
    state: LocalHappyAgentOnboardingState | undefined,
): string | undefined {
    if (!state) return undefined;
    if ("message" in state && state.message) return state.message;
    return undefined;
}

/**
 * What to tell the person when Happy Agent refused the registration, or nothing when the
 * answer never arrived at all.
 *
 * Every decoded `ProjectRegistrationError` is a decision Happy Agent reached and
 * reported: it read the request, refused it, and registered nothing. So all of
 * them are definitive, none of them leaves the outcome in doubt, and none of them
 * is a reason to go back and ask Happy Agent what happened — there is nothing to
 * reconcile. Only a lost or unreadable answer is ambiguous, and that arrives as a
 * `ProjectRegistrationProtocolError` or a transport failure, which this reports
 * nothing about.
 *
 * Most codes describe the chosen folder, and each is said in terms of the choice
 * the person just made rather than by repeating Happy Agent's own wording. The two that
 * describe Happy's request instead are still definitive, and are said as what
 * they are: nothing was registered, and choosing the same folder again is a
 * reasonable thing to try.
 */
function registrationRefusal(error: unknown): string | undefined {
    if (!(error instanceof ProjectRegistrationError)) return undefined;
    switch (error.code) {
        case "not_git_repository":
            return "That folder is not in a Git repository. Choose a folder with a Git repository in it, or run `git init` there first.";
        case "not_git_top_level":
            return "That folder is inside a Git repository rather than at its root. Choose the repository's own folder instead.";
        case "not_directory":
            return "That is a file, not a folder. Choose the folder holding your repository.";
        case "path_missing":
            return "That folder no longer exists. Choose one that does.";
        case "path_inaccessible":
            return "Happy Agent cannot read that folder. Choose one you have access to.";
        case "managed_workspace_unavailable":
            return "Happy Agent cannot prepare workspaces for that repository yet. Choose another project to start with.";
        case "invalid_request":
            return "Happy Agent did not accept how Happy asked for that project, so nothing was registered. Try choosing the folder again.";
        case "project_id_conflict":
            return "Happy Agent is already using the identity Happy chose for that project, so nothing was registered. Try choosing the folder again.";
    }
}

function displayError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Windows' official installers are PowerShell one-liners; everywhere else they are POSIX shell. */
function localInstallShell(): "powershell" | "posix" {
    return process.platform === "win32" ? "powershell" : "posix";
}
