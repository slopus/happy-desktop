# Managed settings and team servers

Organizations that run their own Happy server, for example behind an
SSO-enforcing HTTPS load balancer, can preset that server and turn features off
for every person on a machine.

The host Happy Agent, the daemon on this computer, owns team servers. It holds
the connection, the sign-in and its tokens, and it reads the managed settings
and serves them to the desktop app. The desktop app shows what the daemon
reports and enforces the policy in its own screens.

> **Status:** the desktop screens and their enforcement are built. They are not
> yet connected to the daemon's team-server and managed-settings routes, so
> until then the app behaves as if no file exists.

## Keys

Happy Agent, iOS, Android, and desktop share these key names. A key that is
present is enforced and its control is locked, except `analyticsEnabled`, which
only ever turns analytics off. A key that is absent leaves the choice to the
person.

| Key                      | Type    | Effect on desktop                                                                                                                                                                 |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serverUrl`              | string  | The organization's server, as an `https://` URL. Settings › Servers shows it in the address field.                                                                                |
| `allowAdditionalServers` | boolean | `false` stops anyone adding a server other than `serverUrl`: the field is locked to it. Without `serverUrl`, no server can be added.                                              |
| `analyticsEnabled`       | boolean | `false` turns product analytics off and locks the Privacy switch off. `true` changes nothing: a policy never turns analytics on. No event is sent while the policy is being read. |
| `hostedRelayEnabled`     | boolean | `false` turns the Happy relay off. Phone pairing offers Direct only, with no Relay or Direct choice.                                                                              |
| `tailcatEnabled`         | boolean | `false` turns Tailcat off, and with it direct phone pairing. Phone pairing offers Relay only.                                                                                     |
| `phonePairingEnabled`    | boolean | `false` turns phone pairing off. Settings › Mobile access is left out and onboarding skips the phone step.                                                                        |

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
server hands the address to the host Happy Agent. The daemon reads
`GET /v0/authentication` and signs in with the authorization code flow and
PKCE, and the desktop opens the sign-in page in the system browser. Tailcat, Happy Cloud and WorkOS are not
involved.

The browser returns to Happy through one redirect URI, the same on every
platform and flavor:

```
happy://oauth/callback
```

Register exactly that string with your identity provider. Happy sends it as
`redirect_uri` in both the authorization and the token request.

The desktop app registers `happy://` with the operating system. It takes the
callback and hands it to the host Happy Agent, which finishes the sign-in. If
another installed app also claims `happy://`, the system may open that app
instead, and the sign-in does not finish.

A redirect, or a `401` or `403` that is not Happy's own JSON error, comes from
the load balancer and means the sign-in has ended. A `401` from Happy itself can
also mean the person has not finished onboarding, so Happy asks
`GET /v0/authentication` first. If that says the person is signed in with no
profile yet, Happy goes to onboarding instead of a new sign-in. When the
sign-in has ended, the server's sidebar section says "Sign in required" and
offers "Sign in again".
