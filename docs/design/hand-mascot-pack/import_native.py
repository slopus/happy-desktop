"""Import native GPT artwork; split real opposite views without altering anatomy."""
from pathlib import Path
from PIL import Image
import hashlib
import json
import shutil
import sys

ROOT = Path(__file__).resolve().parent
source = Path(sys.argv[1])
target = ROOT / 'images/native-turnaround.png'
shutil.copy2(source, target)
image = Image.open(target).convert('RGBA')
views = [image.crop((0, 0, image.width//2, image.height)),
         image.crop((image.width//2, 0, image.width, image.height))]
boxes = [view.getchannel('A').point(lambda value: 255 if value > 48 else 0).getbbox() for view in views]
scale = min(820 / max(box[2]-box[0] for box in boxes), 820 / max(box[3]-box[1] for box in boxes))
for name, view, box in zip(['02-wave', '08-turnaround-back'], views, boxes):
    crop = view.crop(box)
    crop = crop.resize((round(crop.width*scale), round(crop.height*scale)), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (1024, 1024))
    canvas.alpha_composite(crop, ((1024-crop.width)//2, (1024-crop.height)//2))
    canvas.save(ROOT / 'images' / (name + '.png'))
manifest = {
    'provider': 'native GPT image tool', 'exact_model_version': 'Not exposed by native tool',
    'original_output': str(source), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    'derivatives': {'02-wave.png': 'Left front/palm view, cropped and padded',
                    '08-turnaround-back.png': 'Right back/dorsal view, cropped and padded'},
    'note': 'No finger edits, recoloring or facial changes in crops. Same source opposite views.'
}
(ROOT / 'native-provenance.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Imported native identity, smiling-palm wave and frowny-back turn endpoint.')