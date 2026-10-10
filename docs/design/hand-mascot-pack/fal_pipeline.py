"""Scoped fal artwork generation. Credentials never enter records or stdout."""
import argparse
import os
import base64
import json
import pathlib
import urllib.request
import urllib.error
import re
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent
IMAGE_MODEL = 'openai/gpt-image-2.5/sunburst/edit'
VIDEO_MODEL = 'fal-ai/kling-video/o3/pro/reference-to-video'
def key():
    value = os.environ.get('FAL_KEY')
    if not value:
        raise RuntimeError('Set FAL_KEY in the environment before making paid API calls')
    return value

def api(url, payload=None, authenticate=True):
    headers = {'Content-Type': 'application/json'}
    if authenticate:
        headers['Authorization'] = 'Key ' + key()
    req = urllib.request.Request(url, data=json.dumps(payload).encode() if payload is not None else None, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.load(response)

def image_url(path):
    path = pathlib.Path(path)
    mime = 'image/jpeg' if path.suffix in ('.jpg', '.jpeg') else 'image/png'
    return 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode()

def video_image_url(path):
    from PIL import Image
    path = pathlib.Path(path)
    folder = ROOT / 'video-inputs'
    folder.mkdir(exist_ok=True)
    image = Image.open(path).convert('RGBA')
    canvas = Image.new('RGBA', image.size, '#f6f2e9')
    canvas.alpha_composite(image)
    target = folder / (path.stem + '-ivory.png')
    canvas.convert('RGB').save(target)
    return image_url(target)

def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')

def submit(name, model, payload, refs=None):
    record = ROOT / 'records' / (name + '.json')
    if record.exists():
        print(name + ': already submitted')
        return
    result = api('https://queue.fal.run/' + model, payload)
    safe_payload = dict(payload)
    if 'image_urls' in safe_payload:
        safe_payload['image_urls'] = refs
    for field in ['start_image_url', 'end_image_url']:
        if field in safe_payload and safe_payload[field].startswith('data:'):
            safe_payload[field] = 'Local native-generated image; see local_sources'
    if model == VIDEO_MODEL:
        safe_payload['local_sources'] = refs
    save(record, {'name': name, 'model': model, 'input': safe_payload, 'queue': result})
    print(name + ': submitted ' + result['request_id'])

def check(record):
    value = json.loads(record.read_text())
    if value.get('local_output'):
        print(value['name'] + ': downloaded')
        return
    status = api(value['queue']['status_url'])
    value['status'] = status
    if status['status'] == 'COMPLETED':
        try:
            result = api(value['queue']['response_url'])
        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors='replace').replace(key(), '[REDACTED]')
            detail = re.sub(r'data:image[^"\s]+', '[artwork data URI omitted]', detail)
            value['response_error'] = {'http_status': error.code, 'detail': detail[:5000]}
            save(record, value)
            print(value['name'] + ': response error ' + str(error.code) + ' ' + detail[:3000])
            return
        value['result'] = result
        asset = result['images'][0] if 'images' in result else result['video']
        output = ROOT / ('images' if 'images' in result else 'videos') / (value['name'] + ('.png' if 'images' in result else '.mp4'))
        with urllib.request.urlopen(asset['url'], timeout=60) as response:
            output.write_bytes(response.read())
        value['local_output'] = str(output)
        print(value['name'] + ': downloaded ' + str(output))
    else:
        print(value['name'] + ': ' + status['status'])
    save(record, value)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['image', 'video', 'check'])
    parser.add_argument('names', nargs='*')
    args = parser.parse_args()
    for folder in ['records', 'images', 'videos', 'references', 'prompts', 'previews']:
        (ROOT / folder).mkdir(exist_ok=True)
    if args.action == 'check':
        records = [ROOT / 'records' / (name + '.json') for name in args.names] if args.names else list((ROOT / 'records').glob('*.json'))
        with ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(check, records))
    elif args.action == 'image':
        raise RuntimeError('User switched still-image generation to native GPT. Additional fal image requests are disabled.')
    else:
        for name in args.names:
            record = ROOT / 'records' / (name + '.json')
            if record.exists():
                print(name + ': already submitted')
                continue
            spec = json.loads((ROOT / 'prompts' / (name + '.json')).read_text())
            source_name = spec.pop('source')
            source = ROOT / 'images' / (source_name + '.png')
            spec['start_image_url'] = video_image_url(source)
            end_source = spec.pop('end_source', None)
            if end_source:
                end = ROOT / 'images' / (end_source + '.png')
                spec['end_image_url'] = video_image_url(end)
            else:
                end = source
                spec['end_image_url'] = spec['start_image_url']
            spec.pop('cfg_scale', None)
            negative = spec.pop('negative_prompt', '')
            spec['aspect_ratio'] = '1:1'
            references = ['images/native-turnaround.png', 'references/telegram-style-pair.png']
            # O3 rejects end-frame control in combination with multiple references.
            # Keep identity/style conditioning and supply the goal pose as a reference.
            spec.pop('end_image_url', None)
            if end_source:
                references.append(str(end.relative_to(ROOT)))
                if name == '07-finger-dance-motion':
                    spec['prompt'] += ' @Image3 shows the desired UPSIDE-DOWN final dance stance: wrist at TOP, index/middle fingertips at BOTTOM. Arrive at this stance through the described real flip and finger steps.'
                else:
                    spec['prompt'] += ' @Image3 defines the desired final physical pose. Reach it through the described articulated movement.'
            spec['image_urls'] = [video_image_url(ROOT / ref) for ref in references]
            spec['prompt'] = ('@Image1 defines permanent mascot identity: happy palm and frowny back. '
                              '@Image2 contains the actual Telegram hand frame on LEFT and robot frame on RIGHT for '
                              'style ONLY, never inherit robot nose, teeth, colors or large eyes. '
                              'Exactly FIVE digits in EVERY frame. Thumb never swells or merges into a fist. '
                              'No new digits appear. Preserve each digit as a continuous anatomical part. '
                              + spec['prompt'] + ' Avoid: ' + negative + '.')
            video_records = [json.loads(file.read_text()) for file in (ROOT / 'records').glob('*.json')]
            video_count = sum(1 for value in video_records if value['model'] == VIDEO_MODEL)
            # One existing metered image reserved at a deliberately large $10 allowance;
            # each 3s audio-off Kling O3 clip has an official fixed $0.336 price.
            failed_count = len(list((ROOT / 'records/failures').glob('*.json')))
            reservation = 10.0 + (video_count + failed_count + 1) * 0.336
            if reservation > 15 or video_count >= 10 or spec['duration'] != '3' or spec['generate_audio']:
                raise RuntimeError('Approved generation count, audio setting, duration or budget limit would be exceeded')
            safe_refs = {'start': str(source.relative_to(ROOT)), 'end': str(end.relative_to(ROOT)),
                         'identity_style_refs': references}
            submit(name, VIDEO_MODEL, spec, safe_refs)
            save(ROOT / 'budget.json', {'approved_usd_cap': 15, 'already_inflight_metered_image_reserve_usd': 10,
                                       'video_unit_price_usd': 0.336, 'submitted_video_count': video_count + 1,
                                       'failed_validation_request_count': failed_count,
                                       'total_reserved_usd': reservation,
                                       'note': 'Image $10 is a conservative allowance, not measured billing. Video official $0.112/s, 3s, audio off.'})

if __name__ == '__main__':
    main()