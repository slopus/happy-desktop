import { happyAgentRendererUtilityServerCreate } from "./happyAgentRendererUtilityServer";
import {
    rendererUtilityOriginArgument,
    type RendererUtilityInput,
} from "../shared/happyAgentRendererUtilityContract";

const port = process.parentPort;
if (!port) throw new Error("Happy Agent transport requires an Electron utility parent.");
const parent = port;
const debug = process.argv.includes("--happy-agent-transport-debug");
const origin = process.argv
    .find((argument) => argument.startsWith(rendererUtilityOriginArgument))
    ?.slice(rendererUtilityOriginArgument.length);
void happyAgentRendererUtilityServerCreate(
    (message) => parent.postMessage(message),
    debug,
    origin,
).then(
    (server) => {
        parent.on("message", (event) => {
            // This is a private Electron process channel, not renderer IPC.
            void server.receive(event.data as RendererUtilityInput).catch(() => process.exit(1));
        });
        parent.postMessage({
            type: "ready",
            port: server.port,
            username: server.username,
            password: server.password,
        });
    },
    () => process.exit(1),
);
