# 產生 PWA 圖示：酒紅底＋金色拍賣槌＋木頭底座
import os
from PIL import Image, ImageDraw
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
os.makedirs(out, exist_ok=True)

def draw(size, pad):
    s = 4 * size
    im = Image.new('RGB', (s, s), '#3B0D1C')
    d = ImageDraw.Draw(im)
    x0, x1 = pad * s, (1 - pad) * s
    w = x1 - x0
    d.ellipse([x0 + w * .02, x0 + w * .02, x1 - w * .02, x1 - w * .02], outline='#D9A441', width=int(w * .035))
    # 底座
    d.rounded_rectangle([x0 + w * .2, x0 + w * .72, x0 + w * .8, x0 + w * .82], radius=w * .03, fill='#8B5E3C')
    d.rounded_rectangle([x0 + w * .28, x0 + w * .64, x0 + w * .72, x0 + w * .73], radius=w * .03, fill='#A9744A')
    # 槌子（旋轉 -35 度）
    g = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    cx, cy = s / 2, x0 + w * .42
    gd.rounded_rectangle([cx - w * .04, cy - w * .05, cx + w * .36, cy + w * .05], radius=w * .03, fill='#C98A0B')
    gd.rounded_rectangle([cx - w * .2, cy - w * .14, cx + w * .02, cy + w * .14], radius=w * .05, fill='#F3D58A')
    gd.rectangle([cx - w * .2, cy - w * .1, cx + w * .02, cy - w * .07], fill='#C98A0B')
    gd.rectangle([cx - w * .2, cy + w * .07, cx + w * .02, cy + w * .1], fill='#C98A0B')
    g = g.rotate(35, center=(cx, cy), resample=Image.BICUBIC)
    im.paste(g, (int(-w * .02), int(w * .02)), g)
    return im.resize((size, size), Image.LANCZOS)

draw(192, .08).save(os.path.join(out, 'icon-192.png'))
draw(512, .08).save(os.path.join(out, 'icon-512.png'))
draw(512, .2).save(os.path.join(out, 'icon-maskable-512.png'))
print('ok')
