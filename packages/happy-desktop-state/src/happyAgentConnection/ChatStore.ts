import type {
    ChatDelta,
    ChatElement,
    ProtocolSession,
    SessionState,
    SessionStreamHello,
} from "./types.js";

/**
 * Small framework-independent holder used by compatibility consumers.
 *
 * The Happy Agent connection owns transport reconciliation. This class exists
 * for callers that need the old immutable `elements()` / `session()` boundary
 * without importing the retired connector.
 */
export class ChatStore {
    #elements: readonly ChatElement[] = [];
    #session: SessionState;

    constructor(sessionId: string) {
        this.#session = emptySession(sessionId);
    }

    elements(): readonly ChatElement[] {
        return this.#elements;
    }

    session(): SessionState {
        return this.#session;
    }

    replace(elements: readonly ChatElement[], session: SessionState): readonly ChatDelta[] {
        const deltas: ChatDelta[] = [];
        if (elements !== this.#elements) {
            this.#elements = elements;
            deltas.push({ type: "elements_changed", elements });
        }
        if (session !== this.#session) {
            this.#session = session;
            deltas.push({ type: "session_changed", session });
        }
        return deltas;
    }

    applySessionSnapshot(snapshot: ProtocolSession): readonly ChatDelta[] {
        const previous = this.#session;
        const next: SessionState = {
            ...previous,
            ...snapshot,
            sessionId: snapshot.id,
            // Sparse authoritative snapshots retain collections they omit. An
            // explicitly present empty collection still clears the old value.
            backgroundProcesses: presentOr(
                snapshot,
                "backgroundProcesses",
                previous.backgroundProcesses,
            ),
            slashCommands: presentOr(snapshot, "slashCommands", previous.slashCommands),
            subagents: presentOr(snapshot, "subagents", previous.subagents),
            tasks: presentOr(snapshot, "tasks", previous.tasks),
            ...(Object.hasOwn(snapshot, "goal")
                ? snapshot.goal === undefined
                    ? withoutGoal(previous, snapshot)
                    : { goal: snapshot.goal }
                : previous.goal === undefined
                  ? {}
                  : { goal: previous.goal }),
        };
        this.#session = next;
        return next === previous ? [] : [{ type: "session_changed", session: next }];
    }

    applyHello(hello: SessionStreamHello): readonly ChatDelta[] {
        if (hello.session === undefined) {
            if (this.#session.connection === hello.connection) return [];
            this.#session = { ...this.#session, connection: hello.connection };
            return [
                { type: "connection_changed", connection: hello.connection },
                { type: "session_changed", session: this.#session },
            ];
        }
        return this.replace(this.#elements, {
            ...hello.session,
            connection: hello.connection,
        });
    }
}

function presentOr<T extends object, K extends keyof T, Fallback extends NonNullable<T[K]>>(
    value: T,
    key: K,
    fallback: Fallback,
): Fallback {
    return (Object.hasOwn(value, key) ? value[key] : fallback) as Fallback;
}

function withoutGoal(
    previous: SessionState,
    snapshot: ProtocolSession,
): Omit<SessionState, "goal"> {
    const merged = { ...previous, ...snapshot, sessionId: snapshot.id };
    delete merged.goal;
    return merged;
}

function emptySession(sessionId: string): SessionState {
    return {
        historyLoading: true,
        selectionKnown: false,
        activity: { kind: "idle", label: "Idle", since: 0 },
        status: "idle",
        archived: false,
        sessionId,
        ownerInstanceId: "unknown",
        scope: { kind: "unsorted" },
        cwd: "",
        modelId: "",
        providerId: "",
        titleStatus: "idle",
        permissionMode: "auto",
        modelLocked: false,
        modelCatalog: {
            defaultModelId: "",
            defaultProviderId: "",
            models: [],
            providers: [],
        },
        models: [],
        pendingUserInputs: [],
        pendingSteeringMessages: [],
        slashCommands: [],
        tasks: [],
        subagents: [],
        backgroundProcesses: [],
        connection: "connecting",
        transcriptComplete: true,
        loadingMore: false,
    };
}
