import type { ReactNode } from "react";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import PierreHighlightWorker from "@pierre/diffs/worker/worker.js?worker";

/**
 * Syntax highlighting off the main thread.
 *
 * Pierre Diffs tokenizes with Shiki, and a TextMate grammar over a large file
 * is real work: run on the main thread it stalls typing and scrolling for as
 * long as the file is long. Mounting this provider once near the top of a
 * surface moves that work into a small pool of Web Workers; every `CodeBlock`
 * and `ChangedFileDiff` beneath it picks the pool up from context and tokenizes
 * there instead. Nothing else changes — without the provider the same
 * components highlight on the main thread, which is what a test or a Blueprint
 * page wants.
 *
 * What is paid for it is one pass of uncoloured text: with a pool the renderer
 * never takes a highlighter synchronously, so rows are drawn immediately and
 * tokens arrive by message. That wait is the tokenizing itself and scales with
 * the file — measured at roughly 100 ms over 180 lines and 490 ms over 3,600.
 * Opening the same content again is immediate, because the result is cached
 * against the diff's identity. Warming the pool's grammars ahead of time was
 * tried and changed nothing (412 ms against 409 ms over six files), which is
 * how we know the wait is the work and not the starting.
 *
 * The pool is a process-wide singleton, so mounting the provider twice shares
 * one pool rather than starting a second.
 */
export function CodeHighlightWorkers(props: { children: ReactNode }) {
    // jsdom has no Worker, so a test render takes the main-thread fallback
    // described above instead of constructing a pool that cannot start.
    if (typeof Worker === "undefined") return props.children;
    return (
        <WorkerPoolContextProvider
            // The pool tokenizes for whatever renders under it, so it is
            // initialized with the one palette every code surface here asks for.
            highlighterOptions={{ theme: { dark: "pierre-dark", light: "pierre-light" } }}
            poolOptions={{
                // Four, because the review stream hands over every changed file
                // in a checkout at once and they queue on whatever is here. Two
                // was sized for "one file and one diff", which a review is not:
                // six files at once finished colouring in 544 ms on two workers
                // and 409 ms on four. Still well under the library's default of
                // eight, which is eight idle threads with no question behind
                // them.
                poolSize: 4,
                // Pierre keeps separate file and diff AST LRUs at this size;
                // cap each one explicitly so the worker pool cannot retain
                // its library default of 100 entries per cache.
                totalASTLRUCacheSize: 24,
                workerFactory: () => new PierreHighlightWorker(),
            }}
        >
            {props.children}
        </WorkerPoolContextProvider>
    );
}
