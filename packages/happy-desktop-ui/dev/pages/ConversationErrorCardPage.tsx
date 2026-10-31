import { ConversationErrorCard } from "../../src/ConversationErrorCard";
import { SystemNotice } from "../../src/Message";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export const componentNumber = "C-283";

export function ConversationErrorCardPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Full diagnostic text stays readable in the transcript: paragraphs and indentation are preserved, long identifiers wrap, and the one way out is Ask Chief of Staff, which receives the error itself."
            title="Conversation error card"
        >
            <Specimen
                label="Source-specific manual recovery"
                number="05"
                detail="Manual steps and exact Copy stay usable without Chief of Staff. Nothing executes or sends automatically."
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "24px",
                        width: "760px",
                    }}
                >
                    <ConversationErrorCard
                        title="Authentication failed"
                        reason={
                            "The provider rejected authentication.\n\nYour conversation and draft are preserved."
                        }
                        assistance={{
                            status: "unavailable",
                            reason: "Chief of Staff is not available on this Happy Agent.",
                        }}
                        error={{
                            code: "authentication_failed",
                            mode: {
                                providerId: "claude",
                                providerType: "claude",
                                account: null,
                                modelId: "anthropic/opus-5-5",
                                effort: "high",
                                permissionMode: "auto",
                                serviceTier: null,
                            },
                            credentialSource: {
                                kind: "native_login",
                                location: "Claude Code sign-in (default configuration)",
                                host: "Agent host",
                            },
                            recovery: {
                                steps: [
                                    "Retry this chat first.",
                                    "If it still fails, run the sign-in command on Agent host as the same operating-system user that runs the agent, then retry this chat.",
                                ],
                                actions: ["ask_chief"],
                                commands: [
                                    {
                                        label: "Sign in to Claude Code",
                                        command: "claude auth login",
                                    },
                                ],
                            },
                        }}
                    />
                    <ConversationErrorCard
                        title="Failure"
                        reason="The provider connection closed."
                        assistance={{ status: "prepared" }}
                    />
                    <SystemNotice align="start" text="Model Opus 5.5 → Sonnet 5.5" />
                    <SystemNotice align="start" text="Account Work → Personal" />
                </div>
            </Specimen>
            <Specimen
                detail="Heading and reason stay separate; there is no copy or log button."
                label="Short failure"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", width: "760px" }}>
                    <ConversationErrorCard
                        reason="The provider connection closed."
                        title="Failure"
                    />
                    <DimensionRule label="760 px wide · 14/20 text · 4 px heading gap" />
                </div>
            </Specimen>
            <Specimen
                detail="An explicit click adds the quoted diagnostic to the Chief of Staff's draft and opens that conversation; nothing is sent. Pending, unavailable, and failed handoffs say so."
                label="Chief of Staff handoff"
                number="04"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "24px",
                        width: "760px",
                    }}
                >
                    <ConversationErrorCard
                        assistance={{ status: "ready" }}
                        onAssistanceRequest={() => {}}
                        reason="The selected provider account needs attention. You can also sign in manually and retry."
                        title="Failure"
                    />
                    <ConversationErrorCard
                        assistance={{ status: "pending" }}
                        reason="The provider connection closed."
                        title="Failure"
                    />
                    <ConversationErrorCard
                        assistance={{
                            status: "unavailable",
                            reason: "Chief of Staff is not available on this Happy Agent.",
                        }}
                        reason="The provider connection closed."
                        title="Failure"
                    />
                    <ConversationErrorCard
                        assistance={{
                            status: "failed",
                            reason: "Could not reach this Happy Agent. Your error and manual recovery options are unchanged.",
                        }}
                        onAssistanceRequest={() => {}}
                        reason="The provider connection closed."
                        title="Failure"
                    />
                </div>
            </Specimen>
            <Specimen
                detail="Hard breaks, blank paragraphs, and indentation remain visible."
                label="Full multiline diagnostic"
                number="02"
                stage="surface"
            >
                <div style={{ display: "flex", width: "760px" }}>
                    <ConversationErrorCard
                        reason={
                            "The provider could not complete this request.\n\nDetails:\n  The selected account is no longer signed in.\n  The conversation and unsent draft have been preserved.\n\nSign in to the provider, then submit your message again."
                        }
                        title="Failure"
                    />
                </div>
            </Specimen>
            <Specimen
                detail="Warning treatment, a wrapped heading, and an unbroken request identifier."
                label="Retry in a narrow conversation pane"
                number="03"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", width: "360px" }}>
                    <ConversationErrorCard
                        reason={
                            "The connection was interrupted while waiting for a response.\n\nRequest: provider-request-with-an-unbroken-identifier-that-must-stay-fully-readable-without-horizontal-scrolling"
                        }
                        title="Connection Error (Attempt 2)"
                        tone="warning"
                    />
                    <DimensionRule label="360 px pane · wraps without a horizontal scrollport" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
