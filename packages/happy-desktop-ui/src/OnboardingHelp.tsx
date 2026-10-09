import { MenuButton } from "./MenuButton";

/** Where somebody stuck during first-run setup can go, and to whom. */
const HELP_LINKS = [
    { id: "discord", label: "Ask on Discord", url: "https://discord.gg/fX9WBAhyfD" },
    { id: "bra1n_dump", label: "DM @bra1n_dump on X", url: "https://x.com/bra1n_dump" },
    { id: "ex3ndr", label: "DM @Ex3NDR on X", url: "https://x.com/Ex3NDR" },
    {
        id: "issues",
        label: "Browse known issues",
        url: "https://github.com/slopus/happy/issues",
    },
] as const;

/** Somewhere to turn on every screen, without leaving the step you are on. */
export function OnboardingHelp(props: { onExternalOpen?(url: string): void }) {
    return (
        <MenuButton
            align="end"
            icon="users"
            items={HELP_LINKS.map((link) => ({ id: link.id, kind: "item", label: link.label }))}
            label="Get help"
            menuLabel="Get help"
            placement="above"
            onSelect={(id) => {
                const link = HELP_LINKS.find((candidate) => candidate.id === id);
                if (link) props.onExternalOpen?.(link.url);
            }}
            size="medium"
            text="Get help"
            variant="ghost"
        />
    );
}
