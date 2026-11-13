import type { ReactNode } from "react";
import type { HappyAgentPluginImage } from "happy-desktop-state";
import { CopyButton } from "./CopyButton";
import { PluginMark } from "./pages/plugins/pluginPresentation";
import { QRCode } from "./QRCode";
import { Spinner } from "./Spinner";
import { AvatarPlaceholder } from "./AvatarPlaceholder";
import { OnboardingHelp } from "./OnboardingHelp";
import { ProfileSetupForm, type ProfileSetupFormProps } from "./ProfileSetupScreen";
import { SegmentedProgress } from "./SegmentedProgress";
import { AssistantMark, type AssistantMarkName } from "./AssistantMark";
import { Ionicon } from "./vectorIcons/VectorIcon";
import { SetupPage, type SetupPageAction, type SetupPageSecondaryAction } from "./SetupPage";
import { TextField } from "./TextField";
import { Button } from "./Button";
import type { ThemeMode } from "./ThemeScope";
import { Icon } from "./Icon";

/** One step in the bar across the top, in the server's order. */
export interface CloudOnboardingStep {
    readonly id: string;
    readonly label: string;
}

/** A way to connect inference, as one tile of the row. */
export interface CloudOnboardingInferenceOption {
    /** `custom` is every other way in: an API key, or an endpoint of the team's own. */
    readonly id: "claude" | "chatgpt" | "grok" | "custom";
    /** Connected already, through the team or the reader's own account. */
    readonly connected: boolean;
    /** A sign-in or dialog this option opened is still going. */
    readonly busy?: boolean;
    readonly onSelect?: () => void;
}

/** One plugin offered on the plugins gate. */
export interface CloudOnboardingPlugin {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly image: HappyAgentPluginImage | null;
    /** The server requires an active installation before the reader may continue. */
    readonly required: boolean;
    /**
     * `available` is not installed; `setup` is installed and waiting for a
     * sign-in; `connected` is active.
     */
    readonly state: "available" | "setup" | "connected";
    readonly busy?: boolean;
    readonly onSelect?: () => void;
}

/** An invite sent from the teammates gate, newest first. */
export interface CloudOnboardingInvite {
    readonly id: string;
    readonly email: string;
    readonly delivery: "sending" | "sent" | "failed";
}

/** A top-up amount offered on the payment gate. */
export interface CloudOnboardingAmount {
    readonly id: string;
    readonly label: string;
}

export type CloudOnboardingView =
    | ({
          readonly kind: "profile";
          /** `photo` asks only for the picture, from someone who already has a name. */
          readonly ask: "profile" | "photo";
      } & ProfileSetupFormProps)
    | {
          readonly kind: "adminBot";
          /** The server's words for the step; the defaults stand in when it sends none. */
          readonly title: string;
          readonly description: string;
          /** What the bot can do for the team, one short line each, when the server lists them. */
          readonly points: readonly string[];
          /** Who may talk to it, said quietly under the rest. */
          readonly note: string;
          readonly name: string;
          readonly avatarUrl: string | null;
          readonly placeholderSeed: string;
          readonly busy: boolean;
          readonly error?: string;
          onNameChange(value: string): void;
          /** Enter in the name field. */
          onSubmit(): void;
      }
    | {
          readonly kind: "inference";
          readonly options: readonly CloudOnboardingInferenceOption[];
          readonly error?: string;
      }
    | {
          readonly kind: "plugins";
          /** Required plugins first, then the rest worth offering. */
          readonly plugins: readonly CloudOnboardingPlugin[];
          readonly loading?: boolean;
          readonly error?: string;
      }
    | {
          readonly kind: "teammates";
          readonly email: string;
          readonly busy: boolean;
          readonly invites: readonly CloudOnboardingInvite[];
          /** A link invite made because this server cannot send email, shown this once. */
          readonly link?: string;
          readonly error?: string;
          onEmailChange(value: string): void;
          onInvite(): void;
          /** Makes a link anyone holding it can join with, instead of an email. */
          onLinkCreate?(): void;
      }
    | {
          readonly kind: "mobileApp";
          readonly appStoreUrl: string | null;
          readonly playStoreUrl: string | null;
          /** The phone signed in to this server; the gate is done. */
          readonly registered: boolean;
      }
    | {
          readonly kind: "payment";
          /** `method` puts a card or Link on file; `credit` tops the balance up. */
          readonly ask: "method" | "credit";
          /** What is on file, such as "Visa •••• 4242", or `null` for nothing. */
          readonly method: string | null;
          /** The balance, formatted, once it is known. */
          readonly balance: string | null;
          /** What having it on file does for the team, one short line. */
          readonly detail: string;
          readonly testMode: boolean;
          readonly amounts?: readonly CloudOnboardingAmount[];
          readonly amount?: string;
          onAmountSelect?(id: string): void;
          /** Stripe's page is open in the browser; the page waits on it. */
          readonly waiting: boolean;
          readonly error?: string;
      }
    | {
          /** The last page, for a reader the admin bot does not work with. */
          readonly kind: "finished";
          readonly botName: string;
      }
    | {
          readonly kind: "notice";
          /**
           * `waitForAdmin`: only someone else can complete this step. `update`:
           * this Happy is too old to show it. `unavailable`: the server cannot
           * check it yet.
           */
          readonly reason: "waitForAdmin" | "update" | "unavailable";
          /** The step, as the bar names it. */
          readonly step: string;
          /** For `waitForAdmin`: the owners who can finish it, by name. */
          readonly owners?: readonly string[];
      };

