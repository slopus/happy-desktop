import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useRef, useState } from "react";
import {
    pipelineLogCommandFailed,
    type PipelineLogCommand,
    type PipelineLogEntry,
    type PipelineNodeLogSnapshot,
} from "happy-desktop-state";
import { Button } from "../../Button";
import { Icon } from "../../Icon";
import { MarkdownDocument } from "../../MarkdownDocument";
import { ScrollArea } from "../../Scrollbar";
import { elapsedTimeFormat } from "../../elapsedTimeFormat";

/** How far from the bottom, in pixels, still counts as at the bottom. */
const BOTTOM_SLACK = 4;
/** One output line, which every row's estimate is a multiple of. */
const LINE_HEIGHT = 18;

export interface PipelineNodeLogProps {
    readonly log: PipelineNodeLogSnapshot;
    /** The node is still working, so more is coming. */
    readonly live: boolean;
    /** When the node started, which every entry's time is counted from. */
    readonly startedAt: number | null;
    readonly "aria-label": string;
}

type LogRow =
    | { readonly key: string; readonly kind: "dropped"; readonly count: number }
    | { readonly key: string; readonly kind: "entry"; readonly entry: PipelineLogEntry };

function durationText(durationMs: number | null): string | null {
    if (durationMs === null) return null;
    return durationMs < 1_000 ? `${String(durationMs)}ms` : elapsedTimeFormat(durationMs);
}

