import { act, fireEvent, render, within } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { expect, it, vi } from "vitest";
import {
    happyAgentComputeStoreCreate,
    HappyCloudRequestRefusal,
    UserError,
    type HappyAgentComputeStore,
    type HappyCloudRequest,
} from "happy-desktop-state";
import { AppComputeSettings } from "../../sources/views/AppComputeSettings";

// jsdom has no canvas, and a button that is busy draws a spinner.
vi.mock("../../../happy-desktop-ui/src/Spinner", () => ({ Spinner: () => null }));

/*
 * A computer the reader may manage is deleted from its own dialog, through a
 * confirmation that says what happens. It leaves the list, and its dialog
 * closes, only once Happy Cloud says it is gone: a refusal or a request that
 * never arrives keeps it, and a computer already gone is let go all the same.
 */

/** How Happy Cloud answers the one `DELETE`, once the test lets it. */
type Answer = "deleted" | "not found" | "forbidden" | "offline";

function serverCreate() {
    let computers = [
        { id: "c1", name: "build-01", status: "online", access: "shared", agents: [] },
        { id: "c2", name: "gpu-box", status: "online", access: "shared", agents: [] },
    ];
    const deletes: string[] = [];
    let answer: ((answer: Answer) => void) | undefined;
    const request: HappyCloudRequest = async (method, path) => {
        if (method === "DELETE") {
            deletes.push(path);
            const id = decodeURIComponent(path.replace("v0/computers/", ""));
            const given = await new Promise<Answer>((resolve) => {
                answer = resolve;
            });
            if (given === "deleted" || given === "not found")
                computers = computers.filter((computer) => computer.id !== id);
            if (given === "deleted") return undefined;
            if (given === "not found")
                throw new HappyCloudRequestRefusal("Computer not found", "not_found", 404, {
                    error: "Computer not found",
                    code: "computer_not_found",
                });
            if (given === "forbidden")
                throw new HappyCloudRequestRefusal("Forbidden", "forbidden", 403, {
                    error: "Forbidden",
                    code: "forbidden",
                });
            throw new UserError("Happy couldn't reach the server.", "offline");
        }
        if (path === "v0/permissions") return { granted: ["compute.use", "pools.manage"] };
        if (path === "v0/profile") return { profile: { userId: "reader" } };
        if (path === "v0/computers") return { computers };
        if (path === "v0/computers/approvals") return { approvals: [] };
        throw new Error(`Unexpected ${method} ${path}`);
    };
    return {
        request,
        deletes,
        answer: async (given: Answer) => {
            await act(async () => {
                answer?.(given);
                await Promise.resolve();
            });
        },
    };
}

function Screen(props: { readonly store: HappyAgentComputeStore }) {
    const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get);
    return <AppComputeSettings snapshot={snapshot} store={props.store} />;
}

/** Opens build-01's dialog, then its deletion's confirmation. */
async function confirmationOpen() {
    const server = serverCreate();
    const store = happyAgentComputeStoreCreate({ request: server.request });
    const view = render(<Screen store={store} />);
    const row = (await view.findByText("build-01")).closest(
        '[data-happy-desktop-ui="compute-machine"]',
    ) as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Manage" }));
    fireEvent.click(
        within(view.getByRole("dialog", { name: "build-01" })).getByRole("button", {
            name: "Delete…",
        }),
    );
    const confirmation = view.getByRole("dialog", { name: "Delete build-01?" });
    return { server, store, view, confirmation };
}

const listed = (store: HappyAgentComputeStore) => store.get().machines.map((machine) => machine.id);

it("deletes a computer once confirmed, and leaves its view", async () => {
    const { server, store, view, confirmation } = await confirmationOpen();
    expect(confirmation.textContent).toContain(
        "It is disconnected right away. Agents using it lose access to its files, terminals and tools, and are told on their next turn. To use this machine again, install it again with a new join command.",
    );
    // The confirmation takes the computer's own dialog's place.
    expect(view.queryByRole("dialog", { name: "build-01" })).toBeNull();

    const confirm = within(confirmation).getByRole("button", { name: "Delete computer" });
    fireEvent.click(confirm);
    expect(server.deletes).toEqual(["v0/computers/c1"]);
    // Nothing leaves before the server answers, and nothing can be pressed twice.
    expect(confirm.hasAttribute("disabled")).toBe(true);
    expect(
        within(confirmation).getByRole("button", { name: "Cancel" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(confirm);
    expect(server.deletes).toHaveLength(1);
    expect(listed(store)).toEqual(["c1", "c2"]);

    await server.answer("deleted");
    expect(listed(store)).toEqual(["c2"]);
    expect(view.queryByRole("dialog")).toBeNull();
    expect(view.queryByText("build-01")).toBeNull();
    expect(view.getByText("gpu-box")).toBeTruthy();
    expect(store.get().machineDetail).toBeUndefined();
    expect(store.get().machineDeletion).toBeUndefined();
    view.unmount();
    store[Symbol.dispose]();
});

it("keeps a computer the server won't let the reader delete, and says why", async () => {
    const { server, store, view, confirmation } = await confirmationOpen();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete computer" }));
    await server.answer("forbidden");

    const refused = view.getByRole("dialog", { name: "Delete build-01?" });
    expect(within(refused).getByText("You can't delete this computer.")).toBeTruthy();
    expect(
        within(refused).getByRole("button", { name: "Delete computer" }).hasAttribute("disabled"),
    ).toBe(false);
    expect(listed(store)).toEqual(["c1", "c2"]);

    // Cancelling goes back to the computer, still there.
    fireEvent.click(within(refused).getByRole("button", { name: "Cancel" }));
    expect(view.getByRole("dialog", { name: "build-01" })).toBeTruthy();
    view.unmount();
    store[Symbol.dispose]();
});

it("keeps a computer when the deletion never reaches the server", async () => {
    const { server, store, view, confirmation } = await confirmationOpen();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete computer" }));
    await server.answer("offline");

    const failed = view.getByRole("dialog", { name: "Delete build-01?" });
    expect(within(failed).getByText("Happy couldn't reach the server.")).toBeTruthy();
    expect(listed(store)).toEqual(["c1", "c2"]);
    view.unmount();
    store[Symbol.dispose]();
});

it("lets go of a computer that was already deleted", async () => {
    const { server, store, view, confirmation } = await confirmationOpen();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete computer" }));
    await server.answer("not found");

    expect(listed(store)).toEqual(["c2"]);
    expect(view.queryByRole("dialog")).toBeNull();
    expect(view.getByText("build-01 was already deleted.")).toBeTruthy();
    expect(view.queryByText("That didn't go through")).toBeNull();
    view.unmount();
    store[Symbol.dispose]();
});

it("sends nothing when the deletion is cancelled", async () => {
    const { server, store, view, confirmation } = await confirmationOpen();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));

    expect(server.deletes).toEqual([]);
    expect(view.queryByRole("dialog", { name: "Delete build-01?" })).toBeNull();
    expect(view.getByRole("dialog", { name: "build-01" })).toBeTruthy();
    expect(listed(store)).toEqual(["c1", "c2"]);
    view.unmount();
    store[Symbol.dispose]();
});
