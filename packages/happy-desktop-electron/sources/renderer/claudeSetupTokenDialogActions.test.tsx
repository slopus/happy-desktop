// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ClaudeSetupTokenDialog } from "../../../happy-desktop-ui/src/ClaudeSetupTokenDialog";

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

it("reports only a nonempty paste into an empty token field, without passing the token", () => {
    const pasted = vi.fn();
    const props = {
        shell: "powershell" as const,
        phase: "idle" as const,
        onClose: vi.fn(),
        onTokenSubmit: vi.fn(),
        onTokenPaste: pasted,
    };
    const { rerender } = render(<ClaudeSetupTokenDialog {...props} />);
    const field = screen.getByLabelText("Claude setup token");
    const paste = (text: string) =>
        fireEvent.paste(field, { clipboardData: { getData: () => text } });
    paste(" \n\t");
    expect(pasted).not.toHaveBeenCalled();
    paste("sk-ant-oat01-private-token");
    fireEvent.input(field, { target: { value: "sk-ant-oat01-private-token" } });
    expect(pasted.mock.calls).toEqual([[]]);
    rerender(<ClaudeSetupTokenDialog {...props} />);
    paste("replacement");
    expect(pasted).toHaveBeenCalledOnce();
    fireEvent.input(field, { target: { value: "" } });
    fireEvent.input(field, { target: { value: "typed" } });
    expect(pasted).toHaveBeenCalledOnce();
    fireEvent.input(field, { target: { value: "" } });
    paste("another-token");
    expect(pasted.mock.calls).toEqual([[], []]);
    rerender(<ClaudeSetupTokenDialog {...props} phase="saving" />);
    paste("while-saving");
    expect(pasted).toHaveBeenCalledTimes(2);
});

it("forwards the existing setup command copy once after the clipboard succeeds", async () => {
    const copied = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const props = {
        shell: "powershell" as const,
        phase: "idle" as const,
        onClose: vi.fn(),
        onTokenSubmit: vi.fn(),
        onCommandCopy: copied,
    };
    const { rerender } = render(<ClaudeSetupTokenDialog {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy Claude setup token command" }));
    await waitFor(() => expect(copied.mock.calls).toEqual([["setup-token"]]));
    expect(writeText).toHaveBeenCalledWith("claude setup-token");
    rerender(<ClaudeSetupTokenDialog {...props} />);
    expect(copied).toHaveBeenCalledOnce();
});
