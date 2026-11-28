import { useState, type ReactNode } from "react";
import type { HappyAgentPluginAuthField, HappyAgentPluginImage } from "happy-desktop-state";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { PluginMark } from "./pages/plugins/pluginPresentation";
import { SegmentedControl } from "./SegmentedControl";
import { Spinner } from "./Spinner";
import { TextField } from "./TextField";
import { Ionicon, type IoniconName } from "./vectorIcons/VectorIcon";

/** One tool the server offers, as a row and a list entry draw it. */
export interface CloudOnboardingTool {
    readonly id: string;
    readonly name: string;
    readonly image: HappyAgentPluginImage | null;
    /** A handful of words; empty where there are none to say. */
    readonly summary: string;
    /** What the person brings to sign in, in two or three words; may be empty. */
    readonly needs: string;
    /** Signed in for the team already. */
    readonly connected: boolean;
}

/** A job on the step, as a row: its tools, and what opens it. */
export interface CloudOnboardingToolsJob {
    readonly id: string;
    /** The job's name; the row of tools no job claims is named by its count. */
    readonly title: string;
    /** `rest` holds every tool no job claims. */
    readonly kind: "job" | "rest";
    readonly tools: readonly CloudOnboardingTool[];
    readonly onOpen?: () => void;
}

/** GitHub, which takes the Code box. */
export interface CloudOnboardingToolsGitHub {
    readonly image: HappyAgentPluginImage | null;
    readonly connected: boolean;
    /** The server offers the GitHub App, so a change is made on GitHub. */
    readonly app: boolean;
    /** Sending the person to GitHub is under way. */
    readonly busy?: boolean;
    readonly onConnect?: () => void;
    readonly onChange?: () => void;
}

/** What the plugins gate shows. */
export interface CloudOnboardingToolsBodyProps {
    /** Absent where the server does not offer GitHub. */
    readonly github?: CloudOnboardingToolsGitHub;
    readonly jobs: readonly CloudOnboardingToolsJob[];
    /** The catalog is not read yet: the boxes hold their room. */
    readonly loading?: boolean;
    /** Why the catalog could not be read, or the last action on the step failed. */
    readonly error?: string;
}

/** What agents can do once GitHub is connected, from the GitHub plugin's own tools. */
const GITHUB_POINTS: readonly { readonly icon: IoniconName; readonly text: string }[] = [
    { icon: "code-slash-outline", text: "Read and push code" },
    { icon: "git-pull-request-outline", text: "Open and merge pull requests" },
    { icon: "play-circle-outline", text: "Follow CI and re-run checks" },
];

/** The same three in the dialog, where there is room to say all of each. */
const GITHUB_POINTS_DIALOG: readonly { readonly icon: IoniconName; readonly text: string }[] = [
    { icon: "code-slash-outline", text: "Read and push code" },
    { icon: "git-pull-request-outline", text: "Open and merge pull requests, and work on issues" },
    { icon: "play-circle-outline", text: "Follow CI and re-run failed checks" },
];

const GITHUB_STEPS = [
    "Pick your organization or account",
    "Choose all of its repositories, or only some",
    "Come back here, connected",
];

const TEAM_NOTE = "One connection for your whole team.";

/**
 * Where each dialog's top is set, as the height of the view centred there:
 * GitHub's first look, and the design's key form (Vercel's) for every job's
 * dialog and for GitHub's token form alone. A constant, not the tallest real
 * form: how many fields a form has is the server's, so a taller one grows
 * down from the same top and scrolls inside the card at the window's gutter.
 */
const ANCHOR_GITHUB = 517;
const ANCHOR_KEY_FORM = 471;

function Mark(props: {
    readonly image: HappyAgentPluginImage | null;
    readonly size: 24 | 36 | 40;
}) {
    return (
        <span className="happy-cloud-tools__mark" data-size={props.size}>
            <PluginMark image={props.image} size="row" />
        </span>
    );
}

function Marks(props: { readonly tools: readonly CloudOnboardingTool[] }) {
    return (
        <span className="happy-cloud-tools__marks">
            {props.tools.map((tool) => (
                <Mark image={tool.image} key={tool.id} size={24} />
            ))}
        </span>
    );
}

function Done(props: { readonly label: string }) {
    return (
        <span className="happy-cloud-tools__done">
            <Icon name="check" size={14} />
            {props.label}
        </span>
    );
}

/** "And 2 more", or the job's own name. */
function jobTitle(job: CloudOnboardingToolsJob): string {
    return job.kind === "rest" ? `And ${String(job.tools.length)} more` : job.title;
}

