import type { ReactNode } from "react";
import type {
    HappyAgentVaultItem,
    HappyAgentVaultSearch,
    HappyAgentVaultSearchResult,
} from "happy-desktop-state";
import { Banner } from "../../../Banner";
import { EmptyState } from "../../../EmptyState";
import { ScrollArea } from "../../../Scrollbar";
import { Spinner } from "../../../Spinner";
import { VaultItemGlyph, vaultParentPath } from "./vaultPresentation";

/** The query's every occurrence in a line of text, marked; any other line is returned as it is. */
function highlighted(text: string, query: string): ReactNode {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return text;
    const lower = text.toLowerCase();
    const parts: ReactNode[] = [];
    let from = 0;
    for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
        if (at > from) parts.push(text.slice(from, at));
        parts.push(
            <mark className="happy-vault-search__mark" key={at}>
                {text.slice(at, at + needle.length)}
            </mark>,
        );
        from = at + needle.length;
    }
    if (from < text.length) parts.push(text.slice(from));
    return parts;
}

/**
 * What the search field found: items whose names match, then lines of text
 * inside files and sites. A query still being answered keeps the last results
 * on screen, so typing never empties the list.
 */
export function VaultSearchResults(props: {
    search: HappyAgentVaultSearch;
    onOpen: (entry: HappyAgentVaultItem) => void;
}) {
    const answer = props.search.answer;
    const query = props.search.query;
    if (answer === null) return null;
    if (answer.status === "failed")
        return (
            <div className="happy-vault-search__notice">
                <Banner icon="alert" title="The search failed" tone="warning">
                    {answer.error.message}
                </Banner>
            </div>
        );
    const names = answer.results.filter((result) => result.match === "name");
    const lines = answer.results.filter((result) => result.match === "content");
    if (answer.results.length === 0)
        return answer.status === "searching" ? (
            <div className="happy-vault-search__waiting" role="status">
                <Spinner size={16} />
                Searching…
            </div>
        ) : (
            <EmptyState
                description="No names or text in this vault match it."
                icon="search"
                size="panel"
                title={`Nothing found for “${query}”`}
            />
        );
    const resultRow = (result: HappyAgentVaultSearchResult, index: number) => (
        <li key={`${result.match}:${result.item.id}:${String(index)}`}>
            <button
                className="happy-vault-search__result"
                data-happy-desktop-ui="vault-search-result"
                data-match={result.match}
                onClick={() => props.onOpen(result.item)}
                type="button"
            >
                <VaultItemGlyph item={result.item} size={16} />
                <span className="happy-vault-search__text">
                    <span className="happy-vault-search__line">
                        <span className="happy-vault-search__name">
                            {result.match === "name"
                                ? highlighted(result.item.name, query)
                                : result.item.name}
                        </span>
                        <span className="happy-vault-search__path" title={result.path}>
                            {result.match === "name"
                                ? vaultParentPath(result.path)
                                : `${result.innerPath === null ? result.path : `${result.path}/${result.innerPath}`}, line ${String(result.line)}`}
                        </span>
                    </span>
                    {result.match === "content" ? (
                        <span className="happy-vault-search__snippet">
                            {highlighted(result.snippet, query)}
                        </span>
                    ) : null}
                </span>
            </button>
        </li>
    );
    return (
        <ScrollArea
            className="happy-vault-search"
            data-happy-desktop-ui="vault-search"
            viewportClassName="happy-vault-search__viewport"
        >
            <div aria-busy={answer.status === "searching"} className="happy-vault-search__content">
                {names.length > 0 ? (
                    <section className="happy-vault-search__section">
                        <h2 className="happy-vault-search__heading">Names</h2>
                        <ul className="happy-vault-search__list">{names.map(resultRow)}</ul>
                    </section>
                ) : null}
                {lines.length > 0 ? (
                    <section className="happy-vault-search__section">
                        <h2 className="happy-vault-search__heading">Text in files</h2>
                        <ul className="happy-vault-search__list">{lines.map(resultRow)}</ul>
                    </section>
                ) : null}
                {answer.status === "ready" && answer.truncated ? (
                    <p className="happy-vault-search__note">
                        More results matched than are shown. Type more to narrow them down.
                    </p>
                ) : null}
            </div>
        </ScrollArea>
    );
}
