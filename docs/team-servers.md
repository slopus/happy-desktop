# Team servers

Organizations that run their own Happy server, for example behind an
SSO-enforcing HTTPS load balancer, connect to it from Settings › Servers.

The host Happy Agent, the daemon on this computer, owns team servers. It holds
the connection, the sign-in and its tokens. The desktop app shows what the
daemon reports. Tailcat, the hosted relay and phone pairing are configured on
the agent; the desktop only hides what the agent reports as unavailable.

> **Status:** the Servers screen and the sign-in-again state are built. They are
> not yet connected to the daemon's team-server routes.

## Adding a server

Settings › Servers adds a server by its address. The address must be `https://`.
Plain `http://` is accepted only for `localhost`, `127.0.0.1` and `[::1]`. Adding a
server hands the address to the host Happy Agent. The daemon reads
`GET /v0/authentication` and signs in with the authorization code flow and
PKCE, and the desktop opens the sign-in page in the system browser. Tailcat,
Happy Cloud and WorkOS are not involved.

## Redirect URI

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

## When the sign-in ends

A redirect other than `304`, or a `401` or `403` that is not Happy's own JSON
error, comes from the load balancer and means the sign-in has ended. A `401`
from Happy itself can also mean the person has not finished onboarding, so
Happy asks `GET /v0/authentication` first. If that says the person is signed in
with no profile yet, Happy goes to onboarding instead of a new sign-in. When the
sign-in has ended, the server's sidebar section says "Sign in required" and
offers "Sign in again".
