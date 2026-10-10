from pathlib import Path
from shutil import copyfile
from PIL import Image

generated = Path('/Users/kirilldubovitskiy/Happy/Generated')
out = Path('mascot/selected-c')
out.mkdir(exist_ok=True)
copyfile(generated / 'hk3c0u0wrsynumejjiju5b9h.png', out / 'gesture-sheet.png')
copyfile(generated / 'n6i00ajb71lm0zgecda83la7.png', out / 'finger-heart.png')
hero = Image.open(out / 'finger-heart.png')
print('Hero:', hero.size, hero.mode)
if 'A' in hero.getbands():
    print('Alpha range:', hero.getchannel('A').getextrema())
    hero.thumbnail((512, 512), Image.Resampling.LANCZOS)
    hero.save(out / 'finger-heart-512.png')
else:
    print('Hero has no alpha; do not describe it as transparent.')
sheet = Image.open(out / 'gesture-sheet.png')
assert sheet.size == (1536, 1024), sheet.size
for i, name in enumerate(['heart', 'luck', 'hold', 'dance', 'hello', 'cheeky']):
    col, row = i % 3, i // 3
    top, bottom = (0, 474) if row == 0 else (530, 938)
    crop = sheet.crop((col * 512, top, (col + 1) * 512, bottom))
    canvas = Image.new('RGB', (512, 512), sheet.getpixel((0, 0)))
    canvas.paste(crop, (0, (512 - crop.height) // 2))
    canvas.save(out / f'{name}-pose.png')
print('Saved six label-free exploratory poses; backgrounds remain opaque.')