import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { imeKeyboardEvent } from "./imeComposition";
import { Ionicon } from "./vectorIcons/VectorIcon";

/** One kind of bullet across every release in range, newest release first. */
export interface SidebarUpdateNotesList {
    /** The head of the list the card shows, already capped by the host. */
    readonly items: readonly string[];
    /** Every distinct bullet of this kind in range; the rest is "+N more". */
    readonly total: number;
}

/**
 * What changed between the installed Happy Agent and the one being offered,
 * as plain data the host has already fetched, merged, and capped.
 */
export type SidebarUpdateNotes = {
    /** The installed version, without a leading `v`. */
    readonly from: string;
    /** The offered version, without a leading `v`. */
    readonly to: string;
    /** Releases after `from` up to and including `to`. */
    readonly releaseCount: number;
    readonly changelogUrl: string;
} & (
    | {
          readonly kind: "list";
          readonly features: SidebarUpdateNotesList;
          readonly fixes: SidebarUpdateNotesList;
      }
    /** Too many releases to list: the card points at the changelog instead. */
    | { readonly kind: "overflow" }
);

export interface SidebarUpdateActionProps {
    /** Operation the host needs for this update source once it is ready. */
    action: "refresh" | "restart" | "install";
    /** Opens the panel on the first render, for blueprint fixtures and tests. */
    defaultOpen?: boolean;
    /** Detail shown while the update is arriving, such as download progress. */
    detail?: string;
    /**
     * What is new in this version, shown above the panel in the same card.
     * Happy Agent updates only; absent when no notes could be read.
     */
    notes?: SidebarUpdateNotes;
    /** Applies the ready update through the operation named by `action`. */
    onAction?: () => void;
    status: "available" | "downloading" | "downloaded";
    /**
     * Which of the two things that can update this one is. It names the subject
     * — a version alone does not say what it is a version of — and it decides
     * what the panel promises about work in flight, which is the only question
     * anyone actually has before pressing the button.
     */
    subject: "application" | "happyAgent";
    /** Human-readable identity of the incoming version or build. */
    version?: string;
}

/** How long the notes take to fold away once Install is pressed; matches sidebar.css. */
const NOTES_COLLAPSE_MS = 240;

function versionLabel(version: string | undefined): string {
    if (!version) return "New version";
    return /^\d/u.test(version) ? `v${version}` : version;
}

/**
 * What survives the update. The answer is "everything" either way, so it is one
 * short line: the reader is deciding whether to press a button, and what is new
 * already sits above it. Only the reason differs — Happy's own update takes the window
 * away while the agents carry on without it, and an agent's update hands its
 * running sessions over rather than dropping them.
 */
function assurance(subject: SidebarUpdateActionProps["subject"]): string {
    return subject === "happyAgent"
        ? "Running agents keep working."
        : "Agents keep working during the update.";
}

/**
 * SidebarUpdateAction — the standing sign that an update is ready to apply. The
 * footer keeps one 28px slot for it: a filled orange arrow-up-circle, the only
 * colour in a row of neutral ghost controls, so news is legible at a glance
 * without being read. The version, its state, and the action that applies it
 * live in the panel it opens above itself. Downloads stay in Settings until ready.
 *
 * A sentence in the footer was the wrong size for this: "Install · Happy Agent
 * v0.3.10" is either truncated or wider than the navigation it sits under, and
 * it spends the row on text nobody reads twice. The mark is either there or it
 * is not; the words appear when the reader asks for them.
 *
 * A Happy Agent update may carry notes: the bullets of every release since the
 * installed one, stacked above the panel inside the same card. They fold away
 * when Install is pressed, leaving the panel at its plain size.
 */
