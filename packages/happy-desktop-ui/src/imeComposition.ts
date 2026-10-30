import type { CompositionEvent, FocusEvent } from "react";

// DOM input lifecycle, not product state. Weak keys neither retain unmounted
// controls nor confuse two inputs/React roots. Capture consumers can read the
// same target's state before a child keydown handler runs.
const composingTargets = new WeakSet<EventTarget>();

export function imeCompositionActive(target: EventTarget | null): boolean {
    return target !== null && composingTargets.has(target);
}

export function imeKeyboardEvent(event: KeyboardEvent): boolean {
    // WebKit may dispatch compositionend before the confirming keydown. 229
    // still identifies that key, without delaying the next ordinary Enter.
    return event.isComposing || event.keyCode === 229 || imeCompositionActive(event.target);
}

// Spread on an input or its owning surface. Use target, not currentTarget:
// nested boundaries and portals can observe the same event idempotently.
// These handlers never cancel events, install global listeners, or own timers.
export const imeCompositionHandlers = {
    onCompositionStartCapture(event: CompositionEvent) {
        composingTargets.add(event.target);
    },
    onCompositionEndCapture(event: CompositionEvent) {
        composingTargets.delete(event.target);
    },
    onBlurCapture(event: FocusEvent) {
        composingTargets.delete(event.target);
    },
};
