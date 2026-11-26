import { useRef, useState, type DragEvent as ReactDragEvent } from "react";

export interface ImageDrop<T extends HTMLElement> {
    /** True while a drag that may carry an accepted picture is over the zone. */
    readonly dropping: boolean;
    /** Spread on the drop zone. */
    readonly zoneProps: {
        onDragEnter(event: ReactDragEvent<T>): void;
        onDragOver(event: ReactDragEvent<T>): void;
        onDragLeave(event: ReactDragEvent<T>): void;
        onDrop(event: ReactDragEvent<T>): void;
    };
}

/**
 * Whether a drag may be bringing a picture `accept` names. Only a file drag
 * can; while it is in flight most engines say each file's type, and a file
 * whose type is not said yet is given the benefit of the doubt until the drop.
 */
function dragMayCarry(transfer: DataTransfer, accept: readonly string[]): boolean {
    if (!Array.from(transfer.types).includes("Files")) return false;
    const files = Array.from(transfer.items).filter((item) => item.kind === "file");
    return files.length === 0 || files.some((item) => !item.type || accept.includes(item.type));
}

/**
 * A zone a picture can be dropped on, to be taken exactly as the file picker
 * beside it would take it. `accept` is the picker's own filter. Anything that
 * is not one of those pictures is not answered, so the zone neither lights up
 * for it nor takes it.
 *
 * `dragenter` and `dragleave` fire on every child the pointer crosses, so the
 * zone counts them and is left only when the count is back to nothing.
 */
export function useImageDrop<T extends HTMLElement>(options: {
    readonly accept: string;
    readonly disabled: boolean;
    onFile(file: File): void;
}): ImageDrop<T> {
    const [dropping, setDropping] = useState(false);
    const depth = useRef(0);
    const accept = options.accept.split(",");
    const answer = (event: ReactDragEvent<T>): boolean => {
        if (options.disabled || !dragMayCarry(event.dataTransfer, accept)) return false;
        // An unanswered drag leaves the browser's default in charge, which
        // opens the dropped file over the page.
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        return true;
    };
    return {
        dropping: dropping && !options.disabled,
        zoneProps: {
            onDragEnter: (event) => {
                if (!answer(event)) return;
                depth.current += 1;
                setDropping(true);
            },
            onDragOver: (event) => {
                answer(event);
            },
            onDragLeave: () => {
                if (depth.current === 0) return;
                depth.current -= 1;
                if (depth.current === 0) setDropping(false);
            },
            onDrop: (event) => {
                depth.current = 0;
                setDropping(false);
                if (!answer(event)) return;
                const file = Array.from(event.dataTransfer.files).find((candidate) =>
                    accept.includes(candidate.type),
                );
                if (file) options.onFile(file);
            },
        },
    };
}
