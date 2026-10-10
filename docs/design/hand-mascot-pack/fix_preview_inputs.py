"""Local reference composition and durable archival of failed API validation."""
from pathlib import Path
from PIL import Image
import json
import shutil

ROOT = Path(__file__).resolve().parent
canvas = Image.new('RGBA', (1024, 512), '#f6f2e9')
for offset, name in [(0, 'telegram-open-hands-frame-000.png'), (512, 'telegram-robot-frame-090.png')]:
    image = Image.open(ROOT / 'references' / name).convert('RGBA')
    image.thumbnail((512, 512), Image.Resampling.LANCZOS)
    canvas.alpha_composite(image, (offset+(512-image.width)//2, (512-image.height)//2))
canvas.save(ROOT / 'references/telegram-style-pair.png')
failures = ROOT / 'records/failures'
failures.mkdir(exist_ok=True)
for name in ['02-wave-motion', '07-finger-dance-motion']:
    record = ROOT / 'records' / (name+'.json')
    value = json.loads(record.read_text())
    if value.get('local_output') or not value.get('response_error'):
        raise RuntimeError('Cannot archive a successful or unresolved request')
    if name == '02-wave-motion':
        value['first_observed_error'] = 'Result returned HTTP422 in initial check, then HTTP404 on repeated retrieval. No video was returned.'
    record.write_text(json.dumps(value, indent=2)+'\n')
    shutil.move(record, failures / record.name)
print('Combined the two approved style frames; archived two failed validations. No new generation.')