/*
 * A small standing dinosaur on a short stretch of ground between two cacti:
 * what a story row shows on its last line while its agent has said nothing yet.
 * Drawn on a 49 × 22 cell grid, the ground on the last row; the dinosaur
 * fills the 21 rows above it.
 */
const SCENE = [
    "..........########...............................",
    ".........##.#######..............................",
    ".........##########..............................",
    ".........##########..............................",
    ".........##########..............................",
    ".........#####...................................",
    ".........########................................",
    "#.......#####....................................",
    "#......######....................................",
    "##....########...................................",
    "###..##########.............................##...",
    "#############.##..............##............##...",
    "#############..#..............##..........#.##.#.",
    ".############.................##.#........#.##.#.",
    "..##########...............#..##.#........#####..",
    "...########................#..##.#..........##...",
    "....######.................#..####..........##...",
    ".....##.##.................#####............##...",
    ".....#...#....................##............##...",
    ".....#...#....................##............##...",
    ".....##..##...................##............##...",
    "#################################################",
] as const;

const ROWS = SCENE.length;
const COLUMNS = SCENE[0].length;
/** The dinosaur's height in CSS pixels: "Ag" in 14px Figtree, cap 9.8 plus descender 3. */
const DINOSAUR_HEIGHT = 12.8;
const HEIGHT = (DINOSAUR_HEIGHT * ROWS) / (ROWS - 1);
const WIDTH = (HEIGHT * COLUMNS) / ROWS;

/**
 * StoryEmptyMark — the scene in whole device pixels, sampled nearest-cell at
 * this display's density so it stays crisp at 1x, 2x and 3x, in the colour of
 * the text around it.
 */
export function StoryEmptyMark() {
    const density = typeof window === "undefined" ? 2 : window.devicePixelRatio || 1;
    const height = Math.round(HEIGHT * density);
    const width = Math.round(WIDTH * density);
    const runs: { x: number; y: number; length: number }[] = [];
    for (let y = 0; y < height; y += 1) {
        const row = SCENE[Math.min(ROWS - 1, Math.floor(((y + 0.5) * ROWS) / height))]!;
        let start = -1;
        for (let x = 0; x <= width; x += 1) {
            const filled =
                x < width &&
                row[Math.min(COLUMNS - 1, Math.floor(((x + 0.5) * COLUMNS) / width))] === "#";
            if (filled && start < 0) start = x;
            if (!filled && start >= 0) {
                runs.push({ x: start, y, length: x - start });
                start = -1;
            }
        }
    }
    return (
        <svg
            aria-hidden="true"
            className="happy-story-empty-mark"
            data-happy-desktop-ui="story-empty-mark"
            fill="currentColor"
            height={height / density}
            shapeRendering="crispEdges"
            viewBox={`0 0 ${String(width)} ${String(height)}`}
            width={width / density}
        >
            {runs.map((run) => (
                <rect
                    height={1}
                    key={`${String(run.x)}-${String(run.y)}`}
                    width={run.length}
                    x={run.x}
                    y={run.y}
                />
            ))}
        </svg>
    );
}
