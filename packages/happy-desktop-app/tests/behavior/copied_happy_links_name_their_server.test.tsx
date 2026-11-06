import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { happyExternalLinkFormat, happyShareLinkFormat, isHappyUrl } from "happy-desktop-state";
import { LinkContextMenu, LinkCopyContext } from "happy-desktop-ui";

/*
 * A Happy link copied out of the window is its link.happy.page share link,
 * naming the server it is on, so it opens there and nowhere else. A server
 * that reports no instance has no such link and offers nothing to copy, and
 * anything that is not a Happy link is copied as it is.
 */

const TEAM = "k3x9q2m7p0a4b8c1d5e6f7g2";

function view(href: string, instanceId: string | undefined) {
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const rendered = render(
        <LinkCopyContext.Provider
            value={(link) =>
                !isHappyUrl(link)
                    ? link
                    : instanceId === undefined
                      ? undefined
                      : happyShareLinkFormat(happyExternalLinkFormat(instanceId, link))
            }
        >
            <LinkContextMenu href={href} onClose={() => undefined} x={10} y={10} />
        </LinkCopyContext.Provider>,
    );
    return { rendered, writeText };
}

async function copied(href: string, instanceId: string | undefined): Promise<string> {
    const { rendered, writeText } = view(href, instanceId);
    fireEvent.click(rendered.getByRole("menuitem", { name: /Copy link/u }));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    rendered.unmount();
    return writeText.mock.calls[0]![0];
}

it("copies a Happy link as the share link of the server it is on", async () => {
    expect(await copied("happy://artifacts/abc123?version=2", TEAM)).toBe(
        `https://link.happy.page/#1/${TEAM}/artifacts/abc123?version=2`,
    );
});

it("copies other links unchanged, and offers no copy of a Happy link with no server", async () => {
    expect(await copied("https://example.com/a", TEAM)).toBe("https://example.com/a");
    const { rendered } = view("happy://artifacts/abc123", undefined);
    expect(rendered.queryByRole("menuitem", { name: /Copy link/u })).toBeNull();
    rendered.unmount();
});
