import { ClaudeSetupTokenDialog } from "../../src/ClaudeSetupTokenDialog";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-341";

export function ClaudeSetupTokenDialogPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Claude setup-token instructions for PowerShell and Terminal. Pasted whitespace is removed before connecting."
            title="ClaudeSetupTokenDialog"
        >
            {(["powershell", "posix"] as const).flatMap((shell) =>
                (["idle", "saving", "failed"] as const).map((phase, index) => (
                    <FullScreenSpecimen
                        detail="480px card · centered"
                        key={`${shell}-${phase}`}
                        label={`${shell} · ${phase}`}
                        number={String(index + 1)}
                        screen={`${shell}-${phase}`}
                        window={{ width: 720, height: 640 }}
                    >
                        <div style={{ height: "100%", transform: "translateZ(0)" }}>
                            <ClaudeSetupTokenDialog
                                shell={shell}
                                {...(phase === "idle"
                                    ? {
                                          installCommand:
                                              shell === "powershell"
                                                  ? "irm https://claude.ai/install.ps1 | iex"
                                                  : "curl -fsSL https://claude.ai/install.sh | bash",
                                      }
                                    : {})}
                                phase={phase}
                                error="The setup token is invalid. Copy the token again."
                                onClose={() => undefined}
                                onTokenSubmit={() => undefined}
                            />
                        </div>
                    </FullScreenSpecimen>
                )),
            )}
        </ComponentPage>
    );
}
