import type { ReactNode } from "react";
import {
    CloudOnboardingComputerBody,
    cloudOnboardingComputerCopy,
    type CloudOnboardingComputerBodyProps,
} from "./CloudOnboardingComputer";
import { CopyButton } from "./CopyButton";
import {
    CloudOnboardingToolsBody,
    type CloudOnboardingToolsBodyProps,
} from "./CloudOnboardingTools";
import { QRCode } from "./QRCode";
import { ScrollArea } from "./Scrollbar";
import { Spinner } from "./Spinner";
import { OnboardingHelp } from "./OnboardingHelp";
import { ProfileSetupForm, type ProfileSetupFormProps } from "./ProfileSetupScreen";
import { SegmentedProgress } from "./SegmentedProgress";
import {
    CloudOnboardingProviderRows,
    type CloudOnboardingProviderRow,
} from "./CloudOnboardingProviderRows";
import {
    SetupPage,
    type SetupPageAction,
    type SetupPageCornerAction,
    type SetupPageSecondaryAction,
} from "./SetupPage";
import { TextField } from "./TextField";
import { Button } from "./Button";
import type { ThemeMode } from "./ThemeScope";
import { Icon } from "./Icon";

/** One step in the bar across the top, in the server's order. */
export interface CloudOnboardingStep {
    readonly id: string;
    readonly label: string;
    /**
     * Finished or skipped, wherever the reader stands. The bar draws what is
     * finished and where the reader is as two separate things, so someone who
     * steps back sees the steps ahead they already finished.
     */
    readonly done: boolean;
}

/** An invite sent from the teammates gate. The caller lists them newest first. */
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
          readonly kind: "inference";
          /** One row per provider, plans first. */
          readonly rows: readonly CloudOnboardingProviderRow[];
          readonly error?: string;
      }
    | ({
          /** GitHub in the Code box, then every other tool by the job it does. */
          readonly kind: "plugins";
      } & CloudOnboardingToolsBodyProps)
    | ({
          readonly kind: "computer";
          /** The step is required: the line under the title says the server asks for it. */
          readonly required: boolean;
          /** The team already has a shared computer the reader's agents may use. */
          readonly shared: boolean;
      } & Omit<CloudOnboardingComputerBodyProps, "serverName">)
    | {
          readonly kind: "teammates";
          readonly email: string;
          readonly busy: boolean;
          readonly invites: readonly CloudOnboardingInvite[];
          /** The link invite, once one is made. The server keeps none, so it shows this once. */
          readonly link?: string;
          /** A link was asked for and has not come back yet. */
          readonly linkBusy?: boolean;
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
    /** Returns to the step before this one. Omitted on the first step. */
    readonly back?: Omit<SetupPageCornerAction, "label">;
    /** Leaves setup to finish later; what is done stays done. */
    readonly exit?: Omit<SetupPageCornerAction, "label">;
    onExternalOpen?(url: string): void;
}

/** A short sentence-case mark beside a row's title. */
function Tag(props: { readonly label: string; readonly tone?: "attention" }) {
    return (
        <span className="happy-cloud-onboarding__tag" data-tone={props.tone}>
            {props.label}
        </span>
    );
}

/** Invite lists that have opened, so a row can tell arriving later from arriving with them. */
const inviteListsOpened = new WeakSet<Element>();

/**
 * The list rests on its newest invite. It opens there. React attaches a row's
 * ref before its list's, so the rows a list opens with find it unopened and
 * leave it alone.
 */
function inviteListRef(node: HTMLDivElement | null): void {
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "instant" });
    inviteListsOpened.add(node);
}

/** A row sent while the list is open brings the list to it, one row's glide. */
function inviteRowRef(node: HTMLDivElement | null): void {
    const list = node?.parentElement;
    if (list && inviteListsOpened.has(list)) list.scrollTo({ top: list.scrollHeight });
}

/**
 * The reserved two lines under a form where a refusal is said. The box is the
 * same whether it is empty, holds one line, or holds a message too long for
 * two: that one scrolls inside it, so no refusal moves what is under it.
 */
