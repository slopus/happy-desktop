import { Banner } from "./Banner";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { TextField } from "./TextField";

/** One Happy Cloud server the person belongs to. */
export interface CloudConnectServer {
    readonly id: string;
    readonly name: string;
    /** The server's host, shown under its name. */
    readonly host: string;
    readonly role: "owner" | "member";
}

/** What the accounts service said about the name being typed for a new server. */
export type CloudConnectAvailability =
    | "idle"
    | "checking"
    | "available"
    | "taken"
    | "reserved"
    | "invalid";

/** Where connecting this window to Happy Cloud stands. */
export type CloudConnectView =
    | { readonly kind: "confirm" }
    /** The account sign-in is open in the browser; `host` is where. */
    | { readonly kind: "signingIn"; readonly host?: string }
    | {
          readonly kind: "picker";
          readonly servers:
              | { readonly status: "loading" }
              | { readonly status: "ready"; readonly servers: readonly CloudConnectServer[] }
              | { readonly status: "error"; readonly message: string };
          /** The domain every server name sits under, shown after the name field. */
          readonly suffix: string;
          readonly create: {
              readonly name: string;
              readonly availability: CloudConnectAvailability;
          };
          readonly join: { readonly name: string; readonly code: string };
          /** A pick, create or join is being carried out; everything else waits. */
          readonly busy?: "pick" | "create" | "join";
          readonly error?: string;
      }
    | { readonly kind: "failed"; readonly message: string };

export interface CloudConnectDialogProps {
    readonly view: CloudConnectView;
    onCancel(): void;
    /** Confirm's Connect, and Try again after a failure. */
    onConnect(): void;
    onServerPick(id: string): void;
    onCreateNameChange(name: string): void;
    onCreate(): void;
    onJoinNameChange(name: string): void;
    onJoinCodeChange(code: string): void;
    onJoin(): void;
}

const AVAILABILITY_HINT: Record<CloudConnectAvailability, string | undefined> = {
    idle: undefined,
    checking: "Checking…",
    available: "Available",
    taken: "That name is taken.",
    reserved: "That name is reserved.",
    invalid: "3–32 lowercase letters, digits or dashes, not starting or ending with a dash.",
};

/**
 * The sidebar's "+" to Happy Cloud. It asks first; Connect signs in to the
 * person's Happy Cloud account in the browser; then the person picks one of
 * their servers, creates one under a name of their own, or joins one with an
 * invite code. Every state renders from props alone.
 */
export function CloudConnectDialog(props: CloudConnectDialogProps) {
    const { view } = props;
    if (view.kind !== "picker")
        return (
            <ModalOverlay onEscape={props.onCancel}>
                <Modal
                    data-testid="cloud-connect"
                    footer={
                        <>
                            <Button onClick={props.onCancel} variant="secondary">
                                Cancel
                            </Button>
                            {view.kind === "signingIn" ? null : (
                                <Button onClick={props.onConnect} variant="primary">
                                    {view.kind === "failed" ? "Try again" : "Connect"}
                                </Button>
                            )}
                        </>
                    }
                    onClose={props.onCancel}
                    size="medium"
                    title="Connect to Happy Cloud?"
                >
                    <p className="happy-cloud-connect__text">
                        {view.kind === "signingIn"
                            ? `Finish signing in${view.host ? ` at ${view.host}` : ""} in your browser.`
                            : "Sign in or create an account to add a cloud team. Agents run in the cloud; no computer needed."}
                    </p>
                    {view.kind === "failed" ? (
                        <Banner tone="danger" title="Couldn’t connect">
                            {view.message}
                        </Banner>
                    ) : null}
                </Modal>
            </ModalOverlay>
        );
    const busy = view.busy !== undefined;
    const hint = AVAILABILITY_HINT[view.create.availability];
    const nameBad =
        view.create.availability === "taken" ||
        view.create.availability === "reserved" ||
        view.create.availability === "invalid";
    return (
        <ModalOverlay onEscape={props.onCancel}>
            <Modal
                data-testid="cloud-connect"
                footer={
                    <Button onClick={props.onCancel} variant="secondary">
                        Cancel
                    </Button>
                }
                onClose={props.onCancel}
                size="medium"
                title="Happy Cloud"
            >
                <div className="happy-cloud-connect">
                    {view.error ? (
                        <Banner tone="danger" title="Couldn’t connect">
                            {view.error}
                        </Banner>
                    ) : null}
                    <section className="happy-cloud-connect__section">
                        <h3 className="happy-cloud-connect__heading">Your servers</h3>
                        {view.servers.status === "loading" ? (
                            <p className="happy-cloud-connect__text">Loading…</p>
                        ) : view.servers.status === "error" ? (
                            <p className="happy-cloud-connect__text">{view.servers.message}</p>
                        ) : view.servers.servers.length === 0 ? (
                            <p className="happy-cloud-connect__text">
                                You don’t belong to a server yet. Create one or join one below.
                            </p>
                        ) : (
                            <div className="happy-cloud-connect__servers">
                                {view.servers.servers.map((server) => (
                                    <button
                                        className="happy-cloud-connect__server"
                                        disabled={busy}
                                        key={server.id}
                                        onClick={() => props.onServerPick(server.id)}
                                        type="button"
                                    >
                                        <span className="happy-cloud-connect__server-name">
                                            {server.name}
                                        </span>
                                        <span className="happy-cloud-connect__server-detail">
                                            {server.host}
                                            {server.role === "owner" ? " · Owner" : ""}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>
                    <section className="happy-cloud-connect__section">
                        <h3 className="happy-cloud-connect__heading">Create a new server</h3>
                        <div className="happy-cloud-connect__row">
                            <TextField
                                aria-label="Server name"
                                disabled={busy}
                                fullWidth
                                onSubmit={props.onCreate}
                                onValueChange={props.onCreateNameChange}
                                placeholder="acme"
                                value={view.create.name}
                            />
                            <span className="happy-cloud-connect__suffix">.{view.suffix}</span>
                            <Button
                                disabled={busy || view.create.availability !== "available"}
                                loading={view.busy === "create"}
                                onClick={props.onCreate}
                                variant="primary"
                            >
                                Create
                            </Button>
                        </div>
                        {hint ? (
                            <p
                                className="happy-cloud-connect__hint"
                                data-tone={nameBad ? "danger" : undefined}
                            >
                                {hint}
                            </p>
                        ) : null}
                    </section>
                    <section className="happy-cloud-connect__section">
                        <h3 className="happy-cloud-connect__heading">Join a server</h3>
                        <div className="happy-cloud-connect__row">
                            <TextField
                                aria-label="Server to join"
                                disabled={busy}
                                fullWidth
                                onValueChange={props.onJoinNameChange}
                                placeholder="Server name"
                                value={view.join.name}
                            />
                            <TextField
                                aria-label="Invite code"
                                disabled={busy}
                                fullWidth
                                onSubmit={props.onJoin}
                                onValueChange={props.onJoinCodeChange}
                                placeholder="Invite code"
                                value={view.join.code}
                            />
                            <Button
                                disabled={busy || view.join.name === "" || view.join.code === ""}
                                loading={view.busy === "join"}
                                onClick={props.onJoin}
                                variant="secondary"
                            >
                                Join
                            </Button>
                        </div>
                    </section>
                </div>
            </Modal>
        </ModalOverlay>
    );
}
