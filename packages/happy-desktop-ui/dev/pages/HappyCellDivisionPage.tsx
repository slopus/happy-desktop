import { useId, useRef, useState, type ReactNode } from "react";
import { CellClayDefs, cellClayFilter, cellPaintId } from "../../src/CellPaint";
import { clayIconMark, type ClayIconSlug } from "../../src/clayIcons";
import { HappyCell } from "../../src/HappyCell";
import { HappyCellDivision, type DivisionRect } from "../../src/HappyCellDivision";
import { HappyCellDivisionSim } from "../../src/happyCellDivisionSim";
import { HAPPY_CELL_SHAPE, type HappyCellShape } from "../../src/happyCellGeometry";
import { Icon, type IconName } from "../../src/Icon";
import { Sidebar } from "../../src/Sidebar";
import { StemCell } from "../../src/StemCell";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export const componentNumber = "C-319b";
const modes = ["light", "dark"] as const;
const ROW = 32;
/** Fixed moments of one division, so every capture is the same. */
const frameTimes = [0, 60, 110, 150, 175, 195, 230, 280, 360, 500, 900];

/** The division stepped to fixed moments and drawn with the real paint. Nothing here moves. */
function DivisionFrames(props: { size: number }) {
    const clay = cellPaintId(useId());
    const pad = Math.round(props.size * 0.4);
    const from: DivisionRect = { x: pad, y: pad, width: props.size, height: props.size };
    const to: DivisionRect = { ...from, y: pad + props.size * 1.6 };
    const width = props.size + 2 * pad;
    const height = to.y + props.size + pad;
    const [frames] = useState(() => {
        const sim = new HappyCellDivisionSim(from, HAPPY_CELL_SHAPE);
        sim.divide("window-navigation", to);
        let now = 0;
        return frameTimes.map((ms) => {
            sim.step((ms - now) / 1000);
            now = ms;
            return sim.frame();
        });
    });
    return (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 8 }}>
            {frames.map((frame, index) => (
                <div
                    key={frameTimes[index]}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <svg height={height} style={{ display: "block" }} width={width}>
                        {index === 0 ? <CellClayDefs id={clay} size={props.size} /> : null}
                        <path
                            className="happy-stem-cell__membrane"
                            d={frame.membrane}
                            filter={cellClayFilter(clay, false)}
                        />
                        <path
                            className="happy-stem-cell__core"
                            d={frame.core}
                            filter={cellClayFilter(clay, true)}
                        />
                    </svg>
                    <DimensionRule label={`${frameTimes[index]}`} />
                </div>
            ))}
        </div>
    );
}

/**
 * A new row opening to its full height on a critically damped spring, stepped
 * by animation frames so a stepped clock records it exactly. Module-level, so
 * re-rendering the row does not start it again.
 */
function rowOpen(row: HTMLDivElement | null) {
    if (!row) return;
    let height = 0;
    let velocity = 0;
    let last: number | undefined;
    let request = 0;
    const omega = 16;
    const tick = (now: number) => {
        const seconds = last === undefined ? 0 : Math.min((now - last) / 1000, 1 / 20);
        last = now;
        for (let t = 0; t < seconds; t += 1 / 480) {
            velocity += (omega * omega * (ROW - height) - 2 * omega * velocity) / 480;
            height += velocity / 480;
        }
        row.style.height = `${height}px`;
        row.style.opacity = String(Math.min(1, height / ROW));
        if (Math.abs(ROW - height) < 0.01 && Math.abs(velocity) < 0.1) {
            row.style.height = `${ROW}px`;
            row.style.opacity = "1";
            return;
        }
        request = requestAnimationFrame(tick);
    };
    row.style.height = "0px";
    row.style.opacity = "0";
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
}

