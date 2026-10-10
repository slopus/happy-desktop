"""Export ten real still gestures, review sheet and honest motion manifest."""
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'deliverables'
NAMES = [
    '01-finger-heart', '02-wave', '03-crossed-fingers', '04-thumbs-up',
    '05-holding-heart', '06-beckoning', '07-finger-dance', '08-turnaround-back',
    '09-back-stop', '10-back-middle-finger'
]
LABELS = [
    'Finger heart', 'Wave', 'Crossed fingers', 'Thumbs up', 'Holding a heart',
    'Beckoning', 'Finger dance', 'Turn to frowny back', 'Back: stop / refusal', 'Back: middle finger'
]
OUT.mkdir(exist_ok=True)
(OUT / 'motion-prompts').mkdir(exist_ok=True)
(OUT / 'references').mkdir(exist_ok=True)
(OUT / 'previews').mkdir(exist_ok=True)
for name in ['telegram-open-hands-frame-000.png', 'telegram-robot-frame-090.png']:
    shutil.copy2(ROOT / 'references' / name, OUT / 'references' / name)
if (ROOT / 'references/telegram-style-pair.png').exists():
    shutil.copy2(ROOT / 'references/telegram-style-pair.png', OUT / 'references/telegram-style-pair.png')
missing = [name for name in NAMES if not (ROOT / 'images' / (name + '.png')).exists()]
if missing:
    raise RuntimeError('Still artwork is incomplete: ' + ', '.join(missing))

