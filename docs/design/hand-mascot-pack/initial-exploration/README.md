# Happy hand mascot — first exploration

The user confirmed the one-handed Korean finger heart (🫰) as the signature pose and selected concept C: the yellow hand with a tiny face. The same floating hand changes gesture.

## Concepts

- `concepts.png`: A — faceless yellow, B — faceless coral, C — yellow with a tiny palm face.
- `gestures.png`: provisional concept A in six poses: finger heart, crossed fingers, holding a heart, dance, wave, middle finger.

Selected direction: C. Current assets are in `selected-c/`: a six-gesture sheet, a standalone finger-heart PNG, a 512px version, and six label-free exploratory pose crops. The cropped poses retain the opaque off-white sheet background. These are raster design assets, not animated stickers. Finger overlap and proportions should be refined before production.

## Identity to keep fixed

One floating hand with four fingers and one thumb; short rounded wrist, plump fingers, butter-yellow material, satin highlights, warm shadows, soft upper-left lighting. Two tiny dark-brown oval eyes and one small curved smile sit low on the palm, clear of the folded fingers. The cheeky pose can wink. No body, arms, legs, skin texture or prominent nails. Coral hearts are small accents. Keep face size and placement, wrist length, palm volume, finger lengths, handedness, color and lighting consistent across production poses. Check each pose as a small silhouette before adding effects.

## Motion directions

| Gesture | Short loop direction |
| --- | --- |
| Heart | Anticipation squeeze, thumb/index pinch, tiny heart pops and pulses, settle. |
| Luck | Index and middle cross, small hopeful wrist bounce, hold, settle. |
| Hold | Palm lifts a coral heart, fingers gently cup it, heart softly pulses. |
| Dance | Wrist rocks side to side in a rhythmic arc, fingers flex, return to starting pose. |
| Hello | Palm turns slightly toward viewer, two relaxed wrist waves, settle. |
| Cheeky | Fist anticipates, middle finger rises, playful wrist bounce, hold, return. |

Aim for approximately 2–3 seconds, fixed camera and matching loop endpoints. The repo's open-hands reference is 512×512, 60fps, 179 frames. For generated 3D motion, render and inspect a transparent video sticker; an image or video model does not directly produce editable vector Lottie animation. A reusable 3D hand rig provides stronger anatomy and continuity for a large pack; generated video can test the motion direction first.

## Generation and model availability

Generated with Happy's built-in GPT image-generation tool using local image references. The tool does not expose the selected model or version; these images are not claimed to be GPT Image 2.5 outputs.

Official OpenAI documentation checked during research identifies `gpt-image-2.5-sunburst` as the current precision-focused image model. fal publishes `openai/gpt-image-2.5/sunburst/text-to-image`. No registered fal secret or MCP connection was available in this session, so fal generation was not run. See `fal-request.json` for a ready-to-use request body.

## References inspected

- Local `happy-desktop/scripts/demo/assets/stickers/wave.webp`: rounded yellow emoji hand, smooth gradients, short wrist.
- Local `happy-desktop/packages/happy-desktop-ui/src/assets/animations/open-hands.json` and `PROVENANCE.md`: rendered and visually inspected frames 0, 45, 90 and 135. The animation rotates the hands edge-on and opens them again, with warm yellow/orange vector gradients and broad highlights. Extracted frames are in `../references/open-hands-frames.jpg`. The generated concepts intentionally use smoother 3D shading, guided by the local waving emoji.
- [Telegram finger-heart emoji](https://emojipedia.org/telegram/telemoji-november-2022/hand-with-index-finger-and-thumb-crossed).
- [Telegram animated emoji overview](https://blog.emojipedia.org/telegrams-animated-emoji-set/).
- [AnimSchool: posing hands for animation](https://blog.animschool.edu/2025/06/13/posing-hands-for-animation-2/).
- [Microsoft Fluent emoji](https://github.com/microsoft/fluentui-emoji): another useful smooth 3D emoji precedent.
- [OpenAI Sunburst model documentation](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst.md).
- [fal Sunburst endpoint schema](https://fal.ai/models/openai/gpt-image-2.5/sunburst/text-to-image/llms.txt).