// Fork the existing core experience's actual repository/worktree world. Native
// turns are never seeded: both filmed conversations begin empty.
export { repository, backgroundRepositories, worktrees } from "../core/world.mjs";
export const id = "astra-speed";
export const sessions = [];
export const models = { codex: ["openai/gpt-6-astra"], claude: [], grok: [] };
export const effort = "low";
export const prompt =
    "Count from 1 to 1000 internally, then reply with exactly done and nothing else.";
