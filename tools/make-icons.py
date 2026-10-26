# PWA 아이콘 만들기: 호랑이 스프라이트(assets/chars/tiger.webp, 환호 첫 프레임)를 한지 바탕에 올린다.
# 사용: python tools/make-icons.py   (yut 폴더에서)  → assets/icons/*.png
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'icons')
FRAME = 160
PAPER = (244, 234, 219, 255)
RED = (224, 83, 61, 255)
INK = (34, 32, 29, 255)


def sprite():
    # 렌더러에서 ?icon&save 로 찍은 큰 그림(assets/chars/tiger-icon.png, 다 만든 뒤 지워도 된다)이 있으면 그것을, 없으면 게임용 시트를 쓴다
    big = os.path.join(ROOT, 'assets', 'chars', 'tiger-icon.png')
    if os.path.exists(big):
        f = Image.open(big).convert('RGBA')
        return f.crop(f.getbbox())
    sheet = Image.open(os.path.join(ROOT, 'assets', 'chars', 'tiger.webp')).convert('RGBA')
    row = 2  # 환호
    f = sheet.crop((0, row * FRAME, FRAME, (row + 1) * FRAME))
    return f.crop(f.getbbox())


def icon(size, maskable):
    s = size * 4  # 크게 그리고 줄여 가장자리를 부드럽게
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if maskable:
        d.rectangle((0, 0, s, s), fill=PAPER)
        safe = s * 0.62
    else:
        pad = s * 0.04
        d.rounded_rectangle((pad, pad, s - pad, s - pad), radius=s * 0.22, fill=PAPER, outline=INK, width=int(s * 0.035))
        safe = s * 0.7
    # 붉은 해
    r = safe * 0.5
    cx, cy = s / 2, s / 2 + s * 0.02
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=RED, outline=INK, width=int(s * 0.022))
    t = sprite()
    k = safe * 0.95 / max(t.size)
    t = t.resize((int(t.width * k), int(t.height * k)), Image.LANCZOS)
    im.alpha_composite(t, (int(cx - t.width / 2), int(cy - t.height * 0.56)))
    return im.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
icon(512, False).save(os.path.join(OUT, 'icon-512.png'))
icon(192, False).save(os.path.join(OUT, 'icon-192.png'))
icon(512, True).save(os.path.join(OUT, 'icon-maskable-512.png'))
icon(180, True).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))
icon(64, False).save(os.path.join(OUT, 'favicon-64.png'))
print('ok', sorted(os.listdir(OUT)))