function Row(props: {
    mark: ReactNode;
    label: string;
    quiet?: boolean;
    onClick?: () => void;
    opens?: boolean;
}) {
    const style = {
        display: "flex",
        flex: "none",
        alignItems: "center",
        gap: 8,
        height: ROW,
        padding: "0 8px",
        overflow: "hidden",
        border: 0,
        borderRadius: 6,
        background: "transparent",
        color: props.quiet ? "var(--text-secondary)" : "var(--text)",
        font: "inherit",
        fontSize: 13,
        fontWeight: 500,
        lineHeight: "16px",
        textAlign: "left",
        cursor: props.onClick ? "pointer" : "default",
    } as const;
    const content = (
        <>
            <span style={{ display: "flex", flex: "none", width: 20, justifyContent: "center" }}>
                {props.mark}
            </span>
            {props.label}
        </>
    );
    if (props.onClick)
        return (
            <button
                data-demo-action={props.label}
                onClick={props.onClick}
                style={style}
                type="button"
            >
                {content}
            </button>
        );
    return (
        <div ref={props.opens ? rowOpen : undefined} style={style}>
            {content}
        </div>
    );
}

function ClayMark(props: { slug: ClayIconSlug }) {
    const mark = clayIconMark(props.slug);
    return (
        <img
            alt=""
            src={mark.src}
            srcSet={mark.srcSet}
            style={{ display: "block", width: 20, height: 20 }}
        />
    );
}

function Glyph(props: { name: IconName }) {
    return (
        <span style={{ display: "flex", color: "var(--text-secondary)" }}>
            <Icon name={props.name} size={16} />
        </span>
    );
}

const clayRows: readonly { slug: ClayIconSlug; label: string }[] = [
    { slug: "ci-watcher", label: "Release coordinator" },
    { slug: "cloud", label: "Cloud costs" },
    { slug: "notes", label: "Meeting notes" },
    { slug: "roadmap", label: "Q3 roadmap" },
];

/**
 * A sidebar with Happy on top. New divides Happy: the daughter drops into a
 * new row opening right under it, as that row's stem cell, and rows opened
 * earlier move down one. Happy's mark and the new marks are hidden while the
 * overlay draws them, and shown again when it is done.
 */
export function DivisionDemo(props: { screen: string; shape?: HappyCellShape }) {
    const happy = useRef<HTMLSpanElement>(null);
    /** Newest first, as the rows read. */
    const [stems, setStems] = useState<readonly string[]>([]);
    /** Happy's membrane seed: new after each division, as an app would keep it. */
    const [seed, setSeed] = useState<number | undefined>(undefined);
    const [from, setFrom] = useState<DivisionRect | undefined>(undefined);
    /** Oldest first, still drawn by the overlay. */
    const [pending, setPending] = useState<readonly string[]>([]);
    const create = () => {
        const box = happy.current?.getBoundingClientRect();
        const canvas = happy.current?.closest("[data-screen]")?.getBoundingClientRect();
        if (!box || !canvas) return;
        const id = `new-chat-${props.screen}-${stems.length + 1}`;
        setStems([id, ...stems]);
        setPending([...pending, id]);
        setFrom(
            from ?? {
                x: box.x - canvas.x,
                y: box.y - canvas.y,
                width: box.width,
                height: box.height,
            },
        );
    };
    const rowOf = (id: string) => stems.indexOf(id);
    return (
        <div
            data-screen={props.screen}
            style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                width: 248,
                height: 360,
                padding: 8,
                background: "var(--groupped-background)",
                fontFamily: "var(--happy-font-ui)",
            }}
        >
            <Row label="Search" mark={<Glyph name="search" />} onClick={() => {}} quiet />
            <Row label="New" mark={<Glyph name="compose" />} onClick={create} quiet />
            <div style={{ height: 1, margin: "8px 8px", background: "var(--divider)" }} />
            <Row
                label="Happy"
                mark={
                    <span
                        ref={happy}
                        style={{ display: "flex", visibility: from ? "hidden" : "visible" }}
                    >
                        <HappyCell seed={seed} shape={props.shape} size={20} />
                    </span>
                }
            />
            {stems.map((id) => (
                <Row
                    key={id}
                    label="New chat"
                    mark={
                        <span
                            style={{
                                display: "flex",
                                visibility: pending.includes(id) ? "hidden" : "visible",
                            }}
                        >
                            <StemCell id={id} size={20} />
                        </span>
                    }
                    opens
                    quiet
                />
            ))}
            {clayRows.map((row) => (
                <Row key={row.slug} label={row.label} mark={<ClayMark slug={row.slug} />} />
            ))}
            {from ? (
                <HappyCellDivision
                    onSeed={setSeed}
                    seed={seed}
                    shape={props.shape}
                    daughters={pending.map((id) => ({
                        stemCellId: id,
                        to: { ...from, y: from.y + ROW * (rowOf(id) + 1) },
                    }))}
                    from={from}
                    onDone={() => {
                        setFrom(undefined);
                        setPending([]);
                    }}
                />
            ) : null}
        </div>
    );
}

