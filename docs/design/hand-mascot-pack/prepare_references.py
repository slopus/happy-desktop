from pathlib import Path
import shutil
import hashlib
import json

ROOT = Path(__file__).resolve().parent
PARENT = ROOT / 'original-telegram-references'
REPO = ROOT.parents[2]

items = []
for asset, frame, role in [
    ('open-hands', 0, 'STYLE AND MOTION ONLY; five-digit silhouette and 3sec motion rhythm'),
    ('robot', 90, 'STYLE ONLY; gloss and restrained expression, no robot anatomy'),
]:
    source = REPO / 'packages/happy-desktop-ui/src/assets/animations' / (asset + '.json')
    value = json.loads(source.read_text())
    name = f'telegram-{asset}-frame-{frame:03d}.png'
    frame_file = ROOT / 'references' / name
    shutil.copy2(PARENT / f'{asset}-frame-{frame:03d}.png', frame_file)
    items.append({
        'asset': asset, 'role': role, 'original_source': str(source),
        'original_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'frame_rate': value['fr'], 'in_frame': value['ip'], 'out_frame': value['op'],
        'duration_seconds': (value['op']-value['ip'])/value['fr'],
        'dimensions': [value['w'], value['h']], 'reference_frame': frame,
        'local_upload_file': str(frame_file),
        'frame_sha256': hashlib.sha256(frame_file.read_bytes()).hexdigest()
    })
hero = ROOT / 'references/selected-finger-heart.png'
manifest = {
    'identity_reference': {
        'file': str(hero), 'sha256': hashlib.sha256(hero.read_bytes()).hexdigest(),
        'role': 'AUTHORITATIVE selected C mascot identity and material'
    },
    'telegram_references': items,
    'additional_generated_reference': 'images/00-turnaround.png (fal-generated after approval; reused in 10 gesture calls)',
    'credential_source': 'Authorized exact local .env.mascot.local; credentials never uploaded as artwork or recorded',
    'upload_scope': 'Only the three approved artwork images and the generated turnaround, never repository source JSON or other files'
}
(ROOT / 'source-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Copied two exact Telegram frames; recorded original source hashes and native timing.')