/**
 * C-357 CloudOnboardingToolsBody — the plugins gate by job: Code is GitHub
 * and takes the large box with one action, every other job is a row that
 * opens its tools, and the last row holds the tools no job claims. The
 * choice between the GitHub App and a token lives in GitHub's dialog.
 */
export function CloudOnboardingToolsBody(props: CloudOnboardingToolsBodyProps) {
    const github = props.github;
    const pending = props.loading === true && props.jobs.length === 0;
    return (
        <div
            className="happy-cloud-tools"
            data-happy-desktop-ui="cloud-onboarding-tools"
            data-pending={pending ? "" : undefined}
        >
            {github || pending ? (
                <section
                    className="happy-cloud-tools__card happy-cloud-tools__code"
                    data-happy-desktop-ui="cloud-onboarding-tools-github"
                >
                    {github ? (
                        <>
                            <p className="happy-cloud-tools__label">Code</p>
                            <header className="happy-cloud-tools__head">
                                <Mark image={github.image} size={40} />
                                <span className="happy-cloud-tools__text">
                                    <span className="happy-cloud-tools__name">GitHub</span>
                                    <span className="happy-cloud-tools__detail">{TEAM_NOTE}</span>
                                </span>
                            </header>
                            <ul className="happy-cloud-tools__points">
                                {GITHUB_POINTS.map((point) => (
                                    <li key={point.icon}>
                                        <Ionicon name={point.icon} size={14} />
                                        {point.text}
                                    </li>
                                ))}
                            </ul>
                            <div className="happy-cloud-tools__foot">
                                {github.connected ? (
                                    <>
                                        <Done label="Connected" />
                                        <Button
                                            disabled={!github.onChange}
                                            onClick={github.onChange}
                                            size="small"
                                            variant="ghost"
                                            working={github.busy === true}
                                            {...(github.app
                                                ? { trailingIcon: "open-external" as const }
                                                : {})}
                                        >
                                            {github.app ? "Change on GitHub" : "Change token"}
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        disabled={!github.onConnect}
                                        fullWidth
                                        onClick={github.onConnect}
                                    >
                                        Connect GitHub
                                    </Button>
                                )}
                            </div>
                        </>
                    ) : null}
                </section>
            ) : null}
            <div className="happy-cloud-tools__jobs">
                {pending
                    ? [0, 1, 2, 3, 4].map((index) => (
                          <div
                              className="happy-cloud-tools__card happy-cloud-tools__job"
                              data-pending=""
                              key={index}
                          >
                              {index === 2 ? <Spinner size={16} /> : null}
                          </div>
                      ))
                    : props.jobs.map((job) => (
                          <button
                              className="happy-cloud-tools__card happy-cloud-tools__job"
                              data-happy-desktop-ui="cloud-onboarding-tools-job"
                              data-job={job.id}
                              disabled={!job.onOpen}
                              key={job.id}
                              onClick={job.onOpen}
                              type="button"
                          >
                              <span className="happy-cloud-tools__job-text">
                                  <span className="happy-cloud-tools__job-name">
                                      {jobTitle(job)}
                                  </span>
                                  <span className="happy-cloud-tools__job-tools">
                                      {job.tools.map((tool) => tool.name).join(", ")}
                                  </span>
                              </span>
                              <Marks tools={job.tools} />
                              <Icon name="chevron-right" size={14} />
                          </button>
                      ))}
            </div>
            {/* Under the boxes, in room nothing else takes, so a refusal moves nothing. */}
            <p className="happy-cloud-tools__hint" role="status">
                {props.error}
            </p>
        </div>
    );
}

/* ---- Dialogs ------------------------------------------------------------- */

/** A sign-in form: one of a tool's fields methods, what is typed, and what was refused. */
export interface CloudOnboardingToolForm {
    /** The tool's fields methods; a switch above the fields when there is more than one. */
    readonly methods: readonly { readonly id: string; readonly label: string }[];
    readonly methodId: string;
    readonly fields: readonly HappyAgentPluginAuthField[];
    readonly values: ReadonlyMap<string, string>;
    /** What the server refused about each field, by key. */
    readonly fieldErrors: ReadonlyMap<string, string>;
    /** A refusal that names no field. */
    readonly message?: string;
    readonly busy: boolean;
    readonly onMethodSelect?: (methodId: string) => void;
    readonly onValueChange: (key: string, value: string) => void;
    readonly onSubmit: () => void;
}

