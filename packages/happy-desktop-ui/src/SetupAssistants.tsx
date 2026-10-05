import { AssistantMark, type AssistantMarkName } from "./AssistantMark";
import { SetupCommand } from "./SetupCommand";

/**
 * What to do about an assistant that is not usable yet: run something, or go
 * and get it. Absent on one that is already signed in, because there is
 * nothing to do about it.
 */
export type SetupAssistantAction =
    | { readonly kind: "command"; readonly command: string; readonly note?: string }
    | { readonly kind: "link"; readonly label: string; readonly href: string };

/** What setup found out about one assistant on this machine. */
export interface SetupAssistantEntry {
    /** Stable row key, and the command the person would type. */
    readonly id: string;
    readonly name: string;
    /** Whose mark goes above the name. Codex is OpenAI's, so it is named that. */
    readonly mark: AssistantMarkName;
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
 * Status is carried by emphasis rather than by a label. What is here is at full
 * ink with the path that proves it; what is not is dimmed, which is what it is
 * worth on a screen nobody reads for long. Only the case that asks for an action
 * says so in words, because it is the only one where words are the point.
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
                            <AssistantMark name={assistant.mark} size={22} />
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
                                                  label={`${assistant.name} sign-in command`}
                                              />
                                              {action.note === undefined ? null : (
                                                  <span className="happy-setup-assistants__note">
                                                      {action.note}
                                                  </span>
                                              )}
                                          </>
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
