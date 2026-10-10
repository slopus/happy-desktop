"""Record and import parent-generated native poses, with exact source hashes."""
from pathlib import Path
import hashlib
import json
import shutil
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parent
manifest_path = ROOT / 'native-poses.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
values = sys.argv[1:]
if len(values) % 2:
    raise RuntimeError('Provide pairs of pose name and absolute native output path')
for name, path in zip(values[0::2], values[1::2]):
    source = Path(path)
    target = ROOT / 'images' / (name + '.png')
    shutil.copy2(source, target)
    image = Image.open(target)
    manifest[name] = {
        'source': str(source), 'local_file': str(target),
        'provider': 'native GPT image generation',
        'exact_model_version': 'Not exposed by native tool',
        'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'dimensions': list(image.size), 'mode': image.mode
    }
    print(name + ': imported')
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')