"""User-approved redo of four clips: start/end frame lock, single identity ref, one attempt each."""
import json
import sys
from fal_pipeline import ROOT, VIDEO_MODEL, submit, video_image_url

IDENTITY = ('@Image1 is the permanent mascot identity: smiling face on the PALM, frowning face on the BACK. '
            'Locked stationary camera, one continuous 3-second shot of the exact butter-yellow 3D hand from the '
            'start frame, same material, proportions and small chocolate-brown face. Exactly FIVE digits in EVERY '
            'frame (thumb, index, middle, ring, pinky); no digit ever swells, melts, splits, merges or disappears. '
            'The face stays painted on the same spot of the hand and never changes expression type. MOVEMENT: ')
NEGATIVE = (' Avoid: extra fingers, missing fingers, swelling, melting, morphing, open mouth, tongue, blank face, '
            'missing mouth, second rotation, camera movement, zoom, new props, text.')
REDOS = {
    '02-wave-motion-v2': ('02-wave', '02-wave',
        'The palm faces the camera the whole time. Wave ONLY by rocking from the wrist: two gentle side-to-side '
        'sways, then settle back to the start pose. All five fingers stay extended and spread; the thumb keeps '
        'exactly the same size and shape in every frame and never curls or forms a lump. The smile stays; the '
        'eyes may blink once.'),
    '04-thumbs-up-motion-v2': ('04-thumbs-up', '04-thumbs-up',
        'The thumb points straight UP for the entire clip. The four fingers stay curled into a fist in every frame '
        'and NEVER open. Motion: two small confident up-down bounces of the whole hand, then settle back to the '
        'start pose, with one happy blink.'),
    '09-back-stop-motion-v2': ('09-back-stop', '09-back-stop',
        'The back of the hand faces the camera the whole clip. Fingers stay spread and never close into a fist. One '
        'firm small push toward the camera, a short hold, then ease back to the start pose. The frowning face (two '
        'eyes and a downturned mouth) is clearly visible in EVERY frame.'),
    '08-turnaround-back-motion-v2': ('02-wave', '08-turnaround-back',
        'Starts showing the smiling palm. Exactly ONE smooth 180-degree turn around the vertical axis, no second '
        'spin, ending on the back of the hand. As soon as the back is visible it shows the frowning face (two eyes '
        'and a downturned mouth), which stays until the end.'),
    '10-back-middle-finger-motion-v2': ('10-back-middle-finger-v2', '10-back-middle-finger-v2',
        'The BACK of the hand faces the camera the whole clip. Only the middle finger is raised; the index, ring and '
        'pinky stay curled AWAY from the camera so only their smooth rounded KNUCKLES show, never their fingertip '
        'pads or finger fronts. Motion: the hand gives two short cheeky forward jabs with the raised middle finger, '
        'then settles back to the start pose; the frowning face blinks once. Soft crease lines appear ONLY at the '
        'bent knuckles of the curled fingers; the back of the hand and the raised finger stay perfectly smooth.'),
    '10-back-middle-finger-motion-v3': ('10-back-middle-finger-v2', '10-back-middle-finger-v2',
        'The BACK of the hand faces the camera the whole clip. The middle finger stays fully extended, pointing '
        'straight UP, the SAME length in every frame; it never bends, tilts toward the camera, shortens or glows. '
        'The index, ring and pinky stay curled AWAY from the camera so only their smooth rounded KNUCKLES show, '
        'never their fingertip pads. Motion: two small sassy up-down bounces of the whole hand with a slight side '
        'tilt, then settle back to the start pose. The frowning face keeps its eyes open and blinks once. Soft '
        'crease lines appear ONLY at the bent knuckles; the back of the hand and the raised finger stay smooth.'),
    '10-back-middle-finger-motion-v4': ('10-back-middle-finger-v3', '10-back-middle-finger-v3',
        'The BACK of the hand faces the camera the whole clip. The closed fist stays ONE smooth rounded mitten-like '
        'mass with NO lines, creases, folds or separate curled-finger shapes in ANY frame; the thumb is one smooth '
        'lobe on the left. The middle finger stays fully extended, straight UP, the SAME length in every frame; it '
        'never bends, tilts toward the camera or shortens. Motion: two small sassy up-down bounces of the whole hand '
        'with a slight side tilt, then settle back to the start pose. The frowning face keeps its eyes open and '
        'blinks once.'),
}

def main():
    use_refs = '--no-refs' not in sys.argv
    names = [arg for arg in sys.argv[1:] if not arg.startswith('--')] or list(REDOS)
    for name in names:
        start, end, motion = REDOS[name]
        spec = {
            'prompt': (IDENTITY if use_refs else IDENTITY.replace('@Image1 is', 'The')) + motion + NEGATIVE,
            'duration': '3', 'generate_audio': False, 'aspect_ratio': '1:1',
            'start_image_url': video_image_url(ROOT / 'images' / (start + '.png')),
            'end_image_url': video_image_url(ROOT / 'images' / (end + '.png')),
        }
        refs = {'start': 'images/%s.png' % start, 'end': 'images/%s.png' % end, 'identity_style_refs': []}
        if use_refs:
            spec['image_urls'] = [video_image_url(ROOT / 'images/native-turnaround.png')]
            refs['identity_style_refs'] = ['images/native-turnaround.png']
        submit(name, VIDEO_MODEL, spec, refs)

if __name__ == '__main__':
    main()
