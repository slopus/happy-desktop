import { cloudWebPasswordSignIn } from "./cloudWeb";

/** How many presses in a row reveal the test-account sign-in. */
const REVEAL_PRESSES = 10;

export interface CloudWebSignInSnapshot {
    /** The test-account sign-in, once revealed. */
    readonly test?: {
        readonly login: string;
        readonly password: string;
        readonly busy: boolean;
        readonly error?: string;
    };
}

export interface CloudWebSignInStore {
    get(): CloudWebSignInSnapshot;
    subscribe(listener: () => void): () => void;
    screenPress(): void;
    testLoginUpdate(login: string): void;
    testPasswordUpdate(password: string): void;
    testSignInSubmit(): void;
}

/** The web app's signed-out page: its hidden test-account sign-in and what is typed into it. */
export function cloudWebSignInStoreCreate(): CloudWebSignInStore {
    let snapshot: CloudWebSignInSnapshot = {};
    let presses = 0;
    const listeners = new Set<() => void>();
    const set = (next: CloudWebSignInSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const testUpdate = (change: Partial<NonNullable<CloudWebSignInSnapshot["test"]>>): void => {
        if (!snapshot.test || snapshot.test.busy) return;
        const { error: _cleared, ...rest } = snapshot.test;
        set({ test: { ...rest, ...change } });
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        screenPress() {
            if (snapshot.test) return;
            presses += 1;
            if (presses >= REVEAL_PRESSES) set({ test: { login: "", password: "", busy: false } });
        },
        testLoginUpdate: (login) => testUpdate({ login }),
        testPasswordUpdate: (password) => testUpdate({ password }),
        testSignInSubmit() {
            const test = snapshot.test;
            if (!test || test.busy || test.login.trim() === "" || test.password === "") return;
            set({ test: { ...test, busy: true } });
            void cloudWebPasswordSignIn(test.login.trim(), test.password).then((error) => {
                if (error === undefined || !snapshot.test) return;
                set({ test: { ...snapshot.test, busy: false, error } });
            });
        },
    };
}
