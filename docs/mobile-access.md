# Mobile Access management

This is the Desktop workflow and the operational recipe for the Chief of Staff.
Use Settings → Mobile Access to inspect and manage the selected Happy Agent's
phone pairing separately from the operating-system user's existing Happy CLI.
First-run phone pairing has no Node.js or terminal CLI prerequisite.

## What the two connections mean

Happy Agent owns the connection that lets Happy Mobile follow and steer Agent
work. A saved pairing and a live connection are different facts. The screen
combines them into one status: **Connected**, **Reconnecting**, **Offline — pairing
saved**, **Waiting for phone**, **Not set up**, **Disabled**, or **Unavailable**.
Agent updates arrive through its authenticated event stream. An offline saved
pairing does not need another scan.

The terminal Happy CLI owns a separate login, machine registration, and daemon.
Its section shows the installed version, saved authentication format, server,
public account-key fingerprint, machine ID, and daemon readiness. A running HTTP
listener is insufficient: **Ready** requires the matching daemon to report its
remote connection online. A legacy or V2 CLI login can be ready independently of
the Agent pairing. Vanilla `claude` or `codex` sessions are not automatically
managed by Happy; use `happy claude` or `happy codex` for terminal remote access.

The CLI's account fingerprint is an identifier, not a secret or proof that its
login matches the Agent account. Current Agent integration APIs expose no
account identity, server, machine ID, phone inventory, or per-phone revocation.
The screen must not reconstruct those values from keys or another user's files.
CLI status is checked every few seconds only while the surface is visible.

## Connect or recover

1. For **Not set up**, choose **Connect phone**. Open Happy on the intended phone,
   scan the computer-pairing QR, and approve it. **Copy auth link** carries the
   exact opaque authorization; it is never parsed or rebuilt.
2. For **Waiting for phone**, approve the existing code or cancel the attempt.
   Codes expire; a later explicit attempt creates a new one.
3. For a saved offline pairing, keep the pairing and inspect the reported
   connection error. Do not disconnect as routine troubleshooting. Starting an
   existing configured integration retries its connection without replacing
   credentials; this is a recovery action, not a refresh control.
4. Inspect the terminal section separately. Installing or linking the CLI is
   optional and must not turn successful Agent phone pairing into a failure.
   Desktop reports and manages an existing terminal CLI login independently;
   it does not automatically install or link the CLI during phone setup.

Personal/team Agent connections are selected by the authenticated member. Their
credentials differ from the older installation-wide pairing consumed by
`happy auth desktop`. The authenticated profile's explicit `userId: null`
identifies standalone scope; a member ID identifies personal scope. An omitted
ID does not prove standalone scope. Desktop does not invoke automatic terminal
handoff; an authoritative handoff contract is needed before personal pairings
can be linked that way. The phone pairing remains usable and an existing
terminal CLI login remains intact.
Do not scan user directories, pass a guessed owner path, or copy credentials to
make this appear to work.

The older native CLI error combined account refusal, server refusal, daemon
startup failure, and timeout. It is not evidence of an account mismatch. The
new safe status/reset commands require a compatible CLI release. Older CLIs
show an explicit management-unavailable state; status checks do not install,
authenticate, repair files, or start a daemon automatically.

## Add another phone to the same computer

Install Happy on the new phone and choose **Restore an existing account**. The
new phone displays an account-restoration QR. On a phone already signed in,
open **Settings → Account → Link New Device** and scan that code. Alternatively,
restore using the account's secret key entirely within the phone app.

Both phones then use the same account and its existing computer connections.
Do not create another account, replace the CLI login, or call Agent re-pair to
add a phone. Agent re-pair explicitly unlinks the old account before creating a
new authorization. Desktop cannot list or selectively revoke phones. Logging
out on a phone removes that phone's local login; it is not a server-side
per-device revocation guarantee.

## Remove only the intended connection

| Action | Changes | Preserves |
| --- | --- | --- |
| **Disconnect this computer** | Cancels Agent pairing, closes the selected owner's Happy connections, and removes that owner's Agent credential copy. Standalone mode also suppresses re-import of the exact external login present at unlink. | Other team users, the CLI login and daemon, phone accounts, history, and local Agent work. It does not delete a remote computer registration. |
| **Remove saved terminal login** | Stops only a verified matching CLI daemon, deletes its root `access.key`, and removes `machineId` and `machineIdConfirmedByServer` from its settings. | The Agent pairing, other settings, running terminal sessions, projects, logs, history, binaries, provider credentials, and recovery keys. |
| Optional **remove the CLI registration** in the same confirmation | Deletes exactly the CLI's displayed machine ID on its displayed server using that CLI account's authority. | Account and session history. It does not delete an Agent registration whose ID is unknown. |

The CLI confirmation names the exact absolute paths, fields, account fingerprint,
server, and optional machine registration. Its private identity guard remains
fixed while the dialog is open. The CLI rechecks it under its auth/settings locks
and refuses a changed login, server, or machine. The guard never appears in
visible diagnostics or command arguments. Removal runs only after the person
confirms; developing or reviewing these controls does not authorize operating
them against a real account.

CLI cleanup removes a saved login, not every live authenticated process. Existing
terminal sessions can retain their independent in-memory connection until they
end. End particular running sessions only when their owner explicitly requests
that action. Do not kill processes by name or PID guess. A lost server response
can leave remote removal unconfirmed; display completed stages honestly and
preserve the local login when remote deletion is not confirmed. Never retry a
destructive request automatically.

There is no complete-home wipe or all-phone logout action. Historical unowned
installation credentials, recovery material, other members' connections, and
already running sessions require their own explicit ownership and cleanup
contracts. Never describe these scoped controls as complete local auth removal.
Never recursively remove `~/.happy` or `HAPPY_HOME_DIR`.

## Chief of Staff procedure

Read this recipe alongside the installed `recipe/mobile-access.md` entry in the
Happy Agent documentation map. Establish whether the request concerns Agent
work, terminal sessions, another phone, or removal. Report both connection
statuses and their scope before recommending an action.

Use the authenticated product status and the safe CLI `--status-json` contract.
It reports public metadata and an opaque guard; summarize metadata and keep the
guard private. Never print credential files, tokens, private keys, account
restoration keys, or QR payloads in diagnostics. Do not request another user's
files, perform aggregate credential scans, or interpret an approval denial as
permission to try a different route.

Keep the intended account and server when diagnosing failures. Never run
`happy auth desktop` as a read-only diagnostic: it mutates authentication and
daemon state. Never use forced login, a `yes` wrapper, recursive ownership
repair, or wholesale deletion as recovery. For removal, show the concrete
confirmation and use the guarded operation once authorized. Afterward inspect
fresh status and report confirmed completed stages and any remaining limitation.

Builds, fake-server checks, and CLI contract checks do not prove a real phone can
start or resume a session. Claim device verification only after an authorized
check with the intended phone, account, and computer.