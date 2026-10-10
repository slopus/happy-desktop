"""Use explicit image paths and file-view tools; no shell permission required."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REVIEW = ROOT / 'review'
paths = sorted(REVIEW.glob('*/temporal-grid.jpg'))
prompt = (
    'The user asked agy to visually review these generated mascot clips for glaring issues. '
    'The timestamped grids already contain the actual video frames. Use ONLY your file-read/view '
    'tool to open the EXACT image files below. Do NOT run any shell commands, ffmpeg, list '
    'directories, or inspect other files. Do not edit settings or use any permission bypass. '
    'If you cannot view images without a command tool, simply say so and give no invented verdict.\n\n'
    + '\n'.join(str(path) for path in paths) + '\n\n'
    'Each grid samples 4fps of the real 3-second clip, in left-to-right rows with timestamps. '
    'Hand identity: exactly FIVE digits, one thumb plus index/middle/ring/pinky, chunky yellow '
    '3D toy, tiny brown eyes, fixed smiling palm and separate frowny back. The face rotates '
    'with the physical hand, so an upside-down smile may look like a frown in world coordinates. '
    'Wave should keep five digits and articulate a friendly small wave. Dance must flip '
    'upside down, wrist at TOP, land on index/middle fingertips and take alternating finger '
    'steps. Other digits stay folded; no new legs, feet or fingers.\n\n'
    'Report PASS or NEEDS FIX per clip, concrete glaring issues and timestamps, especially '
    'digit count, thumb swelling, melting, face migration/surface swaps, flicker and missed '
    'choreography. Be concise and state the limits of sampling. No tool execution beyond '
    'reading/viewing the explicit image files.\n'
)
(REVIEW/'review-request.md').write_text(prompt)
print('Prepared direct image-view review for agy, with no command/list/ffmpeg tool requirement.')