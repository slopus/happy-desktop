# Verified fal video candidates

These are live official endpoint capabilities, not a benchmark ranking. The chosen model was **Kling O3 Pro reference-to-video**, because this task requires a fixed two-sided hand identity, actual Telegram style references, start/end frame control and short square clips.

| Model | Shortest clip | Reference control | Published audio-off cost | Ten minimum-length clips |
| --- | --- | --- | --- | --- |
| Kling O3 Pro reference-to-video | 3 seconds | Start/end frames, separate identity/style images, character elements; 1:1 | $0.112/sec | $3.36 |
| Kling 3 Pro image-to-video | 3 seconds | Start/end frames, character elements | $0.112/sec | $3.36 |
| MiniMax H3 Max image-to-video | 5 seconds | Start/end frames; no separate identity/style fields | 768p $0.08/sec after September 30 promotional deadline | $4.00 |
| Veo 3.1 image-to-video | 4 seconds | Start image; 16:9 or 9:16 only, square cropped | $0.20/sec at 720p without audio | $8.00 |

Official schemas read:

- https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video/llms.txt
- https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/llms.txt
- https://fal.ai/models/minimax/h3-max/image-to-video/llms.txt
- https://fal.ai/models/fal-ai/veo3.1/image-to-video/llms.txt

Seedance 2.0 reference-to-video is also documented at `bytedance/seedance-2.0/reference-to-video`: up to nine image refs plus three motion videos, minimum four seconds, 480p/720p, square available. Its guessed prefixed endpoint paths returned 404; official docs identified the correct unprefixed provider path. It was not selected or submitted. Parent separately researched the newer Seedance 2.5 variant and found its ten-clip cost would exceed the approved $15 budget.

No model performance claim is based on generated motion here: automatic review blocked the first animation request before submission because of the private-artwork transfer policy. All ten video prompts remain unexecuted.