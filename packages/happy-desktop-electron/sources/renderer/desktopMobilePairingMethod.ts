import type {
    MobilePairingMethodDocument,
    MobilePairingMethodPersistence,
} from "happy-desktop-state";
import { EXPERIMENTS_KEY } from "./desktopExperiments";

const MOBILE_PAIRING_METHOD_KEY = "happy.mobile-pairing-method.v1";

/**
 * Where this machine remembers the pairing method the person picked. Direct
 * used to be the `mobileDirect` experiment: an installation that turned it on
 * chose Direct, and that choice moves here on first read. Off is not carried
 * over, because every experiments write stored it whether or not anyone chose.
 */
export function desktopMobilePairingMethodPersistence(): MobilePairingMethodPersistence {
    const write = (document: MobilePairingMethodDocument): void => {
        try {
            localStorage.setItem(MOBILE_PAIRING_METHOD_KEY, JSON.stringify(document));
        } catch {
            // A storage-denied renderer still honours the choice while the window stays open.
        }
    };
    return {
        read() {
            try {
                const value = localStorage.getItem(MOBILE_PAIRING_METHOD_KEY);
                if (value) return JSON.parse(value) as unknown;
                const legacy = localStorage.getItem(EXPERIMENTS_KEY);
                const experiments: unknown = legacy ? JSON.parse(legacy) : undefined;
                if (
                    typeof experiments !== "object" ||
                    experiments === null ||
                    !("mobileDirect" in experiments) ||
                    experiments.mobileDirect !== true
                )
                    return undefined;
                const migrated: MobilePairingMethodDocument = { chosen: "direct" };
                write(migrated);
                return migrated;
            } catch {
                return undefined;
            }
        },
        write,
    };
}
