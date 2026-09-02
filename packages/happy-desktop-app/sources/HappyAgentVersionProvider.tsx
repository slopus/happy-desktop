import { createContext, useContext, type ReactNode } from "react";
import { happyAgentVersionAtLeast } from "happy-desktop-state";

/**
 * The addressed Happy Agent's most recently observed product version. It stays
 * available while that agent reconnects and is undefined until one version has
 * been observed.
 */
export const HappyAgentVersionContext = createContext<string | undefined>(undefined);

export interface HappyAgentVersionProviderProps {
    readonly children: ReactNode;
    readonly lastKnownVersion?: string;
}

/** Supplies the addressed Happy Agent's last known version to an application subtree. */
export function HappyAgentVersionProvider(props: HappyAgentVersionProviderProps) {
    return (
        <HappyAgentVersionContext.Provider value={props.lastKnownVersion}>
            {props.children}
        </HappyAgentVersionContext.Provider>
    );
}

/** The addressed Happy Agent's last known version, if one has been observed. */
export function useHappyAgentVersion(): string | undefined {
    return useContext(HappyAgentVersionContext);
}

/**
 * Whether the addressed Happy Agent is new enough for a feature. An unknown
 * version is unsupported so a component never offers an operation speculatively.
 */
export function useHappyAgentVersionAtLeast(minimumVersion: string): boolean {
    return happyAgentVersionAtLeast(useHappyAgentVersion(), minimumVersion);
}