/** The production scroll boundary: divide, then scroll Happy behind the header. */
function SidebarDivisionDemo(props: { screen: string }) {
    const [stems, setStems] = useState<readonly string[]>([]);
    return (
        <div data-screen={props.screen} style={{ display: "flex", height: 360 }}>
            <Sidebar
                activeItemId="happy"
                composeLabel="New"
                division={{ from: "happy", into: stems }}
                onCompose={() => setStems([...stems, `work-${stems.length + 1}`])}
                onItemSelect={() => {}}
                sections={[
                    {
                        id: "work",
                        items: [
                            { id: "happy", label: "Happy", kind: "view", happyMark: true },
                            ...[...stems].reverse().map((id) => ({
                                id,
                                label: "New work",
                                kind: "view" as const,
                                stemCell: { id },
                            })),
                            ...Array.from({ length: 12 }, (_, index) => ({
                                id: `project-${index}`,
                                label: `Project ${index + 1}`,
                                kind: "view" as const,
                                stemCell: { id: `project-${index}` },
                            })),
                        ],
                    },
                ]}
                title="Projects"
            />
        </div>
    );
}

export function HappyCellDivisionPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Happy cell division"
            summary="New work is Happy dividing. Happy’s lower right lobe peels away underneath it, stretches a neck that thins and lets go, and slides into the new row opening under Happy, where it is that row’s stem cell; what is left of Happy swells round and starts to divide again. Pressed again mid-way, Happy divides again at once and the earlier daughter glides on to its row’s new place. Springs carry every number and the outline is traced from the field each frame, so nothing steps or swaps."
        >
            {modes.map((mode, index) => (
                <Specimen
                    key={`scroll-${mode}`}
                    number={`0${index + 1}`}
                    label={`${mode} · real sidebar · scroll while dividing`}
                    detail="Press New, then scroll: the cells travel with their rows and disappear beneath the header at the scroll boundary"
                    stage="app"
                >
                    <ThemeScope mode={mode}>
                        <SidebarDivisionDemo screen={`division-scroll-${mode}`} />
                    </ThemeScope>
                </Specimen>
            ))}
            {modes.map((mode, index) => (
                <Specimen
                    key={`demo-${mode}`}
                    number={`0${index + 3}`}
                    label={`${mode} · sidebar · press New`}
                    detail="The real component in a sidebar mock: 32 px rows, a 20 px mark lane. Press New again mid-division to divide again"
                    stage="app"
                >
                    <ThemeScope mode={mode}>
                        <DivisionDemo screen={`division-demo-${mode}`} />
                    </ThemeScope>
                </Specimen>
            ))}
            {modes.map((mode, index) => (
                <Specimen
                    key={`frames-${mode}`}
                    number={`0${index + 5}`}
                    label={`${mode} · frames · 20 / 64`}
                    detail="The division stepped to fixed moments (ms) and drawn with the clay paint, at row size and at 64 for detail"
                    stage="app"
                >
                    <ThemeScope mode={mode}>
                        <div
                            data-screen={`division-frames-${mode}`}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 24,
                                padding: 24,
                                background: "var(--surface)",
                            }}
                        >
                            <DivisionFrames size={20} />
                            <DivisionFrames size={64} />
                        </div>
                    </ThemeScope>
                </Specimen>
            ))}
        </ComponentPage>
    );
}
