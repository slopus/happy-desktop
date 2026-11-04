import { Button } from "./Button";
import { Ionicon } from "./vectorIcons/VectorIcon";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";

export type WindowsSandboxSetupState = "explain" | "waiting" | "declined" | "failed";

export interface WindowsSandboxSetupProps {
    readonly state: WindowsSandboxSetupState;
    /** Starts explicit setup, or an explicit retry after the previous attempt ended. */
    onContinue(): void;
}

/**
 * A permission explanation before Windows opens its administrator prompt.
 * The caller checks native readiness and owns setup; rendering never starts it.
 * Keep this mounted through the attempt so the diagram and action stay put.
 */
export function WindowsSandboxSetup(props: WindowsSandboxSetupProps) {
    const retry = props.state === "declined" || props.state === "failed";
    const copy = (() => {
        switch (props.state) {
            case "explain":
            case "waiting":
                return "Happy runs agent commands in a sandbox to limit changes to your project and protect private files. Setting this up once needs Windows’ administrator approval.";
            case "declined":
                return "Windows permission wasn’t approved, so the sandbox wasn’t set up. Happy needs it to run agent commands safely. Choose Try again when you’re ready.";
            case "failed":
                return "Windows couldn’t finish setting up the sandbox. Happy needs it to run agent commands safely. Try again to complete setup.";
        }
    })();

    return (
        <ModalOverlay>
            <Modal
                className="happy-windows-sandbox"
                data-testid="windows-sandbox-setup"
                size="large"
                title={retry ? "Sandbox not set up yet" : "One quick Windows permission"}
                footer={
                    <Button
                        loading={props.state === "waiting"}
                        onClick={props.onContinue}
                        width={144}
                    >
                        {retry ? "Try again" : "Continue"}
                    </Button>
                }
            >
                <div className="happy-windows-sandbox__content">
                    <p className="happy-windows-sandbox__copy" role={retry ? "alert" : undefined}>
                        {copy}
                    </p>
                    <div
                        aria-label="Your PC: agent commands can change your project folder inside the sandbox. Changes to the rest of your PC are blocked."
                        className="happy-windows-sandbox__pc"
                        role="img"
                    >
                        <span className="happy-windows-sandbox__label">Your PC</span>
                        <div className="happy-windows-sandbox__diagram" aria-hidden="true">
                            <div className="happy-windows-sandbox__boundary">
                                <span className="happy-windows-sandbox__label">Sandbox</span>
                                <div className="happy-windows-sandbox__item">
                                    <Ionicon name="terminal-outline" size={20} />
                                    <span>Agent commands</span>
                                </div>
                                <div className="happy-windows-sandbox__item">
                                    <Ionicon name="folder-outline" size={20} />
                                    <span>Your project folder</span>
                                </div>
                            </div>
                            <div className="happy-windows-sandbox__private">
                                <Ionicon name="lock-closed-outline" size={24} />
                                <span className="happy-windows-sandbox__label">
                                    Rest of your PC
                                </span>
                                <span>Documents, passwords, system</span>
                                <span className="happy-windows-sandbox__blocked">
                                    Changes blocked
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="happy-windows-sandbox__expect">
                        <span className="happy-windows-sandbox__label">What happens next</span>
                        {retry ? (
                            <p>
                                Choose <strong>Yes</strong> for <strong>Happy Sandbox Setup</strong>
                                .
                            </p>
                        ) : (
                            <>
                                <p>
                                    Windows will ask: “Do you want to allow this app to make changes
                                    to your device?” for <strong>Happy Sandbox Setup</strong>.
                                </p>
                                <p>
                                    Check the name, then choose <strong>Yes</strong>.
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </Modal>
        </ModalOverlay>
    );
}
