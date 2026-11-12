# In-app browser

## Where we are going

The workspace browser is a real browser the person can sign in with. Its tabs
run locally in the desktop app; their traffic leaves through the agent's
network, so sites see the agent's address, and HTTPS stays opaque to the agent.
Signing in just works, Google and X/Twitter included: the browser names itself
honestly instead of pretending to be Chrome.

Happy never stores passwords and does not fill logins saved in the person's
other browsers. That picker was built and then cut; we are not doing it. There
is no vault, no bulk import, and no copied sessions.

No password or browser secret ever reaches an agent. If agents are given tools
to drive the browser, those tools never read a password field.

## How we get there

First, protection. Installed builds encrypt the browser's cookies at rest and
refuse any debugger attaching to the app. This is a host-process change, so it
goes through the double confirmation `AGENTS.md` requires.

Then sign-in. The browser sends an honest user agent, and Google and X/Twitter
sign-in are checked in it.

## How we know it is done

- Google and X/Twitter sign-in work in the workspace browser.
- Happy reads no other browser's saved logins, writes no password to disk, and
  returns none through any bridge or agent tool.
- Installed builds encrypt the browser's cookies at rest and refuse debuggers.
