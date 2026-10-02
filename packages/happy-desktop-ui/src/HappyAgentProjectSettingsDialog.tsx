import type { CSSProperties } from "react";
import { Avatar } from "./Avatar";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { CopyButton } from "./CopyButton";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { SegmentedControl } from "./SegmentedControl";
import { TextField } from "./TextField";

/** The three things a project can say about where the sessions started in it run. */
export type HappyAgentProjectComputeMode = "default" | "local" | "docker";

/** What the host holds for a project: the machine itself, or a container built from an image. */
export type HappyAgentProjectComputeChoice = { type: "local" } | { type: "docker"; image: string };

/**
 * Where sessions started in this project run, as the settings dialog shows it.
 *
 * The host's own answer (`current`) and the choice being made (`mode`, `image`)
 * are separate on purpose: until the two agree, the reader is looking at a
 * decision they have not committed, and the section says so rather than
 * presenting an edit as a fact.
 */
export type HappyAgentProjectComputeSection = {
    /**
     * Whether the host's answer is in hand. Nothing states what the project is
     * set to until it is `ready`; `error` means it could not be read, and
     * `readError` says why.
     */
    status: "loading" | "ready" | "error";
    /** What the host holds. Absent means the project states nothing and the machine decides. */
    current?: HappyAgentProjectComputeChoice;
    /** The choice being made. */
    mode: HappyAgentProjectComputeMode;
    /** The Docker image being written, kept while another option is being looked at. */
    image: string;
    /** True while the host is being told; the whole dialog stays up and inert. */
    submitting?: boolean;
    /** Why the last attempt did not save, in the reader's words. */
    error?: string;
    /** Why the setting could not be read, when `status` is `error`. */
    readError?: string;
};

/**
 * What a new workspace of this project starts with, as the settings dialog
 * shows it: the commands its checkout runs, read from the project's own
 * `happy.toml`, and the first message its agent is sent.
 *
 * The commands are shown, not set — the file is where they live, and the
 * dialog only offers to open it. The first message is the host's answer
 * (`initialPrompt`) beside the text being written (`initialPromptDraft`), kept
 * apart for the same reason the compute section keeps its two: until they
 * agree, the reader is looking at a decision they have not committed.
 */
export type HappyAgentProjectSetupSection = {
    /** Whether the host's answer is in hand; nothing is stated until it is `ready`. */
    status: "loading" | "ready" | "error";
    /** The ordered shell commands a new checkout runs, as the host last read them. */
    setupCommands: readonly string[];
    /** What the host holds as the first message. Absent means the project says nothing. */
    initialPrompt?: string;
    /** The first message being written. */
    initialPromptDraft: string;
    /** True while the host is being told; the whole dialog stays up and inert. */
    submitting?: boolean;
    /** Why the last attempt did not save, in the reader's words. */
    error?: string;
    /** Why the settings could not be read, when `status` is `error`. */
    readError?: string;
};

