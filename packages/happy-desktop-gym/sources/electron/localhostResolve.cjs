/*
 * Preloaded into a gym run's Happy Agent when the team server it reaches is a
 * local stack at `<name>.localhost`. Browsers resolve every `*.localhost` name
 * to this machine; glibc's resolver does not, so a daemon on Linux could not
 * reach a server whose sign-in only accepts that host. This answers those
 * names as a browser would and leaves every other lookup to the system.
 */
"use strict";
const dns = require("node:dns");

const lookup = dns.lookup;
dns.lookup = function localhostLookup(hostname, options, callback) {
    if (typeof hostname !== "string" || !hostname.toLowerCase().endsWith(".localhost"))
        return lookup.apply(this, arguments);
    const done = typeof options === "function" ? options : callback;
    const all = typeof options === "object" && options !== null && options.all === true;
    process.nextTick(() =>
        all ? done(null, [{ address: "127.0.0.1", family: 4 }]) : done(null, "127.0.0.1", 4),
    );
    return {};
};
