import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Display } from "electron";
import type { DesktopWindowBounds } from "./windowLifecycle";

const windowStateVersion = 1;
const writeDelayMs = 250;
const minimumVisibleLength = 64;

interface DesktopWindowState {
    bounds: DesktopWindowBounds;
    version: typeof windowStateVersion;
}

/** Persists the latest normal desktop window geometry without writing on every resize event. */
export class DesktopWindowStateStore {
    private operation = Promise.resolve();
    private pending?: ReturnType<typeof setTimeout>;

    private constructor(
        private readonly path: string,
        private value: DesktopWindowState | undefined,
    ) {}

    static async create(path: string): Promise<DesktopWindowStateStore> {
        return new DesktopWindowStateStore(path, await windowStateRead(path));
    }

    restore(
        displays: readonly Display[],
        primaryDisplay: Display,
    ): DesktopWindowBounds | undefined {
        const bounds = this.value?.bounds;
        if (!bounds) return undefined;
        const overlapping = displays
            .filter(({ workArea }) => boundsVisible(bounds, workArea))
            .sort((a, b) => overlapArea(bounds, b.workArea) - overlapArea(bounds, a.workArea))[0];
        if (overlapping) return boundsFit(bounds, overlapping.workArea);

        const { workArea } = primaryDisplay;
        const width = Math.min(bounds.width, workArea.width);
        const height = Math.min(bounds.height, workArea.height);
        return {
            height,
            width,
            x: Math.round(workArea.x + (workArea.width - width) / 2),
            y: Math.round(workArea.y + (workArea.height - height) / 2),
        };
    }

    remember(bounds: DesktopWindowBounds): void {
        this.value = windowStateValidate({ bounds, version: windowStateVersion });
        if (this.pending) clearTimeout(this.pending);
        this.pending = setTimeout(() => {
            this.pending = undefined;
            void this.write().catch(() => undefined);
        }, writeDelayMs);
        this.pending.unref();
    }

    flush(): Promise<void> {
        if (this.pending) {
            clearTimeout(this.pending);
            this.pending = undefined;
        }
        return this.write();
    }

    private write(): Promise<void> {
        const value = this.value;
        if (!value) return this.operation;
        const operation = this.operation.then(() => windowStateWrite(this.path, value));
        this.operation = operation.catch(() => undefined);
        return operation;
    }
}

async function windowStateRead(path: string): Promise<DesktopWindowState | undefined> {
    try {
        return windowStateValidate(JSON.parse(await readFile(path, "utf8")));
    } catch (error) {
        if (
            error instanceof SyntaxError ||
            error instanceof InvalidWindowStateError ||
            (error as NodeJS.ErrnoException).code === "ENOENT"
        )
            return undefined;
        throw error;
    }
}

async function windowStateWrite(path: string, state: DesktopWindowState): Promise<void> {
    await mkdir(dirname(path), { mode: 0o700, recursive: true });
    const temporary = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
    try {
        await writeFile(temporary, `${JSON.stringify(state, undefined, 2)}\n`, {
            flag: "wx",
            mode: 0o600,
        });
        await rename(temporary, path);
    } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
}

function windowStateValidate(candidate: unknown): DesktopWindowState {
    if (!isRecord(candidate) || candidate.version !== windowStateVersion)
        throw new InvalidWindowStateError();
    if (
        Object.keys(candidate).some((key) => key !== "bounds" && key !== "version") ||
        !isRecord(candidate.bounds) ||
        Object.keys(candidate.bounds).some((key) => !["height", "width", "x", "y"].includes(key))
    )
        throw new InvalidWindowStateError();
    const { height, width, x, y } = candidate.bounds;
    if (
        !integerValid(height) ||
        !integerValid(width) ||
        !integerValid(x) ||
        !integerValid(y) ||
        height < 640 ||
        width < 720
    )
        throw new InvalidWindowStateError();
    return { bounds: { height, width, x, y }, version: windowStateVersion };
}

function boundsVisible(bounds: DesktopWindowBounds, workArea: DesktopWindowBounds): boolean {
    const visibleWidth =
        Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
        Math.max(bounds.x, workArea.x);
    const visibleHeight =
        Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
        Math.max(bounds.y, workArea.y);
    return visibleWidth >= minimumVisibleLength && visibleHeight >= minimumVisibleLength;
}

function overlapArea(bounds: DesktopWindowBounds, workArea: DesktopWindowBounds): number {
    const width =
        Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
        Math.max(bounds.x, workArea.x);
    const height =
        Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
        Math.max(bounds.y, workArea.y);
    return Math.max(0, width) * Math.max(0, height);
}

/** Moves (and if needed shrinks) bounds so the whole window, title bar included, lies in the work area. */
function boundsFit(bounds: DesktopWindowBounds, workArea: DesktopWindowBounds): DesktopWindowBounds {
    const width = Math.min(bounds.width, workArea.width);
    const height = Math.min(bounds.height, workArea.height);
    const x = Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width);
    const y = Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height);
    return { height, width, x, y };
}

function integerValid(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

class InvalidWindowStateError extends Error {}
