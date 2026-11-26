import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import "./styles.css";
import { EmptyState } from "./EmptyState";
import { RenderErrorBoundary } from "./RenderErrorBoundary";
import { ViewErrorFallback } from "./ViewErrorFallback";
import { createRenderer } from "./testing";

it("keeps a render error inside its region and renders it again on retry", async () => {
    let broken = true;
    function Fragile() {
        if (broken) throw new Error("Cannot read properties of null (reading 'reviewer')");
        return <p>Conversation</p>;
    }
    const view = createRenderer().render(
        () => (
            <div>
                <p>Sidebar</p>
                <RenderErrorBoundary
                    fallback={(error, retry) => (
                        <EmptyState
                            action={{ label: "Retry", onClick: retry }}
                            description={error.message}
                            icon="alert"
                            title="This view stopped working"
                        />
                    )}
                >
                    <Fragile />
                </RenderErrorBoundary>
            </div>
        ),
        { width: 640, height: 480 },
    );
    await view.ready();
    await expect.element(page.getByText("Sidebar", { exact: true })).toBeVisible();
    await expect
        .element(page.getByText("Cannot read properties of null (reading 'reviewer')"))
        .toBeVisible();
    broken = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.element(page.getByText("Conversation", { exact: true })).toBeVisible();
});

it("offers only Reload as the window's last resort", async () => {
    const reload = vi.fn();
    function Broken(): never {
        throw new Error("The rail failed.");
    }
    const view = createRenderer().render(
        () => (
            <RenderErrorBoundary
                fallback={(error) => (
                    <ViewErrorFallback
                        error={error}
                        onReload={reload}
                        title="Happy stopped working"
                    />
                )}
            >
                <Broken />
            </RenderErrorBoundary>
        ),
        { width: 640, height: 480 },
    );
    await view.ready();
    await expect.element(page.getByText("Happy stopped working", { exact: true })).toBeVisible();
    expect(page.getByRole("button").elements()).toHaveLength(1);
    await page.getByRole("button", { name: "Reload", exact: true }).click();
    expect(reload).toHaveBeenCalledOnce();
});
