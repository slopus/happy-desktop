# Happy hand mascot archive

Start with the [latest ten-motion preview](previews/all-ten-motions-v4.mp4) and its [contact frame](review/all-ten-v4-still.jpg). This is an archival artwork pack, saved on a dedicated branch without application integration. All generated stills, motion revisions, GIFs, contact sheets, sampled review frames, prompts, and safe generation records are retained.

The character is the selected butter-yellow hand: a happy face on the palm and a frown on the back. Native GPT generated the authoritative stills; its exact image model version was not exposed. Motion records identify the fal Kling O3 reference-to-video model and request IDs. The earlier fal-generated turnaround remains as history, with its unwanted halo.

## Selected motions

These are the exact ten choices in `build_review_v4.sh`; each path is relative to this folder.

| Slot | Gesture | Selected video |
| --- | --- | --- |
| 01 | Finger heart | [01-finger-heart-motion.mp4](videos/01-finger-heart-motion.mp4) |
| 02 | Wave | [02-wave-motion-v2.mp4](videos/02-wave-motion-v2.mp4) |
| 03 | Crossed fingers | [03-crossed-fingers-motion.mp4](videos/03-crossed-fingers-motion.mp4) |
| 04 | Thumbs up | [04-thumbs-up-motion-v2.mp4](videos/04-thumbs-up-motion-v2.mp4) |
| 05 | Holding heart | [05-holding-heart-motion.mp4](videos/05-holding-heart-motion.mp4) |
| 06 | Beckoning | [06-beckoning-motion.mp4](videos/06-beckoning-motion.mp4) |
| 07 | Finger dance | [07-finger-dance-motion.mp4](videos/07-finger-dance-motion.mp4) |
| 08 | Turn to back | [08-turnaround-back-motion-v2.mp4](videos/08-turnaround-back-motion-v2.mp4) |
| 09 | Stop | [09-back-stop-motion-v2.mp4](videos/09-back-stop-motion-v2.mp4) |
| 10 | Middle finger | [10-back-middle-finger-motion-v4.mp4](videos/10-back-middle-finger-motion-v4.mp4) |

The latest slot 10 still is [10-back-middle-finger-v3.png](images/10-back-middle-finger-v3.png), using [Apple's emoji reference](references/apple-middle-finger-emoji.png) for anatomy. Its exact native prompt is saved in [latest-middle-finger-prompt.txt](latest-middle-finger-prompt.txt); its motion revision prompt is in `redo_v2.py`.

## History and limits

`HISTORY.md` preserves the earlier batch narrative, approval and budget context. Its ten-clip count, upload scope, budget reservations, and credential-file instructions describe that earlier stage; later redo records and previews supersede it. Reserved estimates are not measured billing. `deliverables/` is the earlier packaged still set and is not a replacement for the current selections above.

Known flaws remain in finger heart, crossed fingers, holding heart, beckoning, and dance. The automated reviews disagree on dance digit count; the user explicitly retained that dance as-is. These clips are review candidates, not a blanket production-ready set. The latest middle-finger revision was checked on twelve sampled frames for a smooth closed-fist silhouette without grooves or extra finger lines.

`initial-exploration/` contains the original concept boards, selected-C crops, prompt research, and original request. `original-telegram-references/` retains all original reference frames, boards, and motion GIFs. The three scripts under `initial-exploration/tools/` are unchanged historical tools: their original host paths, working-directory assumptions, exact dotlottie package version, and Chrome location require adjustment before reuse. The original native outputs they reference are already saved as artwork here.

## Reuse

Use Python 3 with Pillow and FFmpeg/ffprobe for local image and preview processing. From this directory, `bash build_review_v4.sh` rebuilds the latest preview using saved clips, without generation or API calls. Set `FONT=/path/to/font.ttf` for systems without macOS Arial. Earlier preview scripts are retained alongside it. Python processing scripts resolve their inputs relative to this folder; `prepare_references.py` uses the saved reference frames and the repository's animation JSON files. Optional review runners invoke `agy` from PATH.

The fal runner now reads `FAL_KEY` only from the environment. No credentials or env files are included. Running generation scripts can upload artwork and incur charges; this archival task made no generation calls. Saved records prevent accidental resubmission of recorded jobs. Historical native-import scripts accept an explicit source-image path. Native images cannot be reproduced by a pinned model version because the tool did not expose one.

`preservation-manifest.json` records every copied source file, source and saved SHA-256, byte size, and the seven scripts adapted for portability. Artwork is byte-identical to its source. Only Finder metadata and Python caches were omitted from the completed pack; the parent's credential-setup script was deliberately excluded. Historical local paths in safe provenance are retained as evidence and are not required to view the archive.