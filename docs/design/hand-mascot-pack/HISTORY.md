# Happy hand mascot generation pack

Artwork pipeline, not an application change. The user approved the exact uploads and a $15 full-batch limit, then switched still-image creation to native GPT and requested current fal video models. One fal turnaround was already in progress at that switch and completed; it is retained for provenance only. All further fal image calls are disabled. Native GPT generated the authoritative identity and gesture stills.

**The motion batch contains ten real generated-preview jobs.** The user first requested wave and the corrected hand-flips-onto-fingers dance, then asked to retain the dance as-is and proceed with the other eight. The first animation review rejected the upload; after the user explicitly instructed submission again, one fresh review passed. Two initial requests failed fal input validation before rendering. The corrected requests keep identity/style references, omit conflicting end-frame control, and supply the inverted dance pose as an appearance reference. `agy` reviews actual sampled video frames for glaring issues. No automatic regenerations are performed.

## Reviewable batch

Selected C: butter-yellow soft 3D right hand; exactly five digits; two tiny dark brown oval eyes; tiny happy smile permanently on palm; tiny unhappy frown permanently on back. No body, arm, cuff, nose or eyebrows.

1. Identity turnaround: two opposite views, 1536 × 1024, high-quality transparent PNG.
2. Ten gestures: 1024 × 1024, high-quality transparent PNGs.
3. Ten genuine generated movement clips: 3 seconds each, audio disabled, fixed camera, image-to-video generation. The turnaround motion begins with the wave's smiling palm and ends at the back's frown.
4. Ten GIF previews, one ten-pose contact sheet, four representative frames per actual motion clip, provenance and reusable prompts.

| ID | Gesture | Visible surface |
| --- | --- | --- |
| 01 | One-handed Korean finger heart | Smiling palm |
| 02 | Wave | Smiling palm |
| 03 | Crossed fingers | Frowny back |
| 04 | Thumbs up | Smiling palm |
| 05 | Holding a coral heart | Smiling palm |
| 06 | Beckoning index | Smiling palm |
| 07 | Finger dance | Smiling palm |
| 08 | Turn around to expose separate back face | Palm → back |
| 09 | Stop / refusal | Frowny back |
| 10 | Middle finger | Frowny back |

## Exact upload scope

Only these three existing local images are supplied to fal.ai:

- `references/selected-finger-heart.png`: chosen mascot identity.
- `references/telegram-open-hands-frame-000.png`: actual extracted repo animation frame, style only.
- `references/telegram-robot-frame-090.png`: actual extracted repo animation frame, style only; no robot facial features inherited.

The generated `images/00-turnaround.png` is reused as an additional identity reference in the ten image calls. Generated fal image URLs become video start/end references. Original repository animation JSON files, unrelated files and credential contents are not uploaded. `source-manifest.json` records the real animation sources, SHA-256 hashes and timing. Open hands: 512 × 512, 60fps, 179 frames, 2.9833s. Robot: 512 × 512, 60fps, 180 frames, 3s.

The scoped runner reads only the explicitly authorized local env file at `/Users/kirilldubovitskiy/Developer/happy-desktop/.env.mascot.local`. The key is used only in HTTPS Authorization headers. It is never printed, included in prompts, copied into this workspace, or written to records.

## Models and documented pricing

Verified live model schemas:

- Image: `openai/gpt-image-2.5/sunburst/edit`, https://fal.ai/models/openai/gpt-image-2.5/sunburst/edit/llms.txt . Image tokens per million: $8 input, $2 cached input, $30 output. Text tokens per million: $5 input, $1.25 cached input, $10 output. Metered cost depends on actual token use; the retrieved schema does not give an exact high-quality canonical-size quote.
- Selected motion model: `fal-ai/kling-video/o3/pro/reference-to-video`, https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video/llms.txt . Audio-off price $0.112/second; ten 3-second clips would cost **$3.36** at the quoted rate. Supports start/end frames, identity/style references and square video. It was selected for character control after comparing live H3 Max and Veo 3.1 schemas; no claim that it is universally the newest or highest-ranked model.

Current scope: ten silent 3-second previews, **$3.36** at the published motion rate, plus the one already-completed metered fal image whose exact billing was not returned. The runner caps ten live/successful preview records. Its conservative budget reserves $10 for the single metered image and $0.336 even for each of the two failed validation attempts, making **$14.032 reserved** across twelve video submissions, under the approved $15 cap. This is an allowance, not measured billing. No upscales, audio or automatic regenerations are submitted.

## Execution record

The first image command was initially rejected, then approved once after new exact user authorization:

```
python3 .context/hand-mascot-pack/fal_pipeline.py image 00-turnaround
```

Its fal request ID is `01a0f74f-e912-7fc1-9af3-1bcd686bebb5`. The inference result exposed generated images but no usage or billing amount. `images/00-turnaround.png` is retained unused; it has an unwanted glow halo. Native GPT replaces it as identity authority.

The animation command was initially denied, then passed a fresh review after the new exact user instruction:

```
python3 .context/hand-mascot-pack/fal_pipeline.py video 02-wave-motion
```

The two successful corrected request IDs are `01a0fbbd-6d41-7643-bb3e-950d2598c1ed` (wave) and `01a0fbbd-7314-7ee3-af56-7c32d6c790cb` (dance). Actual MP4s are under `videos/`, GIFs under `previews/`, timestamped samples and agy's review under `review/`. Both clips are about 3.04 seconds, 1440 × 1440, with video streams only and no audio.

The dance endpoint is a local rotation of the existing five-digit native still, used only as conditioning. The actual somersault and alternating articulated finger steps were generated by fal's video model; no static affine effect is claimed to be the animation.

`fal_pipeline.py` durably saves request IDs, model IDs, safe inputs, queue/status URLs, results and local outputs under `records/`. Data URI artwork bytes are omitted from durable records in favor of exact relative reference paths. Submission is idempotent by local record name; already submitted records are not resubmitted.