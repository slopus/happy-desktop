import { expect, it } from "vitest";
import { cloudWebRefreshCreate } from "./cloudWebRefresh";

/** One origin: the storage and the lock every tab of it shares. */
function originCreate() {
    const values = new Map<string, string>();
    let tail: Promise<unknown> = Promise.resolve();
    let clock = 1_000;
    let posts = 0;
    let refreshOk = true;
    const tab = () =>
        cloudWebRefreshCreate({
            post: async () => {
                posts += 1;
                // The edge takes a moment, long enough for a second tab to queue.
                await new Promise((resolve) => setTimeout(resolve, 5));
                return refreshOk;
            },
            locked: <T>(task: () => Promise<T>): Promise<T> => {
                const run = tail.then(task, task);
                tail = run.catch(() => undefined);
                return run;
            },
            storage: {
                getItem: (key) => values.get(key) ?? null,
                setItem: (key, value) => void values.set(key, value),
            },
            now: () => (clock += 1),
        });
    return {
        tab,
        posts: () => posts,
        refreshFail: () => {
            refreshOk = false;
        },
        time: () => clock,
    };
}

it("two tabs refused together spend the refresh token once", async () => {
    const origin = originCreate();
    const first = origin.tab();
    const second = origin.tab();
    const refusedAt = origin.time();
    const answers = await Promise.all([first(refusedAt), second(refusedAt), second(refusedAt)]);
    expect(answers).toEqual([true, true, true]);
    expect(origin.posts()).toBe(1);
});

it("a refusal after the last refresh refreshes again", async () => {
    const origin = originCreate();
    const tab = origin.tab();
    expect(await tab(origin.time())).toBe(true);
    // Cookies the refresh issued were themselves refused later.
    expect(await tab(origin.time() + 10)).toBe(true);
    expect(origin.posts()).toBe(2);
});

it("a refused refresh ends the session instead of being retried", async () => {
    const origin = originCreate();
    origin.refreshFail();
    const first = origin.tab();
    const second = origin.tab();
    const refusedAt = origin.time();
    expect(await Promise.all([first(refusedAt), second(refusedAt)])).toEqual([false, false]);
    // The second tab saw no newer refresh, so it asked once itself and was refused too.
    expect(origin.posts()).toBe(2);
});