function ToolsDialog(props: {
    readonly title: string;
    readonly leading?: ReactNode;
    readonly anchorHeight: number;
    readonly busy?: boolean;
    readonly footer?: ReactNode;
    readonly onBack?: () => void;
    readonly onClose: () => void;
    readonly testId: string;
    readonly children: ReactNode;
}) {
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                anchorHeight={props.anchorHeight}
                className="happy-cloud-tools-dialog"
                data-testid={props.testId}
                frame="anchored"
                onClose={props.onClose}
                title={props.title}
                {...(props.busy ? { busy: true } : {})}
                {...(props.footer ? { footer: props.footer } : {})}
                {...(props.onBack
                    ? { onBack: props.onBack }
                    : props.leading
                      ? { leading: props.leading }
                      : {})}
            >
                <div className="happy-cloud-tools-dialog__body">{props.children}</div>
            </Modal>
        </ModalOverlay>
    );
}

/** A tool's picture as the dialog's 28px header tile, or the plugin chip without one. */
function HeaderMark(props: { readonly image: HappyAgentPluginImage | null }) {
    return props.image ? (
        <img
            alt=""
            className="happy-cloud-tools-dialog__mark"
            draggable={false}
            src={props.image.url}
        />
    ) : (
        <span className="happy-cloud-tools-dialog__chip">
            <Icon name="plugin" size={18} />
        </span>
    );
}

/** One icon and its words, on the dialog's two shared columns. */
function Row(props: { readonly icon: ReactNode; readonly children: ReactNode }) {
    return (
        <li className="happy-cloud-tools-dialog__row">
            <span className="happy-cloud-tools-dialog__icon">{props.icon}</span>
            <span className="happy-cloud-tools-dialog__text">{props.children}</span>
        </li>
    );
}

/**
 * A note framed like the chat's question prompt: a hairline frame that stands
 * outside the text column, so its icon and words stay on the dialog's columns.
 */
function FramedNote(props: { readonly icon: IconName; readonly children: ReactNode }) {
    return (
        <ul className="happy-cloud-tools-dialog__note">
            <Row icon={<Icon name={props.icon} size={14} />}>{props.children}</Row>
        </ul>
    );
}

function Kept(props: { readonly where: string }) {
    return (
        <FramedNote icon="lock">
            Kept on your Happy server for your whole team. Delete the token on {props.where} to take
            the access away.
        </FramedNote>
    );
}

/**
 * A secret being typed, with the show control at the size of the dialog's own
 * close button. A multi-line secret, such as a key file, shows as typed.
 */
function SecretField(props: {
    readonly field: HappyAgentPluginAuthField;
    readonly value: string;
    readonly error: string | undefined;
    readonly disabled: boolean;
    readonly onValueChange: (value: string) => void;
}) {
    const [shown, setShown] = useState(false);
    const { field } = props;
    return (
        <div className="happy-cloud-tools-dialog__secret">
            <TextField
                disabled={props.disabled}
                fullWidth
                label={field.label}
                onValueChange={props.onValueChange}
                required={field.required}
                type={field.multiline || shown ? "text" : "password"}
                value={props.value}
                {...(field.multiline ? { multiline: true, rows: 4 } : {})}
                {...(props.error ? { error: props.error } : field.help ? { hint: field.help } : {})}
            />
            {field.multiline ? null : (
                <span className="happy-cloud-tools-dialog__eye">
                    <Button
                        aria-label={shown ? "Hide value" : "Show value"}
                        aria-pressed={shown}
                        icon={shown ? "eye-off" : "eye"}
                        iconOnly
                        onClick={() => setShown(!shown)}
                        size="small"
                        variant="ghost"
                    />
                </span>
            )}
        </div>
    );
}

