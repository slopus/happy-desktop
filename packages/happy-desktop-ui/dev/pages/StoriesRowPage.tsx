import { RichTaskList } from "../../src/RichTaskList";
import { Sidebar } from "../../src/Sidebar";
import { StoriesRow } from "../../src/StoriesRow";
import { ComponentPage, Specimen } from "../kit";
import { STORIES_ROW_ITEMS } from "./storyFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-335";

export function StoriesRowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The stories header over the sidebar's list in rich mode: My story first, then every poster with a live story, one ring segment per story, greyed once seen."
            title="Stories row"
        >
            <Specimen
                detail="304px sidebar · 52px pitch + 12px gaps · 11px names"
                label="Header"
                number="01"
                stage="chrome"
            >
                <div style={{ width: 304 }}>
                    <StoriesRow items={STORIES_ROW_ITEMS} onOpen={() => undefined} />
                </div>
            </Specimen>
            <Specimen
                detail="My story with a story up, and nothing else"
                label="Only mine"
                number="02"
                stage="chrome"
            >
                <div style={{ width: 304 }}>
                    <StoriesRow
                        items={[{ ...STORIES_ROW_ITEMS[0]!, segments: { total: 1, unseen: 0 } }]}
                        onOpen={() => undefined}
                    />
                </div>
            </Specimen>
            <Specimen
                detail="above Search and Create · the card's disc wears its agent's ring"
                label="In the sidebar"
                number="03"
                stage="chrome"
            >
                <div style={{ display: "flex", width: 304, height: 420 }}>
                    <Sidebar
                        activeItemId=""
                        composeLabel="Create"
                        onCompose={() => undefined}
                        onItemSelect={() => undefined}
                        searchRow={{ label: "Search", onOpen: () => undefined }}
                        sections={[{ id: "tasks", label: "Tasks", items: [], content: tasks }]}
                        style={{ width: "100%" }}
                        title="Happy"
                        topAccessory={
                            <StoriesRow items={STORIES_ROW_ITEMS} onOpen={() => undefined} />
                        }
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}

const tasks = (
    <RichTaskList
        onMoreToggle={() => undefined}
        onSectionCollapseToggle={() => undefined}
        onSelect={() => undefined}
        onStoryOpen={() => undefined}
        rows={[
            ["Onboarding redesign", "ux", "Steve and Jordan replied to its story", 1],
            ["SHIP BOSS", "deploy", "Needs your yes on 1ff04853 to fix preview links", 0],
        ].map(([title, slug, status, unseen], index) => ({
            kind: "task",
            card: {
                id: String(index),
                title: String(title),
                time: index === 0 ? "4m" : "1h",
                status: String(status),
                iconSlug: String(slug),
                ...(index === 0 ? { story: { total: 1, unseen: Number(unseen) } } : {}),
                faces: [],
                signal: "unread",
                subRows: [],
                more: 0,
                expanded: false,
            },
        }))}
        selectedId={null}
    />
);
