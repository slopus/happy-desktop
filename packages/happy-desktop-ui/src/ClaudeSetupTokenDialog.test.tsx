import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import "./styles.css";
import { ClaudeSetupTokenDialog } from "./ClaudeSetupTokenDialog";
import { createRenderer } from "./testing";

it.each(["powershell", "posix"] as const)(
    "shows %s instructions and submits a whitespace-free token",
    async (shell) => {
        const onTokenSubmit = vi.fn();
        const installCommand =
            shell === "powershell"
                ? "irm https://claude.ai/install.ps1 | iex"
                : "curl -fsSL https://claude.ai/install.sh | bash";
        const view = createRenderer().render(
            () => (
                <ClaudeSetupTokenDialog
                    shell={shell}
                    installCommand={installCommand}
                    phase="idle"
                    onClose={() => undefined}
                    onTokenSubmit={onTokenSubmit}
                />
            ),
            { width: 720, height: 760 },
        );
        await view.ready();
        const terminal = shell === "powershell" ? "PowerShell" : "Terminal";
        await expect
            .element(page.getByText(`Install Claude Code. In ${terminal}, run:`))
            .toBeVisible();
        await expect.element(page.getByText(`In ${terminal}, run:`, { exact: true })).toBeVisible();
        await expect
            .element(
                page.getByText(`Back in ${terminal}, copy the token it prints.`, { exact: false }),
            )
            .toBeVisible();
        await expect.element(page.getByText(installCommand, { exact: true })).toBeVisible();
        const submit = page.getByRole("button", { name: "Connect Claude", exact: true });
        const field = page.getByLabelText("Claude setup token", { exact: true });
        await field.fill(" \t\r\n\u0085\u00a0\u2003\u2028\u2029\u3000\ufeff");
        await expect.element(submit).toBeDisabled();
        await field.fill(" \tsk-ant-\r\noat01-\u0085ab\u00a0cd\u2003_9\u2028\u2029\u3000\ufeff");
        await submit.click();
        expect(onTokenSubmit).toHaveBeenCalledExactlyOnceWith("sk-ant-oat01-abcd_9");
    },
);