export function SidebarUpdateAction(props: SidebarUpdateActionProps) {
    const [open, setOpen] = useState(props.defaultOpen ?? false);
    const [applying, setApplying] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const notes = props.subject === "happyAgent" ? props.notes : undefined;
    const version = versionLabel(props.version);
    // The name comes first wherever there is one, because "Install · v0.4.2" in
    // a corner of the window does not say what is being installed. Happy's own
    // update is the exception: the window it is named after is the thing the
    // reader is looking at.
    const subject = props.subject === "happyAgent" ? `Happy Agent ${version}` : version;
    const actionLabel =
        props.action === "refresh" ? "Refresh" : props.action === "install" ? "Install" : "Restart";
    const ready = props.status === "downloaded" && props.onAction !== undefined;
    const state =
        props.status === "downloaded"
            ? `Ready to ${actionLabel.toLowerCase()}`
            : props.status === "downloading"
              ? (props.detail ?? "Downloading")
              : "Available to download";
    // The trigger is a glyph, so its own name has to carry everything the row
    // used to say out loud.
    const triggerLabel = ready ? `${actionLabel} ${subject}` : `${subject} — ${state}`;

    // eslint-disable-next-line happy-react/no-layout-effect -- an open popover owns document-level outside-pointer and Escape listeners that are attached after commit and completely removed when it closes
    useLayoutEffect(() => {
        if (!open || props.status !== "downloaded") return;
        const closeOnOutsidePointer = (event: PointerEvent) => {
            if (event.target instanceof Node && !root.current?.contains(event.target)) {
                setOpen(false);
            }
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !imeKeyboardEvent(event)) setOpen(false);
        };
        document.addEventListener("pointerdown", closeOnOutsidePointer, true);
        document.addEventListener("keydown", closeOnEscape, true);
        return () => {
            document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
            document.removeEventListener("keydown", closeOnEscape, true);
        };
    }, [open, props.status]);

    if (props.status !== "downloaded") return null;

    return (
        <div
            className="happy-sidebar-update"
            data-happy-desktop-ui="sidebar-update-action"
            data-open={open ? "" : undefined}
            data-status={props.status}
            ref={root}
        >
            <button
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-label={triggerLabel}
                className="happy-sidebar-update__trigger"
                data-happy-desktop-ui="sidebar-update-action-trigger"
                onClick={() => setOpen((current) => !current)}
                title={triggerLabel}
                type="button"
            >
                <Ionicon name="arrow-up-circle" size={20} />
            </button>
            {/* The mark says only that there is news; the words that changed are
                spoken here, where a state change is announced whether or not the
                panel is open. */}
            <span aria-live="polite" className="happy-visually-hidden" role="status">
                {`${subject} — ${state}`}
            </span>
            {open ? (
                <div
                    aria-label="Update"
                    className="happy-sidebar-update__panel"
                    data-happy-desktop-ui="sidebar-update-action-panel"
                    role="dialog"
                >
                    {notes ? <UpdateNotes applying={applying} notes={notes} /> : null}
                    <div className="happy-sidebar-update__main">
                        <span className="happy-sidebar-update__copy">
                            <span
                                className="happy-sidebar-update__eyebrow"
                                data-happy-desktop-ui="sidebar-update-action-eyebrow"
                            >
                                Update
                            </span>
                            <span
                                className="happy-sidebar-update__subject"
                                data-happy-desktop-ui="sidebar-update-action-subject"
                                title={subject}
                            >
                                {subject}
                            </span>
                            <span
                                className="happy-sidebar-update__state"
                                data-happy-desktop-ui="sidebar-update-action-state"
                            >
                                {state}
                            </span>
                        </span>
                        <span
                            className="happy-sidebar-update__assurance"
                            data-happy-desktop-ui="sidebar-update-action-assurance"
                        >
                            {assurance(props.subject)}
                        </span>
                        {ready ? (
                            <Button
                                className="happy-sidebar-update__apply"
                                disabled={applying}
                                fullWidth
                                onClick={() => {
                                    // The notes fold away first, so the card is back
                                    // to its plain size by the time the update takes
                                    // the slot over.
                                    if (notes && !motionReduced()) {
                                        const section = root.current?.querySelector<HTMLElement>(
                                            ".happy-sidebar-update__notes",
                                        );
                                        if (section) {
                                            section.style.setProperty(
                                                "--notes-height",
                                                `${section.getBoundingClientRect().height}px`,
                                            );
                                            // Commit the measured start before collapsing to zero.
                                            section.getBoundingClientRect();
                                        }
                                        setApplying(true);
                                        setTimeout(() => {
                                            setApplying(false);
                                            setOpen(false);
                                            props.onAction?.();
                                        }, NOTES_COLLAPSE_MS);
                                        return;
                                    }
                                    setOpen(false);
                                    props.onAction?.();
                                }}
                                size="small"
                                variant="primary"
                            >
                                {applying ? `${actionLabel}ing…` : actionLabel}
                            </Button>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function motionReduced(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function releasesLabel(count: number): string {
    return count === 1 ? "1 release" : `${count} releases`;
}

/**
 * The notes above the panel. Features and Fixes share one list slot behind two
 * tabs, Features first. When one kind is empty there is nothing to switch to, so
 * the other is named as a plain label instead of a lone tab.
 */
function UpdateNotes(props: { readonly applying: boolean; readonly notes: SidebarUpdateNotes }) {
    const { notes } = props;
    const [tab, setTab] = useState<"features" | "fixes">(
        notes.kind === "list" && notes.features.total === 0 ? "fixes" : "features",
    );
    const selectedTab =
        notes.kind === "list" && notes[tab].total === 0
            ? tab === "features"
                ? "fixes"
                : "features"
            : tab;
    const range = `${notes.from} → ${notes.to}`;
    return (
        <div
            className="happy-sidebar-update__notes"
            data-applying={props.applying ? "" : undefined}
            data-happy-desktop-ui="sidebar-update-action-notes"
        >
            <div className="happy-sidebar-update__notes-clip">
                <div className="happy-sidebar-update__notes-body">
                    <div className="happy-sidebar-update__notes-head">
                        <span className="happy-sidebar-update__eyebrow">{"What's new"}</span>
                        {notes.kind === "list" ? (
                            notes.features.total > 0 && notes.fixes.total > 0 ? (
                                <span
                                    aria-label="Kind of change"
                                    className="happy-sidebar-update__tabs"
                                    role="tablist"
                                >
                                    <NotesTab
                                        count={notes.features.total}
                                        label="Features"
                                        onSelect={() => setTab("features")}
                                        selected={selectedTab === "features"}
                                    />
                                    <NotesTab
                                        count={notes.fixes.total}
                                        label="Fixes"
                                        onSelect={() => setTab("fixes")}
                                        selected={selectedTab === "fixes"}
                                    />
                                </span>
                            ) : (
                                <span className="happy-sidebar-update__kind">
                                    {selectedTab === "features" ? "Features" : "Fixes"}
                                    <span className="happy-sidebar-update__tab-count">
                                        {notes[selectedTab].total}
                                    </span>
                                </span>
                            )
                        ) : null}
                    </div>
                    <span className="happy-sidebar-update__notes-meta" title={range}>
                        {range}
                    </span>
                    {notes.kind === "list" ? (
                        <NotesList changelogUrl={notes.changelogUrl} list={notes[selectedTab]} />
                    ) : (
                        <div className="happy-sidebar-update__notes-overflow">
                            <span className="happy-sidebar-update__notes-headline">
                                {"We've shipped a ton since you last updated."}
                            </span>
                            <span className="happy-sidebar-update__notes-line">
                                {`That's ${releasesLabel(notes.releaseCount)}. Too much to list here :D`}
                            </span>
                            <span className="happy-sidebar-update__notes-line">
                                <a
                                    className="happy-sidebar-update__notes-link"
                                    href={notes.changelogUrl}
                                    rel="noreferrer"
                                    target="_blank"
                                >
                                    Read the changelog ↗
                                </a>
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function NotesTab(props: {
    readonly count: number;
    readonly label: string;
    readonly onSelect: () => void;
    readonly selected: boolean;
}) {
    return (
        <button
            aria-selected={props.selected}
            className="happy-sidebar-update__tab"
            onClick={props.onSelect}
            role="tab"
            type="button"
        >
            {props.label}
            <span className="happy-sidebar-update__tab-count">{props.count}</span>
        </button>
    );
}

function NotesList(props: {
    readonly changelogUrl: string;
    readonly list: SidebarUpdateNotesList;
}) {
    const rest = props.list.total - props.list.items.length;
    return (
        <>
            <ul className="happy-sidebar-update__notes-list" role="tabpanel">
                {props.list.items.map((item) => (
                    <li className="happy-sidebar-update__notes-item" key={item} title={item}>
                        {item}
                    </li>
                ))}
            </ul>
            {rest > 0 ? (
                <span className="happy-sidebar-update__notes-line">
                    {`+${rest} more · `}
                    <a
                        className="happy-sidebar-update__notes-link"
                        href={props.changelogUrl}
                        rel="noreferrer"
                        target="_blank"
                    >
                        Changelog ↗
                    </a>
                </span>
            ) : null}
        </>
    );
}
