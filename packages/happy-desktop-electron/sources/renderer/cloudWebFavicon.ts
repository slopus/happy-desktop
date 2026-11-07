import { LOCAL_HAPPY_AGENT_ID, type HappyAgentDirectoryStore } from "./happyAgentDirectoryStore";

/**
 * Where the last drawn server icon is kept, so `/favicon-cache.js` can put it
 * back before the app loads. The two must agree on this name.
 */
const CACHE_KEY = "happy.favicon";
const TAB_SIZE = 64;
const TOUCH_SIZE = 180;
/** The superellipse exponent that reads like an iPhone icon's continuous corners. */
const CORNER_EXPONENT = 5;

interface FaviconCache {
    readonly key: string;
    readonly icon: string;
    readonly touch: string;
}

/** Traces a superellipse filling a `size` square; the default icon's shape. */
function squircleTrace(context: CanvasRenderingContext2D, size: number): void {
    const half = size / 2;
    const steps = 180;
    context.beginPath();
    for (let step = 0; step < steps; step++) {
        const angle = (2 * Math.PI * step) / steps;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = half + half * Math.sign(cos) * Math.abs(cos) ** (2 / CORNER_EXPONENT);
        const y = half + half * Math.sign(sin) * Math.abs(sin) ** (2 / CORNER_EXPONENT);
        if (step === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
    }
    context.closePath();
}

/** The picture cropped to a centered square, optionally clipped to the icon shape. */
function iconDraw(image: HTMLImageElement, size: number, rounded: boolean): string {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D canvas.");
    if (rounded) {
        squircleTrace(context, size);
        context.clip();
    }
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.imageSmoothingQuality = "high";
    context.drawImage(
        image,
        (image.naturalWidth - side) / 2,
        (image.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        size,
        size,
    );
    return canvas.toDataURL("image/png");
}

function cacheRead(): FaviconCache | undefined {
    try {
        const stored = window.localStorage.getItem(CACHE_KEY);
        const parsed: unknown = stored === null ? undefined : JSON.parse(stored);
        if (
            typeof parsed === "object" &&
            parsed !== null &&
            "key" in parsed &&
            "icon" in parsed &&
            "touch" in parsed &&
            typeof parsed.key === "string" &&
            typeof parsed.icon === "string" &&
            typeof parsed.touch === "string"
        )
            return { key: parsed.key, icon: parsed.icon, touch: parsed.touch };
    } catch {
        // A damaged record only costs the head start.
    }
    return undefined;
}

function cacheWrite(cache: FaviconCache | undefined): void {
    try {
        if (cache) window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        else window.localStorage.removeItem(CACHE_KEY);
    } catch {
        // A full or refused storage only costs the head start.
    }
}

/**
 * Shows the server's own picture as the cloud web app's tab icon, clipped to
 * the same rounded square as Happy's default icon, and Happy's icon when the
 * server has none or its picture does not load. The picture is followed from
 * the server's own identity, so a new one replaces the icon without a reload.
 */
export function cloudWebFaviconFollow(directory: HappyAgentDirectoryStore): () => void {
    const head = document.head;
    // The page's own icons, from the static build, put back whenever the
    // server has no picture to show instead. `/favicon-cache.js` may have
    // set them aside already, keeping each one's own `rel` beside it.
    const defaults = [
        ...head.querySelectorAll<HTMLLinkElement>('link[data-happy-icon="default"]'),
    ].map((link) => {
        const kept = link.cloneNode() as HTMLLinkElement;
        kept.rel = link.dataset.rel ?? link.rel;
        delete kept.dataset.rel;
        return kept;
    });
    let shown: string | undefined;
    let wanted: string | undefined;

    const linksReplace = (links: readonly HTMLLinkElement[]): void => {
        for (const link of head.querySelectorAll("link[data-happy-icon]")) link.remove();
        for (const link of links) head.append(link);
    };
    const defaultShow = (): void => {
        if (shown === "default") return;
        shown = "default";
        linksReplace(defaults.map((link) => link.cloneNode() as HTMLLinkElement));
        cacheWrite(undefined);
    };
    const iconShow = (cache: FaviconCache): void => {
        if (shown === cache.key) return;
        shown = cache.key;
        const icon = document.createElement("link");
        icon.dataset.happyIcon = "server";
        icon.rel = "icon";
        icon.type = "image/png";
        icon.href = cache.icon;
        const touch = document.createElement("link");
        touch.dataset.happyIcon = "server";
        touch.rel = "apple-touch-icon";
        touch.href = cache.touch;
        linksReplace([icon, touch]);
        cacheWrite(cache);
    };

    const follow = (): void => {
        const node = directory
            .get()
            .happyAgents.find((entry) => entry.id === LOCAL_HAPPY_AGENT_ID)?.node;
        // Until the server has said who it is, the icon already showing stays.
        if (!node) return;
        const avatar = node.avatar;
        const key = avatar?.thumbhash ?? "";
        if (key === wanted) return;
        wanted = key;
        if (!avatar) {
            defaultShow();
            return;
        }
        const cached = cacheRead();
        if (cached?.key === key) {
            iconShow(cached);
            return;
        }
        const image = new Image();
        image.decoding = "async";
        image.onload = () => {
            if (wanted !== key) return;
            try {
                iconShow({
                    key,
                    icon: iconDraw(image, TAB_SIZE, true),
                    // The home screen rounds its icons itself.
                    touch: iconDraw(image, TOUCH_SIZE, false),
                });
            } catch {
                defaultShow();
            }
        };
        image.onerror = () => {
            if (wanted === key) defaultShow();
        };
        // The address stays the same when the picture changes, so its
        // thumbhash tells this request apart from a cached older one.
        image.src = `${avatar.url}?v=${encodeURIComponent(key)}`;
    };
    follow();
    return directory.subscribe(follow);
}
