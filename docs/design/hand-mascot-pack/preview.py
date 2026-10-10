"""Create honest contact sheets and GIFs from actual generated PNG/MP4 assets."""
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FONT_PATH = '/System/Library/Fonts/Supplemental/Arial.ttf'

def contact_sheet():
    files = sorted((ROOT / 'images').glob('[0-1][0-9]-*.png'))
    files = [file for file in files if not file.name.startswith('00-') and not file.stem.endswith('-inverted-end')]
    if not files:
        return
    width, height = 350, 390
    sheet = Image.new('RGB', (width * 5, height * 2), '#f6f2e9')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(FONT_PATH, 19)
    for index, file in enumerate(files[:10]):
        source = file
        if file.stem == '07-finger-dance' and (ROOT/'images/07-finger-dance-inverted-end.png').exists():
            source = ROOT/'images/07-finger-dance-inverted-end.png'
        image = Image.open(source).convert('RGBA')
        image.thumbnail((width - 28, height - 60))
        x, y = (index % 5) * width, (index // 5) * height
        sheet.paste(image, (x + (width - image.width)//2, y + 12), image)
        label = file.stem.replace('-', ' ')
        draw.text((x + 15, y + height - 35), label, fill='#453824', font=font)
    sheet.save(ROOT / 'previews' / 'ten-gestures-contact-sheet.jpg', quality=93)

def videos():
    for file in sorted((ROOT / 'videos').glob('*.mp4')):
        target = ROOT / 'previews' / (file.stem + '.gif')
        if target.exists():
            continue
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(file),
                        '-filter_complex', '[0:v]fps=15,scale=320:-1:flags=lanczos,split[a][b];'
                        '[a]palettegen[p];[b][p]paletteuse', '-loop', '0', str(target)], check=True)
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(file),
                        '-vf', 'fps=4/3,scale=300:-1,tile=4x1', '-frames:v', '1',
                        str(ROOT / 'previews' / (file.stem + '-frames.jpg'))], check=True)

if __name__ == '__main__':
    (ROOT / 'previews').mkdir(exist_ok=True)
    contact_sheet()
    videos()