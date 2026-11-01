import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { happyExternalLinkFormat } from "happy-desktop-state";
import { LinkContextMenu, LinkCopyContext } from "happy-desktop-ui";

/*
 * A Happy link copied out of the window is the external form, naming the
 * server it is on, so it opens there and nowhere else. A server that reports
 * no instance has no such link, and anything that is not a Happy link is
 * copied as it is.
 */

const TEAM = "k3x9q2m7p0a4b8c1d5e6f7g2";

async function copied(href: string, instanceId: string | undefined): Promise<string> {
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const view = render(
        <LinkCopyContext.Provider
            value={(link) =>
                instanceId === undefined ? link : happyExternalLinkFormat(instanceId, link)
            }
        >
            <LinkContextMenu href={href} onClose={() => undefined} x={10} y={10} />
        </LinkCopyContext.Provider>,
    );
    fireEvent.click(view.getByRole("menuitem", { name: /Copy link/u }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    view.unmount();
    return writeText.mock.calls[0]![0];
}

it("copies a Happy link with the server it is on", async () => {
    expect(await copied("happy://artifacts/abc123?version=2", TEAM)).toBe(
        `happy://${TEAM}/artifacts/abc123?version=2`,
    );
});

it("copies other links, and Happy links on a server with no instance, unchanged", async () => {
    expect(await copied("https://example.com/a", TEAM)).toBe("https://example.com/a");
    expect(await copied("happy://artifacts/abc123", undefined)).toBe("happy://artifacts/abc123");
});
