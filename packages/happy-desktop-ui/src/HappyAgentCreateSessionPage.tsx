import type { CSSProperties, KeyboardEvent } from "react";
import { useCallback } from "react";
import type {
    HappyAgentCreateKind,
    HappyAgentMenusSnapshot,
    HappyAgentModelSelection,
    HappyAgentPermissionMode,
    HappyAgentServiceTier,
    HappyAgentThinkingLevel,
} from "happy-desktop-state";
import { Banner } from "./Banner";
import { KeyCap } from "./Badge";
import { Button } from "./Button";
import { LottieScene } from "./LottieScene";
import { ScrollArea, ScrollbarTracks, useScrollbarController } from "./Scrollbar";
import { SegmentedControl } from "./SegmentedControl";
import { Select, type SelectOption } from "./Select";

/** What the surface is titled, by what it is currently making. */
const KIND_TITLE: Record<HappyAgentCreateKind, string> = {
    bot: "New bot",
    task: "New task",
};

/**
 * Separator between provider and model in a select option value. A space is
 * safe: neither a provider nor a model identifier contains one.
 */
const MODEL_VALUE_SEP = " ";
/** Stands for "no tier chosen", which a select cannot express as undefined. */
const SERVICE_TIER_OFF = "__happy_agent_service_tier_off__";

/** One place a session can be started: a project, or a worktree inside one. */
export interface HappyAgentCreateSessionDestination {
    readonly id: string;
    readonly label: string;
    /**
     * The project a worktree belongs to. Absent on a project itself, so the
     * list can say "happy · review-fixes" rather than a bare worktree name
     * that means nothing on its own.
     */
    readonly parentLabel?: string;
    /** Where a session started here runs, as the host presents the path. */
    readonly displayPath: string;
}