/** The switch between a tool's methods, and the fields of the one chosen. */
function FormFields(props: { readonly form: CloudOnboardingToolForm }) {
    const { form } = props;
    return (
        <>
            {form.methods.length > 1 && form.onMethodSelect ? (
                <SegmentedControl
                    aria-label="How to sign in"
                    onChange={form.onMethodSelect}
                    segments={form.methods.map((method) => ({
                        value: method.id,
                        label: method.label,
                    }))}
                    size="small"
                    value={form.methodId}
                />
            ) : null}
            {form.fields.map((field) =>
                field.secret ? (
                    <SecretField
                        disabled={form.busy}
                        error={form.fieldErrors.get(field.key)}
                        field={field}
                        key={`${form.methodId}:${field.key}`}
                        onValueChange={(value) => form.onValueChange(field.key, value)}
                        value={form.values.get(field.key) ?? ""}
                    />
                ) : (
                    <TextField
                        disabled={form.busy}
                        fullWidth
                        key={`${form.methodId}:${field.key}`}
                        label={field.label}
                        onValueChange={(value) => form.onValueChange(field.key, value)}
                        required={field.required}
                        value={form.values.get(field.key) ?? ""}
                        {...(field.multiline ? { multiline: true, rows: 4 } : {})}
                        {...(form.fieldErrors.get(field.key)
                            ? { error: form.fieldErrors.get(field.key)! }
                            : field.help
                              ? { hint: field.help }
                              : {})}
                    />
                ),
            )}
            {form.message ? (
                <p className="happy-cloud-tools-dialog__error" role="alert">
                    {form.message}
                </p>
            ) : null}
        </>
    );
}

function ConnectButton(props: { readonly form: CloudOnboardingToolForm }) {
    const { form } = props;
    const missing = form.fields.some(
        (field) => field.required && (form.values.get(field.key) ?? "").trim() === "",
    );
    return (
        <Button disabled={missing} loading={form.busy} onClick={form.onSubmit} width={112}>
            Connect
        </Button>
    );
}

export interface CloudOnboardingGitHubDialogProps {
    readonly image: HappyAgentPluginImage | null;
    /**
     * The server offers the GitHub App. Without it the token form is all the
     * dialog has, and it has no Back.
     */
    readonly app: boolean;
    /** GitHub's page was opened: the button works and still opens it again. */
    readonly waiting: boolean;
    /** Sending the person to GitHub is under way. */
    readonly busy: boolean;
    /** Why sending the person to GitHub failed. */
    readonly error?: string;
    /** The token form, when it is the view. */
    readonly token?: CloudOnboardingToolForm;
    readonly onContinue: () => void;
    readonly onTokenOpen: () => void;
    readonly onBack: () => void;
    readonly onClose: () => void;
}

/**
 * C-358 CloudOnboardingGitHubDialog — connecting GitHub. The GitHub App is
 * the one filled button; while GitHub is open in the browser the view stays
 * and only its button works, which opens GitHub again. A personal access
 * token is a quiet second path that says it is not recommended, in a second
 * view behind Back.
 */
export function CloudOnboardingGitHubDialog(props: CloudOnboardingGitHubDialogProps) {
    const token = props.token;
    return (
        <ToolsDialog
            anchorHeight={props.app ? ANCHOR_GITHUB : ANCHOR_KEY_FORM}
            busy={token?.busy === true}
            footer={
                token ? (
                    <ConnectButton form={token} />
                ) : (
                    <Button
                        onClick={props.onContinue}
                        trailingIcon="open-external"
                        width={184}
                        working={props.waiting || props.busy}
                    >
                        Continue on GitHub
                    </Button>
                )
            }
            leading={<HeaderMark image={props.image} />}
            onClose={props.onClose}
            testId="cloud-onboarding-github-dialog"
            title="Connect GitHub"
            {...(token && props.app ? { onBack: props.onBack } : {})}
        >
            {token ? (
                <>
                    <FormFields form={token} />
                    <div className="happy-cloud-tools-dialog__section">
                        <p className="happy-cloud-tools-dialog__lead">What the token needs</p>
                        <ul className="happy-cloud-tools-dialog__needs">
                            <li>
                                <b>Fine-grained</b>
                                Pick the repositories, then Contents read and write. Add Issues,
                                Pull requests, Actions and Commit statuses for the work you want
                                done there.
                            </li>
                            <li>
                                <b>Classic</b>
                                repo, workflow and read:org.
                            </li>
                        </ul>
                    </div>
                    <Kept where="GitHub" />
                </>
            ) : (
                <>
                    <div className="happy-cloud-tools-dialog__section">
                        <p className="happy-cloud-tools-dialog__lead">
                            In the repositories you choose, agents can
                        </p>
                        <ul className="happy-cloud-tools-dialog__rows">
                            {GITHUB_POINTS_DIALOG.map((point) => (
                                <Row
                                    icon={<Ionicon name={point.icon} size={14} />}
                                    key={point.icon}
                                >
                                    {point.text}
                                </Row>
                            ))}
                        </ul>
                    </div>
                    <div className="happy-cloud-tools-dialog__section">
                        <p className="happy-cloud-tools-dialog__lead">On GitHub, you will</p>
                        <ol className="happy-cloud-tools-dialog__rows">
                            {GITHUB_STEPS.map((text, index) => (
                                <Row
                                    icon={
                                        <span className="happy-cloud-tools-dialog__n">
                                            {String(index + 1)}
                                        </span>
                                    }
                                    key={text}
                                >
                                    {text}
                                </Row>
                            ))}
                        </ol>
                    </div>
                    <FramedNote icon="lock">
                        Happy asks GitHub for a short-lived key for one repository at a time, and
                        never keeps your GitHub sign-in.
                    </FramedNote>
                    <button
                        className="happy-cloud-tools-dialog__alt"
                        onClick={props.onTokenOpen}
                        type="button"
                    >
                        <span className="happy-cloud-tools-dialog__icon">
                            <Ionicon name="key-outline" size={14} />
                        </span>
                        <span className="happy-cloud-tools-dialog__text">
                            <span className="happy-cloud-tools-dialog__alt-name">
                                Use a personal access token
                            </span>
                            <span className="happy-cloud-tools-dialog__alt-why">
                                Not recommended. Agents act as one person.
                            </span>
                        </span>
                        <Icon name="chevron-right" size={14} />
                    </button>
                    {props.error ? (
                        <p className="happy-cloud-tools-dialog__error" role="alert">
                            {props.error}
                        </p>
                    ) : null}
                </>
            )}
        </ToolsDialog>
    );
}

