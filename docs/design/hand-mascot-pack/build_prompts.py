"""Reproducible prompt pack for ten distinct poses and real finger movements."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IDENTITY = (
    'Create exactly ONE isolated Happy hand mascot matching the supplied identity references. '
    'Reference 1 is the authoritative front/back identity turnaround. Reference 2 is the selected '
    'original Korean finger-heart mascot: preserve its butter-yellow hue, rounded chunky 3D '
    'vinyl/clay softness, tiny dark chocolate-brown oval eyes, understated face, soft studio '
    'highlights and short rounded wrist stump. Reference 3 and 4 are ACTUAL frames rendered from '
    'the repository Telegram animated emoji open-hands and robot: use them for hand silhouette, '
    'expressive restraint and glossy toy rendering ONLY. Do not inherit the robot nose, teeth, '
    'large eyes, colors, or flat vector outlines. Selected mascot controls identity. One right hand only, anatomically exactly '
    'FIVE digits: one thumb, index, middle, ring, pinky, all properly connected. Each finger has '
    'a clear base, plausible bending and chunky rounded tip. Permanent surface identity: '
    'PALM ALWAYS has two tiny oval brown eyes and a small U-shaped happy smile; BACK OF HAND '
    'ALWAYS has two tiny oval brown eyes and a small inverted-U unhappy FROWN. This is a real '
    'two-sided hand, not a face changing expression on one side. A side facing away cannot show '
    'its face. Faces sit low on the palm/back, unobstructed where possible, no eyebrows, nose, '
    'teeth, cheeks or face on fingertips. No arm, body, cuff, second hand, typography, frame, '
    'ground plane or extra objects except an explicitly requested heart. Transparent alpha '
    'background, entire hand within frame, generous margins, hand occupies about 72% of canvas. '
    'Keep the same 3D material and identity across the whole pack. POSE: '
)

MOTION_IDENTITY = (
    'Locked stationary orthographic camera; single short continuous shot of the exact butter-yellow '
    '3D hand in the supplied image. Match material, proportions and small chocolate-brown face. '
    'Exactly five anatomical digits throughout every frame: thumb, index, middle, ring, pinky. '
    'The face is physically attached low on the surface of the hand, does not float or migrate. '
    'Palm has a fixed happy smile and back has a fixed frown. Never change a smile into a frown '
    'on the same physical surface. Soft toy-like Telegram animated emoji timing: the supplied '
    'open-hands asset is 60fps frames 0-178, about 2.98sec, open at frame0, edge-on near frame45, '
    'open/spread at frame90, settle at frame135. Use clear anticipation, quick elastic finger '
    'articulation near 0.75s and 1.5s, gentle settling near 2.25s, steady final pose by 3s. '
    'Animate actual finger joints and hand volume, not a still image sliding or rotating flat '
    'in the picture plane. Calm ivory studio background, no text, camera changes, audio or '
    'new props. MOVEMENT: '
)

POSES = [
    ('01-finger-heart', 'Signature one-handed Korean finger heart, PALM smiling toward camera. '
     'Thumb and index cross neatly near their tips to make a tiny pinched heart silhouette. '
     'Other three fingers curl individually into palm, exactly three distinct folded pads. '
     'One small coral-pink three-dimensional heart floats just above the crossed fingertips.',
     'Thumb and index gently uncross a little, cross again into the Korean finger-heart gesture '
     'with a soft squeeze, then relax and squeeze once more. The other three fingers stay folded '
     'but flex subtly. The existing little coral heart gives one soft pulse; no extra hearts.'),
    ('02-wave', 'PALM view, happy face. A relaxed open right hand, all five digits spread clearly '
     'with thumb on viewer right, middle finger tallest, pinky shortest. Friendly slight tilt.',
     'The five spread fingers flex independently through a friendly small wave. The hand waves '
     'twice from its wrist, at most 12 degrees, always exposing the smiling palm. Fingers relax '
     'together and reopen with soft elastic ease; return to original pose.'),
    ('03-crossed-fingers', 'BACK view with the permanent tiny FROWNY face. Index and middle '
     'fingers extend upward and cross clearly above the knuckles for a good-luck gesture. '
     'Ring and pinky curl individually and thumb holds them. Exactly five digits, two extended '
     'and two folded plus one thumb. Dorsal face remains readable low on hand.',
     'The two extended index and middle fingers separate slightly and cross again twice. '
     'Ring and pinky stay folded; thumb adjusts minutely. The back of the hand remains facing '
     'the camera and the dorsal tiny frown stays unchanged. End with the fingers crossed.'),
    ('04-thumbs-up', 'PALM three-quarter view with tiny happy face low on palm. Classic thumbs '
     'up: one chunky thumb extends up, all FOUR other fingers are individually curled, no '
     'additional fingers. Thumb not a second index. Palm face visible beneath the curled fingers.',
     'The raised thumb bends slightly down at its real joint then confidently extends up twice. '
     'The four curled fingers softly tighten and loosen together. Hand remains palm-facing '
     'with the tiny smile unchanged; return to the original thumbs-up.'),
    ('05-holding-heart', 'PALM view smiling. One hand cups a single small coral-pink puffy 3D '
     'heart above its palm. Thumb supports the heart on one side; four rounded fingers gently '
     'curve behind and around it. Keep the happy palm face visible below the heart. Five digits.',
     'The thumb and four fingers gently cup the existing coral heart tighter, then open slightly '
     'to present it twice. Fingers bend individually around the heart; heart pulses subtly '
     'without changing size dramatically. Smile stays low on the visible palm.'),
    ('06-beckoning', 'PALM toward camera with tiny smile. Index extends upward and bends '
     'toward camera at its tip in a friendly come-here gesture. Middle, ring and pinky curl '
     'separately. Thumb rests to the side. Exactly one beckoning index, three curled fingers, '
     'one thumb. No heart or object.',
     'The single index finger curls toward the palm then extends back, twice, a clear friendly '
     'come-here beckon with visible joint articulation. Other three fingers remain curled '
     'and thumb stable. Smiling palm faces the camera the whole time.'),
    ('07-finger-dance', 'PALM happy face facing camera. Playful finger dance pose: index and '
     'middle extend as two little dancing legs above the palm, softly bent at different '
     'angles. Ring and pinky folded individually, thumb tucked beside them. Exactly five '
     'digits. No legs, arms, extra hands or objects.',
     'The raised index and middle alternate bending and extending like two tiny dancing '
     'legs for two little steps, then both return to starting pose. Real finger joints '
     'articulate; ring and pinky remain curled, thumb stable. Small wrist bounce keeps the '
     'smiling palm face visible; no newly grown legs or digits.'),
    ('08-turnaround-back', 'Fully BACK/DORSAL view of the open right hand, matching the exact '
     'scale, position and relaxed five-finger spread of the wave pose. Thumb on viewer LEFT. '
     'The back has TWO tiny oval chocolate eyes and a very clear small DOWNWARD frown '
     '(inverted U). No happy mouth on this back. Anatomically exact opposite surface.',
     'Beginning with the smiling front/palm, the hand slowly turns 180 degrees around its '
     'vertical axis as a solid three-dimensional object. At halfway the hand is narrow '
     'edge-on and NO face is visible. It finishes with the actual opposite BACK surface '
     'toward the camera, revealing its separate tiny fixed frowny face. Smiling palm face '
     'turns physically out of sight. Five digits keep the same spread. No facial expression '
     'morph, no smile-to-frown animation on the same surface, no flat card flipping.'),
    ('09-back-stop', 'BACK view, permanent tiny FROWNY face. All five digits straight and '
     'spread in a firm stop/refusal posture, thumb viewer left, hand leans slightly forward. '
     'Frown clearly inverted U, not a smile. Slightly assertive silhouette without eyebrows.',
     'The back-facing hand makes a firm little refusal: fingers tighten their spread, hand '
     'leans forward slightly as if saying stop, gives one small side-to-side wrist wag, '
     'then settles. Back remains facing camera, tiny dorsal frown stays fixed, five fingers.'),
    ('10-back-middle-finger', 'BACK/DORSAL toward camera with its permanent tiny FROWNY '
     'face visible low on hand. Classic rude middle-finger gesture: ONLY MIDDLE finger '
     'extends straight up. Index, ring and pinky are separately folded with visible '
     'knuckles, thumb crosses and holds the folded fingers. Exactly FIVE digits. '
     'Playful toy-like rather than threatening; no props.',
     'The only extended middle finger bends slightly at its knuckle then straightens up '
     'twice in a cheeky emphatic gesture. Index, ring and pinky stay folded; thumb holds '
     'them. The back stays toward the camera with tiny permanent frowny face. Five digits '
     'at every moment, no extra finger appears.'),
]

def main():
    (ROOT / 'prompts').mkdir(exist_ok=True)
    for name, pose, movement in POSES:
        image = {
            'prompt': IDENTITY + pose,
            'references': ['images/00-turnaround.png', 'references/selected-finger-heart.png',
                           'references/telegram-open-hands-frame-000.png', 'references/telegram-robot-frame-090.png'],
            'image_size': {'width': 1024, 'height': 1024},
            'background': 'transparent', 'quality': 'high', 'num_images': 1, 'output_format': 'png'
        }
        video = {
            'source': name, 'prompt': MOTION_IDENTITY + movement,
            'duration': '3', 'generate_audio': False, 'cfg_scale': 0.6,
            'negative_prompt': 'extra fingers, missing fingers, fused fingers, six digits, '
                               'face morphing, face sliding, smiling dorsal face, frowny palm, '
                               'camera motion, zoom, multiple hands, scene cuts, text, flat still image'
        }
        if name == '08-turnaround-back':
            video['source'] = '02-wave'
            video['end_source'] = name
        (ROOT / 'prompts' / (name + '.json')).write_text(json.dumps(image, indent=2) + '\n')
        (ROOT / 'prompts' / (name + '-motion.json')).write_text(json.dumps(video, indent=2) + '\n')
    print('Prepared ten pose prompts and ten 3-second real-motion prompts.')

if __name__ == '__main__':
    main()