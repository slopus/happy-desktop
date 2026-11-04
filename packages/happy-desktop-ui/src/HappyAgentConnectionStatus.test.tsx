import { expect, it } from "vitest";
import "./theme.css";
import "./styles/title-bar.css";
import "./styles/icon.css";
import "./styles/button.css";
import "./styles/spinner.css";
import "./styles/spinner-braille.css";
import "./styles/happy-agent-connection-status.css";
import { HappyAgentConnectionStatus } from "./HappyAgentConnectionStatus";
import { createRenderer } from "./testing";

const frame = { width: 760, height: 520, padding: 0 } as const;

it("shows the probe loader while the transport is still connecting", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <HappyAgentConnectionStatus
                attempt={0}
                connection="connecting"
                daemon="unknown"
                onRetry={() => undefined}
            />
        ),
        frame,
    );
    await view.ready();

    expect(
        view
            .$('[data-happy-desktop-ui="happy-agent-connection-status"]')
            .element.getAttribute("data-state"),
    ).toBe("connecting");
    expect(
        view.$('[data-happy-desktop-ui="happy-agent-connection-status-label"]').element.textContent,
    ).toBe("Connecting to Happy Agent");
    expect(
        view.$('[data-happy-desktop-ui="happy-agent-connection-status-progress"]').element
            .textContent,
    ).toBe("Checking the local service…");
    expect(view.container.querySelector('[data-happy-desktop-ui="spinner"]')).not.toBeNull();
    expect(
        view.container.querySelector(
            '[data-happy-desktop-ui="happy-agent-connection-status-body"] button',
        ),
    ).toBeNull();

    await view.screenshot("HappyAgentConnectionStatus.connecting");
}, 120_000);

it("reports daemon boot as a loading state distinct from transport connection", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <HappyAgentConnectionStatus
                attempt={0}
                connection="connected"
                daemon="starting"
                onRetry={() => undefined}
                version="1.4.2"
            />
        ),
        frame,
    );
    await view.ready();

    expect(
        view
            .$('[data-happy-desktop-ui="happy-agent-connection-status"]')
            .element.getAttribute("data-state"),
    ).toBe("starting");
    expect(
        view.$('[data-happy-desktop-ui="happy-agent-connection-status-label"]').element.textContent,
    ).toBe("Starting Happy Agent");
    expect(
        view.$('[data-happy-desktop-ui="happy-agent-connection-status-progress"]').element
            .textContent,
    ).toBe("Waiting for the daemon to become ready…");
    expect(view.container.querySelector('[data-happy-desktop-ui="spinner"]')).not.toBeNull();
}, 120_000);

it("counts reconnect attempts and retries on demand while disconnected", async () => {
    const retries: number[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <HappyAgentConnectionStatus
                attempt={3}
                connection="disconnected"
                daemon="unknown"
                message="connect ECONNREFUSED"
                onRetry={() => retries.push(retries.length + 1)}
            />
        ),
        frame,
    );
    await view.ready();

    expect(
        view.$('[data-happy-desktop-ui="happy-agent-connection-status-label"]').element.textContent,
    ).toBe("Reconnecting to Happy Agent");
    expect(
        view.$('[data-happy-desktop-ui="happy-agent-connection-status-progress"]').element
            .textContent,
    ).toBe("Waiting for the local service · attempt 3");
    const retry = view.$('[data-happy-desktop-ui="happy-agent-connection-status-body"] button')
        .element as HTMLButtonElement;
    expect(
        retry.querySelector('[data-happy-desktop-ui="button-label"]')?.textContent ??
            retry.textContent,
    ).toContain("Retry now");
    retry.click();
    expect(retries).toEqual([1]);

    await view.screenshot("HappyAgentConnectionStatus.disconnected");
}, 120_000);

it("uses singular reconnect copy on the first attempt", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <HappyAgentConnectionStatus
                attempt={1}
                connection="disconnected"
                daemon="unknown"
                onRetry={() => undefined}
            />
        ),
        frame,
    );
    await view.ready();

    expect(
        view.$('[data-happy-desktop-ui="happy-agent-connection-status-label"]').element.textContent,
    ).toBe("Reconnecting to Happy Agent");
    expect(
        view.$('[data-happy-desktop-ui="happy-agent-connection-status-progress"]').element
            .textContent,
    ).toBe("Waiting for the local service…");
}, 120_000);

it("offers an explicit retry control when a reachable daemon reports an error", async () => {
    let retried = 0;
    const view = createRenderer();
    view.render(
        () => (
            <HappyAgentConnectionStatus
                attempt={0}
                connection="connected"
                daemon="error"
                message="No provider is authenticated."
                onRetry={() => {
                    retried += 1;
                }}
                version="1.4.2"
            />
        ),
        frame,
    );
    await view.ready();

    expect(
        view.$('[data-happy-desktop-ui="happy-agent-connection-status-label"]').element.textContent,
    ).toBe("Happy Agent needs attention");
    expect(
        view.$('[data-happy-desktop-ui="happy-agent-connection-status-progress"]').element
            .textContent,
    ).toBe("No provider is authenticated.");
    const button = view.$('[data-happy-desktop-ui="happy-agent-connection-status-body"] button')
        .element as HTMLButtonElement;
    expect(button.querySelector('[data-happy-desktop-ui="button-label"]')?.textContent).toBe(
        "Retry now",
    );
    button.click();
    expect(retried).toBe(1);

    await view.screenshot("HappyAgentConnectionStatus.daemonError");
}, 120_000);

it("confirms the connected daemon version without offering a retry", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <HappyAgentConnectionStatus
                attempt={0}
                connection="connected"
                daemon="ready"
                onRetry={() => undefined}
                version="1.4.2"
            />
        ),
        frame,
    );
    await view.ready();

    expect(
        view.$('[data-happy-desktop-ui="happy-agent-connection-status-label"]').element.textContent,
    ).toBe("Happy Agent is ready");
    expect(
        view.$('[data-happy-desktop-ui="happy-agent-connection-status-progress"]').element
            .textContent,
    ).toBe("Local daemon 1.4.2");
    // A healthy connection is informational only — nothing to retry.
    expect(
        view.container.querySelector(
            '[data-happy-desktop-ui="happy-agent-connection-status-body"] button',
        ),
    ).toBeNull();

    await view.screenshot("HappyAgentConnectionStatus.ready");
}, 120_000);
