import { useState } from "react";
import { AssistantMark, type AssistantMarkName } from "./AssistantMark";
import { CopyButton } from "./CopyButton";
import { SetupCommand } from "./SetupCommand";
import { Ionicon } from "./vectorIcons/VectorIcon";

/** One instruction somebody hands to the coding agent they already use. */
export interface SetupAgentPrompt {
    readonly id: string;
    /** What the person is saying about their setup, for example "Sign me in". */
    readonly label: string;
    /** Exact text copied: the goal and where the installed documentation is. */
    readonly text: string;
}

/**
 * What to do about an assistant that is not usable yet: run something, go and
 * get it, or hand the job to the coding agent already on this machine. Absent
 * on one that is already signed in, because there is nothing to do about it.
 */
export type SetupAssistantAction =
    | {
          readonly kind: "command";
          readonly command: string;
          /** Names this command for assistive technology, e.g. "Codex install command". */
          readonly label: string;
          readonly note?: string;
      }
    | { readonly kind: "link"; readonly label: string; readonly href: string }
    | {
          readonly kind: "prompts";
          readonly label: string;
          /** One line over the prompts saying what to do with them. */
          readonly title: string;
          readonly prompts: readonly SetupAgentPrompt[];
          /** Opens with the page, for the Blueprint. */
          readonly defaultOpen?: boolean;
      };

/** What setup found out about one assistant on this machine. */
export interface SetupAssistantEntry {
    /** Stable row key, and the command the person would type. */
    readonly id: string;
    readonly name: string;
    /**
     * Whose mark goes above the name. Codex is OpenAI's, so it is named that.
     * `custom` is the column for a setup that is none of those vendors' CLIs.
     */
    readonly mark: AssistantMarkName | "custom";
    /**
     * `checking` is still being verified, `found` is usable, `signed-out` is
     * installed but unusable, and `missing` is not here at all.
     *
     * The caller owns that product truth. This component uses it only to keep
     * the same three columns in place while their emphasis changes.
     */
    readonly status: "checking" | "found" | "signed-out" | "missing";
    /** Where it is, or what to do about it, in one line under the name. */
    readonly detail: string;
    /**
     * What that line is. A path is set in the monospace face and allowed to
     * break at its separators, because it is read as a location rather than as a
     * sentence and a column is narrower than most of them.
     */
    readonly detailKind?: "sentence" | "path";
    /** The one thing that would make this assistant usable, when there is one. */
    readonly action?: SetupAssistantAction;
}

export interface SetupAssistantsProps {
    readonly assistants: readonly SetupAssistantEntry[];
    readonly "data-testid"?: string;
    /** Opens an official install page in the host's external browser. */
    readonly onExternalOpen?: (url: string) => void;
}

/**
 * Lets a path wrap where a reader would break it: after a separator.
 *
 * A path is one long token with nowhere to break, so a column either overflows,
 * clips the part that identifies the binary, or splits a directory name down the
 * middle. A zero-width space after each separator offers the layout the breaks
 * the path already has, and adds nothing to what is copied out.
 */
function pathBreakable(path: string): string {
    return path.replaceAll("/", "/​");
}

/**
 * C-270 SetupAssistants — the coding assistants this machine has, side by side.
 *
 * Three columns holding the three things worth knowing: whose tool it is, what
 * it is called, and where it is — or, when it is not here, that it is not. No
 * cards, no icon tiles, no status pills. Each of those was chrome around a fact
 * short enough to read without help, and the row is read across rather than
 * down: same mark size, same baselines, so the column that differs is the one
 * that catches the eye.
 *
 * The marks are the products' own, because that is the one thing a house glyph
 * could not say. A terminal square on all three told the reader they are
 * command-line tools, which they already knew, and left the name doing every
 * bit of the identifying.
 *
 * Only a verified usable assistant is at full ink; unresolved assistants keep
 * their mark, name, and state dimmed. Remedies stay readable so the person can
 * make an assistant ready.
 *
 * The install links point to the vendors' official instructions and leave Happy
 * through the host's external browser. The report still owns no setup state:
 * the terminal and the provider remain the source of truth.
 *
 * Props only: which assistants exist and what is true of them belongs to setup.
 */