export type HappyAgentProjectSettingsDialogProps = {
    /** What the project is called now — the name the host has, not the draft. */
    name: string;
    /** The name being edited. The caller owns it, so an in-flight edit survives the row list being republished underneath. */
    draft: string;
    /**
     * Presentation path of the project root, home-relative where the host said
     * so, with the canonical absolute path the clipboard gets. Absent when the
     * caller has lost sight of the project — the checkout was archived from
     * somewhere else while this was open — and the location block is then left
     * out rather than guessed at.
     */
    location?: {
        displayPath: string;
        path: string;
    };
    /** The picture the daemon derived from the repository, when it has one. */
    imageUrl?: string;
    /** How many worktrees the project holds, and how many sessions live under it, its worktrees' included. Absent with `location`. */
    contents?: {
        worktrees: number;
        sessions: number;
    };
    /** True while the host is being told; the dialog stays up and inert. */
    submitting?: boolean;
    /** Why the current local drafts cannot be committed to the Happy Agent. */
    submitDisabledReason?: string;
    /**
     * Where sessions started in this project run. Absent leaves the section out
     * entirely — a worktree has no compute of its own, and a caller that has lost
     * sight of the project has nothing truthful to put here.
     */
    compute?: HappyAgentProjectComputeSection;
    /** The reader chose a different place for sessions to run. Nothing is saved here. */
    onComputeModeChange?: (mode: HappyAgentProjectComputeMode) => void;
    /** The reader edited the Docker image. */
    onComputeImageChange?: (image: string) => void;
    /** The reader committed the choice. */
    onComputeSubmit?: () => void;
    /**
     * What a new workspace starts with. Absent leaves the section out entirely,
     * for the same reasons `compute` may be.
     */
    setup?: HappyAgentProjectSetupSection;
    /** The reader edited the first message. Nothing is saved here. */
    onInitialPromptChange?: (value: string) => void;
    /** The reader committed the first message. */
    onInitialPromptSubmit?: () => void;
    /**
     * The reader asked to see the project's `happy.toml`, where the setup
     * commands are written. Absent leaves the offer out.
     */
    onSetupFileOpen?: () => void;
    /**
     * Archiving this project, when the caller offers it. Absent leaves the
     * section out entirely — a project the caller has lost sight of has nothing
     * left to archive.
     */
    archive?: {
        /** True once the reader has asked, and the confirmation is what they are looking at. */
        confirming?: boolean;
        /** True while the host is being told; everything in the dialog goes inert. */
        submitting?: boolean;
        /** Why the last attempt did not archive it, in the reader's words. */
        error?: string;
    };
    /** The reader asked to archive; the caller answers by confirming. Nothing is archived here. */
    onArchiveRequest?: () => void;
    /** The reader went through with it. */
    onArchiveConfirm?: () => void;
    /** The reader kept the project. */
    onArchiveCancel?: () => void;
    onDraftChange: (draft: string) => void;
    onSubmit: () => void;
    onClose: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/** "2 workspaces · 7 sessions", with the singular where it belongs and nothing where there is nothing. */
function contentsSummary(contents: { worktrees: number; sessions: number }): string {
    const parts = [
        contents.worktrees > 0
            ? `${String(contents.worktrees)} workspace${contents.worktrees === 1 ? "" : "s"}`
            : undefined,
        contents.sessions > 0
            ? `${String(contents.sessions)} session${contents.sessions === 1 ? "" : "s"}`
            : undefined,
    ].filter((part) => part !== undefined);
    return parts.length > 0 ? parts.join(" · ") : "No sessions yet";
}

/** The choice the controls currently express, as a value that can be compared. */
function computeKeyOf(compute: HappyAgentProjectComputeChoice | undefined): string {
    return compute === undefined
        ? "default"
        : compute.type === "local"
          ? "local"
          : `docker:${compute.image}`;
}

function computeDraftKeyOf(compute: HappyAgentProjectComputeSection): string {
    return compute.mode === "default"
        ? "default"
        : compute.mode === "local"
          ? "local"
          : `docker:${compute.image.trim()}`;
}

/**
 * What each choice actually does, in the terms the reader is deciding in. The
 * default is not "runs on this machine": it is the project declining to say,
 * which leaves whatever the machine is set up to do in charge — and that may
 * well be a container.
 */
const computeEffect: Record<HappyAgentProjectComputeMode, string> = {
    default:
        "The project says nothing, so this machine decides. If it is set up to run agents in a container, new sessions here run in one; otherwise they run on the machine itself.",
    local: "New sessions run directly on this machine, with the checkout in place — even when this machine is set up to use a container.",
    docker: "New sessions run inside a container built from this image, with the project's checkout mounted in it. The image must already be available to this machine.",
};

/** What the host holds now, said plainly. */
function computeCurrentLabel(compute: HappyAgentProjectComputeChoice | undefined): string {
    if (compute === undefined) return "This machine's own setting";
    return compute.type === "local" ? "This machine, directly" : compute.image;
}

/**
 * The first message the host holds, on one line. A prompt is prose and may run
 * to paragraphs; the row beside the commit only has to say which one it is.
 */
function initialPromptCurrentLabel(prompt: string | undefined): string {
    if (prompt === undefined) return "Nothing; the first agent waits";
    const firstLine = prompt.split(/\r?\n/u)[0]?.trim() ?? "";
    return firstLine.length > 0 ? firstLine : "A message starting with a blank line";
}

/**
 * C-178 HappyAgentProjectSettingsDialog — what one project of the local workspace is,
 * and the one thing about it the reader sets.
 *
 * The identity strip answers "which project is this" before anything is
 * editable: the picture the daemon derived, the name the host has, and what is
 * filed under it. Below that is the name — the only project field the daemon
 * accepts a new value for — and then the location, read-only because the
 * checkout is where it is, with a copy for the terminal the reader is about to
 * open there. Last is archiving, which is where a project ends: it is the one
 * act here that removes something, so it sits below everything the reader came
 * to look at, and it asks before it does anything. The question names the
 * project and says what leaves with it, because "Archive" alone does not tell
 * anyone whether their code is about to be deleted.
 *
 * Props only. The draft lives with the caller so the dialog is a pure function
 * of what it is given, and `submitting` is the host being told — the field and
 * the commit go inert together rather than one of them lying about it.
 */
export function HappyAgentProjectSettingsDialog(props: HappyAgentProjectSettingsDialogProps) {
    const archiving = props.archive?.submitting === true;
    const confirming = props.archive?.confirming === true;
    const computing = props.compute?.submitting === true;
    const settingUp = props.setup?.submitting === true;
    // One request is in flight and there is nothing to type into or commit while
    // it lands: the whole dialog answers for it rather than one block alone.
    const submitting = props.submitting === true || archiving || computing || settingUp;
    // A blank name is not a name; anything else commits, and a draft equal to
    // the current name simply closes, which is what the host is told to do with it.
    const committable = props.draft.trim().length > 0;
    return (
        // Dismissal stops only while the project is being archived: that request
        // cannot be recalled, and a dialog that vanished off a stray backdrop
        // click mid-archive would leave the reader guessing.
        <ModalOverlay
            onDismiss={() => {
                if (!archiving) props.onClose();
            }}
        >
            <Modal
                className={props.className}
                data-testid={props["data-testid"]}
                footer={
                    <>
                        {/* Not disabled while saving: the close in the header and
                            the backdrop both still dismiss, and a Cancel that
                            went inert beside them would be the odd one out. */}
                        <Button
                            disabled={archiving}
                            onClick={() => props.onClose()}
                            variant="ghost"
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={
                                submitting ||
                                !committable ||
                                props.submitDisabledReason !== undefined
                            }
                            onClick={() => props.onSubmit()}
                            title={props.submitDisabledReason}
                            variant="primary"
                        >
                            {props.submitting === true ? "Saving…" : "Save"}
                        </Button>
                    </>
                }
                icon="settings"
                onClose={archiving ? undefined : () => props.onClose()}
                size="medium"
                style={props.style}
                title="Project settings"
            >
                <div
                    className="happy-agent-project-settings"
                    data-happy-desktop-ui="happy-agent-project-settings"
                >
                    {props.submitDisabledReason ? (
                        <Banner tone="neutral" title="Happy Agent reconnecting">
                            {props.submitDisabledReason}
                        </Banner>
                    ) : null}
                    <div
                        className="happy-agent-project-settings__identity"
                        data-happy-desktop-ui="happy-agent-project-settings-identity"
                    >
                        <Avatar
                            imageUrl={props.imageUrl}
                            initials={props.name.slice(0, 1).toUpperCase()}
                            size="md"
                            type="agent"
                        />
                        <div className="happy-agent-project-settings__identity-text">
                            <span className="happy-agent-project-settings__identity-name">
                                {props.name}
                            </span>
                            {props.contents ? (
                                <span className="happy-agent-project-settings__identity-meta">
                                    {contentsSummary(props.contents)}
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <TextField
                        disabled={submitting}
                        fullWidth
                        hint="What this project is called in the sidebar and the tab strip."
                        label="Name"
                        onSubmit={() => {
                            if (committable) props.onSubmit();
                        }}
                        onValueChange={(value) => props.onDraftChange(value)}
                        value={props.draft}
                    />
                    {props.location
                        ? ((location) => (
                              <div
                                  className="happy-agent-project-settings__field"
                                  data-happy-desktop-ui="happy-agent-project-settings-location"
                              >
                                  <span className="happy-agent-project-settings__label">
                                      Location
                                  </span>
                                  <div className="happy-agent-project-settings__path">
                                      <span
                                          className="happy-agent-project-settings__path-text"
                                          title={location.path}
                                      >
                                          {location.displayPath}
                                      </span>
                                      <CopyButton label="Copy project path" text={location.path} />
                                  </div>
                                  <span className="happy-agent-project-settings__hint">
                                      The checkout this project runs in. The daemon owns it, so it
                                      is shown here rather than set.
                                  </span>
                              </div>
                          ))(props.location)
                        : null}
                    {props.compute
                        ? ((compute) => {
                              const ready = compute.status === "ready";
                              // Everything here waits on the host's own answer.
                              // Offering a choice before it arrives would let the
                              // reader pick against a selection that is only a
                              // placeholder, and commit it without ever having
                              // seen what the project is actually set to.
                              const inert = submitting || !ready;
                              const changed =
                                  ready &&
                                  computeDraftKeyOf(compute) !== computeKeyOf(compute.current);
                              return (
                                  <div
                                      className="happy-agent-project-settings__compute"
                                      data-happy-desktop-ui="happy-agent-project-settings-compute"
                                  >
                                      <span className="happy-agent-project-settings__label">
                                          Where sessions run
                                      </span>
                                      {compute.status === "error" ? (
                                          <Banner
                                              data-testid="happy-agent-project-compute-read-error"
                                              tone="danger"
                                              title="Not read"
                                          >
                                              {compute.readError ??
                                                  "This project's compute setting could not be read."}
                                          </Banner>
                                      ) : null}
                                      {compute.error ? (
                                          <Banner
                                              data-testid="happy-agent-project-compute-error"
                                              tone="danger"
                                              title="Not saved"
                                          >
                                              {compute.error}
                                          </Banner>
                                      ) : null}
                                      <SegmentedControl
                                          aria-label="Where sessions started in this project run"
                                          data-testid="happy-agent-project-compute-mode"
                                          disabled={inert}
                                          fullWidth
                                          onChange={(value) =>
                                              props.onComputeModeChange?.(
                                                  value as HappyAgentProjectComputeMode,
                                              )
                                          }
                                          segments={[
                                              {
                                                  value: "default",
                                                  label: "Machine default",
                                                  icon: "settings",
                                              },
                                              {
                                                  value: "local",
                                                  label: "This machine",
                                                  icon: "terminal",
                                              },
                                              {
                                                  value: "docker",
                                                  label: "Container",
                                                  icon: "package",
                                              },
                                          ]}
                                          value={compute.mode}
                                      />
                                      {compute.mode === "docker" ? (
                                          <TextField
                                              data-testid="happy-agent-project-compute-image"
                                              disabled={inert}
                                              fullWidth
                                              label="Image"
                                              onSubmit={() => {
                                                  if (changed) props.onComputeSubmit?.();
                                              }}
                                              onValueChange={(value) =>
                                                  props.onComputeImageChange?.(value)
                                              }
                                              placeholder="node:22-bookworm"
                                              value={compute.image}
                                          />
                                      ) : null}
                                      <span className="happy-agent-project-settings__hint">
                                          {compute.status === "loading"
                                              ? "Reading what this project is set to…"
                                              : computeEffect[compute.mode]}
                                      </span>
                                      <span className="happy-agent-project-settings__hint">
                                          Applies to sessions started after it is saved. Anything
                                          already running stays where it is, and a container in use
                                          now is left behind rather than reused.
                                      </span>
                                      {/* Only what has not been settled is
                                          stated. While the choice and the host
                                          agree, the control already says what
                                          the project is set to, and repeating it
                                          underneath would read as a second
                                          setting. */}
                                      {changed ? (
                                          <div
                                              className="happy-agent-project-settings__compute-pending"
                                              data-happy-desktop-ui="happy-agent-project-settings-compute-pending"
                                          >
                                              <span
                                                  className="happy-agent-project-settings__compute-current"
                                                  data-happy-desktop-ui="happy-agent-project-settings-compute-current"
                                                  title={computeCurrentLabel(compute.current)}
                                              >
                                                  {`Set to: ${computeCurrentLabel(compute.current)}`}
                                              </span>
                                              <Button
                                                  data-testid="happy-agent-project-compute-apply"
                                                  disabled={
                                                      submitting ||
                                                      props.submitDisabledReason !== undefined
                                                  }
                                                  onClick={() => props.onComputeSubmit?.()}
                                                  size="small"
                                                  variant="primary"
                                              >
                                                  {computing ? "Applying…" : "Apply"}
                                              </Button>
                                          </div>
                                      ) : null}
                                  </div>
                              );
                          })(props.compute)
                        : null}
                    {props.setup
                        ? ((setup) => {
                              const ready = setup.status === "ready";
                              // The same rule as the compute section: nothing is
                              // offered against a placeholder. The reader edits the
                              // first message only once the host has said what it is.
                              const inert = submitting || !ready;
                              const changed =
                                  ready &&
                                  setup.initialPromptDraft.trim() !==
                                      (setup.initialPrompt ?? "").trim();
                              return (
                                  <div
                                      className="happy-agent-project-settings__setup"
                                      data-happy-desktop-ui="happy-agent-project-settings-setup"
                                  >
                                      <span className="happy-agent-project-settings__label">
                                          New workspaces
                                      </span>
                                      {setup.status === "error" ? (
                                          <Banner
                                              data-testid="happy-agent-project-setup-read-error"
                                              tone="danger"
                                              title="Not read"
                                          >
                                              {setup.readError ??
                                                  "This project's workspace settings could not be read."}
                                          </Banner>
                                      ) : null}
                                      {setup.error ? (
                                          <Banner
                                              data-testid="happy-agent-project-setup-error"
                                              tone="danger"
                                              title="Not saved"
                                          >
                                              {setup.error}
                                          </Banner>
                                      ) : null}
                                      <div
                                          className="happy-agent-project-settings__field"
                                          data-happy-desktop-ui="happy-agent-project-settings-commands"
                                      >
                                          <span className="happy-agent-project-settings__sublabel">
                                              Setup commands
                                          </span>
                                          {/* The list is the host's reading of the
                                              file, so it is shown the way the path
                                              is: in a well, mono, and plainly not a
                                              thing to type into. */}
                                          <div
                                              className="happy-agent-project-settings__commands"
                                              data-testid="happy-agent-project-setup-commands"
                                          >
                                              {setup.status === "loading" ? (
                                                  <span className="happy-agent-project-settings__commands-empty">
                                                      Reading what this project runs…
                                                  </span>
                                              ) : setup.setupCommands.length === 0 ? (
                                                  <span className="happy-agent-project-settings__commands-empty">
                                                      No setup commands
                                                  </span>
                                              ) : (
                                                  setup.setupCommands.map((command, index) => (
                                                      <span
                                                          className="happy-agent-project-settings__command"
                                                          // Commands may repeat; their
                                                          // place in the order is what
                                                          // tells them apart.
                                                          key={`${String(index)}:${command}`}
                                                          title={command}
                                                      >
                                                          {command}
                                                      </span>
                                                  ))
                                              )}
                                          </div>
                                          <span className="happy-agent-project-settings__hint">
                                              Run in order in every new workspace once its checkout
                                              exists. They come from{" "}
                                              <code>[workspace] setup_commands</code> in the
                                              project&apos;s <code>happy.toml</code>; edit the file
                                              to change them.
                                          </span>
                                          {props.onSetupFileOpen ? (
                                              <div className="happy-agent-project-settings__setup-actions">
                                                  <Button
                                                      data-testid="happy-agent-project-setup-file-open"
                                                      disabled={submitting}
                                                      onClick={() => props.onSetupFileOpen?.()}
                                                      size="small"
                                                      variant="ghost"
                                                  >
                                                      Open happy.toml
                                                  </Button>
                                              </div>
                                          ) : null}
                                      </div>
                                      <TextField
                                          data-testid="happy-agent-project-initial-prompt"
                                          disabled={inert}
                                          fullWidth
                                          hint="Sent to the first agent as soon as a new workspace is ready. Leave it empty to start quiet."
                                          label="First message"
                                          multiline
                                          onValueChange={(value) =>
                                              props.onInitialPromptChange?.(value)
                                          }
                                          placeholder="Install dependencies, run the tests, and report what fails before changing anything."
                                          rows={4}
                                          value={setup.initialPromptDraft}
                                      />
                                      {changed ? (
                                          <div
                                              className="happy-agent-project-settings__pending"
                                              data-happy-desktop-ui="happy-agent-project-settings-setup-pending"
                                          >
                                              <span
                                                  className="happy-agent-project-settings__pending-current"
                                                  data-happy-desktop-ui="happy-agent-project-settings-setup-current"
                                                  title={initialPromptCurrentLabel(
                                                      setup.initialPrompt,
                                                  )}
                                              >
                                                  {`Set to: ${initialPromptCurrentLabel(setup.initialPrompt)}`}
                                              </span>
                                              <Button
                                                  data-testid="happy-agent-project-initial-prompt-apply"
                                                  disabled={
                                                      submitting ||
                                                      props.submitDisabledReason !== undefined
                                                  }
                                                  onClick={() => props.onInitialPromptSubmit?.()}
                                                  size="small"
                                                  variant="primary"
                                              >
                                                  {settingUp ? "Applying…" : "Apply"}
                                              </Button>
                                          </div>
                                      ) : null}
                                  </div>
                              );
                          })(props.setup)
                        : null}
                    {props.archive ? (
                        <div
                            className="happy-agent-project-settings__archive"
                            data-happy-desktop-ui="happy-agent-project-settings-archive"
                        >
                            <span className="happy-agent-project-settings__label">Archive</span>
                            {props.archive.error ? (
                                <Banner
                                    data-testid="happy-agent-project-archive-error"
                                    tone="danger"
                                    title="Not archived"
                                >
                                    {props.archive.error}
                                </Banner>
                            ) : null}
                            {/* The question and the answer occupy the same block,
                                so asking does not move the dialog's other rows
                                or take the reader somewhere else to answer it. */}
                            <span className="happy-agent-project-settings__hint">
                                {confirming
                                    ? `Archive ${props.name}? It leaves the sidebar with its sessions, and every workspace under it is archived and its worktree folder removed. The project's own checkout stays exactly where it is.`
                                    : "Takes the project out of the sidebar with its sessions, archives every workspace under it, and removes those workspaces' worktree folders. The project's own checkout is left alone."}
                            </span>
                            <div className="happy-agent-project-settings__archive-actions">
                                {confirming ? (
                                    <>
                                        <Button
                                            disabled={archiving}
                                            onClick={() => props.onArchiveCancel?.()}
                                            size="small"
                                            variant="ghost"
                                        >
                                            Keep project
                                        </Button>
                                        <Button
                                            data-testid="happy-agent-project-archive-confirm"
                                            disabled={
                                                archiving ||
                                                props.submitDisabledReason !== undefined
                                            }
                                            icon="archive"
                                            onClick={() => props.onArchiveConfirm?.()}
                                            size="small"
                                            variant="danger"
                                        >
                                            {archiving ? "Archiving…" : `Archive ${props.name}`}
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        data-testid="happy-agent-project-archive"
                                        disabled={submitting}
                                        icon="archive"
                                        onClick={() => props.onArchiveRequest?.()}
                                        size="small"
                                        variant="danger"
                                    >
                                        Archive project
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>
            </Modal>
        </ModalOverlay>
    );
}
