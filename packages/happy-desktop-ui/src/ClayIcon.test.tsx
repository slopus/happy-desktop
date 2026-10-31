import "./styles.css";
import { expect, it } from "vitest";
import { ClayIcon, clayIconSlugs } from "./ClayIcon";
import { createRenderer } from "./testing";

it("draws every slug the naming job can return at both sizes, and falls back otherwise", async () => {
    const view = createRenderer({ width: 1200, height: 520, padding: 12 });
    view.render(() => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {[20, 40].flatMap((size) =>
                clayIconSlugs.map((slug) => (
                    <ClayIcon key={`${size}-${slug}`} label={slug} size={size} slug={slug} />
                )),
            )}
            <ClayIcon label="Unknown" size={40} slug="not-a-clay-slug" />
            <ClayIcon label="None" size={20} slug={null} />
        </div>
    ));
    const images = [...view.container.querySelectorAll<HTMLImageElement>("img.happy-clay-icon")];
    expect(images).toHaveLength(clayIconSlugs.length * 2);
    await Promise.all(images.map((image) => image.decode()));
    for (const image of images) expect(image.naturalWidth, image.dataset.slug).toBeGreaterThan(0);
    const fallbacks = view.container.querySelectorAll(".happy-clay-icon-fallback");
    expect([...fallbacks].map((fallback) => fallback.textContent)).toEqual(["U", "N"]);
    view.destroy();
});
