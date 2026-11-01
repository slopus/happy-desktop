# Managed settings and team servers

Organizations that run their own Happy server, for example behind an
SSO-enforcing HTTPS load balancer, can preset that server and turn features off
for every person on a machine.

> **Status:** the desktop app enforces these settings and draws the add-server
> and "Sign in again" screens. It does not read the file yet. That waits on a
> decision: does the host Happy Agent own team-server connections (it reads the
> file and serves the policy), or does the desktop shell own them? Until a source
> is connected, the app behaves as if no file exists.

## Keys

Happy Agent, iOS, Android, and desktop share these key names. A key that is
present is enforced and its control is locked. A key that is absent leaves the
choice to the person.

| Key                      | Type    | Effect on desktop                                                                                                                       |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `serverUrl`              | string  | The organization's server, as an `https://` URL. Settings › Servers shows it in the address field.                                      |
| `allowAdditionalServers` | boolean | `false` stops anyone adding a server other than `serverUrl`: the field is locked to it. Without `serverUrl`, no server can be added.    |
| `analyticsEnabled`       | boolean | Fixes product analytics on or off. The Privacy switch shows the value and is disabled. No event is sent while the policy is being read. |
| `hostedRelayEnabled`     | boolean | `false` turns the Happy relay off. Phone pairing offers Direct only, with no Relay or Direct choice.                                    |
| `tailcatEnabled`         | boolean | `false` turns Tailcat off, and with it direct phone pairing. Phone pairing offers Relay only.                                           |
| `phonePairingEnabled`    | boolean | `false` turns phone pairing off. Settings › Mobile access is left out and onboarding skips the phone step.                              |

Turning off both `hostedRelayEnabled` and `tailcatEnabled` has the same effect as
`phonePairingEnabled: false`. The host Happy Agent also enforces the relay and
Tailcat keys. The desktop hides those features; it is not the only thing
stopping them.

## File

The file is JSON with the keys above at the top level:

```json
{
    "serverUrl": "https://happy.corp.example",
    "allowAdditionalServers": false,
    "analyticsEnabled": false,
    "hostedRelayEnabled": false,
    "tailcatEnabled": false,
    "phonePairingEnabled": false
}
```

Proposed locations (writable by administrators only):

| OS      | Path                                                       |
| ------- | ---------------------------------------------------------- |
| macOS   | `/Library/Application Support/Happy/managed-settings.json` |
| Windows | `%ProgramData%\Happy\managed-settings.json`                |
| Linux   | `/etc/happy/managed-settings.json`                         |

macOS managed preferences and Windows registry policy are not supported yet.

## Signing in to a team server

Settings › Servers adds a server by its address. The address must be `https://`.
Plain `http://` is accepted only for `localhost`, `127.0.0.1` and `[::1]`. Adding a
server reads `GET /v0/authentication`, then signs in with the authorization code
flow and PKCE in the system browser. Tailcat, Happy Cloud and WorkOS are not
involved.

The browser returns to Happy through one redirect URI, the same on every
platform and flavor:

```
happy://oauth/callback
```

Register exactly that string with your identity provider. Happy sends it as
`redirect_uri` in both the authorization and the token request.

> **Desktop status:** the desktop app registers only `happy-auth:` with the OS
> today. Taking `happy://oauth/callback` needs a change to the Electron host
> process, which is waiting for confirmation.

A redirect, or a `401` or `403` that is not Happy's own JSON error, comes from
the load balancer and means the sign-in has ended. A `401` from Happy itself can
also mean the person has not finished onboarding, so Happy asks
`GET /v0/authentication` first. If that says the person is signed in with no
profile yet, Happy goes to onboarding instead of a new sign-in. When the
sign-in has ended, the server's sidebar section says "Sign in required" and
offers "Sign in again".
