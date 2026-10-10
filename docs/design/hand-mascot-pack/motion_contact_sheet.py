"""Composite the ten actual generated video timelines into an honest animated sheet."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
LABELS = [
    ('01-finger-heart-motion', '01 Finger heart'), ('02-wave-motion', '02 Wave'),
    ('03-crossed-fingers-motion', '03 Crossed fingers'), ('04-thumbs-up-motion', '04 Thumbs up'),
    ('05-holding-heart-motion', '05 Holding heart'), ('06-beckoning-motion', '06 Beckoning'),
    ('07-finger-dance-motion', '07 Finger dance'), ('08-turnaround-back-motion', '08 Turn to back'),
    ('09-back-stop-motion', '09 Back stop'), ('10-back-middle-finger-motion', '10 Middle finger')
]
command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y']
for name, _ in LABELS:
    path = ROOT / 'videos' / (name+'.mp4')
    if not path.exists():
        raise RuntimeError('Video not available: '+name)
    command.extend(['-threads', '1', '-i', str(path)])
chains = []
for index, (_, label) in enumerate(LABELS):
    chains.append(
        f'[{index}:v]fps=12,scale=300:300:flags=lanczos,pad=300:340:0:0:color=0xf6f2e9,'
        f'drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text=\'{label}\':'
        f'x=12:y=313:fontsize=17:fontcolor=0x453824[v{index}]'
    )
layout = '|'.join(f'{(index%5)*300}_{(index//5)*340}' for index in range(10))
chains.append(''.join(f'[v{index}]' for index in range(10))+
              f'xstack=inputs=10:layout={layout}:fill=0xf6f2e9:shortest=1[grid]')
target = ROOT / 'previews/all-ten-motions.mp4'
subprocess.run(command+['-filter_complex', ';'.join(chains), '-map', '[grid]',
                        '-an', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p',
                        '-movflags', '+faststart', str(target)], check=True)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(target),
                '-filter_complex', '[0:v]fps=10,scale=1000:-2:flags=lanczos,split[a][b];'
                                   '[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=none',
                '-loop', '0', str(ROOT/'previews/all-ten-motions.gif')], check=True)
print('Created actual-video motion contact sheet in MP4 and GIF.')