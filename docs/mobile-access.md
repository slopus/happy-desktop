# Mobile Access management

This is the Desktop workflow and the operational recipe for Happy.
Use Settings → Mobile Access to inspect and manage the selected Happy Agent's
phone pairing. Phone pairing has no Node.js or terminal CLI prerequisite.

## What the connection means

Happy Agent owns the connection that lets Happy Mobile follow and steer Agent
work. A saved pairing and a live connection are different facts. The screen
combines them into one status: **Connected**, **Reconnecting**, **Offline — pairing
saved**, **Waiting for phone**, **Not set up**, **Disabled**, or **Unavailable**.
Agent updates arrive through its authenticated event stream. An offline saved
pairing does not need another scan.

Current Agent integration APIs expose no account identity, server, machine ID,
phone inventory, or per-phone revocation. The screen must not reconstruct those
values from keys or another user's files.

## Connect or recover

1. For **Not set up**, choose **Connect phone**. Open Happy on the intended phone,
   scan the computer-pairing QR, and approve it. **Copy auth link** carries the
   exact opaque authorization; it is never parsed or rebuilt.
2. For **Waiting for phone**, approve the existing code or cancel the attempt.
   Codes expire; a later explicit attempt creates a new one.
3. For a saved offline pairing, keep the pairing and inspect the reported
   connection error. Do not disconnect as routine troubleshooting; with Happy
   Agent 0.4.84-preview.1 and later, disconnecting deletes this computer's chats
   from your phones. Starting an existing configured integration retries its
   connection without replacing credentials; this is a recovery action, not a
   refresh control.

Personal/team Agent connections are selected by the authenticated member.
Do not scan user directories, pass a guessed owner path, or copy credentials to
make this appear to work.

## Add another phone to the same computer

Install Happy on the new phone and choose **Restore an existing account**. The
new phone displays an account-restoration QR. On a phone already signed in,
open **Settings → Account → Link New Device** and scan that code. Alternatively,
restore using the account's secret key entirely within the phone app.

Both phones then use the same account and its existing computer connections.
Do not create another account or call Agent re-pair to add a phone. Agent
re-pair explicitly unlinks the old account before creating a new authorization.
Desktop cannot list or selectively revoke phones. Logging out on a phone removes
that phone's local login; it is not a server-side per-device revocation
guarantee.

## Remove only the intended connection

| Action                                                                | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                | Preserves                                                                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Disconnect this computer** (Happy Agent 0.4.84-preview.1 and later) | Deletes this computer and the chats it published from the selected owner's Happy account, then removes that owner's Agent credential copy and forgets the computer's identity, so connecting again adds it as a new computer. If Happy can't confirm the removal, nothing local is removed: **Try again**, or **Keep linked** to reconnect the saved pairing. Standalone mode also suppresses re-import of the exact external login present at unlink. | Other team users, other computers, phone accounts, and local Agent work and history.                                       |
| **Disconnect this computer** (older Happy Agent)                      | Cancels Agent pairing, closes the selected owner's Happy connections, and removes that owner's Agent credential copy. The dialog says so.                                                                                                                                                                                                                                                                                                              | Other team users, phone accounts, history, and local Agent work. It does not delete a remote computer registration.        |

Removal runs only after the person confirms; developing or reviewing these
controls does not authorize operating them against a real account. A lost
server response can leave remote removal unconfirmed; report it honestly and
never retry a destructive request automatically.

There is no complete-home wipe or all-phone logout action. Historical unowned
installation credentials, recovery material, other members' connections, and
already running sessions require their own explicit ownership and cleanup
contracts. Never describe Disconnect as complete local auth removal. Never
recursively remove `~/.happy` or `HAPPY_HOME_DIR`.

## Happy procedure

Read this recipe alongside the installed `recipe/mobile-access.md` entry in the
Happy Agent documentation map. Establish whether the request concerns Agent
work, another phone, or removal. Report the connection status and its scope
before recommending an action.

Use the authenticated product status. Never print credential files, tokens,
private keys, account restoration keys, or QR payloads in diagnostics. Do not
request another user's files, perform aggregate credential scans, or interpret
an approval denial as permission to try a different route.

Keep the intended account and server when diagnosing failures. Never use forced
login, a `yes` wrapper, recursive ownership repair, or wholesale deletion as
recovery. For removal, show the concrete confirmation and act once authorized.
Afterward inspect fresh status and report confirmed completed stages and any
remaining limitation.

Builds and fake-server checks do not prove a real phone can start or resume a
session. Claim device verification only after an authorized check with the
intended phone, account, and computer.
