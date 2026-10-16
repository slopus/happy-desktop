import { createContext } from "react";

/** Whether this surface owns window typing and commands; standalone surfaces own them by default. */
export const ChatPaneFocusContext = createContext(true);
