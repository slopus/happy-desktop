import { expect, it } from "vitest";
import { desktopExperimentalOnboardingOffered } from "./desktopExperiments";

const identity = { checkout: "/work/happy", branch: "main", commit: "abc1234" } as never;

it.each([
    ["a development checkout", { buildIdentity: identity }, false, false, true],
    ["the browser development server", {}, false, true, true],
    ["Nightly's hosted renderer", {}, true, false, true],
    ["a production build", {}, false, false, false],
] as const)(
    "offers experimental onboarding by default in %s",
    (_label, bridge, hosted, browserDevelopment, offered) => {
        expect(desktopExperimentalOnboardingOffered(bridge, { hosted, browserDevelopment })).toBe(
            offered,
        );
    },
);
