import {
    useCallback,
    useEffectEvent,
    useLayoutEffect,
    useRef,
    useState,
    type PointerEvent,
} from "react";
import { haptic } from "./haptics";

interface ConnectionDrag {
    readonly pointerId: number;
    readonly startY: number;
    readonly peers: readonly string[];
    readonly tops: readonly number[];
    readonly from: number;
    readonly to: number;
    readonly deltaY: number;
    readonly moved: boolean;
}

/** The project sidebar's direct manipulation, specialized to a flat tile rail. */
export function useConnectionReorder(
    ids: readonly string[],
    onReorder: ((id: string, afterId: string | null) => void) | undefined,
) {
    const [drag, setDrag] = useState<ConnectionDrag>();
    const live = useRef<ConnectionDrag | undefined>(undefined);
    const rail = useRef<HTMLDivElement | null>(null);
    const suppressClick = useRef(false);
    const firsts = useRef<Map<string, number> | undefined>(undefined);
    const animations = useRef(new Set<Animation>());
    // Stable ref identity is a lifecycle contract: ordinary drag paints must not
    // dispose the rail or cancel the drop animations it owns.
    const railRef = useCallback((node: HTMLDivElement | null) => {
        rail.current = node;
        return () => {
            for (const animation of animations.current) animation.cancel();
            animations.current.clear();
            rail.current = null;
            live.current = undefined;
            setDrag(undefined);
        };
    }, []);
    const update = (next: ConnectionDrag | undefined) => {
        live.current = next;
        setDrag(next);
    };
    const nodes = () => [
        ...(rail.current?.querySelectorAll<HTMLButtonElement>("[data-connection-id]") ?? []),
    ];
    const capture = () => {
        firsts.current = new Map(
            nodes().map((node) => [node.dataset.connectionId!, node.getBoundingClientRect().top]),
        );
    };
    const cancel = () => {
        if (!live.current) return;
        suppressClick.current = live.current.moved;
        capture();
        update(undefined);
    };
    const dragging = drag !== undefined;
    const cancelEvent = useEffectEvent(cancel);
    // eslint-disable-next-line happy-react/no-layout-effect -- Capture loss on a removed tile is delivered to the document; Escape and window blur also cancel the captured gesture. All listeners belong to one drag.
    useLayoutEffect(() => {
        if (!dragging) return;
        const lost = (event: globalThis.PointerEvent) => {
            if (event.pointerId === live.current?.pointerId) cancelEvent();
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                cancelEvent();
            }
        };
        document.addEventListener("lostpointercapture", lost);
        document.addEventListener("keydown", escape);
        const blur = () => cancelEvent();
        window.addEventListener("blur", blur);
        return () => {
            document.removeEventListener("lostpointercapture", lost);
            document.removeEventListener("keydown", escape);
            window.removeEventListener("blur", blur);
        };
    }, [dragging]);
    // eslint-disable-next-line happy-react/no-layout-effect -- FLIP requires post-commit tile geometry to settle the carried tile from its release position. The rail ref cancels animations on disposal, not unrelated renders.
    useLayoutEffect(() => {
        const before = firsts.current;
        if (!before) return;
        firsts.current = undefined;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        for (const node of nodes()) {
            const top = before.get(node.dataset.connectionId!);
            if (top === undefined) continue;
            const delta = top - node.getBoundingClientRect().top;
            if (Math.abs(delta) < 0.5) continue;
            const animation = node.animate(
                [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
                { duration: 160, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
            );
            animations.current.add(animation);
            void animation.finished
                .catch(() => undefined)
                .then(() => animations.current.delete(animation));
        }
    });
    const shift = (id: string): number => {
        if (!drag?.moved) return 0;
        const index = drag.peers.indexOf(id);
        if (index < 0) return 0;
        if (index === drag.from) return drag.deltaY;
        if (drag.from < drag.to && index > drag.from && index <= drag.to)
            return drag.tops[index - 1]! - drag.tops[index]!;
        if (drag.to < drag.from && index >= drag.to && index < drag.from)
            return drag.tops[index + 1]! - drag.tops[index]!;
        return 0;
    };
    return {
        railRef,
        dragging: drag?.moved === true,
        heldId: drag?.moved ? drag.peers[drag.from] : undefined,
        shift,
        clickAllowed() {
            if (!suppressClick.current) return true;
            suppressClick.current = false;
            return false;
        },
        start(event: PointerEvent<HTMLButtonElement>, id: string) {
            suppressClick.current = false;
            if (!onReorder || event.button !== 0 || ids.length < 2 || !ids.includes(id)) return;
            for (const animation of animations.current) animation.cancel();
            const peers = nodes().filter((node) => ids.includes(node.dataset.connectionId!));
            const from = peers.findIndex((node) => node.dataset.connectionId === id);
            if (from < 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            update({
                pointerId: event.pointerId,
                startY: event.clientY,
                peers: peers.map((node) => node.dataset.connectionId!),
                tops: peers.map((node) => node.getBoundingClientRect().top),
                from,
                to: from,
                deltaY: 0,
                moved: false,
            });
        },
        move(event: PointerEvent<HTMLButtonElement>) {
            const current = live.current;
            if (!current || event.pointerId !== current.pointerId) return;
            if (
                !onReorder ||
                current.peers.some((id, index) => ids[index] !== id) ||
                current.peers.length !== ids.length
            ) {
                cancel();
                return;
            }
            const travel = event.clientY - current.startY;
            if (!current.moved && Math.abs(travel) < 4) return;
            const origin = current.tops[current.from]!;
            const deltaY = Math.max(
                current.tops[0]! - origin,
                Math.min(travel, current.tops.at(-1)! - origin),
            );
            let to = current.from;
            while (
                to < current.tops.length - 1 &&
                origin + deltaY > (current.tops[to]! + current.tops[to + 1]!) / 2
            )
                to++;
            while (to > 0 && origin + deltaY < (current.tops[to]! + current.tops[to - 1]!) / 2)
                to--;
            if (to !== current.to) haptic("selection");
            update({ ...current, deltaY, to, moved: true });
        },
        end(event: PointerEvent<HTMLButtonElement>) {
            const current = live.current;
            if (!current || event.pointerId !== current.pointerId) return;
            if (
                current.peers.length !== ids.length ||
                current.peers.some((id, index) => ids[index] !== id)
            ) {
                cancel();
                return;
            }
            if (current.moved) capture();
            suppressClick.current = current.moved;
            update(undefined);
            if (!current.moved || current.from === current.to || !onReorder) return;
            const id = current.peers[current.from]!;
            const remaining = current.peers.filter((peer) => peer !== id);
            const afterId = remaining[current.to - 1] ?? null;
            if (!ids.includes(id) || (afterId !== null && !ids.includes(afterId))) return;
            haptic("impact");
            onReorder(id, afterId);
        },
        cancel,
        keyboardMove(id: string, direction: -1 | 1) {
            if (live.current || !onReorder) return;
            const from = ids.indexOf(id);
            const to = from + direction;
            if (from < 0 || to < 0 || to >= ids.length) return;
            capture();
            haptic("selection");
            const remaining = ids.filter((peer) => peer !== id);
            onReorder(id, remaining[to - 1] ?? null);
        },
    };
}
