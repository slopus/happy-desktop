import type { LottieSceneName } from "../LottieScene";
import alienMonsterStill from "../assets/animations/stills/alien-monster.webp?inline";
import cherryBlossomStill from "../assets/animations/stills/cherry-blossom.webp?inline";
import closedLockStill from "../assets/animations/stills/closed-lock.webp?inline";
import cloudVariationStill from "../assets/animations/stills/cloud-variation.webp?inline";
import confettiBallStill from "../assets/animations/stills/confetti-ball.webp?inline";
import crowEatingWormStill from "../assets/animations/stills/crow-eating-worm.webp?inline";
import disguisedFaceStill from "../assets/animations/stills/disguised-face.webp?inline";
import frontFacingBabyChickStill from "../assets/animations/stills/front-facing-baby-chick.webp?inline";
import hatchingChickStill from "../assets/animations/stills/hatching-chick.webp?inline";
import llamaStill from "../assets/animations/stills/llama.webp?inline";
import magicWandStill from "../assets/animations/stills/magic-wand.webp?inline";
import mirrorBallStill from "../assets/animations/stills/mirror-ball.webp?inline";
import monkeyHearNoEvilStill from "../assets/animations/stills/monkey-hear-no-evil.webp?inline";
import openHandsStill from "../assets/animations/stills/open-hands.webp?inline";
import owlStill from "../assets/animations/stills/owl.webp?inline";
import partyStill from "../assets/animations/stills/party.webp?inline";
import robotStill from "../assets/animations/stills/robot.webp?inline";
import seedlingStill from "../assets/animations/stills/seedling.webp?inline";
import snailStill from "../assets/animations/stills/snail.webp?inline";
import sparklesStill from "../assets/animations/stills/sparkles.webp?inline";
import spiderCatchingBugStill from "../assets/animations/stills/spider-catching-bug.webp?inline";
import sprigStill from "../assets/animations/stills/sprig.webp?inline";
import ticketsStill from "../assets/animations/stills/tickets.webp?inline";
import treeStill from "../assets/animations/stills/tree.webp?inline";
import wandStill from "../assets/animations/stills/wand.webp?inline";

/**
 * Every scene's end frame as a picture: what a scene shows under its canvas
 * until the player has drawn that frame itself, so the art is on screen with
 * the page rather than after the runtime, the WASM, and the animation arrive.
 *
 * Each is a 240 × 240 render of the scene at the frame `LottieScene` rests on
 * with `rest="end"` (its playback segment's end where it has one), drawn by the
 * same dotLottie player and encoded as WebP — see `assets/animations/PROVENANCE.md`.
 * Inline, so nothing is fetched for them either. Total on purpose: a scene
 * cannot ship without its still.
 */
export const SCENE_STILLS: Record<LottieSceneName, string> = {
    "alien-monster": alienMonsterStill,
    "cherry-blossom": cherryBlossomStill,
    "closed-lock": closedLockStill,
    "cloud-variation": cloudVariationStill,
    "confetti-ball": confettiBallStill,
    "crow-eating-worm": crowEatingWormStill,
    "disguised-face": disguisedFaceStill,
    "front-facing-baby-chick": frontFacingBabyChickStill,
    "hatching-chick": hatchingChickStill,
    llama: llamaStill,
    "magic-wand": magicWandStill,
    "mirror-ball": mirrorBallStill,
    "monkey-hear-no-evil": monkeyHearNoEvilStill,
    "open-hands": openHandsStill,
    owl: owlStill,
    party: partyStill,
    robot: robotStill,
    seedling: seedlingStill,
    snail: snailStill,
    sparkles: sparklesStill,
    "spider-catching-bug": spiderCatchingBugStill,
    sprig: sprigStill,
    tickets: ticketsStill,
    tree: treeStill,
    wand: wandStill,
};