font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 24)
small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)
sheet = Image.new('RGB', (1800, 870), '#f6f2e9')
draw = ImageDraw.Draw(sheet)
draw.text((28, 18), 'Happy hand — ten gesture poses', fill='#453824', font=font)
artwork = []
motions = []
generated_count = 0
for index, (name, label) in enumerate(zip(NAMES, LABELS)):
    source = ROOT / 'images' / (name + '.png')
    if name == '07-finger-dance' and (ROOT / 'images/07-finger-dance-inverted-end.png').exists():
        source = ROOT / 'images/07-finger-dance-inverted-end.png'
    image = Image.open(source).convert('RGBA')
    if image.size != (1024, 1024):
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (1024, 1024))
        canvas.alpha_composite(image, ((1024-image.width)//2, (1024-image.height)//2))
        image = canvas
    target = OUT / (name + '.png')
    image.save(target)
    artwork.append({'id': name, 'label': label, 'file': target.name,
                    'dimensions': [1024, 1024], 'alpha': True,
                    'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
    preview = image.copy()
    preview.thumbnail((330, 335), Image.Resampling.LANCZOS)
    x, y = (index % 5)*360, 60+(index//5)*400
    sheet.paste(preview, (x+(360-preview.width)//2, y+10), preview)
    draw.text((x+18, y+355), f'{index+1:02d}  {label}', fill='#453824', font=small)
    spec = json.loads((ROOT / 'prompts' / (name+'-motion.json')).read_text())
    video = ROOT / 'videos' / (name+'-motion.mp4')
    status = 'GENERATED PREVIEW — awaiting user selection' if video.exists() else 'NOT GENERATED YET'
    video_file = None
    request_id = None
    if video.exists():
        generated_count += 1
        shutil.copy2(video, OUT / 'previews' / video.name)
        video_file = 'previews/'+video.name
        record = json.loads((ROOT / 'records' / (name+'-motion.json')).read_text())
        request_id = record['queue']['request_id']
        gif = ROOT / 'previews' / (name+'-motion.gif')
        if gif.exists():
            shutil.copy2(gif, OUT / 'previews' / gif.name)
    reference_files = ['front-back-turnaround.png', 'references/telegram-style-pair.png']
    target_still = spec.get('end_source')
    target_instruction = ''
    if target_still:
        filename = target_still+'.png'
        target_path = ROOT / 'images' / filename
        if target_path.exists():
            shutil.copy2(target_path, OUT / 'references' / filename)
        reference_files.append('references/'+filename)
        target_instruction = ' @Image3 defines the desired final physical pose. Reach it through the requested articulated movement.'
    reusable = {
        'status': status,
        'intended_model': 'fal-ai/kling-video/o3/pro/reference-to-video',
        'duration_seconds': 3, 'generate_audio': False, 'aspect_ratio': '1:1',
        'prompt': '@Image1 is the authoritative two-sided hand identity. @Image2 contains the '
                  'actual Telegram hand frame on LEFT and robot frame on RIGHT for style only; do not inherit robot '
                  'anatomy, nose, teeth, colors or large eyes. ' + spec['prompt'] +
                  target_instruction + ' Avoid: ' + spec.get('negative_prompt', '') + '.',
        'start_still': spec['source']+'.png',
        'end_still': spec.get('end_source', spec['source'])+'.png',
        'identity_reference': 'front-back-turnaround.png',
        'reference_files_in_order': reference_files,
        'input_note': 'No end_image_url: O3 rejects end-frame control combined with multiple references. Final pose is supplied as a reference when needed.'
    }
    (OUT / 'motion-prompts' / (name+'.json')).write_text(json.dumps(reusable, indent=2)+'\n')
    motions.append({'id': name, 'status': status,
                    'intended_model': 'fal-ai/kling-video/o3/pro/reference-to-video',
                    'duration_seconds': 3, 'generate_audio': False,
                    'start_still': spec['source']+'.png',
                    'end_still': spec.get('end_source', spec['source'])+'.png',
                    'prompt_file': 'motion-prompts/'+name+'.json',
                    'request_id': request_id, 'video_file': video_file})

sheet.save(OUT / 'contact-sheet.jpg', quality=95)
identity = Image.open(ROOT / 'images/native-turnaround.png')
identity.save(OUT / 'front-back-turnaround.png')
(OUT / 'artwork-manifest.json').write_text(json.dumps({
    'identity': 'front-back-turnaround.png', 'stills': artwork,
    'stills_provider': 'native GPT image tool',
    'exact_native_model_version': 'Not exposed by native tool',
    'animations_generated': generated_count, 'app_changes': False,
    'dance_still_derivation': 'The original native five-digit dance pose is locally rotated 180 degrees into the user-requested upside-down stance. This still derivative is not claimed to be an animation.'
}, indent=2)+'\n')
(OUT / 'motion-prompts-manifest.json').write_text(json.dumps({'motions': motions}, indent=2)+'\n')
for name in ['native-provenance.json', 'native-poses.json', 'source-manifest.json', 'budget.json', 'blocked-animation.json']:
    shutil.copy2(ROOT / name, OUT / name)
if (ROOT / 'review/agy-review.txt').exists():
    shutil.copy2(ROOT / 'review/agy-review.txt', OUT / 'previews/agy-review.txt')
(OUT / 'README.md').write_text(
    '# Happy hand mascot\n\n'
    'Ten individual transparent 1024px gesture PNGs, a front/back identity turnaround and a contact sheet. '
    'Butter-yellow 3D hand, exactly five digits, tiny dark brown eyes, smiling palm and frowny back.\n\n'
    'The stills come from native GPT image generation; the native tool does not expose its exact model version. '
    'The wave and back-turn endpoint are crops of the corresponding genuine turnaround views. '
    'The signature finger heart reuses the user-selected original.\n\n'
    f'**{generated_count} animation previews generated.** The dance flips upside down onto its '
    'fingers; it is retained as-is as requested. The user first requested two previews, then '
    'authorized the other eight motions without automatic regenerations. Statuses and preview links are in '
    '`motion-prompts-manifest.json`. Initial permission reviews rejected uploads; a fresh review '
    'passed after the user explicitly instructed submission. Two initial requests failed input '
    'validation before rendering; the corrected requests omit conflicting end-frame control.\n\n'
    'One fal turnaround completed before the user switched stills to native GPT. It is retained separately '
    'for provenance and is not included as the selected identity. Its response exposed no exact billing amount. '
    'No app behavior, host process, commits or releases were changed.\n'
)
for name in ['all-ten-motions.gif', 'all-ten-motions.mp4']:
    path = ROOT / 'previews' / name
    if path.exists():
        shutil.copy2(path, OUT / 'previews' / name)
print('Exported ten transparent 1024px PNGs, native turnaround, contact sheet and motion manifest.')
print(str(OUT))