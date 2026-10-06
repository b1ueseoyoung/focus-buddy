"""Create the menu-only 18pt pixel face on a fixed transparent grid."""
from pathlib import Path
from PIL import Image, ImageDraw
import json, hashlib

root = Path(__file__).resolve().parents[1]
out = root / 'resources/menu-cat'
out.mkdir(parents=True, exist_ok=True)
contour = [(2,7),(2,3),(3,2),(6,5),(11,5),(14,2),(15,3),
           (15,7),(16,8),(16,11),(15,13),(13,15),(4,15),
           (2,13),(1,11),(1,8),(2,7)]
frames = []
for pose in ['open', 'half', 'closed', 'open']:
    image = Image.new('RGBA', (18,18), (0,0,0,0))
    draw = ImageDraw.Draw(image)
    draw.line(contour, fill=(0,0,0,255), width=1)
    for x in [5,11]:
        draw.rectangle((x, 8 if pose == 'open' else 9, x+1,
                        10 if pose == 'open' else 9), fill=(0,0,0,255))
        if pose == 'half':
            draw.point((x,10), fill=(0,0,0,255))
    draw.line((8,12,9,12), fill=(0,0,0,255))
    frames.append(image)
for mode in ['sleep','rest']:
    for i, image in enumerate(frames):
        image.save(out / f'{mode}-{i}.png')
        image.resize((36,36), Image.Resampling.NEAREST).save(out / f'{mode}-{i}@2x.png')
frames[0].save(root / 'resources/tray-icon.png')
frames[0].resize((36,36), Image.Resampling.NEAREST).save(root / 'resources/tray-icon@2x.png')
metadata = {'kind':'menu-only hand-drawn pixel face', 'canvas':[18,18],
            'retina':[36,36], 'frames':['open','half','closed','open'],
            'durationMs':[4600,100,100,200], 'loopMs':5000,
            'alpha':'binary transparent', 'resampling':'nearest neighbor',
            'anchor':'fixed ears and face outline; only eyes change',
            'sha256':[hashlib.sha256(f.tobytes()).hexdigest() for f in frames]}
(out / 'face-playback.json').write_text(json.dumps(metadata, indent=2))
print(json.dumps(metadata))