export interface CloudOnboardingToolDialogProps {
    readonly job: CloudOnboardingToolsJob;
    /** The tool whose form is open, behind Back to the list. */
    readonly form?: CloudOnboardingToolForm & { readonly tool: CloudOnboardingTool };
    readonly onToolOpen: (toolId: string) => void;
    readonly onBack: () => void;
    readonly onClose: () => void;
}

/**
 * C-359 CloudOnboardingToolDialog — one job opened: its tools as a list, then
 * the picked tool's fields in the same dialog behind Back. Only the bottom
 * edge moves between them.
 */
export function CloudOnboardingToolDialog(props: CloudOnboardingToolDialogProps) {
    const { form, job } = props;
    return (
        <ToolsDialog
            anchorHeight={ANCHOR_KEY_FORM}
            busy={form?.busy === true}
            leading={
                <span className="happy-cloud-tools-dialog__chip">
                    <Icon name="plugin" size={18} />
                </span>
            }
            onClose={props.onClose}
            testId="cloud-onboarding-tool-dialog"
            title={
                form ? `Connect ${form.tool.name}` : job.kind === "rest" ? "More tools" : job.title
            }
            {...(form ? { footer: <ConnectButton form={form} />, onBack: props.onBack } : {})}
        >
            {form ? (
                <>
                    <div className="happy-cloud-tools-dialog__summary">
                        <Mark image={form.tool.image} size={36} />
                        <span className="happy-cloud-tools__text">
                            <span className="happy-cloud-tools-dialog__pick-name">
                                {form.tool.name}
                            </span>
                            {form.tool.summary ? (
                                <span className="happy-cloud-tools-dialog__pick-detail">
                                    {form.tool.summary}
                                </span>
                            ) : null}
                        </span>
                    </div>
                    <FormFields form={form} />
                    <Kept where={form.tool.name} />
                </>
            ) : (
                <div className="happy-cloud-tools-dialog__pick">
                    {job.tools.map((tool) => (
                        <button
                            className="happy-cloud-tools-dialog__pick-row"
                            data-happy-desktop-ui="cloud-onboarding-tool"
                            key={tool.id}
                            onClick={() => props.onToolOpen(tool.id)}
                            type="button"
                        >
                            <Mark image={tool.image} size={36} />
                            <span className="happy-cloud-tools__text">
                                <span className="happy-cloud-tools-dialog__pick-name">
                                    {tool.name}
                                </span>
                                {tool.summary ? (
                                    <span className="happy-cloud-tools-dialog__pick-detail">
                                        {tool.summary}
                                    </span>
                                ) : null}
                            </span>
                            <span
                                className="happy-cloud-tools-dialog__pick-needs"
                                data-connected={tool.connected ? "" : undefined}
                            >
                                {tool.connected ? (
                                    <>
                                        <Icon name="check" size={14} />
                                        Connected
                                    </>
                                ) : (
                                    tool.needs
                                )}
                            </span>
                            <Icon name="chevron-right" size={14} />
                        </button>
                    ))}
                    <p className="happy-cloud-tools-dialog__fine">{TEAM_NOTE}</p>
                </div>
            )}
        </ToolsDialog>
    );
}
