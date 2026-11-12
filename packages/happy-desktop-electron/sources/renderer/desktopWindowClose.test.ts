import { describe, expect, it, vi } from "vitest";
import { desktopWindowClose } from "./desktopWindowClose";

describe("closing the window from the page", () => {
    it("asks the shell to close the window, once per request", () => {
        const windowClose = vi.fn(() => Promise.resolve());
        const close = desktopWindowClose({ windowClose });

        expect(windowClose).not.toHaveBeenCalled();
        close?.();
        expect(windowClose).toHaveBeenCalledTimes(1);
    });

    it("offers no way to close under a shell older than the method", () => {
        // What the preload of an earlier shell exposes: no such field at all.
        expect(desktopWindowClose({})).toBeUndefined();
    });

    it("drops a refusal from the shell rather than leaving it unhandled", async () => {
        const unhandled = vi.fn();
        process.on("unhandledRejection", unhandled);
        const close = desktopWindowClose({
            windowClose: () => Promise.reject(new Error("This window cannot be closed.")),
        });

        close?.();
        await new Promise((resolve) => setTimeout(resolve, 0));

        process.off("unhandledRejection", unhandled);
        expect(unhandled).not.toHaveBeenCalled();
    });
});
