import type { HappyCloudRequest } from "../happyAgent/happyAgentProviderCredentials.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { UserError } from "../types.js";

const ATTEMPTS = 3;

/**
 * Sends one handbook change, the same request each time, until the server
 * answers or a few tries have gone unanswered. The body carries the change's
 * own mutation ID, or the ID of what it makes, so a repeat the server already
 * has is answered with what it made the first time. Rejects with what the
 * server said, or that it could not be reached.
 */
export async function handbookMutate(
    request: HappyCloudRequest,
    method: string,
    path: string,
    body?: unknown,
    headers?: Readonly<Record<string, string>>,
): Promise<unknown> {
    let delay = 500;
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await request(method, path, body, headers);
        } catch (error) {
            const unanswered = error instanceof UserError && error.code === "offline";
            if (!unanswered || attempt >= ATTEMPTS) throw happyAgentUserError(error);
            await new Promise<void>((resolve) => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
}

/** A refusal the server explained, or a fallback for an answer this app cannot read. */
export const HANDBOOK_UNREADABLE = new UserError(
    "Happy Cloud answered with a handbook entry this app cannot read.",
);
