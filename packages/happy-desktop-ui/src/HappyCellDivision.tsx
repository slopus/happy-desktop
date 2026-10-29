import { useId, useState } from "react";
import { CellClayDefs, cellClayFilter, cellPaintId, type CellVariant } from "./CellPaint";
import { HappyCellDivisionSim, type DivisionRect } from "./happyCellDivisionSim";
import {
    HAPPY_CELL_SHAPE,
    happyCellPaths,
    happyCellSeeded,
    type HappyCellShape,
} from "./happyCellGeometry";
import { stemCellGeometry, stemCellSmoothPath } from "./stemCellGeometry";

export type { DivisionRect };

export interface HappyCellDaughter {
    readonly stemCellId: string;
    readonly to: DivisionRect;
}

export interface HappyCellDivisionProps {
    /** Happy's mark on screen, from `getBoundingClientRect()`. */
    from: DivisionRect;
    /**
     * One entry per division, oldest first: the stem cell each daughter
     * becomes and its new row's mark on screen. A new entry divides Happy again
     * at once, from wherever it is; a changed `to` — rows shifted by a newer
     * one — re-aims that daughter, which glides on without stopping.
     */
    daughters: readonly HappyCellDaughter[];
    /** Must match the marks it hands over to. Happy's own shape by default. */
    shape?: HappyCellShape;
    /** Happy's membrane seed as it starts, when it differs from `shape`'s. */
    seed?: number;
    /**
     * Each division Happy forms again from a new membrane seed, morphing to it
     * as it swells round; this reports it as the division starts, so the mark
     * shown again in `onDone` — and kept for next time — has it. Each daughter
     * is its own stem cell, seeded by its id. Not called with reduced motion,
     * where Happy does not change.
     */
    onSeed?: (seed: number) => void;
    /** Must match the marks it hands over to. Clay by default. */
    variant?: CellVariant;
    /** Everything is at rest: Happy whole again and every daughter in its row. */
    onDone?: () => void;
    /**
     * A daughter has come to rest in its row, while the overlay still draws it:
     * the moment its row may show itself around it. With reduced motion there
     * is no such moment before `onDone`.
     */
    onArrive?: (stemCellId: string) => void;
}

/**
 * C-319 — Happy dividing to make new work. Drawn in a fixed overlay over the
 * window while the caller hides Happy's mark and the new row's stem cell: the
 * lower right lobe peels away underneath Happy, its neck stretches thin and
 * lets go, and it slides into the new row as that row's stem cell, while
 * Happy swells round and starts to divide again. Every number is a spring
 * stepped each frame and the outline is traced afresh each frame, so the
 * motion never steps, swaps, or fades between shapes. Its last frame is the
 * marks the caller shows again in `onDone`. With reduced motion the new stem
 * cell only fades in.
 *
 * It draws in window coordinates wherever its fixed box lands, so a
 * containing ancestor shifts nothing.
 */
export function HappyCellDivision(props: HappyCellDivisionProps) {
    const { from, daughters } = props;
    const variant = props.variant ?? "clay";
    const clay = cellPaintId(useId());
    const given = props.shape ?? HAPPY_CELL_SHAPE;
    const shape = happyCellSeeded(given, props.seed ?? given.seed);
    const [sim] = useState(() => new HappyCellDivisionSim(from, shape));
    const { onArrive, onDone, onSeed } = props;

    // The rects are the window's, but the layer's fixed box is the window's
    // only where nothing contains it: a connection beside the rail holds its
    // fixed layers in its own box, which starts right of the rail. Drawing is
    // moved back by wherever the layer's box actually starts.
    const place = (svg: SVGSVGElement | null) => {
        const page = svg?.querySelector(".happy-cell-division__page");
        if (!svg || !page) return;
        const origin = svg.getBoundingClientRect();
        page.setAttribute("transform", `translate(${-origin.x} ${-origin.y})`);
    };

    // Attached again whenever the props change: a new daughter divides Happy
    // again, a moved one is re-aimed, and the loop picks up the latest onDone. The sim keeps its own clock, so
    // re-attaching never stalls a frame.
    const play = (svg: SVGSVGElement | null) => {
        if (!svg) return;
        place(svg);
        const membrane = svg.querySelector<SVGPathElement>(".happy-stem-cell__membrane");
        const core = svg.querySelector<SVGPathElement>(".happy-stem-cell__core");
        if (!membrane || !core) return;
        let divided = false;
        for (const daughter of daughters)
            if (sim.divide(daughter.stemCellId, daughter.to)) divided = true;
        if (divided) onSeed?.(sim.seed);
        const draw = () => {
            const frame = sim.frame();
            membrane.setAttribute("d", frame.membrane);
            core.setAttribute("d", frame.core);
        };
        let request = 0;
        const tick = (now: number) => {
            sim.advance(now);
            draw();
            for (const id of sim.arrivedReport()) onArrive?.(id);
            if (sim.restReport()) onDone?.();
            request = requestAnimationFrame(tick);
        };
        draw();
        request = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(request);
    };

    const filter = (inset: boolean) =>
        variant === "clay" ? cellClayFilter(clay, inset) : undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const happy = happyCellPaths(shape, from.width);
        return (
            <svg
                aria-hidden="true"
                className="happy-cell-division"
                data-happy-desktop-ui="happy-cell-division"
                focusable="false"
                ref={place}
            >
                {variant === "clay" ? <CellClayDefs id={clay} size={from.width} /> : null}
                <g className="happy-cell-division__page">
                    <g transform={`translate(${from.x} ${from.y})`}>
                        <path
                            className="happy-stem-cell__membrane"
                            d={happy.membrane}
                            filter={filter(false)}
                        />
                        <path
                            className="happy-stem-cell__core"
                            d={happy.core}
                            filter={filter(true)}
                        />
                    </g>
                    {daughters.map(({ stemCellId, to }, index) => {
                        const stem = stemCellGeometry(stemCellId);
                        return (
                            <g
                                className="happy-cell-division__arrival"
                                key={stemCellId}
                                // The newest fade ends last; it reports that all are in.
                                onAnimationEnd={
                                    index === daughters.length - 1 ? () => onDone?.() : undefined
                                }
                                transform={`translate(${to.x} ${to.y})`}
                            >
                                <path
                                    className="happy-stem-cell__membrane"
                                    d={stemCellSmoothPath(stem.membrane, to.width)}
                                    filter={filter(false)}
                                />
                                <path
                                    className="happy-stem-cell__core"
                                    d={stemCellSmoothPath(stem.core, to.width)}
                                    filter={filter(true)}
                                />
                            </g>
                        );
                    })}
                </g>
            </svg>
        );
    }
    return (
        <svg
            aria-hidden="true"
            className="happy-cell-division"
            data-happy-desktop-ui="happy-cell-division"
            focusable="false"
            ref={play}
        >
            {variant === "clay" ? <CellClayDefs id={clay} size={from.width} /> : null}
            <g className="happy-cell-division__page">
                <path className="happy-stem-cell__membrane" filter={filter(false)} />
                <path className="happy-stem-cell__core" filter={filter(true)} />
            </g>
        </svg>
    );
}
