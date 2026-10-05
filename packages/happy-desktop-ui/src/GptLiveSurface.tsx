import type { ReactNode } from "react";
import type { GptLiveSnapshot } from "happy-desktop-state";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { FormRow } from "./FormRow";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { Select } from "./Select";

export interface GptLiveSurfaceProps {
    children: ReactNode;
    state: GptLiveSnapshot;
    onOpen(): void;
    onClose(): void;
    onStart(): void;
    onEnd(): void;
    onAccountSelect(id: string): void;
    onMutedChange(muted: boolean): void;
    onMessageConfirm(actionId: string): void;
    onMessageCancel(actionId: string): void;
}

const STATUS: Record<GptLiveSnapshot["status"], string> = {
    disabled: "Off",
    idle: "Ready to start",
    checking: "Checking availability…",
    unavailable: "Unavailable",
    connecting: "Connecting…",
    active: "Live",
    error: "Call ended",
};

/** Stable application frame with an opt-in voice footer; it never remounts the app on call updates. */
export function GptLiveSurface(props: GptLiveSurfaceProps) {
    const state = props.state;
    const calling = state.status === "connecting" || state.status === "active";
    const account = state.availability?.accounts.find((item) => item.id === state.accountId);
    return (
        <div className="happy-gpt-live" data-happy-desktop-ui="gpt-live-surface">
            <div className="happy-gpt-live__application">{props.children}</div>
            {state.gptLiveEnabled ? (
                <div className="happy-gpt-live__bar" aria-label="GPT-Live voice controls">
                    <Button size="small" variant="ghost" onClick={props.onOpen}>
                        GPT-Live voice
                    </Button>
                    <span className="happy-gpt-live__status" role="status">
                        {STATUS[state.status]}
                        {state.microphoneMuted && calling ? " · Microphone muted" : ""}
                    </span>
                    {calling ? (
                        <>
                            <Button
                                size="small"
                                variant="secondary"
                                onClick={() => props.onMutedChange(!state.microphoneMuted)}
                            >
                                {state.microphoneMuted ? "Unmute" : "Mute"}
                            </Button>
                            <Button size="small" variant="danger" onClick={props.onEnd}>
                                End call
                            </Button>
                        </>
                    ) : (
                        <Button size="small" variant="secondary" onClick={props.onOpen}>
                            Open voice
                        </Button>
                    )}
                </div>
            ) : null}
            {state.gptLiveEnabled && state.panelVisible ? (
                <ModalOverlay onDismiss={props.onClose}>
                    <Modal title="GPT-Live voice" size="medium" onClose={props.onClose}>
                        <div className="happy-gpt-live__panel">
                            <p className="happy-gpt-live__description">
                                Voice controls this desktop window. It receives selected public
                                conversation text and task status, not private reasoning or tool
                                logs.
                            </p>
                            {!calling ? (
                                <FormRow
                                    label="Voice account"
                                    description="Choose explicitly. Accounts are never switched after a refusal."
                                    control={
                                        <Select
                                            aria-label="GPT-Live voice account"
                                            value={state.accountId}
                                            options={(state.availability?.accounts ?? []).map(
                                                (item) => ({ value: item.id, label: item.label }),
                                            )}
                                            onValueChange={props.onAccountSelect}
                                            placeholder="Choose a voice account"
                                            disabled={state.status === "checking"}
                                            fullWidth
                                        />
                                    }
                                    layout="stacked"
                                />
                            ) : null}
                            {account?.kind === "api" ? (
                                <Banner tone="warning" title="Separately billed API usage">
                                    This account uses OpenAI API billing. Starting a call may incur
                                    charges.
                                </Banner>
                            ) : null}
                            {state.error ? (
                                <Banner tone="danger" title="GPT-Live">
                                    {state.error}
                                </Banner>
                            ) : null}
                            <div className="happy-gpt-live__actions">
                                <span role="status">{STATUS[state.status]}</span>
                                {calling ? (
                                    <>
                                        <Button
                                            size="small"
                                            variant="secondary"
                                            onClick={() =>
                                                props.onMutedChange(!state.microphoneMuted)
                                            }
                                        >
                                            {state.microphoneMuted
                                                ? "Unmute microphone"
                                                : "Mute microphone"}
                                        </Button>
                                        <Button size="small" variant="danger" onClick={props.onEnd}>
                                            End call
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        disabled={
                                            !account ||
                                            !state.availability?.supported ||
                                            state.status === "checking"
                                        }
                                        onClick={(event) => {
                                            if (event.isTrusted) props.onStart();
                                        }}
                                    >
                                        {account?.kind === "api"
                                            ? "Start billed API call"
                                            : "Start voice call"}
                                    </Button>
                                )}
                            </div>
                            {state.actionStatus ? (
                                <p className="happy-gpt-live__description" role="status">
                                    {state.actionStatus}
                                </p>
                            ) : null}
                            {state.confirmation ? (
                                <section
                                    className="happy-gpt-live__confirmation"
                                    aria-label="Confirm voice message"
                                >
                                    <strong>Send to {state.confirmation.targetLabel}?</strong>
                                    <p className="happy-gpt-live__description">
                                        {state.confirmation.connectionLabel} ·{" "}
                                        {state.confirmation.modeLabel}
                                    </p>
                                    <p className="happy-gpt-live__message">
                                        {state.confirmation.text}
                                    </p>
                                    <p className="happy-gpt-live__description">
                                        Only this exact message will be sent. This does not answer a
                                        permission prompt or change access settings.
                                    </p>
                                    <div className="happy-gpt-live__actions">
                                        <Button
                                            disabled={state.confirmationSending}
                                            variant="secondary"
                                            onClick={() =>
                                                props.onMessageCancel(state.confirmation!.actionId)
                                            }
                                        >
                                            Keep as draft
                                        </Button>
                                        <Button
                                            loading={state.confirmationSending}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") event.preventDefault();
                                            }}
                                            onClick={(event) => {
                                                if (event.isTrusted)
                                                    props.onMessageConfirm(
                                                        state.confirmation!.actionId,
                                                    );
                                            }}
                                        >
                                            Send this message
                                        </Button>
                                    </div>
                                </section>
                            ) : null}
                            {state.transcripts.length ? (
                                <section
                                    className="happy-gpt-live__transcript"
                                    aria-label="Voice transcript"
                                >
                                    {state.transcripts.map((fragment) => (
                                        <p key={fragment.id} className="happy-gpt-live__message">
                                            <strong>
                                                {fragment.role === "user" ? "You" : "GPT-Live"}
                                                :{" "}
                                            </strong>
                                            {fragment.text}
                                        </p>
                                    ))}
                                </section>
                            ) : null}
                            <p className="happy-gpt-live__description">
                                Ending voice stops the microphone and this call, never your running
                                tasks.
                            </p>
                            <p className="happy-gpt-live__description">
                                Voice suggestions stay in this window and may be lost on reload.
                                Your existing saved draft is not overwritten or cleared by voice.
                            </p>
                        </div>
                    </Modal>
                </ModalOverlay>
            ) : null}
        </div>
    );
}
