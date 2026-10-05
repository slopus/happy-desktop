import type { GptLiveDocument, GptLivePersistence } from "happy-desktop-state";

const GPT_LIVE_KEY = "happy.gpt-live.v1";

/** Browser-only storage adapter. No native host or provider credentials involved. */
export function desktopGptLivePersistence(): GptLivePersistence {
    return {
        read() {
            const value = localStorage.getItem(GPT_LIVE_KEY);
            return value ? (JSON.parse(value) as GptLiveDocument) : undefined;
        },
        write(document) {
            localStorage.setItem(GPT_LIVE_KEY, JSON.stringify(document));
        },
    };
}