export type HappyAgentCreateSessionPageProps = {
    /** Which of the two things this surface is currently making. */
    kind: HappyAgentCreateKind;
    /** Every project and worktree offered, in the order the sidebar lists them. */
    destinations: readonly HappyAgentCreateSessionDestination[];
    /** The one chosen; absent while the machine has offered nothing to choose. */
    destinationId?: string;
    /** True while the machine's project list is still being read. */
    destinationsLoading?: boolean;
    /** The task. Owned by the caller, so it survives this being re-rendered. */
    text: string;
    /** Model, effort, access, and speed options; absent until the catalog is read. */
    menus?: HappyAgentMenusSnapshot;
    /** True while a session is being started: the surface stays up and inert. */
    submitting?: boolean;
    /** A failed start, stated here rather than thrown away. */
    error?: string;
    /** Why the draft cannot currently be submitted to its Happy Agent. */
    submitDisabledReason?: string;
    onKindSelect: (kind: HappyAgentCreateKind) => void;
    onDestinationSelect: (id: string) => void;
    onTextChange: (text: string) => void;
    onModelChange: (selection: HappyAgentModelSelection) => void;
    onEffortChange: (effort?: HappyAgentThinkingLevel) => void;
    onPermissionModeChange: (mode: HappyAgentPermissionMode) => void;
    onServiceTierChange: (tier?: HappyAgentServiceTier) => void;
    onSubmit: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/** A destination's full name: the worktree under the project that holds it. */
function destinationLabel(destination: HappyAgentCreateSessionDestination): string {
    return destination.parentLabel
        ? `${destination.parentLabel} · ${destination.label}`
        : destination.label;
}

/** What sits under the destination once one is chosen, or in place of one. */
function destinationDetail(
    chosen: HappyAgentCreateSessionDestination | undefined,
    loading: boolean,
): string {
    if (chosen) return chosen.displayPath;
    return loading
        ? "Reading this machine's projects…"
        : "This machine has no project to start a session in.";
}

/**
 * C-238 HappyAgentCreateSessionPage — the window's "Create", as a destination
 * rather than a card over one. Choosing Create takes the whole content region:
 * there is nothing behind it to keep in view, so the surface is empty except for
 * one column standing in the middle of it.
 *
 * The column opens with the mark and the title, because arriving somewhere
 * should say where you are, and then a two-way choice of what to make. A task is
 * work in a project that ends; a bot is a colleague whose name comes from its
 * first message. Switching between them preserves the task draft; the bot
 * opens an empty conversation without a naming form.
 *
 * Beyond that the surface stays empty on purpose: no toolbar, no list of what
 * the window was showing a moment ago. The column is capped at 640px, because a
 * task worth starting a session for rarely fits on one line and never wants a
 * full-width measure.
 *
 * Every choice is a native select rather than a popover menu, drawn by the
 * platform so a model catalog can always be read in full.
 *
 * Props only, and every state is directly renderable: either tab, empty,
 * written, a task too long for the field, a machine still reading its projects,
 * a machine with none, a start in flight, and a start that failed. The task draft
 * belongs to the caller, so navigating away and back preserves it.
 */
export function HappyAgentCreateSessionPage(props: HappyAgentCreateSessionPageProps) {
    const scrollbarController = useScrollbarController("vertical");
    const promptHost = useCallback(
        (node: HTMLDivElement | null) => scrollbarController.hostSet(node),
        [scrollbarController],
    );
    // Arriving puts the caret in the field, and behind whatever is already
    // written: a task offered back from a previous visit is one to carry on
    // with, not one to type in front of. A stable callback rather than an inline
    // one so React runs it when the field appears rather than on every render.
    const promptMount = useCallback(
        (node: HTMLTextAreaElement | null) => {
            scrollbarController.viewportSet(node);
            if (!node) return;
            node.focus();
            node.setSelectionRange(node.value.length, node.value.length);
        },
        [scrollbarController],
    );
    const submitting = props.submitting === true;
    const loading = props.destinationsLoading === true;
    const menus = props.menus;
    const bot = props.kind === "bot";
    const chosen = props.destinations.find((destination) => destination.id === props.destinationId);
    // A bot starts empty; its first message supplies the naming context.
    const submittable =
        (bot || (props.text.trim().length > 0 && chosen !== undefined)) &&
        !submitting &&
        props.submitDisabledReason === undefined;
    const destinationOptions: SelectOption[] = props.destinations.map((destination) => ({
        label: destinationLabel(destination),
        value: destination.id,
    }));
    const modelOptions: SelectOption[] = (menus?.modelOptions ?? []).map((option) => ({
        label: option.name,
        value: `${option.providerId}${MODEL_VALUE_SEP}${option.modelId}`,
        ...(option.disabled ? { disabled: true } : {}),
    }));
    const effortOptions: SelectOption[] = (menus?.effortOptions ?? []).map((option) => ({
        label: option.isDefault ? `${option.label} (default)` : option.label,
        value: option.level,
    }));
    const permissionOptions: SelectOption[] = (menus?.permissionModeOptions ?? []).map(
        (option) => ({
            label: option.label,
            value: option.mode,
        }),
    );
    const tierOptions: SelectOption[] = (menus?.serviceTierOptions ?? []).map((option) => ({
        label: option.label,
        value: option.tier ?? SERVICE_TIER_OFF,
    }));
    const currentModel = menus?.modelOptions.find((option) => option.current);
    const currentEffort = menus?.effortOptions.find((option) => option.current);
    const currentTier = menus?.serviceTierOptions.find((option) => option.current);
    const onPromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
        // Enter writes a new line — a task is prose — so starting the session
        // takes the deliberate chord, the same one the composer sends with.
        if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        if (submittable) props.onSubmit();
    };
    return (
        <ScrollArea
            className={["happy-agent-create-session-page", props.className]
                .filter(Boolean)
                .join(" ")}
            data-happy-desktop-ui="happy-agent-create-session-page"
            data-testid={props["data-testid"]}
            style={props.style}
            viewportClassName="happy-agent-create-session-page__viewport"
        >
            <div
                className="happy-agent-create-session"
                data-happy-desktop-ui="happy-agent-create-session"
            >
                <header
                    className="happy-agent-create-session__header"
                    data-happy-desktop-ui="happy-agent-create-session-header"
                >
                    {/* The one thing on the page that is not a control. A chick
                        is hatching: something small and new is about to come out
                        of this. The stage keeps its square whether the runtime
                        arrives or not, so the column never moves under it. */}
                    <span
                        className="happy-agent-create-session__stage"
                        data-happy-desktop-ui="happy-agent-create-session-stage"
                    >
                        <LottieScene
                            name="hatching-chick"
                            replayLabel={KIND_TITLE[props.kind]}
                            size={96}
                        />
                    </span>
                    <h1
                        className="happy-agent-create-session__title"
                        data-happy-desktop-ui="happy-agent-create-session-title"
                    >
                        {KIND_TITLE[props.kind]}
                    </h1>
                </header>
                {/* The two things this machine can be asked for. A pick rather
                    than two routes: the drafts sit beside each other and the
                    reader changes their mind about which one they are writing
                    without losing the other. */}
                <div
                    className="happy-agent-create-session__kinds"
                    data-happy-desktop-ui="happy-agent-create-session-kinds"
                >
                    <SegmentedControl
                        aria-label="What to create"
                        data-testid="happy-agent-create-session-kind"
                        disabled={submitting}
                        onChange={(value) => props.onKindSelect(value as HappyAgentCreateKind)}
                        segments={[
                            { icon: "tasks", label: "Task", value: "task" },
                            { icon: "agents", label: "Bot", value: "bot" },
                        ]}
                        size="small"
                        value={props.kind}
                    />
                </div>
                {props.submitDisabledReason ? (
                    <Banner tone="neutral" title="Happy Agent reconnecting">
                        {props.submitDisabledReason}
                    </Banner>
                ) : null}
                {/* Keep the page's frame stable when switching creation kinds. */}
                <div
                    className="happy-agent-create-session__body"
                    data-happy-desktop-ui="happy-agent-create-session-body"
                >
                    {bot ? (
                        <div
                            className="happy-agent-create-session__bot"
                            data-happy-desktop-ui="happy-agent-create-session-bot"
                        >
                            <p
                                className="happy-agent-create-session__note"
                                data-happy-desktop-ui="happy-agent-create-session-note"
                            >
                                A bot is one permanent conversation with a folder of its own. Tell
                                it what to do in your first message and it will name itself.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div
                                className="happy-agent-create-session__prompt"
                                data-happy-desktop-ui="happy-agent-create-session-prompt"
                                data-scrollbar-axes="vertical"
                                data-scrollbar-host=""
                                data-scrollbar-placement="gutter"
                                ref={promptHost}
                            >
                                <textarea
                                    aria-label="Task"
                                    className="happy-agent-create-session__input"
                                    data-happy-desktop-ui="happy-agent-create-session-input"
                                    onInput={(event) =>
                                        props.onTextChange(event.currentTarget.value)
                                    }
                                    onKeyDown={onPromptKeyDown}
                                    placeholder="What should the agent do?"
                                    // Read-only rather than disabled while a start is
                                    // in flight: the task stays selectable and the
                                    // caret stays in it, so a start that fails is
                                    // carried on with rather than found again.
                                    readOnly={submitting}
                                    ref={promptMount}
                                    value={props.text}
                                />
                                <ScrollbarTracks controller={scrollbarController} />
                            </div>
                            <div
                                className="happy-agent-create-session__where"
                                data-happy-desktop-ui="happy-agent-create-session-where"
                            >
                                <Select
                                    className="happy-agent-create-session__destination"
                                    data-testid="happy-agent-create-session-destination"
                                    disabled={submitting || destinationOptions.length === 0}
                                    label="Project"
                                    onValueChange={(value) => props.onDestinationSelect(value)}
                                    options={destinationOptions}
                                    placeholder={loading ? "Reading projects…" : "Choose a project"}
                                    size="small"
                                    {...(props.destinationId === undefined
                                        ? {}
                                        : { value: props.destinationId })}
                                />
                                <span
                                    className="happy-agent-create-session__path"
                                    data-happy-desktop-ui="happy-agent-create-session-path"
                                    title={chosen?.displayPath}
                                >
                                    {destinationDetail(chosen, loading)}
                                </span>
                            </div>
                            <div
                                className="happy-agent-create-session__how"
                                data-happy-desktop-ui="happy-agent-create-session-how"
                            >
                                <Select
                                    className="happy-agent-create-session__model"
                                    data-testid="happy-agent-create-session-model"
                                    disabled={submitting || modelOptions.length === 0}
                                    label="Model"
                                    onValueChange={(value) => {
                                        const [providerId, modelId] = value.split(MODEL_VALUE_SEP);
                                        if (modelId) props.onModelChange({ providerId, modelId });
                                    }}
                                    options={modelOptions}
                                    placeholder="Reading models…"
                                    size="small"
                                    {...(currentModel
                                        ? {
                                              value: `${currentModel.providerId}${MODEL_VALUE_SEP}${currentModel.modelId}`,
                                          }
                                        : {})}
                                />
                                <Select
                                    data-testid="happy-agent-create-session-effort"
                                    disabled={submitting || effortOptions.length === 0}
                                    label="Effort"
                                    onValueChange={(value) =>
                                        props.onEffortChange(value as HappyAgentThinkingLevel)
                                    }
                                    options={effortOptions}
                                    placeholder="—"
                                    size="small"
                                    {...(currentEffort ? { value: currentEffort.level } : {})}
                                />
                                <Select
                                    data-testid="happy-agent-create-session-permission"
                                    disabled={submitting || permissionOptions.length === 0}
                                    label="Access"
                                    onValueChange={(value) =>
                                        props.onPermissionModeChange(
                                            value as HappyAgentPermissionMode,
                                        )
                                    }
                                    options={permissionOptions}
                                    placeholder="—"
                                    size="small"
                                    {...(menus ? { value: menus.currentPermissionMode } : {})}
                                />
                                {/* Speed is a choice only where the provider offers a
                                fast tier. On a regular-only model the list would
                                hold one unchangeable row, so the control is absent
                                rather than shown as a decision nobody can make. */}
                                {tierOptions.length > 1 ? (
                                    <Select
                                        data-testid="happy-agent-create-session-tier"
                                        disabled={submitting}
                                        label="Speed"
                                        onValueChange={(value) =>
                                            props.onServiceTierChange(
                                                value === SERVICE_TIER_OFF
                                                    ? undefined
                                                    : (value as HappyAgentServiceTier),
                                            )
                                        }
                                        options={tierOptions}
                                        size="small"
                                        value={currentTier?.tier ?? SERVICE_TIER_OFF}
                                    />
                                ) : null}
                            </div>
                        </>
                    )}
                </div>
                {props.error ? <Banner tone="danger">{props.error}</Banner> : null}
                <div
                    className="happy-agent-create-session__actions"
                    data-happy-desktop-ui="happy-agent-create-session-actions"
                >
                    <span
                        className="happy-agent-create-session__chord"
                        data-happy-desktop-ui="happy-agent-create-session-chord"
                    >
                        {/* A task is prose, so it is committed with the chord its
                            field would otherwise take as a newline; a name is one
                            line, and Enter is the whole gesture. */}
                        <KeyCap keys={bot ? "ENTER" : "⌘ENTER"} />
                    </span>
                    <Button
                        disabled={!submittable}
                        onClick={() => props.onSubmit()}
                        title={props.submitDisabledReason}
                        variant="primary"
                    >
                        {submitting ? (bot ? "Creating…" : "Starting…") : "Create"}
                    </Button>
                </div>
            </div>
        </ScrollArea>
    );
}
