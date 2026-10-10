import base64
import io
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

root = Path('/Users/kirilldubovitskiy/Developer/happy-desktop')
runtime = root / 'node_modules/.pnpm/@lottiefiles+dotlottie-web@0.78.2/node_modules/@lottiefiles/dotlottie-web/dist'
bundle = (runtime / 'index.js').read_text().replace('export{ue as DotLottie,pe as DotLottieWorker};', 'window.DotLottie=ue;')
wasm = 'data:application/wasm;base64,' + base64.b64encode((runtime / 'dotlottie-player.wasm').read_bytes()).decode()
assets = root / 'packages/happy-desktop-ui/src/assets/animations'
out = Path('references')
out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    page = browser.new_page(viewport={'width': 512, 'height': 512}, device_scale_factor=1)
    page.set_content('<style>body{margin:0;background:#faf8f3}canvas{display:block}</style><canvas id="art" width="512" height="512"></canvas>')
    page.add_script_tag(content=bundle, type='module')
    page.wait_for_function('window.DotLottie !== undefined')
    page.evaluate('(url)=>DotLottie.setWasmUrl(url)', wasm)
    for name in ['open-hands', 'robot', 'snail', 'sparkles']:
        page.evaluate('''async(data)=>{
            window.player?.destroy();
            window.player=new DotLottie({canvas:document.querySelector('canvas'),data,autoplay:false,loop:false});
            await new Promise((resolve,reject)=>{player.addEventListener('load',resolve);player.addEventListener('loadError',reject)});
        }''', (assets / f'{name}.json').read_text())
        frames = []
        for frame in [0, 45, 90, 135]:
            page.evaluate('(frame)=>player.setFrame(frame)', frame)
            page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
            image = Image.open(io.BytesIO(page.screenshot())).convert('RGB')
            frames.append(image)
            image.save(out / f'{name}-frame-{frame:03}.png')
        sheet = Image.new('RGB', (1024, 1064), '#faf8f3')
        draw = ImageDraw.Draw(sheet)
        for i, image in enumerate(frames):
            x, y = (i % 2)*512, (i // 2)*532
            sheet.paste(image, (x,y))
            draw.text((x+20,y+512), f'{name}: frame {[0,45,90,135][i]}', fill='#555555')
        sheet.save(out / f'{name}-frames.jpg')
        print(out / f'{name}-frames.jpg')
        if name in ['open-hands', 'robot']:
            motion_frames = []
            for frame in range(0, 177, 3):
                page.evaluate('(frame)=>player.setFrame(frame)', frame)
                page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
                image = Image.open(io.BytesIO(page.screenshot())).convert('RGB')
                image.thumbnail((256, 256), Image.Resampling.LANCZOS)
                motion_frames.append(image)
            motion_frames[0].save(out / f'{name}-motion.gif', save_all=True, append_images=motion_frames[1:], duration=50, loop=0)
            print(out / f'{name}-motion.gif')
    browser.close()