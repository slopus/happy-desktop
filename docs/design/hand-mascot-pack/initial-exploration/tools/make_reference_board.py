from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
font_file = '/System/Library/Fonts/Supplemental/Arial.ttf'
font = ImageFont.truetype(font_file, 22)
small = ImageFont.truetype(font_file, 16)
board = Image.new('RGB', (1200, 520), '#faf8f3')
draw = ImageDraw.Draw(board)
sources = [
    (root / 'mascot/selected-c/finger-heart.png', 'Character identity: selected C'),
    (root / 'references/open-hands-frame-000.png', 'Style + motion: repo open hands'),
    (root / 'references/robot-frame-090.png', 'Style + motion: repo robot'),
]
for i, (source, label) in enumerate(sources):
    image = Image.open(source).convert('RGBA')
    image.thumbnail((360, 400), Image.Resampling.LANCZOS)
    x = i * 400 + (400 - image.width) // 2
    y = 30 + (400 - image.height) // 2
    board.paste(image, (x, y), image)
    draw.text((i * 400 + 20, 450), label, fill='#3b3430', font=font)
draw.text((20, 491), 'Requested identity update: happy face on palm; frowny face on the opposite back surface.', fill='#6a6059', font=small)
out = root / 'references/source-reference-board.jpg'
board.save(out, quality=92)
print(out)