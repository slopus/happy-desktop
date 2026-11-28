import type { ReactNode } from "react";
import { Button, type ButtonVariant } from "./Button";
import { CopyButton } from "./CopyButton";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { SegmentedControl } from "./SegmentedControl";
import { SetupProviderMarkGlyph, type SetupProviderMark } from "./SetupProviderRows";

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
    readonly mark: SetupProviderMark;
    /** `SetupProviderWays` when there is more than one, then `SetupProviderSteps`. */
    readonly children: ReactNode;
    /** Absent on a step with nothing to confirm: the row of buttons is not drawn. */
    readonly action?: SetupProviderDialogAction;
    readonly "data-testid"?: string;
    onClose(): void;
}

/**
 * C-356 SetupProviderDialog — one AI provider's way in, opened from its row on
 * a setup page: the vendor's mark and name with a close button, a choice of
 * how to connect where there is more than one, numbered steps, and at most
 * one action at the bottom right. The card is as tall as its steps and
 * centred in the window, like every other modal.
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
                        <SetupProviderMarkGlyph mark={props.mark} size={16} />
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

/** One way to connect a provider, for example its plan or an API key. */
export interface SetupProviderWay {
    readonly value: string;
    readonly label: string;
    /** Said under the choice while this way is picked: what it uses, or bills. */
    readonly note: string;
}

/** How to connect, for a provider with more than one way: the steps follow it. */
export function SetupProviderWays(props: {
    /** What the choice is of. Absent, "Connect with". */
    readonly label?: string;
    readonly ways: readonly SetupProviderWay[];
    readonly value: string;
    onChange(value: string): void;
}) {
    const note = props.ways.find((way) => way.value === props.value)?.note;
    return (
        <div
            className="happy-setup-provider-dialog__ways"
            data-happy-desktop-ui="setup-provider-ways"
        >
            <span className="happy-setup-provider-dialog__title">
                {props.label ?? "Connect with"}
            </span>
            <SegmentedControl
                aria-label={props.label ?? "Connect with"}
                fullWidth
                onChange={props.onChange}
                segments={props.ways.map((way) => ({ label: way.label, value: way.value }))}
                size="medium"
                value={props.value}
            />
            {note ? <SetupProviderHint>{note}</SetupProviderHint> : null}
        </div>
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

/**
 * Words to hand to another program, such as a prompt for the person's own
 * coding agent: the whole text, selectable, with its copy action beside it.
 */
export function SetupProviderPrompt(props: {
    readonly text: string;
    /** Names the text for assistive technology, for example "Bedrock setup prompt". */
    readonly label: string;
    readonly onCopy?: () => void;
}) {
    return (
        <span
            className="happy-setup-provider-dialog__prompt"
            data-happy-desktop-ui="setup-provider-dialog-prompt"
        >
            <span aria-label={props.label} className="happy-setup-provider-dialog__prompt-text">
                {props.text}
            </span>
            <CopyButton
                caption="Copy"
                copiedCaption="Copied"
                label={`Copy ${props.label}`}
                {...(props.onCopy ? { onCopy: props.onCopy } : {})}
                text={props.text}
            />
        </span>
    );
}
