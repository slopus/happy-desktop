import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

/**
 * A private, non-refreshable copy for the normal native Codex auth loader.
 * The source login is read only. A rejected/expired token fails the take; this
 * isolated daemon cannot rotate the user's refresh token behind their back.
 */
export async function nativeCredentialPrepare({ source, expectedEmail, home }) {
    if (!source || !isAbsolute(source) || !expectedEmail)
        throw new Error("Native filming needs --native-auth (absolute path) and --native-account.");
    let stored;
    try {
        stored = JSON.parse(await readFile(source, "utf8"));
        if (typeof stored.tokens?.access_token !== "string") throw new Error();
        const emails = [];
        for (const token of [stored.tokens.id_token, stored.tokens.access_token]) {
            if (!token) continue;
            const claims = JSON.parse(
                Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
            );
            const email = claims.email ?? claims["https://api.openai.com/profile"]?.email;
            if (typeof email === "string") emails.push(email.toLowerCase());
        }
        if (!emails.length || emails.some((email) => email !== expectedEmail.toLowerCase()))
            throw new Error();
    } catch {
        throw new Error(
            "The native Codex login could not be verified as the requested account. No inference was run.",
        );
    }
    const target = join(home, ".codex", "auth.json");
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(
        target,
        JSON.stringify({
            auth_mode: "chatgpt",
            tokens: {
                access_token: stored.tokens.access_token,
                ...(typeof stored.tokens.id_token === "string"
                    ? { id_token: stored.tokens.id_token }
                    : {}),
                ...(typeof stored.tokens.account_id === "string"
                    ? { account_id: stored.tokens.account_id }
                    : {}),
            },
        }),
        { mode: 0o600 },
    );
    await chmod(target, 0o600);
    return async () => {
        await unlink(target).catch((error) => {
            if (error.code !== "ENOENT") throw error;
        });
    };
}