export function SetupAssistants(props: SetupAssistantsProps) {
    return (
        <div
            className="happy-setup-assistants"
            data-happy-desktop-ui="setup-assistants"
            data-testid={props["data-testid"]}
        >
            <div className="happy-setup-assistants__row">
                {props.assistants.map((assistant) => (
                    <article
                        className="happy-setup-assistants__item"
                        data-happy-desktop-ui="setup-assistants-item"
                        data-status={assistant.status}
                        key={assistant.id}
                    >
                        <span
                            className="happy-setup-assistants__mark"
                            data-happy-desktop-ui="setup-assistants-mark"
                        >
                            {assistant.mark === "custom" ? (
                                <Ionicon name="key" size={22} />
                            ) : (
                                <AssistantMark name={assistant.mark} size={22} />
                            )}
                        </span>
                        <span
                            className="happy-setup-assistants__name"
                            data-happy-desktop-ui="setup-assistants-name"
                        >
                            {assistant.name}
                        </span>
                        <span
                            className="happy-setup-assistants__detail"
                            data-happy-desktop-ui="setup-assistants-detail"
                            data-kind={assistant.detailKind ?? "sentence"}
                        >
                            {assistant.detailKind === "path"
                                ? pathBreakable(assistant.detail)
                                : assistant.detail}
                        </span>
                        {assistant.action
                            ? ((action) => (
                                  <span
                                      className="happy-setup-assistants__action"
                                      data-happy-desktop-ui="setup-assistants-action"
                                  >
                                      {action.kind === "command" ? (
                                          <>
                                              <SetupCommand
                                                  command={action.command}
                                                  label={action.label}
                                              />
                                              {action.note === undefined ? null : (
                                                  <span className="happy-setup-assistants__note">
                                                      {action.note}
                                                  </span>
                                              )}
                                          </>
                                      ) : action.kind === "prompts" ? (
                                          <SetupAssistantPrompts action={action} />
                                      ) : (
                                          <>
                                              <a
                                                  className="happy-setup-assistants__link"
                                                  data-happy-desktop-ui="setup-assistants-link"
                                                  href={action.href}
                                                  onClick={(event) => {
                                                      if (!props.onExternalOpen) return;
                                                      event.preventDefault();
                                                      props.onExternalOpen(action.href);
                                                  }}
                                                  rel="noopener noreferrer"
                                                  target="_blank"
                                              >
                                                  {action.label}
                                              </a>
                                          </>
                                      )}
                                  </span>
                              ))(assistant.action)
                            : null}
                    </article>
                ))}
            </div>
        </div>
    );
}

/**
 * The column's way through for somebody who would rather not do it by hand:
 * a link like the other columns' remedies that opens, right over itself, the
 * prompts to paste into the coding agent already on this machine.
 */
function SetupAssistantPrompts(props: {
    readonly action: Extract<SetupAssistantAction, { readonly kind: "prompts" }>;
}) {
    const { action } = props;
    const [open, setOpen] = useState(action.defaultOpen ?? false);
    return (
        <span
            className="happy-setup-assistants__prompts"
            data-happy-desktop-ui="setup-assistants-prompts"
            onKeyDown={(event) => {
                if (open && event.key === "Escape") {
                    event.stopPropagation();
                    setOpen(false);
                }
            }}
        >
            <button
                aria-expanded={open}
                aria-haspopup="dialog"
                className="happy-setup-assistants__link"
                data-happy-desktop-ui="setup-assistants-link"
                onClick={() => setOpen(!open)}
                type="button"
            >
                {action.label}
            </button>
            {open ? (
                <>
                    <button
                        aria-label="Close"
                        className="happy-setup-assistants__prompts-backdrop"
                        onClick={() => setOpen(false)}
                        tabIndex={-1}
                        type="button"
                    />
                    <span
                        aria-label={action.label}
                        className="happy-setup-assistants__popover"
                        role="dialog"
                    >
                        <span className="happy-setup-assistants__popover-title">
                            {action.title}
                        </span>
                        {action.prompts.map((prompt) => (
                            <span className="happy-setup-assistants__prompt" key={prompt.id}>
                                <span className="happy-setup-assistants__prompt-words">
                                    <span className="happy-setup-assistants__prompt-label">
                                        {prompt.label}
                                    </span>
                                    <span className="happy-setup-assistants__prompt-text">
                                        {prompt.text}
                                    </span>
                                </span>
                                <CopyButton label={`Copy "${prompt.label}"`} text={prompt.text} />
                            </span>
                        ))}
                    </span>
                </>
            ) : null}
        </span>
    );
}