function Hint(props: {
    readonly text: string | undefined;
    /** `list`: between the invite link and the invites, read with both. */
    readonly place?: "list";
}) {
    return (
        <div className="happy-cloud-onboarding__hint" data-place={props.place}>
            <p
                className="happy-cloud-onboarding__hint-text"
                data-happy-desktop-ui="cloud-onboarding-hint"
                data-tone={props.text ? "attention" : undefined}
                role="status"
            >
                {props.text}
            </p>
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
        case "inference":
            return {
                title: "Connect your AI",
                copy: "Use a plan you already pay for, or an API key.",
                body: (
                    <>
                        <CloudOnboardingProviderRows rows={view.rows} />
                        {view.error ? <Hint text={view.error} /> : null}
                    </>
                ),
            };
        case "plugins":
            return {
                title: "Connect your tools",
                copy:
                    view.github || view.loading
                        ? "Start with GitHub, so agents can work in your team's code."
                        : "Plugins let agents work in the tools your team already uses.",
                body: <CloudOnboardingToolsBody {...view} />,
            };
        case "computer": {
            const { kind: _kind, required, shared, ...body } = view;
            return {
                ...cloudOnboardingComputerCopy({
                    reader: view.reader,
                    serverName: server,
                    required,
                    shared,
                }),
                body: <CloudOnboardingComputerBody {...body} serverName={server} />,
            };
        }
        case "teammates":
            return {
                title: "Invite your team",
                copy: `Everyone you invite joins ${server} as a member.`,
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
                                disabled={view.email.trim() === "" || view.linkBusy}
                                loading={view.busy}
                                onClick={view.onInvite}
                                size="large"
                                variant="secondary"
                                width={96}
                            >
                                Invite
                            </Button>
                        </div>
                        {/* One row from the first frame: asking for the link
                            turns its button busy, and the link then stands in
                            the words and the box that were already there. */}
                        {view.link || view.onLinkCreate ? (
                            <div
                                className="happy-cloud-onboarding__row"
                                data-happy-desktop-ui="cloud-onboarding-invite-link"
                            >
                                <span className="happy-cloud-onboarding__row-text">
                                    <span className="happy-cloud-onboarding__row-title">
                                        <Icon name="link" size={14} />
                                        Invite link
                                    </span>
                                    {view.link ? (
                                        <span
                                            className="happy-cloud-onboarding__link-text"
                                            key="link"
                                        >
                                            {view.link}
                                        </span>
                                    ) : (
                                        <span className="happy-cloud-onboarding__row-detail">
                                            Anyone with the link can join.
                                        </span>
                                    )}
                                </span>
                                <span className="happy-cloud-onboarding__row-action">
                                    {view.link ? (
                                        <CopyButton
                                            caption="Copy"
                                            label="Copy invite link"
                                            text={view.link}
                                        />
                                    ) : (
                                        <Button
                                            disabled={view.busy}
                                            loading={view.linkBusy}
                                            onClick={view.onLinkCreate}
                                            size="small"
                                            variant="secondary"
                                            width={96}
                                        >
                                            Create link
                                        </Button>
                                    )}
                                </span>
                            </div>
                        ) : null}
                        {/* Under the link rather than the field, so the link
                            stands right under the form; the line is kept whether
                            or not it says anything, so a refusal moves nothing. */}
                        <Hint place="list" text={view.error} />
                        {/* Oldest first: a new invite lands in the free room
                            under the others instead of pushing them down. The
                            list scrolls inside that room and fades at its
                            edges, so the form above it never leaves. */}
                        {view.invites.length > 0 ? (
                            <div className="happy-cloud-onboarding__rows-room">
                                <ScrollArea
                                    className="happy-cloud-onboarding__rows-area"
                                    data-scrollbar-always=""
                                    viewportClassName="happy-cloud-onboarding__rows"
                                    viewportRef={inviteListRef}
                                >
                                    {[...view.invites].reverse().map((invite) => (
                                        <div
                                            className="happy-cloud-onboarding__row"
                                            data-happy-desktop-ui="cloud-onboarding-invite"
                                            data-size="compact"
                                            key={invite.id}
                                            ref={inviteRowRef}
                                        >
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
                                </ScrollArea>
                            </div>
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
                                <Icon name="check" size={18} />
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
    readonly icon: "clock" | "arrow-down" | "check";
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
 * The bar across the top of setup: one segment per step, the one the reader
 * is on full in the strongest ink. Nothing for a single step.
 */
export function cloudOnboardingStepsBar(
    steps: readonly CloudOnboardingStep[],
    currentStep: string,
): ReactNode {
    if (steps.length <= 1) return undefined;
    return (
        <SegmentedProgress
            label="Setup"
            mode="steps"
            segments={steps.map((step) =>
                step.id === currentStep
                    ? // The step you are on fills its whole segment, in
                      // the strongest ink: the person sets the pace, so
                      // there is no share of it to draw.
                      {
                          id: step.id,
                          label: step.label,
                          state: "running" as const,
                          fraction: 1,
                      }
                    : {
                          id: step.id,
                          label: step.label,
                          state: step.done ? ("done" as const) : ("pending" as const),
                      },
            )}
            // The sky follows the appearance, and so does the ink on it.
            tone="default"
        />
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
    return (
        <SetupPage
            {...(props.action ? { action: props.action } : {})}
            {...(props.skip ? { secondary: { ...props.skip, label: "Skip for now" } } : {})}
            {...(props.footnote && props.action?.disabled ? { footnote: props.footnote } : {})}
            {...(props.back ? { back: { ...props.back, label: "Back" } } : {})}
            {...(props.exit ? { exit: { ...props.exit, label: "Save and exit" } } : {})}
            backdrop={{ appearance: props.appearance, kind: "sky" }}
            className={
                props.view.kind === "inference" ||
                props.view.kind === "plugins" ||
                props.view.kind === "computer"
                    ? "happy-cloud-onboarding happy-cloud-onboarding--wide"
                    : "happy-cloud-onboarding"
            }
            copy={current.copy}
            data-testid="cloud-onboarding-screen"
            help={<OnboardingHelp onExternalOpen={props.onExternalOpen} />}
            // A gate's body varies in height and changes while it is open, so
            // the words hold one line and the body hangs under them.
            placement="top"
            steps={cloudOnboardingStepsBar(props.steps, props.currentStep)}
            title={current.title}
            transitionKey={props.currentStep}
        >
            {current.body}
        </SetupPage>
    );
}
