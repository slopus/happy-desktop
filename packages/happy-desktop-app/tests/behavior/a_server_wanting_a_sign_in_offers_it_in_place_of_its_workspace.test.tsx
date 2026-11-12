import { fireEvent, render, waitFor } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { expect, it, onTestFinished } from "vitest";
import {
    appearanceStoreCreate,
    happyAgentSettingsStoreCreate,
    mobilePairingMethodStoreCreate,
} from "happy-desktop-state";
import type {
    AppHappyAgentDirectorySnapshot,
    AppHappyAgentSignIn,
} from "../../sources/AppHappyAgentView";
import {
    happyAgentMemoryHistoryCreate,
    happyAgentRouterCreate,
    type HappyAgentRouterContext,
} from "../../sources/navigation/happyAgentRouter";

/*
 * A team server that has never had a workspace on screen has nothing to show
 * but the way in. Its surface says what the sign-in wants and offers it,
 * rather than waiting on a splash for a connection that cannot come.
 */

async function serverOpen(signIn: AppHappyAgentSignIn) {
    const signedIn: string[] = [];
    const cancelled: string[] = [];
    const snapshot: AppHappyAgentDirectorySnapshot = {
        activeHappyAgentId: "connection:team",
        happyAgents: [
            {
                id: "connection:team",
                remoteId: "team",
                label: "Example Engineering",
                status: "error",
                message: "Sign in to this server to use it.",
                serverUrl: "https://happy.example.com/",
                signIn,
                projects: [],
                bots: [],
                projectsStatus: "loading",
            },
        ],
    };
    const router = happyAgentRouterCreate(happyAgentMemoryHistoryCreate("/"));
    onTestFinished(() => router.history.destroy());
    const context: HappyAgentRouterContext = {
        appearance: appearanceStoreCreate({ mode: "light" }),
        connectionOnboarding: true,
        happyAgents: {
            get: () => snapshot,
            subscribe: () => () => undefined,
            happyAgentActivate: () => undefined,
            happyAgentSignIn: (id) => signedIn.push(id),
            happyAgentSignInCancel: (id) => cancelled.push(id),
        },
        settings: happyAgentSettingsStoreCreate(),
        mobilePairingMethod: mobilePairingMethodStoreCreate({ defaultMethod: "direct" }),
    };
    router.update({ context });
    await router.load();
    const view = render(<RouterProvider context={context} router={router} />);
    onTestFinished(() => view.unmount());
    await waitFor(() => expect(view.getByTestId("happy-agent-sign-in")).toBeTruthy());
    return { view, signedIn, cancelled };
}

it("offers the first sign-in where the server's workspace would be", async () => {
    const { view, signedIn } = await serverOpen({ phase: "required", reason: "first" });
    expect(view.getByText("Sign in to this server")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Sign in" }));
    expect(signedIn).toEqual(["connection:team"]);
});

it("offers a new sign-in once one ended, and its cancelling while the browser is open", async () => {
    const ended = await serverOpen({ phase: "required", reason: "ended" });
    fireEvent.click(ended.view.getByRole("button", { name: "Sign in again" }));
    expect(ended.signedIn).toEqual(["connection:team"]);
    ended.view.unmount();

    const browsing = await serverOpen({ phase: "browser", host: "sso.example.com" });
    expect(
        browsing.view.getByText("Finish signing in at sso.example.com in your browser."),
    ).toBeTruthy();
    fireEvent.click(browsing.view.getByRole("button", { name: "Cancel" }));
    expect(browsing.cancelled).toEqual(["connection:team"]);
    expect(browsing.signedIn).toEqual([]);
});
