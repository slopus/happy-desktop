export { ChatStore } from "./ChatStore.js";
export { connectHappyAgent } from "./connectHappyAgent.js";
export { chatElementRequest, projectNumericIdentity } from "./projection.js";
export {
    CHECKING_SERVER_COMPATIBILITY,
    MINIMUM_HAPPY_AGENT_PROTOCOL_VERSION,
    describeServerCompatibility,
    happyAgentVersionAtLeast,
    serverCompatibility,
} from "./compatibility.js";
export { ProjectRegistrationError, ProjectRegistrationProtocolError } from "./errors.js";
export type { ProjectRegistrationErrorCode } from "./errors.js";
export type * from "./types.js";
