import { expect, it, vi } from "vitest";
import type { DesktopHappyCloud } from "../shared/desktopContract";
import { desktopCloudConnectStoreCreate } from "./desktopCloudConnectStore";

/*
 * Test-account sign-in hides behind ten presses on the welcome's logo within
 * four seconds. The password goes to the shell with the request and is not
 * kept in the screen's state; a refusal is said inline.
 */

function cloudCreate(passwordSignIn: DesktopHappyCloud["passwordSignIn"]) {
    const cloud: DesktopHappyCloud = {
        serversList: vi.fn(async () => ({ ok: true as const, value: [] })),
        availability: vi.fn(),
        serverCreate: vi.fn(),
        serverJoin: vi.fn(),
        serverConnect: vi.fn(),
        imageRead: vi.fn(async () => undefined),
        serverRemove: vi.fn(),
        accountSignOut: vi.fn(),
        passwordSignIn: vi.fn(passwordSignIn),
    };
    return cloud;
}

function storeCreate(cloud: DesktopHappyCloud) {
    let clock = 0;
    const store = desktopCloudConnectStoreCreate({
        cloud,
        bridge: {},
        connect: async () => ({ ok: true }),
        now: () => clock,
    });
    store.connectOpen();
    return {
        store,
        press(times: number, every: number) {
            for (let i = 0; i < times; i += 1) {
                store.logoPress();
                clock += every;
            }
        },
    };
}

it("reveals test sign-in only after ten presses within four seconds", () => {
    // Presses spread wider than the window never add up.
    const spread = storeCreate(cloudCreate(async () => ({ ok: true, value: undefined })));
    spread.press(30, 450);
    expect(spread.store.get()).toEqual({ kind: "welcome" });
    const { store, press } = storeCreate(cloudCreate(async () => ({ ok: true, value: undefined })));
    press(9, 100);
    expect(store.get()).toEqual({ kind: "welcome" });
    press(1, 100);
    expect(store.get()).toEqual({ kind: "welcome", testSignIn: { login: "", password: "" } });
});

it("sends the password once, keeps none of it, and lists the servers", async () => {
    const cloud = cloudCreate(async () => ({ ok: true, value: undefined }));
    const { store, press } = storeCreate(cloud);
    press(10, 10);
    store.testLoginUpdate(" qa-desktop ");
    store.testPasswordUpdate("hunter2");
    store.testSignIn();
    expect(cloud.passwordSignIn).toHaveBeenCalledWith("qa-desktop", "hunter2");
    expect(JSON.stringify(store.get())).not.toContain("hunter2");
    await vi.waitFor(() =>
        expect(store.get()).toEqual({
            kind: "create",
            name: "",
            availability: "idle",
            back: false,
        }),
    );
});

it("says why a test sign-in was refused, with the password cleared", async () => {
    const { store, press } = storeCreate(
        cloudCreate(async () => ({
            ok: false,
            code: "invalid_credentials",
            message: "That login or password is wrong.",
        })),
    );
    press(10, 10);
    store.testLoginUpdate("qa-desktop");
    store.testPasswordUpdate("wrong");
    store.testSignIn();
    await vi.waitFor(() =>
        expect(store.get()).toEqual({
            kind: "welcome",
            testSignIn: {
                login: "qa-desktop",
                password: "",
                error: "That login or password is wrong.",
            },
        }),
    );
});