export interface CloudOnboardingScreenProps {
    readonly appearance: ThemeMode;
    /** The server, as its rail tile names it. */
    readonly serverLabel?: string;
    readonly steps: readonly CloudOnboardingStep[];
    readonly currentStep: string;
    readonly view: CloudOnboardingView;
    /** The one thing the page asks for. */
    readonly action?: SetupPageAction;
    /**
     * Skipping an optional step. Every optional step offers it in the same
     * words in the same place; a required step has none.
     */
    readonly skip?: Omit<SetupPageSecondaryAction, "label">;
    /** Why the action is not available yet, said quietly under it when there is no skip. */
    readonly footnote?: string;
    onExternalOpen?(url: string): void;
}

const INFERENCE: Readonly<
    Record<
        CloudOnboardingInferenceOption["id"],
        {
            readonly name: string;
            readonly mark: AssistantMarkName | "custom";
            readonly action: string;
            readonly detail: string;
        }
    >
> = {
    claude: { name: "Claude", mark: "claude", action: "Sign in", detail: "Pro or Max" },
    chatgpt: { name: "ChatGPT", mark: "openai", action: "Sign in", detail: "Plus or Pro" },
    grok: { name: "Grok", mark: "grok", action: "Add key", detail: "xAI API key" },
    custom: { name: "Custom", mark: "custom", action: "Add", detail: "Key or endpoint" },
};

/** A short sentence-case mark beside a row's title. */
function Tag(props: { readonly label: string; readonly tone?: "attention" }) {
    return (
        <span className="happy-cloud-onboarding__tag" data-tone={props.tone}>
            {props.label}
        </span>
    );
}

/** The reserved line under a form where a refusal is said, so it never moves the page. */
function Hint(props: { readonly text: string | undefined }) {
    return (
        <p
            className="happy-cloud-onboarding__hint"
            data-tone={props.text ? "attention" : undefined}
            role="status"
        >
            {props.text}
        </p>
    );
}

function InferenceTile(props: { readonly option: CloudOnboardingInferenceOption }) {
    const { option } = props;
    const known = INFERENCE[option.id];
    return (
        <div
            className="happy-cloud-onboarding__tile"
            data-connected={option.connected ? "true" : undefined}
            data-happy-desktop-ui="cloud-onboarding-tile"
        >
            <span className="happy-cloud-onboarding__tile-mark" aria-hidden>
                {known.mark === "custom" ? (
                    <Ionicon name="key-outline" size={32} />
                ) : (
                    <AssistantMark name={known.mark} size={32} tone="brand" />
                )}
            </span>
            <span className="happy-cloud-onboarding__tile-text">
                <span className="happy-cloud-onboarding__tile-name">{known.name}</span>
                <span className="happy-cloud-onboarding__row-detail">{known.detail}</span>
            </span>
            {option.connected ? (
                <span className="happy-cloud-onboarding__done" data-fill="true">
                    <Icon name="check" size={14} />
                    Connected
                </span>
            ) : (
                <Button
                    disabled={!option.onSelect}
                    fullWidth
                    loading={option.busy}
                    onClick={option.onSelect}
                    size="small"
                    variant="secondary"
                >
                    {known.action}
                </Button>
            )}
        </div>
    );
}