/** `+m:ss` since the node started, the gutter CI logs keep. */
function offsetText(at: number, startedAt: number | null): string {
    if (startedAt === null) return "";
    const seconds = Math.max(0, Math.floor((at - startedAt) / 1_000));
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes)}:${String(seconds % 60).padStart(2, "0")}`;
}

function lineCount(text: string): number {
    let lines = 1;
    for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1))
        lines += 1;
    return text.endsWith("\n") ? lines - 1 : lines;
}

/** A command's state, in the words the row ends with. */
function commandStateText(command: PipelineLogCommand): string {
    if (command.state === "running") return "Running";
    if (command.state === "aborted") return "Aborted";
    return `Exit ${command.exitCode === null ? "?" : String(command.exitCode)}`;
}

function CommandRow(props: {
    readonly command: PipelineLogCommand;
    readonly open: boolean;
    readonly onToggle: () => void;
}) {
    const command = props.command;
    const failed = pipelineLogCommandFailed(command);
    const output = command.output.replace(/\n$/u, "");
    const hasOutput = output.length > 0 || command.outputTruncated;
    const duration = durationText(command.durationMs);
    return (
        <div
            className="happy-pipeline-log__command"
            data-failed={failed ? "" : undefined}
            data-state={command.state}
        >
            <button
                aria-expanded={hasOutput ? props.open : undefined}
                className="happy-pipeline-log__command-head"
                disabled={!hasOutput}
                onClick={props.onToggle}
                title={
                    command.cwd === null ? command.command : `${command.cwd} $ ${command.command}`
                }
                type="button"
            >
                <span aria-hidden className="happy-pipeline-log__chevron">
                    {hasOutput ? (
                        <Icon name={props.open ? "chevron-down" : "chevron-right"} size={12} />
                    ) : null}
                </span>
                <span aria-hidden className="happy-pipeline-log__prompt">
                    $
                </span>
                <span className="happy-pipeline-log__command-text">{command.command}</span>
                {command.lease !== null ? (
                    <span className="happy-pipeline-log__aside">on {command.lease}</span>
                ) : null}
                <span className="happy-pipeline-log__command-state">
                    {commandStateText(command)}
                </span>
                <span className="happy-pipeline-log__duration">{duration ?? ""}</span>
            </button>
            {props.open && hasOutput ? (
                <div className="happy-pipeline-log__command-output">
                    {command.outputTruncated ? (
                        <span className="happy-pipeline-log__aside">
                            Earlier output was cut; this is the last 64 KiB.
                        </span>
                    ) : null}
                    <pre className="happy-pipeline-log__text">{output}</pre>
                </div>
            ) : null}
        </div>
    );
}

function EntryBody(props: {
    readonly entry: PipelineLogEntry;
    readonly open: boolean;
    readonly onToggle: () => void;
}) {
    const entry = props.entry;
    switch (entry.kind) {
        case "output":
            return (
                <pre className="happy-pipeline-log__text" data-stream={entry.stream}>
                    {entry.text.replace(/\n$/u, "")}
                </pre>
            );
        case "command":
            return <CommandRow command={entry} onToggle={props.onToggle} open={props.open} />;
        case "tool":
            return (
                <div className="happy-pipeline-log__tool" data-state={entry.state}>
                    <span className="happy-pipeline-log__tool-head">
                        <span aria-hidden className="happy-pipeline-log__chevron" />
                        <span aria-hidden className="happy-pipeline-log__tool-glyph">
                            <Icon name="zap" size={12} />
                        </span>
                        <span className="happy-pipeline-log__tool-name">{entry.name}</span>
                        <span className="happy-pipeline-log__tool-summary">{entry.summary}</span>
                        <span className="happy-pipeline-log__command-state">
                            {entry.state === "running"
                                ? "Running"
                                : entry.state === "ok"
                                  ? "Done"
                                  : "Failed"}
                        </span>
                        <span className="happy-pipeline-log__duration">
                            {durationText(entry.durationMs) ?? ""}
                        </span>
                    </span>
                    {entry.error !== null ? (
                        <pre className="happy-pipeline-log__text" data-stream="stderr">
                            {entry.error}
                        </pre>
                    ) : null}
                </div>
            );
        case "message":
            return (
                <div className="happy-pipeline-log__message">
                    <MarkdownDocument flow="inline" text={entry.text} />
                </div>
            );
        case "status":
            return (
                <span className="happy-pipeline-log__status">
                    <Icon name="pulse" size={12} />
                    <span className="happy-pipeline-log__status-text">
                        {entry.text}
                        {entry.progress === null
                            ? ""
                            : ` · ${String(Math.round(entry.progress * 100))}%`}
                    </span>
                </span>
            );
    }
}

/** What a row is expected to take before it is measured. */
function rowEstimate(row: LogRow | undefined, open: (seq: number) => boolean): number {
    if (row === undefined || row.kind === "dropped") return 28;
    const entry = row.entry;
    if (entry.kind === "output") return lineCount(entry.text) * LINE_HEIGHT;
    if (entry.kind === "command")
        return 28 + (open(entry.seq) ? lineCount(entry.output) * LINE_HEIGHT + 8 : 0);
    if (entry.kind === "tool") return 26 + (entry.error === null ? 0 : LINE_HEIGHT);
    if (entry.kind === "message") return 6 + Math.ceil(entry.text.length / 110) * LINE_HEIGHT;
    return 24;
}

/**
 * PipelineNodeLog — what one node did, as a CI log: output lines in
 * monospace, one per line; each command a row with its exit code and how long
 * it took, its output folding under it; tool calls; and an agent's messages
 * as prose. A failed command or tool reads red.
 *
 * While the reader is at the bottom it follows what arrives; scrolling up
 * leaves them where they are, with a way back to the end. A command opens
 * while it runs and when it fails. One already finished cleanly when first
 * read starts closed; one the reader watched run stays open, so nothing folds
 * away under them. Only the rows on screen are drawn.
 */
export function PipelineNodeLog(props: PipelineNodeLogProps) {
    const log = props.log;
    const rows: LogRow[] = [
        ...(log.dropped > 0
            ? [{ key: "dropped", kind: "dropped" as const, count: log.dropped }]
            : []),
        ...log.entries.map((entry) => ({
            key: String(entry.seq),
            kind: "entry" as const,
            entry,
        })),
    ];
    // The reader's own folds, by entry; everything else follows the rule above.
    const [folds, foldsSet] = useState<ReadonlyMap<number, boolean>>(new Map());
    const open = (entry: PipelineLogEntry): boolean => {
        if (entry.kind !== "command") return false;
        const own = folds.get(entry.seq);
        if (own !== undefined) return own;
        return (
            entry.state === "running" ||
            pipelineLogCommandFailed(entry) ||
            log.watched.has(entry.seq)
        );
    };
    const openBySeq = (seq: number): boolean => {
        const entry = log.entries.find((candidate) => candidate.seq === seq);
        return entry === undefined ? false : open(entry);
    };
    const scrollElement = useRef<HTMLDivElement | null>(null);
    const following = useRef(true);
    const [away, awaySet] = useState(false);
    // TanStack Virtual owns mutable measurement functions; this leaf stays
    // outside compiler memoization, as FeedVirtualList's does.
    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: rows.length,
        estimateSize: (index) => rowEstimate(rows[index], openBySeq),
        getItemKey: (index) => rows[index]?.key ?? index,
        getScrollElement: () => scrollElement.current,
        initialRect: { width: 0, height: 480 },
        overscan: 12,
        useFlushSync: false,
    });
    const toBottom = (): void => {
        const element = scrollElement.current;
        if (element) element.scrollTop = element.scrollHeight;
    };
    // Following the end: whenever what is drawn grows while the reader is at
    // the bottom, the bottom moves with it in the same frame. Nothing else
    // ever scrolls the log.
    const contentMeasure = useCallback((element: HTMLDivElement | null) => {
        if (element === null) return;
        const observer = new ResizeObserver(() => {
            if (following.current) {
                const scroller = scrollElement.current;
                if (scroller) scroller.scrollTop = scroller.scrollHeight;
            }
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const empty =
        rows.length === 0
            ? log.loading
                ? "Reading the log…"
                : props.live
                  ? "Nothing logged yet."
                  : "This node logged nothing."
            : null;
    return (
        <div
            aria-label={props["aria-label"]}
            className="happy-pipeline-log"
            data-happy-desktop-ui="pipeline-node-log"
            role="log"
        >
            {log.error ? (
                <p className="happy-pipeline-log__error">
                    The log may be out of date: {log.error.message}
                </p>
            ) : null}
            {empty !== null ? (
                <p className="happy-pipeline-log__empty">{empty}</p>
            ) : (
                <ScrollArea
                    axes="both"
                    className="happy-pipeline-log__scroll"
                    overlay={
                        away ? (
                            <span className="happy-pipeline-log__jump">
                                <Button
                                    icon="arrow-down"
                                    onClick={() => {
                                        following.current = true;
                                        awaySet(false);
                                        toBottom();
                                    }}
                                    size="small"
                                    variant="secondary"
                                >
                                    {props.live ? "Follow" : "Jump to end"}
                                </Button>
                            </span>
                        ) : null
                    }
                    viewportClassName="happy-pipeline-log__viewport"
                    viewportProps={{
                        onScroll: (event) => {
                            const element = event.currentTarget;
                            const atBottom =
                                element.scrollHeight - element.scrollTop - element.clientHeight <=
                                BOTTOM_SLACK;
                            following.current = atBottom;
                            if (away === atBottom) awaySet(!atBottom);
                        },
                    }}
                    viewportRef={scrollElement}
                >
                    <div
                        className="happy-pipeline-log__rows"
                        ref={contentMeasure}
                        style={{ height: virtualizer.getTotalSize() }}
                    >
                        {virtualizer.getVirtualItems().map((item) => {
                            const row = rows[item.index];
                            if (row === undefined) return null;
                            const entry = row.kind === "entry" ? row.entry : undefined;
                            return (
                                <div
                                    className="happy-pipeline-log__row"
                                    data-index={item.index}
                                    data-kind={entry?.kind ?? "dropped"}
                                    key={item.key}
                                    ref={virtualizer.measureElement}
                                    style={{ transform: `translateY(${String(item.start)}px)` }}
                                >
                                    <span aria-hidden className="happy-pipeline-log__gutter">
                                        {entry ? offsetText(entry.at, props.startedAt) : ""}
                                    </span>
                                    <span className="happy-pipeline-log__body">
                                        {row.kind === "dropped" ? (
                                            <span className="happy-pipeline-log__aside">
                                                {row.count.toLocaleString()} earlier{" "}
                                                {row.count === 1 ? "entry was" : "entries were"} let
                                                go.
                                            </span>
                                        ) : (
                                            <EntryBody
                                                entry={row.entry}
                                                onToggle={() => {
                                                    const next = new Map(folds);
                                                    next.set(row.entry.seq, !open(row.entry));
                                                    foldsSet(next);
                                                }}
                                                open={open(row.entry)}
                                            />
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            )}
        </div>
    );
}
