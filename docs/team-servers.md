# Team servers

Organizations that run their own Happy server, for example behind an
SSO-enforcing HTTPS load balancer, connect to it from Settings › Servers.

The host Happy Agent, the daemon on this computer, lists team servers in its
connection roster and forwards requests to them. It holds no team-server
token. The desktop app's main process signs in to each server and keeps every
token in its own memory. Tailcat, the hosted relay and phone pairing are
configured on the agent; the desktop only hides what the agent reports as
unavailable.

> **Status:** the desktop side is built against the token-free Happy Agent
> contract (`Happy-Remote-Authorization`). It needs a host Happy Agent that
> serves it, and a Chief of Staff with the `add_server_connection` tool.

## Adding and removing a server

Only the Chief of Staff adds or removes a server connection, with its admin
tools. In Settings › Servers the person types the server's address and asks the
Chief of Staff: the request is written into the Chief of Staff's draft and its
conversation opens, so the person sends it. The address must be `https://`.
Plain `http://` is accepted only for `localhost`, `127.0.0.1` and `[::1]`.
Remove, on a listed server, drafts the removal the same way.

The new server reaches the list through the host Happy Agent's roster. It then
wants a sign-in, offered on its row and in the sidebar.

## Signing in

Main reads the server's address from the host Happy Agent's roster, never from
the window, and reads `<address>v0/authentication` from the server itself
through Electron's network stack, so the system's certificates and proxy apply.
It signs in with the authorization code flow and PKCE and opens the sign-in
page in the system browser. Tailcat, Happy Cloud and WorkOS are not involved.

The tokens live only in main's memory: no keychain, no file, and never the
window. Quitting the app ends every sign-in; reloading the window keeps them.
Main refreshes an access token a minute before it expires, one refresh at a
time per server. A refresh the sign-in server refuses ends the sign-in; one
that cannot reach it keeps the token and tries again later.

## Redirect URI

The browser returns to Happy through one redirect URI, the same on every
platform and flavor:

```
happy://oauth/callback
```

Register exactly that string with your identity provider. Happy sends it as
`redirect_uri` in both the authorization and the token request.

The desktop app registers `happy://` with the operating system. Main takes the
callback itself and finishes the sign-in whose `state` it carries; the window
never sees it. If another installed app also claims `happy://`, the system may
open that app instead, and the sign-in does not finish.

## Requests

Every request to `/v0/connections/<id>/api/*` carries the server's access token
in `Happy-Remote-Authorization: Bearer <token>`, next to the local daemon
credential. That covers HTTP, streams, WebSockets and CONNECT tunnels, all of
which the shell opens itself. The token is never put in a URL, and a header of
that name from the window is dropped. The daemon moves it into the server's own
`Authorization` and keeps nothing.

## When the sign-in ends

The host Happy Agent answers `403 remote_sign_in_required` when a request had
no token, when the load balancer refused it, or when the server confirmed the
token has expired. The server never processed such a request, so the shell
refreshes once and sends it again. A second refusal ends the sign-in. The
server's row and its sidebar section then say so and offer "Sign in again".

A redirect other than `304`, or a `401` or `403` that is not Happy's own JSON
error, means the same when the window sees it directly. A `401` from Happy
itself can also mean the person has not finished onboarding, so Happy asks
`GET /v0/authentication` first.