function page(
    view: CloudOnboardingView,
    serverLabel: string | undefined,
): { readonly title: string; readonly copy: string; readonly body: ReactNode } {
    const server = serverLabel ?? "your server";
    switch (view.kind) {
        case "profile":
            return view.ask === "photo"
                ? {
                      title: "Add a photo",
                      copy: "So your team can tell you apart at a glance.",
                      body: <ProfileSetupForm {...view} nameHidden />,
                  }
                : {
                      title: "Create your profile",
                      copy: `This is how your team and agents see you on ${server}.`,
                      body: <ProfileSetupForm {...view} />,
                  };
        case "adminBot":
            return {
                title: view.title || "Name your admin bot",
                // With the points listed, the server's long description would
                // say them twice; the line under the title only introduces them.
                copy:
                    view.points.length > 0
                        ? "It has expanded capabilities, so it can shape Happy around your team."
                        : `Your admin bot runs ${server} with you.`,
                body: (
                    <div
                        className="happy-cloud-onboarding__admin-bot"
                        data-happy-desktop-ui="cloud-onboarding-admin-bot"
                    >
                        <div className="happy-cloud-onboarding__bot-row">
                            <span className="happy-cloud-onboarding__bot-avatar">
                                {view.avatarUrl ? (
                                    <img
                                        alt=""
                                        className="happy-cloud-onboarding__bot-photo"
                                        draggable={false}
                                        src={view.avatarUrl}
                                    />
                                ) : (
                                    <AvatarPlaceholder
                                        className="happy-cloud-onboarding__bot-photo"
                                        seed={view.placeholderSeed}
                                        side={56}
                                    />
                                )}
                            </span>
                            <TextField
                                aria-label="Admin bot name"
                                autoFocus
                                className="happy-cloud-onboarding__name"
                                disabled={view.busy}
                                fullWidth
                                onSubmit={view.onSubmit}
                                onValueChange={view.onNameChange}
                                placeholder="Chief of Staff"
                                size="large"
                                value={view.name}
                            />
                        </div>
                        <Hint text={view.error} />
                        {view.points.length > 0 ? (
                            <ul className="happy-cloud-onboarding__points">
                                {view.points.map((point) => (
                                    <li className="happy-cloud-onboarding__point" key={point}>
                                        <span
                                            className="happy-cloud-onboarding__point-mark"
                                            aria-hidden
                                        >
                                            <Icon name="check" size={14} />
                                        </span>
                                        {point}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="happy-cloud-onboarding__lead">{view.description}</p>
                        )}
                        {view.note ? (
                            <p className="happy-cloud-onboarding__footnote">
                                <Icon name="shield" size={12} />
                                {view.note}
                            </p>
                        ) : null}
                    </div>
                ),
            };
        case "inference":
            return {
                title: "Connect your AI",
                copy: "Sign in to one you already use, or add a key. You can add more later.",
                body: (
                    <div
                        className="happy-cloud-onboarding__inference"
                        data-happy-desktop-ui="cloud-onboarding-inference"
                    >
                        <div className="happy-cloud-onboarding__tiles">
                            {view.options.map((option) => (
                                <InferenceTile key={option.id} option={option} />
                            ))}
                        </div>
                        <Hint text={view.error} />
                    </div>
                ),
            };
        case "plugins":
            return {
                title: "Connect your tools",
                copy: "Plugins let agents work in the tools your team already uses.",
                body: (
                    <div
                        className="happy-cloud-onboarding__list"
                        data-happy-desktop-ui="cloud-onboarding-plugins"
                    >
                        {view.loading && view.plugins.length === 0 ? (
                            <div className="happy-cloud-onboarding__loading">
                                <Spinner size={16} />
                            </div>
                        ) : (
                            view.plugins.map((plugin) => (
                                <div
                                    className="happy-cloud-onboarding__row"
                                    data-happy-desktop-ui="cloud-onboarding-plugin"
                                    key={plugin.id}
                                >
                                    <PluginMark image={plugin.image} size="row" />
                                    <span className="happy-cloud-onboarding__row-text">
                                        <span className="happy-cloud-onboarding__row-title">
                                            {plugin.name}
                                            {plugin.required ? <Tag label="Required" /> : null}
                                        </span>
                                        <span className="happy-cloud-onboarding__row-detail">
                                            {plugin.description}
                                        </span>
                                    </span>
                                    {plugin.state === "connected" ? (
                                        <span className="happy-cloud-onboarding__done">
                                            <Icon name="check" size={14} />
                                            Connected
                                        </span>
                                    ) : (
                                        <Button
                                            disabled={!plugin.onSelect}
                                            loading={plugin.busy}
                                            onClick={plugin.onSelect}
                                            size="small"
                                            variant="secondary"
                                            width={96}
                                        >
                                            {plugin.state === "setup" ? "Finish" : "Connect"}
                                        </Button>
                                    )}
                                </div>
                            ))
                        )}
                        <Hint text={view.error} />
                    </div>
                ),
            };
        case "teammates":
            return {
                title: "Invite your team",
                copy: `Happy works best with the people you build with on ${server}.`,
                body: (
                    <div
                        className="happy-cloud-onboarding__invite"
                        data-happy-desktop-ui="cloud-onboarding-teammates"
                    >
                        <div className="happy-cloud-onboarding__invite-row">
                            <TextField
                                aria-label="Email"
                                autoFocus
                                className="happy-cloud-onboarding__email"
                                disabled={view.busy}
                                fullWidth
                                onSubmit={view.onInvite}
                                onValueChange={view.onEmailChange}
                                placeholder="name@company.com"
                                size="large"
                                type="email"
                                value={view.email}
                            />
                            <Button
                                disabled={view.email.trim() === ""}
                                loading={view.busy}
                                onClick={view.onInvite}
                                size="large"
                                variant="secondary"
                                width={96}
                            >
                                Invite
                            </Button>
                        </div>
                        <Hint text={view.error} />
                        {view.link ? (
                            <div className="happy-cloud-onboarding__note">
                                <span className="happy-cloud-onboarding__note-title">
                                    <Icon name="link" size={14} />
                                    Invite link
                                </span>
                                <span className="happy-cloud-onboarding__link">
                                    <span className="happy-cloud-onboarding__link-text">
                                        {view.link}
                                    </span>
                                    <CopyButton
                                        caption="Copy"
                                        label="Copy invite link"
                                        text={view.link}
                                    />
                                </span>
                            </div>
                        ) : null}
                        {view.invites.length > 0 ? (
                            <div className="happy-cloud-onboarding__list">
                                {view.invites.map((invite) => (
                                    <div className="happy-cloud-onboarding__row" key={invite.id}>
                                        <span className="happy-cloud-onboarding__row-text">
                                            <span className="happy-cloud-onboarding__row-title">
                                                {invite.email}
                                            </span>
                                        </span>
                                        <span
                                            className="happy-cloud-onboarding__done"
                                            data-tone={
                                                invite.delivery === "failed"
                                                    ? "attention"
                                                    : undefined
                                            }
                                        >
                                            {invite.delivery === "sending" ? (
                                                <Spinner size={14} />
                                            ) : invite.delivery === "sent" ? (
                                                <Icon name="check" size={14} />
                                            ) : (
                                                <Icon name="alert" size={14} />
                                            )}
                                            {invite.delivery === "sending"
                                                ? "Sending"
                                                : invite.delivery === "sent"
                                                  ? "Invited"
                                                  : "Not sent"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                        {view.onLinkCreate && !view.link ? (
                            <Button
                                className="happy-cloud-onboarding__other"
                                onClick={view.onLinkCreate}
                                size="small"
                                variant="ghost"
                            >
                                Get an invite link instead
                            </Button>
                        ) : null}
                    </div>
                ),
            };
        case "mobileApp":
            return {
                title: view.registered ? "Your phone is connected" : "Get Happy on your phone",
                copy: view.registered
                    ? "Notifications and your team's chats will follow you."
                    : `Scan a code, install Happy, and sign in to ${server}.`,
                body: (
                    <div
                        className="happy-cloud-onboarding__stores"
                        data-happy-desktop-ui="cloud-onboarding-mobile"
                    >
                        {view.registered ? (
                            <span className="happy-cloud-onboarding__done" data-size="large">
                                <Icon name="check-circle" size={20} />
                                Signed in on your phone
                            </span>
                        ) : (
                            <>
                                {view.appStoreUrl ? (
                                    <span className="happy-cloud-onboarding__store">
                                        <QRCode
                                            data={view.appStoreUrl}
                                            label="QR code for Happy on the App Store"
                                            mark="app-store"
                                            size={176}
                                        />
                                        <span className="happy-cloud-onboarding__row-detail">
                                            iPhone
                                        </span>
                                    </span>
                                ) : null}
                                {view.playStoreUrl ? (
                                    <span className="happy-cloud-onboarding__store">
                                        <QRCode
                                            data={view.playStoreUrl}
                                            label="QR code for Happy on Google Play"
                                            mark="google-play"
                                            size={176}
                                        />
                                        <span className="happy-cloud-onboarding__row-detail">
                                            Android
                                        </span>
                                    </span>
                                ) : null}
                            </>
                        )}
                    </div>
                ),
            };
        case "payment":
            return {
                title: view.ask === "method" ? "Add a payment method" : "Add credit",
                copy:
                    view.ask === "method"
                        ? "Add a card or Link so your team can add credit. Stripe keeps the details."
                        : `Agents on ${server} spend from the team's credit.`,
                body: (
                    <div
                        className="happy-cloud-onboarding__payment"
                        data-happy-desktop-ui="cloud-onboarding-payment"
                    >
                        <div className="happy-cloud-onboarding__note">
                            <span className="happy-cloud-onboarding__note-title">
                                <Icon name="lock" size={14} />
                                {view.ask === "method" ? "Payment method" : "Balance"}
                                {view.testMode ? <Tag label="Test mode" tone="attention" /> : null}
                            </span>
                            <span className="happy-cloud-onboarding__figure">
                                {view.ask === "method"
                                    ? (view.method ?? "Nothing on file yet")
                                    : (view.balance ?? "…")}
                            </span>
                            <p className="happy-cloud-onboarding__note-text">{view.detail}</p>
                        </div>
                        {view.ask === "credit" && view.amounts && view.onAmountSelect ? (
                            <div
                                aria-label="Amount"
                                className="happy-cloud-onboarding__amounts"
                                role="radiogroup"
                            >
                                {view.amounts.map((amount) => (
                                    <Button
                                        aria-checked={amount.id === view.amount}
                                        key={amount.id}
                                        onClick={() => view.onAmountSelect?.(amount.id)}
                                        role="radio"
                                        size="large"
                                        variant={
                                            amount.id === view.amount ? "primary" : "secondary"
                                        }
                                    >
                                        {amount.label}
                                    </Button>
                                ))}
                            </div>
                        ) : null}
                        <Hint
                            text={
                                view.error ??
                                (view.waiting
                                    ? "Finish in your browser. This page moves on by itself."
                                    : undefined)
                            }
                        />
                    </div>
                ),
            };
        case "finished":
            return {
                title: "You're all set",
                copy: `${view.botName || "The admin bot"} works with the people who manage bots.`,
                body: (
                    <NoticeMark
                        icon="check-circle"
                        next="Your team's chats and tasks are waiting for you."
                    />
                ),
            };
        case "notice":
            return NOTICES[view.reason](view.step, view.owners ?? []);
    }
}

/** "Olga", "Olga or Sam", "Olga, Sam or Ana": who the reader is waiting on. */
function ownersText(owners: readonly string[]): string {
    if (owners.length === 0) return "An owner of this server";
    if (owners.length === 1) return owners[0]!;
    return `${owners.slice(0, -1).join(", ")} or ${owners[owners.length - 1]}`;
}

const NOTICES: Readonly<
    Record<
        Extract<CloudOnboardingView, { readonly kind: "notice" }>["reason"],
        (
            step: string,
            owners: readonly string[],
        ) => {
            readonly title: string;
            readonly copy: string;
            readonly body: ReactNode;
        }
    >
> = {
    waitForAdmin: (step, owners) => ({
        title: "Waiting for your admin",
        copy: `${ownersText(owners)} needs to finish "${step}" before you can start.`,
        body: (
            <NoticeMark
                icon="clock"
                next={`Let ${owners.length === 1 ? "them" : "an owner"} know you're here. This page moves on by itself once it's done.`}
            />
        ),
    }),
    update: () => ({
        title: "Update Happy to continue",
        copy: "This server asks for a step this version of Happy can't show.",
        body: (
            <NoticeMark
                icon="arrow-down"
                next="Install the latest Happy, then sign in again. You'll pick up right here."
            />
        ),
    }),
    unavailable: (step) => ({
        title: "Almost ready",
        copy: `This server can't check "${step}" yet.`,
        body: (
            <NoticeMark
                icon="clock"
                next="There's nothing to do here. This page moves on by itself as soon as it can."
            />
        ),
    }),
};

/** The notice's picture, and what happens next in one quiet line under it. */
function NoticeMark(props: {
    readonly icon: "clock" | "arrow-down" | "check-circle";
    readonly next: string;
}) {
    return (
        <div className="happy-cloud-onboarding__notice-body">
            <span className="happy-cloud-onboarding__notice" aria-hidden>
                <Icon name={props.icon} size={32} />
            </span>
            <p className="happy-cloud-onboarding__next">{props.next}</p>
        </div>
    );
}

/**
 * C-345 CloudOnboardingScreen — a Happy Cloud server's onboarding, one gate per
 * page, in the order the server lists them.
 *
 * Every gate is drawn by this one `SetupPage` so the backdrop and the step bar
 * stay mounted while only the words and the body change. Which gate shows,
 * and whether it can be skipped, is the caller's: the server decides, and
 * this component only draws what it decided.
 */
export function CloudOnboardingScreen(props: CloudOnboardingScreenProps) {
    const current = page(props.view, props.serverLabel);
    const currentIndex = props.steps.findIndex((step) => step.id === props.currentStep);
    return (
        <SetupPage
            {...(props.action ? { action: props.action } : {})}
            {...(props.skip ? { secondary: { ...props.skip, label: "Skip for now" } } : {})}
            {...(props.footnote && props.action?.disabled ? { footnote: props.footnote } : {})}
            backdrop={{ appearance: props.appearance, kind: "sky" }}
            className={
                props.view.kind === "inference"
                    ? "happy-cloud-onboarding happy-cloud-onboarding--wide"
                    : "happy-cloud-onboarding"
            }
            copy={current.copy}
            data-testid="cloud-onboarding-screen"
            help={<OnboardingHelp onExternalOpen={props.onExternalOpen} />}
            // Centred, like the Happy Cloud pages that lead here: a gate's body
            // varies in height, and the centred bands hold it at every size.
            placement="centered"
            steps={
                props.steps.length > 1 ? (
                    <SegmentedProgress
                        label="Setup"
                        mode="steps"
                        segments={props.steps.map((step, index) => ({
                            id: step.id,
                            label: step.label,
                            state:
                                index < currentIndex
                                    ? "done"
                                    : index === currentIndex
                                      ? "running"
                                      : "pending",
                        }))}
                        // The sky follows the appearance, and so does the ink on it.
                        tone="default"
                    />
                ) : undefined
            }
            title={current.title}
            transitionKey={props.currentStep}
        >
            {current.body}
        </SetupPage>
    );
}
