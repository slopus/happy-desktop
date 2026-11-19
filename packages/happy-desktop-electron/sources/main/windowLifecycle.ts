export interface DesktopWindowBounds {
    height: number;
    width: number;
    x: number;
    y: number;
}

/** Where a desktop window sits when not minimized: its normal bounds, and whether it fills the screen. */
export interface DesktopWindowPlacement {
    bounds: DesktopWindowBounds;
    maximized: boolean;
}

export interface DesktopManagedWindow {
    readonly webContents: {
        once(event: "did-fail-load", listener: () => void): void;
    };
    destroy(): void;
    getNormalBounds(): DesktopWindowBounds;
    isDestroyed(): boolean;
    isMaximized(): boolean;
    maximize(): void;
    on(event: "closed", listener: () => void): void;
    once(event: "ready-to-show", listener: () => void): void;
    show(): void;
}

export interface DesktopWindowCandidate<Window extends DesktopManagedWindow> {
    load(): Promise<void>;
    window: Window;
}

/** Replaces desktop windows without revealing or retaining superseded candidates. */
export class DesktopWindowLifecycle<Window extends DesktopManagedWindow> {
    private active?: { key: string; placement?: DesktopWindowPlacement; window: Window };
    private presented?: Window;

    constructor(private readonly present: (window: Window) => void = (window) => window.show()) {}

    get(): Window | undefined {
        return live(this.active?.window);
    }

    /**
     * A replacement takes the placement of the window it replaces; the first
     * window takes `restored`. Normal bounds are given to `create`, and a maximized
     * placement is applied just before reveal, since maximizing reveals a
     * hidden window on Windows.
     */
    synchronize(
        key: string,
        restored: DesktopWindowPlacement | undefined,
        create: (bounds?: DesktopWindowBounds) => DesktopWindowCandidate<Window>,
    ): Window {
        const current = live(this.active?.window);
        if (current && this.active?.key === key) return current;

        const presented = live(this.presented);
        // An unrevealed candidate has not been maximized yet, so it passes on
        // the placement it was given rather than its own.
        const placement = presented
            ? { bounds: presented.getNormalBounds(), maximized: presented.isMaximized() }
            : current
              ? this.active?.placement
              : restored;
        if (current && current !== presented) current.destroy();

        const candidate = create(placement?.bounds);
        const window = candidate.window;
        this.active = { key, placement, window };
        let revealed = false;
        const reveal = () => {
            if (revealed || window.isDestroyed() || this.active?.window !== window) return;
            revealed = true;
            if (placement?.maximized) window.maximize();
            this.present(window);
            const previous = live(this.presented);
            this.presented = window;
            if (previous && previous !== window) previous.destroy();
        };
        window.once("ready-to-show", reveal);
        window.webContents.once("did-fail-load", reveal);
        window.on("closed", () => {
            if (this.active?.window === window) this.active = undefined;
            if (this.presented === window) this.presented = undefined;
        });
        void candidate.load().catch(reveal);
        return window;
    }
}

function live<Window extends DesktopManagedWindow>(window: Window | undefined): Window | undefined {
    return window && !window.isDestroyed() ? window : undefined;
}
