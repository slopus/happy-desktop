import type { ReactNode } from "react";
import { AssistantMark, type AssistantMarkName } from "./AssistantMark";
import { Button, type ButtonVariant } from "./Button";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";

/** The one action in a provider dialog's button row, at its right. */
export interface SetupProviderDialogAction {
    readonly label: string;
    readonly onSelect: () => void;
    readonly disabled?: boolean;
    readonly loading?: boolean;
    readonly variant?: ButtonVariant;
}

export interface SetupProviderDialogProps {
    /** The provider, as the header names it, for example "Antigravity". */
    readonly name: string;
    readonly mark: AssistantMarkName;
    /** The numbered steps: `SetupProviderSteps`. */
    readonly children: ReactNode;
    /** Absent on a step with nothing to confirm: the row of buttons is not drawn. */
    readonly action?: SetupProviderDialogAction;
    readonly "data-testid"?: string;
    onClose(): void;
}

/**
 * C-356 SetupProviderDialog — one AI provider's way in, opened from its row on
 * a setup page: the vendor's mark and name with a close button, numbered
 * steps, and at most one action at the bottom right.
 *
 * The card hangs from a fixed top edge and is as tall as its steps, so the
 * header and its close button hold still while a step finishes, waits or
 * fails; only the bottom edge moves.
 *
 * Props only: what each step does belongs to setup.
 */
export function SetupProviderDialog(props: SetupProviderDialogProps) {
    const action = props.action;
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                className="happy-setup-provider-dialog"
                data-testid={props["data-testid"]}
                {...(action
                    ? {
                          footer: (
                              <Button
                                  disabled={action.disabled === true}
                                  loading={action.loading === true}
                                  onClick={action.onSelect}
                                  variant={action.variant ?? "primary"}
                                  width={128}
                              >
                                  {action.label}
                              </Button>
                          ),
                      }
                    : {})}
                leading={
                    <span
                        className="happy-setup-provider-dialog__chip"
                        data-happy-desktop-ui="setup-provider-dialog-chip"
                    >
                        <AssistantMark name={props.mark} size={16} tone="brand" />
                    </span>
                }
                onClose={props.onClose}
                size="medium"
                title={props.name}
            >
                {props.children}
            </Modal>
        </ModalOverlay>
    );
}

/** Numbered steps: what to do, in the order to do it. */
export function SetupProviderSteps(props: { readonly children: ReactNode }) {
    return <ol className="happy-setup-provider-dialog__steps">{props.children}</ol>;
}

/** One step: its number, what to do, and the control or field that does it. */
export function SetupProviderStep(props: {
    readonly n: number;
    readonly title: string;
    readonly children?: ReactNode;
}) {
    return (
        <li className="happy-setup-provider-dialog__step">
            <span className="happy-setup-provider-dialog__number">{`${String(props.n)}.`}</span>
            <span className="happy-setup-provider-dialog__body">
                <span className="happy-setup-provider-dialog__title">{props.title}</span>
                {props.children}
            </span>
        </li>
    );
}

/**
 * The line under a step's control: what happens next, that it is waiting, or
 * why it failed.
 */
export function SetupProviderHint(props: {
    readonly children: ReactNode;
    readonly tone?: "danger";
}) {
    return (
        <span
            className="happy-setup-provider-dialog__hint"
            data-happy-desktop-ui="setup-provider-dialog-hint"
            data-tone={props.tone}
            role="status"
        >
            {props.children}
        </span>
    );
}

/** A code to type on the vendor's page, set to be read across a room. */
export function SetupProviderCode(props: { readonly code: string }) {
    return (
        <span
            className="happy-setup-provider-dialog__code"
            data-happy-desktop-ui="setup-provider-dialog-code"
        >
            {props.code}
        </span>
    );
}
