"""Extract honest temporal review frames from available real fal video outputs."""
from pathlib import Path
import json
import subprocess
import shutil
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
REVIEW = ROOT / 'review'
REVIEW.mkdir(exist_ok=True)
manifest = []
for source in sorted((ROOT / 'videos').glob('*.mp4')):
    name = source.stem
    folder = REVIEW / name
    folder.mkdir(exist_ok=True)
    shutil.copy2(source, folder / 'clip.mp4')
    metadata = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(source)
    ]))
    (folder / 'metadata.json').write_text(json.dumps(metadata, indent=2)+'\n')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
                    '-vf', 'fps=4,scale=384:-1:flags=lanczos', str(folder/'frame-%02d.png')], check=True)
    frames = sorted(folder.glob('frame-*.png'))
    grid = Image.new('RGB', (1536, 1260), '#f6f2e9')
    draw = ImageDraw.Draw(grid)
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)
    for index, file in enumerate(frames[:12]):
        image = Image.open(file).convert('RGB')
        image.thumbnail((384, 384), Image.Resampling.LANCZOS)
        x, y = (index%4)*384, (index//4)*420
        grid.paste(image, (x+(384-image.width)//2, y))
        draw.text((x+12, y+391), f'{index/4:.2f}s', fill='#453824', font=font)
    grid.save(folder/'temporal-grid.jpg', quality=94)
    manifest.append({'clip': name, 'video': str(folder/'clip.mp4'),
                     'frames_per_second_sampled': 4, 'sampled_frame_count': len(frames),
                     'grid': str(folder/'temporal-grid.jpg')})
(REVIEW/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
(REVIEW/'review-request.md').write_text(
    'The user explicitly asked agy to watch these actual mascot animation previews for glaring issues. '
    'Review ONLY the files in this review folder. This is read-only visual review; do not generate, '
    'submit cloud video jobs, change files, restart any app, or inspect credentials.\n\n'
    'Read manifest.json, inspect the timestamped temporal-grid.jpg and frame PNGs for ALL clips; '
    'the actual clip.mp4 files are included if useful. Frames are sampled at 4fps through the full '
    'three-second video, not independently generated illustrations.\n\n'
    'Identity: ONE butter-yellow soft chunky 3D hand, exactly FIVE digits, one thumb plus index, middle, '
    'ring and pinky. Tiny dark brown oval eyes, fixed happy smile physically on PALM, separate fixed '
    'tiny frown physically on BACK. Faces must rotate with the physical surface and never migrate '
    'or change expression on the same surface. A smile rotating upside down is still a palm smile.\n\n'
    'Wave: smiling palm, small friendly wave with finger articulation, stationary camera.\n'
    'Dance: the WHOLE hand flips UPSIDE DOWN, wrist at TOP, lands on INDEX and MIDDLE fingertips, '
    'then DANCES ON those fingers with alternating bending/lifting finger steps. Ring/pinky/thumb '
    'stay folded, no new legs, feet, shoes or toes. Merely wiggling fingers upright or rotating a '
    'still image is a failure of requested choreography.\n\n'
    'Flag glaring anatomy errors, extra/missing/fused fingers, melting, face migration or swapping, '
    'style/color drift, bad cropping, flicker, camera drift and missed choreography. Give each '
    'clip PASS / NEEDS FIX with concrete evidence and timestamps. Mention the limits of sampled '
    'frames. Keep the result concise and do not claim viewing evidence you did not inspect.\n'
)
print('Prepared '+str(len(manifest))+' real clips and timestamped 4fps review frames for agy.')